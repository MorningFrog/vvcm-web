import { type FkSolutionOutput } from '@morningfrog/vvcm-rs'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

THREE.Object3D.DEFAULT_UP.set(0, 0, 1)

type Point2 = {
  x: number
  y: number
}

type IndexBase = 0 | 1

type SceneLabelKind = 'axis' | 'point'

type TextSprite = THREE.Sprite & {
  userData: {
    labelAspect: number
    labelKind: SceneLabelKind
  }
}

export type RobotSceneSolutionEntry = {
  color: string
  index: number
  solution: FkSolutionOutput
}

export type RobotScene3DLabels = {
  ariaLabel: string
  emptyState: string
  groundRobotLegend: string
  holdPointLegend: string
  legendAriaLabel: string
  objectLegend: string
  resetView: string
  tautLineLegend: string
  title: string
  webglUnavailable: string
}

type RobotScene3DProps = {
  holdHeight: number
  indexBase: IndexBase
  labels: RobotScene3DLabels
  robots: Point2[]
  solutionMessage: string | null
  visibleSolutions: RobotSceneSolutionEntry[]
}

type SceneRefs = {
  camera: THREE.PerspectiveCamera
  contentRoot: THREE.Group
  controls: OrbitControls
  renderer: THREE.WebGLRenderer
}

const ROBOT_GROUND_COLOR = '#c56a1a'
const ROBOT_HOLD_COLOR = '#007d7a'
const GUIDE_LINE_COLOR = '#8da09d'
const TAUT_LINE_COLOR = '#d33f49'
const GRID_CENTER_COLOR = '#9badab'
const GRID_COLOR = '#dfe6e3'
const X_AXIS_COLOR = '#b12d36'
const Y_AXIS_COLOR = '#007d7a'
const Z_AXIS_COLOR = '#4d62c7'
const labelRendererSize = new THREE.Vector2()
const labelCameraDirection = new THREE.Vector3()
const labelSpritePosition = new THREE.Vector3()
const labelCameraToSprite = new THREE.Vector3()

const displayIndex = (index: number, indexBase: IndexBase) => index + indexBase

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const toVector3 = (x: number, y: number, z: number) =>
  new THREE.Vector3(x, y, z)

const disposeMaterial = (material: THREE.Material | THREE.Material[]) => {
  if (Array.isArray(material)) {
    material.forEach((item) => item.dispose())
    return
  }

  const texturedMaterial = material as THREE.Material & {
    map?: THREE.Texture
  }
  texturedMaterial.map?.dispose()
  material.dispose()
}

const disposeObject = (object: THREE.Object3D) => {
  object.traverse((item) => {
    const mesh = item as THREE.Object3D & {
      geometry?: THREE.BufferGeometry
      material?: THREE.Material | THREE.Material[]
    }

    mesh.geometry?.dispose()
    if (mesh.material) {
      disposeMaterial(mesh.material)
    }
  })
}

const clearGroup = (group: THREE.Group) => {
  for (const child of [...group.children]) {
    group.remove(child)
    disposeObject(child)
  }
}

const makeSphere = (color: string, radius: number, opacity = 1) =>
  new THREE.Mesh(
    new THREE.SphereGeometry(radius, 24, 16),
    new THREE.MeshStandardMaterial({
      color,
      metalness: 0.08,
      opacity,
      roughness: 0.55,
      transparent: opacity < 1,
    }),
  )

const makeLine = (
  start: THREE.Vector3,
  end: THREE.Vector3,
  color: string,
  opacity = 1,
) => {
  const geometry = new THREE.BufferGeometry().setFromPoints([start, end])
  const material = new THREE.LineBasicMaterial({
    color,
    opacity,
    transparent: opacity < 1,
  })

  return new THREE.Line(geometry, material)
}

