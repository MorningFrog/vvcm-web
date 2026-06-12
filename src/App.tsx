import {
  VvcmFk,
  version,
  type FkSolutionOutput,
  type FkSolutionsOutput,
  type Point2Input,
} from '@morningfrog/vvcm-rs'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from 'react'
import './App.css'
import {
  getInitialLocale,
  localeOptions,
  storeLocale,
  translations,
  type LabelKey,
  type Locale,
  type Messages,
  type ParseErrorCode,
} from './i18n'

type Point = {
  x: number
  y: number
}

type PointKind = 'sheet' | 'robots'

type SolutionDisplayMode = 'single' | 'all'

type IndexBase = 0 | 1

type PointDragState = {
  type: 'point'
  kind: PointKind
  index: number
  offsetX: number
  offsetY: number
  pointerId: number
}

type PanDragState = {
  type: 'pan'
  pointerId: number
  startClientX: number
  startClientY: number
  startViewBox: ViewBox
}

type CanvasInteraction = PointDragState | PanDragState

type SolveState =
  | {
      status: 'ok'
      result: FkSolutionsOutput
    }
  | {
      status: 'error'
      message: string
    }

type IndexedSolution = {
  index: number
  solution: FkSolutionOutput
}

type ViewBox = {
  minX: number
  minY: number
  width: number
  height: number
}

type GridLines = {
  vertical: number[]
  horizontal: number[]
}

type CanvasMetrics = {
  labelSize: number
  statusSize: number
  labelStroke: number
  pointLabelXOffset: number
  sheetLabelYOffset: number
  robotLabelYOffset: number
  objectLabelXOffset: number
  objectTitleYOffset: number
  objectStatusYOffset: number
  virtualObjectTitleYOffset: number
  sheetHitRadius: number
  robotHitRadius: number
  sheetMarkerRadius: number
  sheetActiveMarkerRadius: number
  robotMarkerRadius: number
  robotActiveMarkerRadius: number
  objectRadius: number
  virtualObjectRadius: number
}

type StatusMessage =
  | {
      type: 'ready'
    }
  | {
      type: 'countSet'
      count: number
    }
  | {
      type: 'pointsApplied'
      kind: PointKind
      count: number
    }
  | {
      type: 'textSynced'
      kind: PointKind
    }
  | {
      type: 'copied'
      label: LabelKey
    }
  | {
      type: 'copyFailed'
      message: string
    }
  | {
      type: 'parseError'
      code: ParseErrorCode
    }
  | {
      type: 'pointCountRange'
      min: number
      max: number
    }
  | {
      type: 'error'
      message: string
    }

const MIN_ROBOT_COUNT = 3
const MAX_ROBOT_COUNT = 16
const DEFAULT_ROBOT_COUNT = 4
const DEFAULT_HOLD_HEIGHT = 1000
const DEFAULT_INDEX_BASE: IndexBase = 1
const INDEX_BASE_STORAGE_KEY = 'vvcm-web.index-base.v1'
const EMPTY_SOLUTIONS: FkSolutionOutput[] = []

class PointParseError extends Error {
  code: ParseErrorCode

  constructor(code: ParseErrorCode) {
    super(code)
    this.name = 'PointParseError'
    this.code = code
  }
}

const round = (value: number, digits = 2) => {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

const DEFAULT_CANVAS_UNITS_PER_PIXEL = 3
const MIN_VIEWBOX_SPAN = 20
const MAX_VIEWBOX_SPAN = 200_000
const ZOOM_IN_FACTOR = 0.82
const ZOOM_OUT_FACTOR = 1 / ZOOM_IN_FACTOR
const CANVAS_METRIC_TARGETS = {
  labelSize: 16,
  statusSize: 13,
  labelStroke: 3,
  pointLabelXOffset: 8,
  sheetLabelYOffset: -7,
  robotLabelYOffset: 16,
  objectLabelXOffset: 11,
  objectTitleYOffset: -11,
  objectStatusYOffset: 4,
  virtualObjectTitleYOffset: 4,
  sheetHitRadius: 20,
  robotHitRadius: 22,
  sheetMarkerRadius: 7,
  sheetActiveMarkerRadius: 9,
  robotMarkerRadius: 8,
  robotActiveMarkerRadius: 10,
  objectRadius: 10,
  virtualObjectRadius: 9,
} satisfies CanvasMetrics

const SOLUTION_COLORS = [
  '#2f7d46',
  '#4d62c7',
  '#c56a1a',
  '#8a4db3',
  '#b12d36',
  '#007d7a',
  '#a15c38',
  '#4f6f36',
  '#c24682',
  '#5d6b7a',
]

const getSolutionColor = (index: number) =>
  SOLUTION_COLORS[index % SOLUTION_COLORS.length]

const solutionColorStyle = (index: number) =>
  ({
    '--solution-color': getSolutionColor(index),
  }) as CSSProperties

const scaleCanvasMetrics = (unitsPerPixel: number): CanvasMetrics => {
  const scale = (value: number) => round(value * unitsPerPixel, 2)

  return {
    labelSize: scale(CANVAS_METRIC_TARGETS.labelSize),
    statusSize: scale(CANVAS_METRIC_TARGETS.statusSize),
    labelStroke: scale(CANVAS_METRIC_TARGETS.labelStroke),
    pointLabelXOffset: scale(CANVAS_METRIC_TARGETS.pointLabelXOffset),
    sheetLabelYOffset: scale(CANVAS_METRIC_TARGETS.sheetLabelYOffset),
    robotLabelYOffset: scale(CANVAS_METRIC_TARGETS.robotLabelYOffset),
    objectLabelXOffset: scale(CANVAS_METRIC_TARGETS.objectLabelXOffset),
    objectTitleYOffset: scale(CANVAS_METRIC_TARGETS.objectTitleYOffset),
    objectStatusYOffset: scale(CANVAS_METRIC_TARGETS.objectStatusYOffset),
    virtualObjectTitleYOffset: scale(
      CANVAS_METRIC_TARGETS.virtualObjectTitleYOffset,
    ),
    sheetHitRadius: scale(CANVAS_METRIC_TARGETS.sheetHitRadius),
    robotHitRadius: scale(CANVAS_METRIC_TARGETS.robotHitRadius),
    sheetMarkerRadius: scale(CANVAS_METRIC_TARGETS.sheetMarkerRadius),
    sheetActiveMarkerRadius: scale(
      CANVAS_METRIC_TARGETS.sheetActiveMarkerRadius,
    ),
    robotMarkerRadius: scale(CANVAS_METRIC_TARGETS.robotMarkerRadius),
    robotActiveMarkerRadius: scale(
      CANVAS_METRIC_TARGETS.robotActiveMarkerRadius,
    ),
    objectRadius: scale(CANVAS_METRIC_TARGETS.objectRadius),
    virtualObjectRadius: scale(CANVAS_METRIC_TARGETS.virtualObjectRadius),
  }
}

const DEFAULT_CANVAS_METRICS = scaleCanvasMetrics(
  DEFAULT_CANVAS_UNITS_PER_PIXEL,
)

const sameCanvasMetrics = (
  current: CanvasMetrics,
  next: CanvasMetrics,
) =>
  (Object.keys(next) as Array<keyof CanvasMetrics>).every(
    (key) => current[key] === next[key],
  )

const formatNumber = (value: number) => {
  if (!Number.isFinite(value)) {
    return '0'
  }

  return Number.isInteger(value) ? String(value) : String(round(value))
}

const getInitialIndexBase = (): IndexBase => {
  try {
    return window.localStorage.getItem(INDEX_BASE_STORAGE_KEY) === '0'
      ? 0
      : DEFAULT_INDEX_BASE
  } catch {
    return DEFAULT_INDEX_BASE
  }
}

const storeIndexBase = (indexBase: IndexBase) => {
  try {
    window.localStorage.setItem(INDEX_BASE_STORAGE_KEY, String(indexBase))
  } catch {
    // Ignore storage failures; the selector still works for this session.
  }
}

const displayIndex = (index: number, indexBase: IndexBase) => index + indexBase

const pointLabel = (
  kind: PointKind,
  index: number,
  indexBase: IndexBase,
) => `${kind === 'sheet' ? 'v' : 'r'}${displayIndex(index, indexBase)}`

const formatIndexList = (indices: readonly number[], indexBase: IndexBase) =>
  indices.length
    ? indices.map((index) => displayIndex(index, indexBase)).join(', ')
    : '-'

const toPointInput = (points: Point[]): Point2Input[] =>
  points.map((point) => [point.x, point.y] as const)

const makePolygon = (count: number, radius: number, phase = -Math.PI / 2) =>
  Array.from({ length: count }, (_, index) => {
    const angle = phase + (Math.PI * 2 * index) / count
    return {
      x: round(Math.cos(angle) * radius),
      y: round(Math.sin(angle) * radius),
    }
  })

const defaultSheet4: Point[] = [
  { x: -316.1, y: -421.9 },
  { x: 803.4, y: -384.1 },
  { x: 746.1, y: 712.8 },
  { x: -201.7, y: 390.8 },
]

const defaultRobots4: Point[] = [
  { x: 213.7, y: 122.7 },
  { x: 804.6, y: 37.2 },
  { x: 904, y: 550 },
  { x: 439.3, y: 715.9 },
]

const makeInitialSheet = (count: number) =>
  count === 4 ? defaultSheet4 : makePolygon(count, 240)

const makeInitialRobots = (count: number) =>
  count === 4 ? defaultRobots4 : makePolygon(count, 460)

const resizePoints = (
  points: Point[],
  count: number,
  kind: PointKind,
): Point[] => {
  if (points.length === count) {
    return points
  }

  const generated =
    kind === 'sheet' ? makeInitialSheet(count) : makeInitialRobots(count)

  if (points.length > count) {
    return points.slice(0, count)
  }

  return [...points, ...generated.slice(points.length)]
}

const pointsToJson = (points: Point[]) =>
  JSON.stringify(
    points.map((point) => [round(point.x), round(point.y)]),
    null,
    2,
  )

const allConfigToJson = (
  robotCount: number,
  holdHeight: number,
  sheet: Point[],
  robots: Point[],
) =>
  JSON.stringify(
    {
      robotCount,
      holdHeight,
      sheet: sheet.map((point) => [round(point.x), round(point.y)]),
      formation: robots.map((point) => [round(point.x), round(point.y)]),
    },
    null,
    2,
  )

const pointFromUnknown = (value: unknown): Point | null => {
  if (Array.isArray(value) && value.length >= 2) {
    const x = Number(value[0])
    const y = Number(value[1])
    return Number.isFinite(x) && Number.isFinite(y)
      ? { x: round(x), y: round(y) }
      : null
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const x = Number(record.x)
    const y = Number(record.y)
    return Number.isFinite(x) && Number.isFinite(y)
      ? { x: round(x), y: round(y) }
      : null
  }

  return null
}

const parsePointText = (text: string): Point[] => {
  const trimmed = text.trim()
  if (!trimmed) {
    throw new PointParseError('emptyInput')
  }

  if (trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed) as unknown
    if (!Array.isArray(parsed)) {
      throw new PointParseError('jsonRootArray')
    }

    const points = parsed.map(pointFromUnknown)
    if (points.some((point) => point === null)) {
      throw new PointParseError('invalidPointItem')
    }

    return points as Point[]
  }

  const points = trimmed
    .split(/\r?\n/)
    .map((line) => {
      const matches = line.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)
      if (!matches || matches.length < 2) {
        return null
      }

      const x = Number(matches[0])
      const y = Number(matches[1])
      return Number.isFinite(x) && Number.isFinite(y)
        ? { x: round(x), y: round(y) }
        : null
    })
    .filter((point): point is Point => point !== null)

  if (!points.length) {
    throw new PointParseError('noCoordinateRows')
  }

  return points
}

const clampRobotCount = (value: number) =>
  Math.min(MAX_ROBOT_COUNT, Math.max(MIN_ROBOT_COUNT, Math.round(value)))

const toSvgPoint = (point: Point) => ({
  x: point.x,
  y: -point.y,
})

const buildViewBox = (points: Point[]): ViewBox => {
  if (!points.length) {
    return { minX: -600, minY: -420, width: 1200, height: 840 }
  }

  const svgPoints = points.map(toSvgPoint)
  const minX = Math.min(...svgPoints.map((point) => point.x))
  const maxX = Math.max(...svgPoints.map((point) => point.x))
  const minY = Math.min(...svgPoints.map((point) => point.y))
  const maxY = Math.max(...svgPoints.map((point) => point.y))
  const spanX = Math.max(1, maxX - minX)
  const spanY = Math.max(1, maxY - minY)
  const padding = Math.max(120, Math.max(spanX, spanY) * 0.18)

  return {
    minX: minX - padding,
    minY: minY - padding,
    width: spanX + padding * 2,
    height: spanY + padding * 2,
  }
}