const makeTextSprite = (
  text: string,
  color: string,
  labelKind: SceneLabelKind,
  position: THREE.Vector3,
) => {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  const fontSize = 52
  const paddingX = 14
  const paddingY = 6

  if (!context) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        color,
        depthTest: false,
        depthWrite: false,
      }),
    ) as TextSprite
    sprite.userData = { labelAspect: 1, labelKind }
    sprite.position.copy(position)
    return sprite
  }

  context.font = `700 ${fontSize}px Inter, Arial, sans-serif`
  const metrics = context.measureText(text)
  canvas.width = Math.ceil(metrics.width + paddingX * 2)
  canvas.height = fontSize + paddingY * 2
  context.font = `700 ${fontSize}px Inter, Arial, sans-serif`
  context.textBaseline = 'middle'
  context.lineJoin = 'round'
  context.lineWidth = 8
  context.strokeStyle = 'rgba(255, 255, 255, 0.9)'
  context.shadowColor = 'rgba(20, 33, 36, 0.28)'
  context.shadowBlur = 5
  context.shadowOffsetX = 0
  context.shadowOffsetY = 2
  context.strokeText(text, paddingX, canvas.height / 2)
  context.shadowColor = 'transparent'
  context.fillStyle = color
  context.fillText(text, paddingX, canvas.height / 2)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const material = new THREE.SpriteMaterial({
    depthWrite: false,
    depthTest: false,
    map: texture,
    transparent: true,
  })
  const sprite = new THREE.Sprite(material) as TextSprite
  const aspect = canvas.width / canvas.height
  sprite.userData = { labelAspect: aspect, labelKind }
  sprite.scale.set(aspect, 1, 1)
  sprite.position.copy(position)

  return sprite
}

const isTextSprite = (object: THREE.Object3D): object is TextSprite =>
  object instanceof THREE.Sprite &&
  typeof object.userData.labelAspect === 'number' &&
  (object.userData.labelKind === 'axis' ||
    object.userData.labelKind === 'point')

const getLabelTargetPixels = (
  labelKind: SceneLabelKind,
  viewportHeight: number,
) => {
  if (labelKind === 'axis') {
    return clamp(viewportHeight * 0.062, 22, 32)
  }

  return clamp(viewportHeight * 0.075, 26, 38)
}

const scaleTextSprites = (
  camera: THREE.PerspectiveCamera,
  contentRoot: THREE.Group,
  renderer: THREE.WebGLRenderer,
) => {
  const viewportHeight =
    renderer.domElement.clientHeight || renderer.getSize(labelRendererSize).y
  if (!viewportHeight) {
    return
  }

  const cameraDirection = camera.getWorldDirection(labelCameraDirection)
  const visibleHeightFactor =
    2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)

  contentRoot.updateMatrixWorld(true)
  contentRoot.traverse((object) => {
    if (!isTextSprite(object)) {
      return
    }

    object.getWorldPosition(labelSpritePosition)
    labelCameraToSprite.copy(labelSpritePosition).sub(camera.position)
    const depth = Math.max(1, labelCameraToSprite.dot(cameraDirection))
    const targetPixels = getLabelTargetPixels(
      object.userData.labelKind,
      viewportHeight,
    )
    const worldHeight = (targetPixels / viewportHeight) * visibleHeightFactor * depth

    object.scale.set(worldHeight * object.userData.labelAspect, worldHeight, 1)
  })
}

const makeArrow = (
  direction: THREE.Vector3,
  length: number,
  color: string,
  label: string,
) => {
  const arrow = new THREE.Group()
  const helper = new THREE.ArrowHelper(
    direction.clone().normalize(),
    new THREE.Vector3(0, 0, 0),
    length,
    color,
    length * 0.08,
    length * 0.035,
  )

  arrow.add(helper)
  arrow.add(
    makeTextSprite(
      label,
      color,
      'axis',
      direction.clone().normalize().multiplyScalar(length * 1.08),
    ),
  )

  return arrow
}

const fitCameraToPoints = (
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  points: THREE.Vector3[],
) => {
  const box = new THREE.Box3().setFromPoints(points.length ? points : [
    new THREE.Vector3(-500, -500, 0),
    new THREE.Vector3(500, 500, 500),
  ])
  const center = new THREE.Vector3()
  const size = new THREE.Vector3()
  box.getCenter(center)
  box.getSize(size)

  const maxSpan = Math.max(size.x, size.y, size.z, 100)
  const distance =
    (maxSpan / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2))) * 1.8
  const direction = new THREE.Vector3(1.15, -1.35, 0.9).normalize()

  controls.target.copy(center)
  camera.position.copy(center).add(direction.multiplyScalar(distance))
  camera.near = Math.max(0.1, distance / 1000)
  camera.far = Math.max(distance * 1000, maxSpan * 20)
  camera.up.set(0, 0, 1)
  camera.lookAt(center)
  camera.updateProjectionMatrix()
  controls.minDistance = Math.max(maxSpan * 0.04, 8)
  controls.maxDistance = Math.max(distance * 20, 1000)
  controls.update()
}