const scaleViewBox = (
  viewBox: ViewBox,
  factor: number,
  anchor: { x: number; y: number },
): ViewBox => {
  const currentSpan = Math.max(viewBox.width, viewBox.height)
  const nextSpan = currentSpan * factor
  const safeFactor =
    nextSpan < MIN_VIEWBOX_SPAN
      ? MIN_VIEWBOX_SPAN / currentSpan
      : nextSpan > MAX_VIEWBOX_SPAN
        ? MAX_VIEWBOX_SPAN / currentSpan
        : factor
  const nextWidth = viewBox.width * safeFactor
  const nextHeight = viewBox.height * safeFactor

  return {
    minX: round(anchor.x - (anchor.x - viewBox.minX) * safeFactor),
    minY: round(anchor.y - (anchor.y - viewBox.minY) * safeFactor),
    width: round(nextWidth),
    height: round(nextHeight),
  }
}

const makeGrid = (viewBox: ViewBox): GridLines => {
  const targetLines = 9
  const rawStep = Math.max(viewBox.width, viewBox.height) / targetLines
  const exponent = Math.floor(Math.log10(rawStep))
  const base = 10 ** exponent
  const fraction = rawStep / base
  const step =
    fraction <= 1 ? base : fraction <= 2 ? base * 2 : fraction <= 5 ? base * 5 : base * 10

  const startX = Math.ceil(viewBox.minX / step) * step
  const endX = viewBox.minX + viewBox.width
  const startY = Math.ceil(viewBox.minY / step) * step
  const endY = viewBox.minY + viewBox.height
  const vertical: number[] = []
  const horizontal: number[] = []

  for (let x = startX; x <= endX; x += step) {
    vertical.push(round(x))
  }

  for (let y = startY; y <= endY; y += step) {
    horizontal.push(round(y))
  }

  return { vertical, horizontal }
}

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    const code =
      'code' in error && typeof error.code === 'string'
        ? ` [${error.code}]`
        : ''
    return `${error.message}${code}`
  }

  return String(error)
}

const isNoStableSolutionError = (error: unknown) =>
  error instanceof Error &&
  'code' in error &&
  error.code === 'NO_STABLE_SOLUTION'

const formatStatusMessage = (status: StatusMessage, t: Messages) => {
  switch (status.type) {
    case 'ready':
      return t.status.ready
    case 'countSet':
      return t.status.countSet(status.count)
    case 'pointsApplied':
      return t.status.pointsApplied(t.labels[status.kind], status.count)
    case 'textSynced':
      return status.kind === 'sheet'
        ? t.status.sheetTextSynced
        : t.status.robotsTextSynced
    case 'copied':
      return t.status.copied(t.labels[status.label])
    case 'copyFailed':
      return t.status.copyFailed(status.message)
    case 'parseError':
      return t.parseErrors[status.code]
    case 'pointCountRange':
      return t.status.pointCountRange(status.min, status.max)
    case 'error':
      return status.message
  }
}

function App() {
  const [locale, setLocale] = useState<Locale>(() => getInitialLocale())
  const [indexBase, setIndexBase] = useState<IndexBase>(() =>
    getInitialIndexBase(),
  )
  const [robotCount, setRobotCount] = useState(DEFAULT_ROBOT_COUNT)
  const [holdHeight, setHoldHeight] = useState(DEFAULT_HOLD_HEIGHT)
  const [sheet, setSheet] = useState<Point[]>(() =>
    makeInitialSheet(DEFAULT_ROBOT_COUNT),
  )
  const [robots, setRobots] = useState<Point[]>(() =>
    makeInitialRobots(DEFAULT_ROBOT_COUNT),
  )
  const [selectedKind, setSelectedKind] = useState<PointKind>('sheet')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [solutionDisplayMode, setSolutionDisplayMode] =
    useState<SolutionDisplayMode>('single')
  const [selectedSolutionIndex, setSelectedSolutionIndex] =
    useState<number | null>(null)
  const [canvasInteraction, setCanvasInteraction] =
    useState<CanvasInteraction | null>(null)
  const [status, setStatus] = useState<StatusMessage>({ type: 'ready' })
  const [canvasMetrics, setCanvasMetrics] = useState<CanvasMetrics>(
    DEFAULT_CANVAS_METRICS,
  )
  const [sheetText, setSheetText] = useState(() =>
    pointsToJson(makeInitialSheet(DEFAULT_ROBOT_COUNT)),
  )
  const [robotsText, setRobotsText] = useState(() =>
    pointsToJson(makeInitialRobots(DEFAULT_ROBOT_COUNT)),
  )
  const [sheetTextDirty, setSheetTextDirty] = useState(false)
  const [robotsTextDirty, setRobotsTextDirty] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)
  const currentSheetText = useMemo(() => pointsToJson(sheet), [sheet])
  const currentRobotsText = useMemo(() => pointsToJson(robots), [robots])
  const visibleSheetText = sheetTextDirty ? sheetText : currentSheetText
  const visibleRobotsText = robotsTextDirty ? robotsText : currentRobotsText
  const t = translations[locale]
  const statusText = formatStatusMessage(status, t)

  useEffect(() => {
    document.documentElement.lang = locale
    storeLocale(locale)
  }, [locale])

  useEffect(() => {
    storeIndexBase(indexBase)
  }, [indexBase])

  const solveState = useMemo<SolveState>(() => {
    if (sheet.length !== robotCount || robots.length !== robotCount) {
      return {
        status: 'error',
        message: t.errors.mismatchedCounts,
      }
    }

    try {
      const fk = new VvcmFk(robotCount, holdHeight, toPointInput(sheet))

      try {
        const result = fk.updateStableSolutions(toPointInput(robots))

        return { status: 'ok', result }
      } catch (error) {
        if (isNoStableSolutionError(error)) {
          const result = fk.solutions()
          if (result.solutions.length) {
            return { status: 'ok', result }
          }
        }

        throw error
      } finally {
        fk.free()
      }
    } catch (error) {
      return {
        status: 'error',
        message: getErrorMessage(error),
      }
    }
  }, [holdHeight, robotCount, robots, sheet, t])

  const allSolutions =
    solveState.status === 'ok' ? solveState.result.solutions : EMPTY_SOLUTIONS
  const firstStableSolutionIndex = allSolutions.findIndex(
    (solution) => solution.stable,
  )
  const fallbackSolutionIndex = allSolutions.length
    ? firstStableSolutionIndex >= 0
      ? firstStableSolutionIndex
      : 0
    : null
  const activeSolutionIndex =
    selectedSolutionIndex !== null && allSolutions[selectedSolutionIndex]
      ? selectedSolutionIndex
      : fallbackSolutionIndex
  const indexedSolutions = useMemo<IndexedSolution[]>(
    () =>
      allSolutions.map((solution, index) => ({
        index,
        solution,
      })),
    [allSolutions],
  )
  const selectedSolutionEntry =
    activeSolutionIndex !== null
      ? indexedSolutions[activeSolutionIndex] ?? null
      : null
  const displayedSolutionEntries = useMemo<IndexedSolution[]>(() => {
    if (solutionDisplayMode === 'all') {
      return indexedSolutions
    }

    return selectedSolutionEntry ? [selectedSolutionEntry] : []
  }, [indexedSolutions, selectedSolutionEntry, solutionDisplayMode])
  const showTautCableSegments = displayedSolutionEntries.length === 1

  const canvasPoints = useMemo(() => {
    const points = [...sheet, ...robots]
    points.push(
      ...displayedSolutionEntries.flatMap(({ solution }) => [
        {
          x: solution.po.x,
          y: solution.po.y,
        },
        solution.vo,
      ]),
    )

    return points
  }, [displayedSolutionEntries, robots, sheet])

  const [viewBox, setViewBox] = useState<ViewBox>(() =>
    buildViewBox(canvasPoints),
  )
  const grid = useMemo(() => makeGrid(viewBox), [viewBox])
  const viewBoxText = `${viewBox.minX} ${viewBox.minY} ${viewBox.width} ${viewBox.height}`
  const canvasStyle = useMemo(
    () =>
      ({
        '--canvas-label-size': `${canvasMetrics.labelSize}px`,
        '--canvas-status-size': `${canvasMetrics.statusSize}px`,
        '--canvas-label-stroke': `${canvasMetrics.labelStroke}px`,
      }) as CSSProperties,
    [canvasMetrics],
  )
  const selectedPoints = selectedKind === 'sheet' ? sheet : robots
  const selectedPoint = selectedPoints[selectedIndex] ?? selectedPoints[0]
  const selectedLabel = pointLabel(selectedKind, selectedIndex, indexBase)

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) {
      return
    }

    const updateCanvasMetrics = () => {
      const { height, width } = svg.getBoundingClientRect()
      if (!height || !width) {
        return
      }

      const unitsPerPixel = Math.max(
        viewBox.width / width,
        viewBox.height / height,
      )
      const nextMetrics = scaleCanvasMetrics(unitsPerPixel)

      setCanvasMetrics((current) =>
        sameCanvasMetrics(current, nextMetrics) ? current : nextMetrics,
      )
    }

    updateCanvasMetrics()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateCanvasMetrics)
      return () => window.removeEventListener('resize', updateCanvasMetrics)
    }

    const resizeObserver = new ResizeObserver(updateCanvasMetrics)
    resizeObserver.observe(svg)

    return () => resizeObserver.disconnect()
  }, [viewBox.height, viewBox.width])

  const updatePoint = (kind: PointKind, index: number, point: Point) => {
    const safePoint = { x: round(point.x), y: round(point.y) }

    if (kind === 'sheet') {
      setSheet((current) =>
        current.map((item, itemIndex) =>
          itemIndex === index ? safePoint : item,
        ),
      )
    } else {
      setRobots((current) =>
        current.map((item, itemIndex) =>
          itemIndex === index ? safePoint : item,
        ),
      )
    }
  }

  const handleRobotCountChange = (value: number) => {
    if (!Number.isFinite(value)) {
      return
    }

    const nextCount = clampRobotCount(value)
    setRobotCount(nextCount)
    setSheet((current) => resizePoints(current, nextCount, 'sheet'))
    setRobots((current) => resizePoints(current, nextCount, 'robots'))
    setSelectedIndex((current) => Math.min(current, nextCount - 1))
    setStatus({ type: 'countSet', count: nextCount })
  }

  const handleHoldHeightChange = (value: number) => {
    if (!Number.isFinite(value)) {
      return
    }

    setHoldHeight(round(Math.max(0, value)))
  }

  const getSvgPoint = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current
    const matrix = svg?.getScreenCTM()
    if (!svg || !matrix) {
      return null
    }

    const point = svg.createSVGPoint()
    point.x = clientX
    point.y = clientY
    return point.matrixTransform(matrix.inverse())
  }, [])

  const getCanvasPoint = (event: PointerEvent<SVGElement>): Point | null => {
    const transformed = getSvgPoint(event.clientX, event.clientY)
    return transformed
      ? { x: round(transformed.x), y: round(-transformed.y) }
      : null
  }

  const getPointByKind = (kind: PointKind, index: number) => {
    const source = kind === 'sheet' ? sheet : robots
    return source[index] ?? null
  }

  const handleCanvasPointerDown = (event: PointerEvent<SVGRectElement>) => {
    if (!svgRef.current) {
      return
    }

    event.preventDefault()
    setCanvasInteraction({
      type: 'pan',
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startViewBox: viewBox,
    })
    svgRef.current?.setPointerCapture(event.pointerId)
  }

  const handlePointPointerDown =
    (kind: PointKind, index: number) =>
    (event: PointerEvent<SVGCircleElement | SVGTextElement>) => {
      event.preventDefault()
      event.stopPropagation()
      const pointerPoint = getCanvasPoint(event)
      const currentPoint = getPointByKind(kind, index)
      if (!pointerPoint || !currentPoint) {
        return
      }

      setSelectedKind(kind)
      setSelectedIndex(index)
      setCanvasInteraction({
        type: 'point',
        kind,
        index,
        offsetX: currentPoint.x - pointerPoint.x,
        offsetY: currentPoint.y - pointerPoint.y,
        pointerId: event.pointerId,
      })
      svgRef.current?.setPointerCapture(event.pointerId)
    }

  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (!canvasInteraction || canvasInteraction.pointerId !== event.pointerId) {
      return
    }

    if (canvasInteraction.type === 'point') {
      const point = getCanvasPoint(event)
      if (point) {
        updatePoint(canvasInteraction.kind, canvasInteraction.index, {
          x: point.x + canvasInteraction.offsetX,
          y: point.y + canvasInteraction.offsetY,
        })
      }
      return
    }

    const svg = svgRef.current
    const bounds = svg?.getBoundingClientRect()
    if (!bounds || !bounds.width || !bounds.height) {
      return
    }

    const unitsPerPixel = Math.max(
      canvasInteraction.startViewBox.width / bounds.width,
      canvasInteraction.startViewBox.height / bounds.height,
    )
    const deltaX =
      (event.clientX - canvasInteraction.startClientX) * unitsPerPixel
    const deltaY =
      (event.clientY - canvasInteraction.startClientY) * unitsPerPixel

    setViewBox({
      ...canvasInteraction.startViewBox,
      minX: round(canvasInteraction.startViewBox.minX - deltaX),
      minY: round(canvasInteraction.startViewBox.minY - deltaY),
    })
  }

  const handlePointerUp = (event: PointerEvent<SVGSVGElement>) => {
    if (!canvasInteraction || canvasInteraction.pointerId !== event.pointerId) {
      return
    }

    setCanvasInteraction(null)
    if (svgRef.current?.hasPointerCapture(event.pointerId)) {
      svgRef.current.releasePointerCapture(event.pointerId)
    }
  }

  const handleCanvasWheel = useCallback((event: WheelEvent) => {
    event.preventDefault()
    event.stopPropagation()

    if (event.deltaY === 0) {
      return
    }

    const anchor = getSvgPoint(event.clientX, event.clientY)
    if (!anchor) {
      return
    }

    setViewBox((current) =>
      scaleViewBox(
        current,
        event.deltaY < 0 ? ZOOM_IN_FACTOR : ZOOM_OUT_FACTOR,
        anchor,
      ),
    )
  }, [getSvgPoint])

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) {
      return
    }

    svg.addEventListener('wheel', handleCanvasWheel, { passive: false })
    return () => svg.removeEventListener('wheel', handleCanvasWheel)
  }, [handleCanvasWheel])

  const zoomAtCenter = (factor: number) => {
    setViewBox((current) =>
      scaleViewBox(current, factor, {
        x: current.minX + current.width / 2,
        y: current.minY + current.height / 2,
      }),
    )
  }

  const fitCanvasView = () => {
    setViewBox(buildViewBox(canvasPoints))
  }

  const handlePointTableChange = (
    kind: PointKind,
    index: number,
    axis: keyof Point,
    value: number,
  ) => {
    if (!Number.isFinite(value)) {
      return
    }

    const source = kind === 'sheet' ? sheet : robots
    const point = source[index]
    if (!point) {
      return
    }

    updatePoint(kind, index, { ...point, [axis]: value })
  }

  const applyPointText = (kind: PointKind) => {
    try {
      const text = kind === 'sheet' ? visibleSheetText : visibleRobotsText
      const parsed = parsePointText(text)

      if (
        parsed.length < MIN_ROBOT_COUNT ||
        parsed.length > MAX_ROBOT_COUNT
      ) {
        setStatus({
          type: 'pointCountRange',
          min: MIN_ROBOT_COUNT,
          max: MAX_ROBOT_COUNT,
        })
        return
      }

      setRobotCount(parsed.length)
      setSelectedIndex((current) => Math.min(current, parsed.length - 1))

      if (kind === 'sheet') {
        setSheet(parsed)
        setRobots((current) => resizePoints(current, parsed.length, 'robots'))
        setSheetText(pointsToJson(parsed))
        setSheetTextDirty(false)
      } else {
        setRobots(parsed)
        setSheet((current) => resizePoints(current, parsed.length, 'sheet'))
        setRobotsText(pointsToJson(parsed))
        setRobotsTextDirty(false)
      }

      setStatus({ type: 'pointsApplied', kind, count: parsed.length })
    } catch (error) {
      if (error instanceof PointParseError) {
        setStatus({ type: 'parseError', code: error.code })
      } else {
        setStatus({ type: 'error', message: getErrorMessage(error) })
      }
    }
  }

  const syncPointText = (kind: PointKind) => {
    if (kind === 'sheet') {
      setSheetText(currentSheetText)
      setSheetTextDirty(false)
      setStatus({ type: 'textSynced', kind })
    } else {
      setRobotsText(currentRobotsText)
      setRobotsTextDirty(false)
      setStatus({ type: 'textSynced', kind })
    }
  }

  const copyText = async (label: LabelKey, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setStatus({ type: 'copied', label })
    } catch (error) {
      setStatus({ type: 'copyFailed', message: getErrorMessage(error) })
    }
  }

  const copyAllConfig = () =>
    copyText(
      'allConfig',
      allConfigToJson(robotCount, holdHeight, sheet, robots),
    )

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">{t.header.eyebrow}</p>
          <h1>{t.header.title}</h1>
        </div>
        <div className="header-actions">
          <div className="index-base-control">
            <span>{t.header.indexBaseLabel}</span>
            <div
              className="index-base-toggle"
              role="group"
              aria-label={t.header.indexBaseAriaLabel}
            >
              <button
                type="button"
                className={indexBase === 0 ? 'active' : ''}
                onClick={() => setIndexBase(0)}
              >
                {t.header.zeroBasedIndex}
              </button>
              <button
                type="button"
                className={indexBase === 1 ? 'active' : ''}
                onClick={() => setIndexBase(1)}
              >
                {t.header.oneBasedIndex}
              </button>
            </div>
          </div>
          <label className="language-select">
            <span>{t.language.selectorLabel}</span>
            <select
              aria-label={t.language.ariaLabel}
              value={locale}
              onChange={(event) => setLocale(event.currentTarget.value as Locale)}
            >
              {localeOptions.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="secondary-button" onClick={copyAllConfig}>
            {t.header.copyAllConfig}
          </button>
          <div className="version-pill">vvcm-rs {version()}</div>
        </div>
      </header>

      <section className="workspace">
        <aside className="control-column" aria-label={t.controls.ariaLabel}>
          <section className="panel">
            <div className="panel-heading">
              <h2>{t.controls.title}</h2>
              <span>{t.controls.pointCount(robotCount)}</span>
            </div>
            <div className="field-grid">
              <label className="field">
                <span>{t.controls.robotCountLabel}</span>
                <input
                  type="number"
                  min={MIN_ROBOT_COUNT}
                  max={MAX_ROBOT_COUNT}
                  step={1}
                  value={robotCount}
                  onChange={(event) =>
                    handleRobotCountChange(event.currentTarget.valueAsNumber)
                  }
                />
              </label>
              <label className="field">
                <span>{t.controls.holdHeightLabel}</span>
                <input
                  type="number"
                  min={0}
                  step={10}
                  value={holdHeight}
                  onChange={(event) =>
                    handleHoldHeightChange(event.currentTarget.valueAsNumber)
                  }
                />
              </label>
            </div>
            <div className="mode-row" role="group" aria-label={t.controls.editTargetAriaLabel}>
              <button
                type="button"
                className={selectedKind === 'sheet' ? 'active' : ''}
                onClick={() => setSelectedKind('sheet')}
              >
                {t.controls.sheetButton}
              </button>
              <button
                type="button"
                className={selectedKind === 'robots' ? 'active' : ''}
                onClick={() => setSelectedKind('robots')}
              >
                {t.controls.robotsButton}
              </button>
            </div>
            <div className="selected-point">
              <span>{selectedLabel}</span>
              <label>
                X
                <input
                  type="number"
                  step={1}
                  value={selectedPoint ? formatNumber(selectedPoint.x) : 0}
                  onChange={(event) =>
                    handlePointTableChange(
                      selectedKind,
                      selectedIndex,
                      'x',
                      event.currentTarget.valueAsNumber,
                    )
                  }
                />
              </label>
              <label>
                Y
                <input
                  type="number"
                  step={1}
                  value={selectedPoint ? formatNumber(selectedPoint.y) : 0}
                  onChange={(event) =>
                    handlePointTableChange(
                      selectedKind,
                      selectedIndex,
                      'y',
                      event.currentTarget.valueAsNumber,
                    )
                  }
                />
              </label>
            </div>
          </section>

          <PointTable
            pointHeader={t.controls.tablePointHeader}
            title={t.controls.sheetTableTitle}
            prefix="v"
            indexBase={indexBase}
            kind="sheet"
            points={sheet}
            selectedKind={selectedKind}
            selectedIndex={selectedIndex}
            onSelect={(index) => {
              setSelectedKind('sheet')
              setSelectedIndex(index)
            }}
            onChange={handlePointTableChange}
          />

          <PointTable
            pointHeader={t.controls.tablePointHeader}
            title={t.controls.robotTableTitle}
            prefix="r"
            indexBase={indexBase}
            kind="robots"
            points={robots}
            selectedKind={selectedKind}
            selectedIndex={selectedIndex}
            onSelect={(index) => {
              setSelectedKind('robots')
              setSelectedIndex(index)
            }}
            onChange={handlePointTableChange}
          />
        </aside>

        <section className="visual-column">
          <section className="canvas-panel">
            <div className="panel-heading canvas-heading">
              <div>
                <h2>{t.canvas.title}</h2>
                <span>{t.canvas.currentSelection(selectedLabel)}</span>
              </div>
              <div className="canvas-heading-actions">
                <div
                  className="canvas-tools"
                  role="group"
                  aria-label={t.canvas.viewControlsAriaLabel}
                >
                  <button
                    type="button"
                    aria-label={t.canvas.zoomIn}
                    title={t.canvas.zoomIn}
                    onClick={() => zoomAtCenter(ZOOM_IN_FACTOR)}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    aria-label={t.canvas.zoomOut}
                    title={t.canvas.zoomOut}
                    onClick={() => zoomAtCenter(ZOOM_OUT_FACTOR)}
                  >
                    -
                  </button>
                  <button
                    type="button"
                    className="fit-view-button"
                    onClick={fitCanvasView}
                  >
                    {t.canvas.fitView}
                  </button>
                </div>
                <div className="legend" aria-label={t.canvas.legendAriaLabel}>
                  <span className="legend-item sheet">{t.canvas.sheetLegend}</span>
                  <span className="legend-item robot">{t.canvas.robotLegend}</span>
                  <span className="legend-item stable-solution">
                    {t.canvas.stableSolutionLegend}
                  </span>
                  <span className="legend-item unstable-solution">
                    {t.canvas.unstableSolutionLegend}
                  </span>
                </div>
              </div>
            </div>
            <svg
              ref={svgRef}
              className={`coordinate-canvas ${
                canvasInteraction?.type === 'pan' ? 'panning' : ''
              } ${canvasInteraction?.type === 'point' ? 'point-dragging' : ''}`}
              style={canvasStyle}
              viewBox={viewBoxText}
              role="img"
              aria-label={t.canvas.ariaLabel}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            >
              <rect
                className="canvas-hit-area"
                x={viewBox.minX}
                y={viewBox.minY}
                width={viewBox.width}
                height={viewBox.height}
                onPointerDown={handleCanvasPointerDown}
              />
              <g className="grid-lines">
                {grid.vertical.map((x) => (
                  <line
                    key={`v-${x}`}
                    x1={x}
                    y1={viewBox.minY}
                    x2={x}
                    y2={viewBox.minY + viewBox.height}
                  />
                ))}
                {grid.horizontal.map((y) => (
                  <line
                    key={`h-${y}`}
                    x1={viewBox.minX}
                    y1={y}
                    x2={viewBox.minX + viewBox.width}
                    y2={y}
                  />
                ))}
              </g>
              <g className="axis-lines">
                <line
                  x1={viewBox.minX}
                  y1={0}
                  x2={viewBox.minX + viewBox.width}
                  y2={0}
                />
                <line
                  x1={0}
                  y1={viewBox.minY}
                  x2={0}
                  y2={viewBox.minY + viewBox.height}
                />
              </g>
              <polygon
                className="sheet-polygon"
                points={sheet
                  .map(toSvgPoint)
                  .map((point) => `${point.x},${point.y}`)
                  .join(' ')}
              />
              <polyline
                className="robot-polyline"
                points={[...robots, robots[0]]
                  .filter(Boolean)
                  .map(toSvgPoint)
                  .map((point) => `${point.x},${point.y}`)
                  .join(' ')}
              />
              <g className="cable-lines">
                {sheet.map((sheetPoint, index) => {
                  const robotPoint = robots[index]
                  const sheetSvg = toSvgPoint(sheetPoint)
                  const robotSvg = toSvgPoint(robotPoint)

                  return (
                    <line
                      key={`cable-${index}`}
                      x1={sheetSvg.x}
                      y1={sheetSvg.y}
                      x2={robotSvg.x}
                      y2={robotSvg.y}
                    />
                  )
                })}
              </g>
              {showTautCableSegments && (
                <g className="taut-cable-lines">
                  {displayedSolutionEntries.flatMap(({ index, solution }) => {
                    const voSvg = toSvgPoint(solution.vo)
                    const roSvg = toSvgPoint(solution.po)

                    return solution.tautCables.flatMap((cableIndex) => {
                      const sheetPoint = sheet[cableIndex]
                      const robotPoint = robots[cableIndex]
                      if (!sheetPoint || !robotPoint) {
                        return []
                      }

                      const sheetSvg = toSvgPoint(sheetPoint)
                      const robotSvg = toSvgPoint(robotPoint)

                      return [
                        <line
                          key={`taut-sheet-${index}-${cableIndex}`}
                          className="sheet-side"
                          x1={sheetSvg.x}
                          y1={sheetSvg.y}
                          x2={voSvg.x}
                          y2={voSvg.y}
                        />,
                        <line
                          key={`taut-robot-${index}-${cableIndex}`}
                          className="robot-side"
                          x1={robotSvg.x}
                          y1={robotSvg.y}
                          x2={roSvg.x}
                          y2={roSvg.y}
                        />,
                      ]
                    })
                  })}
                </g>
              )}
              {displayedSolutionEntries.map(({ index, solution }) => {
                const objectPoint = toSvgPoint(solution.po)
                const virtualPoint = toSvgPoint(solution.vo)
                const solutionState = solution.stable ? 'stable' : 'unstable'

                return (
                  <g
                    key={`object-${index}`}
                    style={solutionColorStyle(index)}
                  >
                    <g className={`object-marker ${solutionState}`}>
                      <circle
                        cx={objectPoint.x}
                        cy={objectPoint.y}
                        r={canvasMetrics.objectRadius}
                      />
                      <text
                        x={
                          objectPoint.x + canvasMetrics.objectLabelXOffset
                        }
                        y={
                          objectPoint.y + canvasMetrics.objectTitleYOffset
                        }
                      >
                        po{displayIndex(index, indexBase)}
                      </text>
                      <text
                        className="object-status"
                        x={
                          objectPoint.x + canvasMetrics.objectLabelXOffset
                        }
                        y={
                          objectPoint.y + canvasMetrics.objectStatusYOffset
                        }
                      >
                        {solution.stable
                          ? t.results.stableBadge
                          : t.results.unstableBadge}
                      </text>
                    </g>
                    <g className={`object-marker virtual ${solutionState}`}>
                      <circle
                        cx={virtualPoint.x}
                        cy={virtualPoint.y}
                        r={canvasMetrics.virtualObjectRadius}
                      />
                      <text
                        x={
                          virtualPoint.x + canvasMetrics.objectLabelXOffset
                        }
                        y={
                          virtualPoint.y +
                          canvasMetrics.virtualObjectTitleYOffset
                        }
                      >
                        vo{displayIndex(index, indexBase)}
                      </text>
                    </g>
                  </g>
                )
              })}
              <g className="sheet-points">
                {sheet.map((point, index) => {
                  const svgPoint = toSvgPoint(point)
                  const active =
                    selectedKind === 'sheet' && selectedIndex === index

                  return (
                    <g key={`sheet-${index}`}>
                      <circle
                        className="point-hit-target"
                        cx={svgPoint.x}
                        cy={svgPoint.y}
                        r={canvasMetrics.sheetHitRadius}
                        onPointerDown={handlePointPointerDown('sheet', index)}
                      />
                      <circle
                        className={`point-marker ${active ? 'active' : ''}`}
                        cx={svgPoint.x}
                        cy={svgPoint.y}
                        r={
                          active
                            ? canvasMetrics.sheetActiveMarkerRadius
                            : canvasMetrics.sheetMarkerRadius
                        }
                        onPointerDown={handlePointPointerDown('sheet', index)}
                      />
                      <text
                        x={svgPoint.x + canvasMetrics.pointLabelXOffset}
                        y={svgPoint.y + canvasMetrics.sheetLabelYOffset}
                        onPointerDown={handlePointPointerDown('sheet', index)}
                      >
                        {pointLabel('sheet', index, indexBase)}
                      </text>
                    </g>
                  )
                })}
              </g>
              <g className="robot-points">
                {robots.map((point, index) => {
                  const svgPoint = toSvgPoint(point)
                  const active =
                    selectedKind === 'robots' && selectedIndex === index

                  return (
                    <g key={`robot-${index}`}>
                      <circle
                        className="point-hit-target"
                        cx={svgPoint.x}
                        cy={svgPoint.y}
                        r={canvasMetrics.robotHitRadius}
                        onPointerDown={handlePointPointerDown('robots', index)}
                      />
                      <circle
                        className={`point-marker ${active ? 'active' : ''}`}
                        cx={svgPoint.x}
                        cy={svgPoint.y}
                        r={
                          active
                            ? canvasMetrics.robotActiveMarkerRadius
                            : canvasMetrics.robotMarkerRadius
                        }
                        onPointerDown={handlePointPointerDown('robots', index)}
                      />
                      <text
                        x={svgPoint.x + canvasMetrics.pointLabelXOffset}
                        y={svgPoint.y + canvasMetrics.robotLabelYOffset}
                        onPointerDown={handlePointPointerDown('robots', index)}
                      >
                        {pointLabel('robots', index, indexBase)}
                      </text>
                    </g>
                  )
                })}
              </g>
            </svg>
          </section>

          <section className="result-panel">
            <div className="panel-heading">
              <h2>{t.results.title}</h2>
              <span className={solveState.status === 'ok' ? 'ok' : 'error'}>
                {solveState.status === 'ok'
                  ? t.results.stableCount(solveState.result.stableCount, solveState.result.allCount)
                  : t.results.solveError}
              </span>
            </div>
            {solveState.status === 'ok' ? (
              <>
                <div className="solution-controls">
                  <div
                    className="mode-row solution-mode-row"
                    role="group"
                    aria-label={t.results.displayModeAriaLabel}
                  >
                    <button
                      type="button"
                      className={
                        solutionDisplayMode === 'single' ? 'active' : ''
                      }
                      disabled={!indexedSolutions.length}
                      onClick={() => setSolutionDisplayMode('single')}
                    >
                      {t.results.singleDisplay}
                    </button>
                    <button
                      type="button"
                      className={solutionDisplayMode === 'all' ? 'active' : ''}
                      disabled={!indexedSolutions.length}
                      onClick={() => setSolutionDisplayMode('all')}
                    >
                      {t.results.allDisplay}
                    </button>
                  </div>
                  <label className="solution-select">
                    <span>{t.results.selectedSolutionLabel}</span>
                    <select
                      value={activeSolutionIndex ?? ''}
                      disabled={
                        !indexedSolutions.length ||
                        solutionDisplayMode === 'all'
                      }
                      onChange={(event) =>
                        setSelectedSolutionIndex(
                          Number(event.currentTarget.value),
                        )
                      }
                    >
                      {indexedSolutions.map(({ index, solution }) => {
                        const stateLabel = solution.stable
                          ? t.results.stableBadge
                          : t.results.unstableBadge

                        return (
                          <option key={`solution-option-${index}`} value={index}>
                            {t.results.solutionOption(
                              displayIndex(index, indexBase),
                              stateLabel,
                            )}
                          </option>
                        )
                      })}
                    </select>
                  </label>
                </div>
                <div className="solution-list">
                  {indexedSolutions.length ? (
                    indexedSolutions.map(({ index, solution }) => {
                      const stateLabel = solution.stable
                        ? t.results.stableBadge
                        : t.results.unstableBadge
                      const shown =
                        solutionDisplayMode === 'all' ||
                        activeSolutionIndex === index

                      return (
                        <button
                          type="button"
                          className={`solution-row ${shown ? 'shown' : ''}`}
                          key={`solution-${index}`}
                          style={solutionColorStyle(index)}
                          onClick={() => {
                            setSelectedSolutionIndex(index)
                            setSolutionDisplayMode('single')
                          }}
                        >
                          <span
                            className="solution-color-dot"
                            aria-hidden="true"
                          />
                          <span className="solution-index">
                            #{displayIndex(index, indexBase)}
                          </span>
                          <span
                            className={`solution-badge ${
                              solution.stable ? 'stable' : 'unstable'
                            }`}
                          >
                            {stateLabel}
                          </span>
                          <code>
                            po=({formatNumber(solution.po.x)},{' '}
                            {formatNumber(solution.po.y)},{' '}
                            {formatNumber(solution.po.z)})
                          </code>
                          <code>
                            vo=({formatNumber(solution.vo.x)},{' '}
                            {formatNumber(solution.vo.y)})
                          </code>
                          <code>
                            taut=[{formatIndexList(solution.tautCables, indexBase)}]
                          </code>
                        </button>
                      )
                    })
                  ) : (
                    <p className="empty-state">{t.results.noSolutions}</p>
                  )}
                </div>
              </>
            ) : (
              <p className="empty-state">{solveState.message}</p>
            )}
          </section>
        </section>

        <aside className="data-column" aria-label={t.data.ariaLabel}>
          <DataEditor
            applyLabel={t.data.apply}
            copyLabel={t.data.copy}
            dirtyLabel={t.data.dirty}
            syncedLabel={t.data.synced}
            syncLabel={t.data.sync}
            title={t.data.sheetJsonTitle}
            value={visibleSheetText}
            dirty={sheetTextDirty}
            onChange={(value) => {
              setSheetText(value)
              setSheetTextDirty(true)
            }}
            onApply={() => applyPointText('sheet')}
            onSync={() => syncPointText('sheet')}
            onCopy={() => copyText('sheet', pointsToJson(sheet))}
          />

          <DataEditor
            applyLabel={t.data.apply}
            copyLabel={t.data.copy}
            dirtyLabel={t.data.dirty}
            syncedLabel={t.data.synced}
            syncLabel={t.data.sync}
            title={t.data.robotsJsonTitle}
            value={visibleRobotsText}
            dirty={robotsTextDirty}
            onChange={(value) => {
              setRobotsText(value)
              setRobotsTextDirty(true)
            }}
            onApply={() => applyPointText('robots')}
            onSync={() => syncPointText('robots')}
            onCopy={() => copyText('robots', pointsToJson(robots))}
          />

          <section className="panel status-panel">
            <div className="panel-heading">
              <h2>{t.data.statusTitle}</h2>
            </div>
            <p>{statusText}</p>
          </section>
        </aside>
      </section>
    </main>
  )
}