export function RobotScene3D({
  holdHeight,
  indexBase,
  labels,
  robots,
  solutionMessage,
  visibleSolutions,
}: RobotScene3DProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRefs = useRef<SceneRefs | null>(null)
  const [resetSignal, setResetSignal] = useState(0)
  const [webglUnavailable, setWebglUnavailable] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true })
    } catch {
      window.setTimeout(() => setWebglUnavailable(true), 0)
      return
    }

    renderer.setClearColor(0xf8faf8, 1)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.domElement.className = 'robot-scene-canvas'
    renderer.domElement.setAttribute('role', 'img')
    container.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1_000_000)
    camera.up.set(0, 0, 1)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = false
    controls.screenSpacePanning = false
    controls.target.set(0, 0, 0)

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.72)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.78)
    directionalLight.position.set(-1000, -1200, 1800)
    scene.add(ambientLight, directionalLight)

    const contentRoot = new THREE.Group()
    contentRoot.up.set(0, 0, 1)
    scene.add(contentRoot)

    const resize = () => {
      const width = container.clientWidth
      const height = container.clientHeight
      if (!width || !height) {
        return
      }

      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }

    resize()
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(container)

    sceneRefs.current = { camera, contentRoot, controls, renderer }
    let frameId = 0
    const animate = () => {
      controls.update()
      scaleTextSprites(camera, contentRoot, renderer)
      renderer.render(scene, camera)
      frameId = window.requestAnimationFrame(animate)
    }
    animate()

    return () => {
      window.cancelAnimationFrame(frameId)
      resizeObserver.disconnect()
      controls.dispose()
      clearGroup(contentRoot)
      scene.remove(contentRoot, ambientLight, directionalLight)
      renderer.dispose()
      renderer.domElement.remove()
      sceneRefs.current = null
    }
  }, [])

  useEffect(() => {
    sceneRefs.current?.renderer.domElement.setAttribute(
      'aria-label',
      labels.ariaLabel,
    )
  }, [labels.ariaLabel])

  useEffect(() => {
    const refs = sceneRefs.current
    if (!refs) {
      return
    }

    const { camera, contentRoot, controls } = refs
    clearGroup(contentRoot)

    const finiteHoldHeight = Number.isFinite(holdHeight)
      ? Math.max(0, holdHeight)
      : 0
    const boundsPoints = robots.flatMap((robot) => [
      toVector3(robot.x, robot.y, 0),
      toVector3(robot.x, robot.y, finiteHoldHeight),
    ])

    visibleSolutions.forEach(({ solution }) => {
      boundsPoints.push(toVector3(solution.po.x, solution.po.y, solution.po.z))
    })

    const box = new THREE.Box3().setFromPoints(
      boundsPoints.length ? boundsPoints : [new THREE.Vector3(0, 0, 0)],
    )
    const size = new THREE.Vector3()
    box.getSize(size)
    const span = Math.max(size.x, size.y, size.z, finiteHoldHeight, 800)
    const gridSize = Math.max(span * 1.35, 1000)
    const markerRadius = Math.max(span * 0.012, 8)
    const labelOffset = Math.max(markerRadius * 1.8, span * 0.02)
    const groundLabelOffset = new THREE.Vector3(labelOffset, 0, labelOffset)
    const holdLabelOffset = new THREE.Vector3(labelOffset, 0, labelOffset * 1.8)
    const objectLabelOffset = new THREE.Vector3(labelOffset, 0, -labelOffset * 0.8)
    const axisLength = Math.max(span * 0.45, 260)

    const grid = new THREE.GridHelper(gridSize, 20, GRID_CENTER_COLOR, GRID_COLOR)
    grid.rotation.x = Math.PI / 2
    grid.up.set(0, 0, 1)
    contentRoot.add(grid)
    contentRoot.add(makeArrow(new THREE.Vector3(1, 0, 0), axisLength, X_AXIS_COLOR, 'X'))
    contentRoot.add(makeArrow(new THREE.Vector3(0, 1, 0), axisLength, Y_AXIS_COLOR, 'Y'))
    contentRoot.add(makeArrow(new THREE.Vector3(0, 0, 1), axisLength, Z_AXIS_COLOR, 'Z'))

    robots.forEach((robot, index) => {
      const groundPoint = toVector3(robot.x, robot.y, 0)
      const holdPoint = toVector3(robot.x, robot.y, finiteHoldHeight)
      const groundMarker = makeSphere(ROBOT_GROUND_COLOR, markerRadius)
      const holdMarker = makeSphere(ROBOT_HOLD_COLOR, markerRadius * 0.9)
      const labelIndex = displayIndex(index, indexBase)

      groundMarker.position.copy(groundPoint)
      holdMarker.position.copy(holdPoint)
      contentRoot.add(groundMarker, holdMarker)
      contentRoot.add(makeLine(groundPoint, holdPoint, GUIDE_LINE_COLOR, 0.72))
      contentRoot.add(
        makeTextSprite(
          `r${labelIndex}`,
          ROBOT_GROUND_COLOR,
          'point',
          groundPoint.clone().add(groundLabelOffset),
        ),
      )
      contentRoot.add(
        makeTextSprite(
          `p${labelIndex}`,
          ROBOT_HOLD_COLOR,
          'point',
          holdPoint.clone().add(holdLabelOffset),
        ),
      )
    })

    visibleSolutions.forEach(({ color, index, solution }) => {
      const poPoint = toVector3(solution.po.x, solution.po.y, solution.po.z)
      const poMarker = makeSphere(color, markerRadius * 1.25, solution.stable ? 1 : 0.82)
      poMarker.position.copy(poPoint)
      contentRoot.add(poMarker)

      if (!solution.stable) {
        const wireframe = makeSphere(color, markerRadius * 1.45, 0.72)
        wireframe.position.copy(poPoint)
        const material = wireframe.material
        if (material instanceof THREE.MeshStandardMaterial) {
          material.wireframe = true
        }
        contentRoot.add(wireframe)
      }

      contentRoot.add(
        makeTextSprite(
          `po${displayIndex(index, indexBase)}`,
          color,
          'point',
          poPoint.clone().add(objectLabelOffset),
        ),
      )

      solution.tautCables.forEach((robotIndex) => {
        const robot = robots[robotIndex]
        if (!robot) {
          return
        }

        const holdPoint = toVector3(robot.x, robot.y, finiteHoldHeight)
        contentRoot.add(makeLine(holdPoint, poPoint, TAUT_LINE_COLOR, 1))
      })
    })

    fitCameraToPoints(camera, controls, boundsPoints)
  }, [
    holdHeight,
    indexBase,
    resetSignal,
    robots,
    visibleSolutions,
  ])

  return (
    <section className="scene-panel">
      <div className="panel-heading canvas-heading scene-heading">
        <div>
          <h2>{labels.title}</h2>
          <span>{solutionMessage ?? labels.emptyState}</span>
        </div>
        <div className="canvas-heading-actions">
          <div className="canvas-tools" role="group" aria-label={labels.ariaLabel}>
            <button
              type="button"
              className="fit-view-button"
              onClick={() => setResetSignal((current) => current + 1)}
            >
              {labels.resetView}
            </button>
          </div>
          <div className="legend scene-legend" aria-label={labels.legendAriaLabel}>
            <span className="legend-item ground-robot">{labels.groundRobotLegend}</span>
            <span className="legend-item hold-point">{labels.holdPointLegend}</span>
            <span className="legend-item stable-solution">{labels.objectLegend}</span>
            <span className="legend-item taut-line">{labels.tautLineLegend}</span>
          </div>
        </div>
      </div>
      <div ref={containerRef} className="robot-scene-frame">
        {webglUnavailable && (
          <p className="robot-scene-message">{labels.webglUnavailable}</p>
        )}
      </div>
    </section>
  )
}