type PointTableProps = {
  kind: PointKind
  indexBase: IndexBase
  pointHeader: string
  points: Point[]
  prefix: string
  selectedKind: PointKind
  selectedIndex: number
  title: string
  onSelect: (index: number) => void
  onChange: (
    kind: PointKind,
    index: number,
    axis: keyof Point,
    value: number,
  ) => void
}

function PointTable({
  kind,
  indexBase,
  pointHeader,
  points,
  prefix,
  selectedKind,
  selectedIndex,
  title,
  onSelect,
  onChange,
}: PointTableProps) {
  return (
    <section className="panel point-table">
      <div className="panel-heading">
        <h2>{title}</h2>
        <span>{points.length}</span>
      </div>
      <div className="table-head">
        <span>{pointHeader}</span>
        <span>X</span>
        <span>Y</span>
      </div>
      <div className="table-body">
        {points.map((point, index) => {
          const active = selectedKind === kind && selectedIndex === index

          return (
            <div
              className={`point-row ${active ? 'active' : ''}`}
              key={`${kind}-${index}`}
            >
              <button
                type="button"
                className="point-select"
                onClick={() => onSelect(index)}
              >
                {prefix}{displayIndex(index, indexBase)}
              </button>
              <input
                type="number"
                step={1}
                value={formatNumber(point.x)}
                onFocus={() => onSelect(index)}
                onChange={(event) =>
                  onChange(
                    kind,
                    index,
                    'x',
                    event.currentTarget.valueAsNumber,
                  )
                }
              />
              <input
                type="number"
                step={1}
                value={formatNumber(point.y)}
                onFocus={() => onSelect(index)}
                onChange={(event) =>
                  onChange(
                    kind,
                    index,
                    'y',
                    event.currentTarget.valueAsNumber,
                  )
                }
              />
            </div>
          )
        })}
      </div>
    </section>
  )
}

type DataEditorProps = {
  applyLabel: string
  copyLabel: string
  dirty: boolean
  dirtyLabel: string
  syncedLabel: string
  syncLabel: string
  title: string
  value: string
  onChange: (value: string) => void
  onApply: () => void
  onSync: () => void
  onCopy: () => void
}

function DataEditor({
  applyLabel,
  copyLabel,
  dirty,
  dirtyLabel,
  syncedLabel,
  syncLabel,
  title,
  value,
  onChange,
  onApply,
  onSync,
  onCopy,
}: DataEditorProps) {
  return (
    <section className="panel data-editor">
      <div className="panel-heading">
        <h2>{title}</h2>
        <span>{dirty ? dirtyLabel : syncedLabel}</span>
      </div>
      <textarea
        spellCheck={false}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      <div className="editor-actions">
        <button type="button" className="primary-button" onClick={onApply}>
          {applyLabel}
        </button>
        <button type="button" className="secondary-button" onClick={onSync}>
          {syncLabel}
        </button>
        <button type="button" className="secondary-button" onClick={onCopy}>
          {copyLabel}
        </button>
      </div>
    </section>
  )
}

export default App
