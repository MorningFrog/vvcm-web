import {
  VvcmFk,
  version,
  type FkSolutionOutput,
  type FkSolutionsOutput,
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
  type Locale,
  type Messages,
  type FullConfigErrorCode,
  type ParseErrorCode,
} from './i18n'
import { RobotScene3D, type RobotSceneSolutionEntry } from './RobotScene3D'

type Point = {
  x: number
  y: number
}

type PointKind = 'sheet' | 'robots'

type SolutionDisplayMode = 'single' | 'all'

type IndexBase = 0 | 1

type FullConfig = {
  robotCount: number
  holdHeight: number
  sheet: Point[]
  robots: Point[]
}

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

type ConstraintValidation = {
  distanceViolations: Array<{
    firstIndex: number
    secondIndex: number
  }>
  invalidSheet: boolean
  invalidRobots: boolean
  windingMismatch: boolean
  violatingSheetIndices: number[]
  violatingRobotIndices: number[]
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
      label: string
    }
  | {
      type: 'copyFailed'
      message: string
    }
  | {
      type: 'fullConfigPasted'
      count: number
    }
  | {
      type: 'pasteFailed'
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
      type: 'constraintDragConstrained'
      label: string
    }
  | {
      type: 'constraintDragRejected'
      label: string
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
const GITHUB_ICON_HREF = `${import.meta.env.BASE_URL}icons.svg#github-icon`
const GEOMETRY_TOLERANCE = 1e-6
const GEOMETRY_DRAG_MARGIN = 0.1
const CONSTRAINT_PROJECTION_PASSES = 28
const CONSTRAINT_ARC_SAMPLES = 192
const CONSTRAINT_LINE_SAMPLES = 180

class PointParseError extends Error {
  code: ParseErrorCode

  constructor(code: ParseErrorCode) {
    super(code)
    this.name = 'PointParseError'
    this.code = code
  }
}

class FullConfigParseError extends Error {
  code: FullConfigErrorCode

  constructor(code: FullConfigErrorCode) {
    super(code)
    this.name = 'FullConfigParseError'
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

const formatNumberList = (values: readonly number[]) =>
  values.length ? values.map((value) => formatNumber(value)).join(', ') : '-'

const toPointMatrixInput = (points: Point[]) => {
  const input = new Float32Array(points.length * 2)

  points.forEach((point, index) => {
    input[index * 2] = point.x
    input[index * 2 + 1] = point.y
  })

  return input
}

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

const fkResultToJson = (solveState: SolveState) =>
  JSON.stringify(
    solveState.status === 'ok'
      ? solveState.result
      : {
          status: 'error',
          message: solveState.message,
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const parseFullConfigPoints = (value: unknown): Point[] => {
  if (!Array.isArray(value)) {
    throw new FullConfigParseError('pointArrayRequired')
  }

  const points = value.map(pointFromUnknown)
  if (points.some((point) => point === null)) {
    throw new FullConfigParseError('invalidPointItem')
  }

  return points as Point[]
}

const parseFullConfigText = (text: string): FullConfig => {
  const trimmed = text.trim()
  if (!trimmed) {
    throw new FullConfigParseError('emptyInput')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    throw new FullConfigParseError('invalidJson')
  }

  if (!isRecord(parsed)) {
    throw new FullConfigParseError('jsonRootObject')
  }

  if (
    !('robotCount' in parsed) ||
    !('holdHeight' in parsed) ||
    !('sheet' in parsed) ||
    !('formation' in parsed)
  ) {
    throw new FullConfigParseError('missingField')
  }

  const robotCount = parsed.robotCount
  if (
    typeof robotCount !== 'number' ||
    !Number.isInteger(robotCount) ||
    robotCount < MIN_ROBOT_COUNT ||
    robotCount > MAX_ROBOT_COUNT
  ) {
    throw new FullConfigParseError('invalidRobotCount')
  }

  const holdHeight = parsed.holdHeight
  if (
    typeof holdHeight !== 'number' ||
    !Number.isFinite(holdHeight) ||
    holdHeight < 0
  ) {
    throw new FullConfigParseError('invalidHoldHeight')
  }

  const sheet = parseFullConfigPoints(parsed.sheet)
  const robots = parseFullConfigPoints(parsed.formation)

  if (sheet.length !== robotCount || robots.length !== robotCount) {
    throw new FullConfigParseError('mismatchedCounts')
  }

  return {
    robotCount,
    holdHeight: round(holdHeight),
    sheet,
    robots,
  }
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

const squaredDistance = (a: Point, b: Point) => {
  const deltaX = a.x - b.x
  const deltaY = a.y - b.y
  return deltaX * deltaX + deltaY * deltaY
}

const distance = (a: Point, b: Point) => Math.sqrt(squaredDistance(a, b))

const cross = (a: Point, b: Point, c: Point) =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)

const replacePoint = (points: Point[], index: number, point: Point) =>
  points.map((item, itemIndex) => (itemIndex === index ? point : item))

const signedPolygonArea = (points: Point[]) =>
  points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length]
    return sum + point.x * next.y - next.x * point.y
  }, 0) / 2

const polygonWinding = (points: Point[]) => {
  const area = signedPolygonArea(points)
  if (Math.abs(area) <= GEOMETRY_TOLERANCE) {
    return 0
  }

  return area > 0 ? 1 : -1
}

const invalidConvexVertexIndices = (points: Point[]) => {
  const winding = polygonWinding(points)
  if (points.length < 3 || winding === 0) {
    return points.map((_, index) => index)
  }

  const invalid = new Set<number>()

  points.forEach((point, index) => {
    const previousIndex = (index - 1 + points.length) % points.length
    const nextIndex = (index + 1) % points.length
    const turn = cross(points[previousIndex], point, points[nextIndex])

    if (Math.abs(turn) <= GEOMETRY_TOLERANCE || Math.sign(turn) !== winding) {
      invalid.add(previousIndex)
      invalid.add(index)
      invalid.add(nextIndex)
    }
  })

  return [...invalid].sort((a, b) => a - b)
}

const pairwiseDistanceMatrix = (points: Point[]) =>
  points.map((point, firstIndex) =>
    points.map((otherPoint, secondIndex) =>
      firstIndex === secondIndex ? 0 : distance(point, otherPoint),
    ),
  )

const validateGeometryConstraint = (
  sheet: Point[],
  robots: Point[],
): ConstraintValidation => {
  const sheetDistances = pairwiseDistanceMatrix(sheet)
  const robotDistances = pairwiseDistanceMatrix(robots)
  const distanceViolations: ConstraintValidation['distanceViolations'] = []

  for (
    let firstIndex = 0;
    firstIndex < Math.min(sheet.length, robots.length);
    firstIndex += 1
  ) {
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < Math.min(sheet.length, robots.length);
      secondIndex += 1
    ) {
      if (
        robotDistances[firstIndex][secondIndex] >
        sheetDistances[firstIndex][secondIndex] + GEOMETRY_TOLERANCE
      ) {
        distanceViolations.push({ firstIndex, secondIndex })
      }
    }
  }

  const violatingSheetIndices = new Set<number>()
  const violatingRobotIndices = new Set<number>()

  distanceViolations.forEach(({ firstIndex, secondIndex }) => {
    violatingSheetIndices.add(firstIndex)
    violatingSheetIndices.add(secondIndex)
    violatingRobotIndices.add(firstIndex)
    violatingRobotIndices.add(secondIndex)
  })

  const invalidSheetVertices = invalidConvexVertexIndices(sheet)
  const invalidRobotVertices = invalidConvexVertexIndices(robots)
  invalidSheetVertices.forEach((index) => violatingSheetIndices.add(index))
  invalidRobotVertices.forEach((index) => violatingRobotIndices.add(index))

  const sheetWinding = polygonWinding(sheet)
  const robotWinding = polygonWinding(robots)
  const windingMismatch =
    sheetWinding !== 0 && robotWinding !== 0 && sheetWinding !== robotWinding

  if (windingMismatch) {
    sheet.forEach((_, index) => violatingSheetIndices.add(index))
    robots.forEach((_, index) => violatingRobotIndices.add(index))
  }

  return {
    distanceViolations,
    invalidSheet: invalidSheetVertices.length > 0,
    invalidRobots: invalidRobotVertices.length > 0,
    windingMismatch,
    violatingSheetIndices: [...violatingSheetIndices].sort((a, b) => a - b),
    violatingRobotIndices: [...violatingRobotIndices].sort((a, b) => a - b),
  }
}

const isGeometryConstraintValid = (sheet: Point[], robots: Point[]) => {
  const validation = validateGeometryConstraint(sheet, robots)
  return (
    validation.distanceViolations.length === 0 &&
    !validation.invalidSheet &&
    !validation.invalidRobots &&
    !validation.windingMismatch
  )
}

type CircleConstraint = {
  center: Point
  mode: 'inside' | 'outside'
  radius: number
}

type HalfPlaneConstraint = {
  kind: 'chord' | 'extension'
  start: Point
  end: Point
  value: (point: Point) => number
  gradient: Point
}

const makeHalfPlane = (
  kind: HalfPlaneConstraint['kind'],
  start: Point,
  end: Point,
  value: (point: Point) => number,
  gradient: Point,
): HalfPlaneConstraint => ({
  end,
  gradient,
  kind,
  start,
  value,
})

const circleConstraintRadius = (
  constraint: CircleConstraint,
  safetyMargin = 0,
) =>
  constraint.mode === 'inside'
    ? Math.max(0, constraint.radius - safetyMargin)
    : constraint.radius + safetyMargin

const halfPlaneRequiredValue = (
  constraint: HalfPlaneConstraint,
  safetyMargin = 0,
) => {
  if (safetyMargin <= 0) {
    return -GEOMETRY_TOLERANCE
  }

  const gradientLength = Math.hypot(
    constraint.gradient.x,
    constraint.gradient.y,
  )

  return gradientLength * safetyMargin
}

const activeWindingForKind = (
  kind: PointKind,
  sheet: Point[],
  robots: Point[],
) => {
  const reference = polygonWinding(kind === 'robots' ? sheet : robots)
  if (reference !== 0) {
    return reference
  }

  const fallback = polygonWinding(kind === 'robots' ? robots : sheet)
  return fallback === 0 ? 1 : fallback
}

const buildDistanceConstraints = (
  kind: PointKind,
  index: number,
  sheet: Point[],
  robots: Point[],
): CircleConstraint[] =>
  Array.from({ length: Math.min(sheet.length, robots.length) }, (_, otherIndex) => {
    if (otherIndex === index) {
      return null
    }

    return kind === 'robots'
      ? {
          center: robots[otherIndex],
          mode: 'inside' as const,
          radius: distance(sheet[index], sheet[otherIndex]),
        }
      : {
          center: sheet[otherIndex],
          mode: 'outside' as const,
          radius: distance(robots[index], robots[otherIndex]),
        }
  }).filter(
    (constraint): constraint is CircleConstraint =>
      constraint !== null && Number.isFinite(constraint.radius),
  )

const buildConvexityConstraints = (
  kind: PointKind,
  index: number,
  sheet: Point[],
  robots: Point[],
): HalfPlaneConstraint[] => {
  const polygon = kind === 'robots' ? robots : sheet
  const count = polygon.length
  if (count < 3) {
    return []
  }

  const winding = activeWindingForKind(kind, sheet, robots)
  const previousIndex = (index - 1 + count) % count
  const nextIndex = (index + 1) % count
  const previousPreviousIndex = (index - 2 + count) % count
  const nextNextIndex = (index + 2) % count
  const previous = polygon[previousIndex]
  const next = polygon[nextIndex]
  const previousPrevious = polygon[previousPreviousIndex]
  const nextNext = polygon[nextNextIndex]

  const constraints = [
    makeHalfPlane(
      'chord',
      previous,
      next,
      (point) => cross(previous, point, next) * winding,
      {
        x: (next.y - previous.y) * winding,
        y: -(next.x - previous.x) * winding,
      },
    ),
  ]

  if (count >= 4) {
    constraints.push(
      makeHalfPlane(
        'extension',
        previousPrevious,
        previous,
        (point) => cross(previousPrevious, previous, point) * winding,
        {
          x: -(previous.y - previousPrevious.y) * winding,
          y: (previous.x - previousPrevious.x) * winding,
        },
      ),
      makeHalfPlane(
        'extension',
        nextNext,
        next,
        (point) => cross(point, next, nextNext) * winding,
        {
          x: (next.y - nextNext.y) * winding,
          y: (nextNext.x - next.x) * winding,
        },
      ),
    )
  }

  return constraints
}

const projectToCircleConstraint = (
  point: Point,
  constraint: CircleConstraint,
  safetyMargin = GEOMETRY_DRAG_MARGIN,
) => {
  const deltaX = point.x - constraint.center.x
  const deltaY = point.y - constraint.center.y
  const currentDistance = Math.hypot(deltaX, deltaY)
  const effectiveRadius = circleConstraintRadius(constraint, safetyMargin)
  const safeDistance =
    currentDistance <= GEOMETRY_TOLERANCE ? GEOMETRY_TOLERANCE : currentDistance

  if (
    constraint.mode === 'inside' &&
    currentDistance <= effectiveRadius + GEOMETRY_TOLERANCE
  ) {
    return point
  }

  if (
    constraint.mode === 'outside' &&
    currentDistance + GEOMETRY_TOLERANCE >= effectiveRadius
  ) {
    return point
  }

  const direction =
    currentDistance <= GEOMETRY_TOLERANCE ? { x: 1, y: 0 } : {
      x: deltaX / safeDistance,
      y: deltaY / safeDistance,
    }

  return {
    x: constraint.center.x + direction.x * effectiveRadius,
    y: constraint.center.y + direction.y * effectiveRadius,
  }
}

const projectToHalfPlaneConstraint = (
  point: Point,
  constraint: HalfPlaneConstraint,
  safetyMargin = GEOMETRY_DRAG_MARGIN,
) => {
  const value = constraint.value(point)
  const gradientLengthSquared = squaredDistance(constraint.gradient, {
    x: 0,
    y: 0,
  })
  if (gradientLengthSquared <= GEOMETRY_TOLERANCE) {
    return point
  }

  const requiredValue = halfPlaneRequiredValue(constraint, safetyMargin)
  if (value >= requiredValue) {
    return point
  }

  const offset = (requiredValue - value) / gradientLengthSquared
  return {
    x: point.x + constraint.gradient.x * offset,
    y: point.y + constraint.gradient.y * offset,
  }
}

const applyProjectionPasses = (
  start: Point,
  circleConstraints: CircleConstraint[],
  halfPlaneConstraints: HalfPlaneConstraint[],
  safetyMargin = GEOMETRY_DRAG_MARGIN,
) => {
  let point = start

  for (let pass = 0; pass < CONSTRAINT_PROJECTION_PASSES; pass += 1) {
    circleConstraints.forEach((constraint) => {
      point = projectToCircleConstraint(point, constraint, safetyMargin)
    })
    halfPlaneConstraints.forEach((constraint) => {
      point = projectToHalfPlaneConstraint(point, constraint, safetyMargin)
    })
  }

  return point
}

const circleIntersections = (
  first: CircleConstraint,
  second: CircleConstraint,
  safetyMargin = 0,
) => {
  const dx = second.center.x - first.center.x
  const dy = second.center.y - first.center.y
  const centerDistance = Math.hypot(dx, dy)
  const firstRadius = circleConstraintRadius(first, safetyMargin)
  const secondRadius = circleConstraintRadius(second, safetyMargin)

  if (
    centerDistance <= GEOMETRY_TOLERANCE ||
    centerDistance > firstRadius + secondRadius + GEOMETRY_TOLERANCE ||
    centerDistance < Math.abs(firstRadius - secondRadius) - GEOMETRY_TOLERANCE
  ) {
    return []
  }

  const a =
    (firstRadius * firstRadius -
      secondRadius * secondRadius +
      centerDistance * centerDistance) /
    (2 * centerDistance)
  const heightSquared = firstRadius * firstRadius - a * a
  if (heightSquared < -GEOMETRY_TOLERANCE) {
    return []
  }

  const height = Math.sqrt(Math.max(0, heightSquared))
  const baseX = first.center.x + (a * dx) / centerDistance
  const baseY = first.center.y + (a * dy) / centerDistance
  const offsetX = (-dy * height) / centerDistance
  const offsetY = (dx * height) / centerDistance

  return [
    { x: baseX + offsetX, y: baseY + offsetY },
    { x: baseX - offsetX, y: baseY - offsetY },
  ]
}

const nearestLegalGeometryPoint = (
  kind: PointKind,
  index: number,
  target: Point,
  current: Point,
  sheet: Point[],
  robots: Point[],
) => {
  const circleConstraints = buildDistanceConstraints(kind, index, sheet, robots)
  const halfPlaneConstraints = buildConvexityConstraints(
    kind,
    index,
    sheet,
    robots,
  )
  const isCandidateValid = (candidate: Point) =>
    isPointAllowedByConstraints(
      candidate,
      circleConstraints,
      halfPlaneConstraints,
      -1,
      -1,
      GEOMETRY_DRAG_MARGIN,
    ) &&
    (kind === 'robots'
      ? isGeometryConstraintValid(sheet, replacePoint(robots, index, candidate))
      : isGeometryConstraintValid(replacePoint(sheet, index, candidate), robots))
  const seeds: Point[] = [target, current]

  circleConstraints.forEach((constraint) => {
    seeds.push(projectToCircleConstraint(target, constraint))
  })

  for (
    let firstIndex = 0;
    firstIndex < circleConstraints.length;
    firstIndex += 1
  ) {
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < circleConstraints.length;
      secondIndex += 1
    ) {
      seeds.push(
        ...circleIntersections(
          circleConstraints[firstIndex],
          circleConstraints[secondIndex],
          GEOMETRY_DRAG_MARGIN,
        ),
      )
    }
  }

  halfPlaneConstraints.forEach((constraint) => {
    seeds.push(projectToHalfPlaneConstraint(target, constraint))
  })

  const candidates = seeds
    .map((seed) =>
      applyProjectionPasses(seed, circleConstraints, halfPlaneConstraints),
    )
    .filter(isCandidateValid)

  if (!candidates.length) {
    const fallback = clampAlongDragPath(current, target, isCandidateValid)
    return fallback
  }

  const point = candidates.reduce((best, candidate) =>
    squaredDistance(candidate, target) < squaredDistance(best, target)
      ? candidate
      : best,
  )

  return {
    constrained: squaredDistance(point, target) > GEOMETRY_TOLERANCE,
    point,
  }
}

const satisfiesCircleConstraint = (
  point: Point,
  constraint: CircleConstraint,
  safetyMargin = 0,
) => {
  const currentDistance = distance(point, constraint.center)
  const effectiveRadius = circleConstraintRadius(constraint, safetyMargin)

  return constraint.mode === 'inside'
    ? currentDistance <= effectiveRadius + GEOMETRY_TOLERANCE
    : currentDistance + GEOMETRY_TOLERANCE >= effectiveRadius
}

const isPointAllowedByConstraints = (
  point: Point,
  circleConstraints: CircleConstraint[],
  halfPlaneConstraints: HalfPlaneConstraint[],
  ignoredCircleIndex = -1,
  ignoredHalfPlaneIndex = -1,
  safetyMargin = 0,
) =>
  circleConstraints.every(
    (constraint, index) =>
      index === ignoredCircleIndex ||
      satisfiesCircleConstraint(point, constraint, safetyMargin),
  ) &&
  halfPlaneConstraints.every(
    (constraint, index) =>
      index === ignoredHalfPlaneIndex ||
      constraint.value(point) >=
        halfPlaneRequiredValue(constraint, safetyMargin),
  )

const splitBoundarySamples = (
  samples: Array<Point | null>,
  wrap = false,
) => {
  const segments: Point[][] = []
  let current: Point[] = []

  samples.forEach((sample) => {
    if (sample) {
      current.push(sample)
      return
    }

    if (current.length >= 2) {
      segments.push(current)
    }
    current = []
  })

  if (current.length >= 2) {
    segments.push(current)
  }

  if (
    wrap &&
    segments.length > 1 &&
    samples[0] &&
    samples[samples.length - 1]
  ) {
    const last = segments.pop()
    const first = segments.shift()
    if (first && last) {
      segments.unshift([...last, ...first])
    }
  }

  return segments
}

const buildCircleBoundarySegments = (
  circleConstraints: CircleConstraint[],
  halfPlaneConstraints: HalfPlaneConstraint[],
) =>
  circleConstraints.flatMap((constraint, constraintIndex) => {
    if (constraint.radius <= GEOMETRY_TOLERANCE) {
      return []
    }

    const samples = Array.from(
      { length: CONSTRAINT_ARC_SAMPLES },
      (_, sampleIndex) => {
        const angle = (Math.PI * 2 * sampleIndex) / CONSTRAINT_ARC_SAMPLES
        const point = {
          x: constraint.center.x + Math.cos(angle) * constraint.radius,
          y: constraint.center.y + Math.sin(angle) * constraint.radius,
        }

        return isPointAllowedByConstraints(
          point,
          circleConstraints,
          halfPlaneConstraints,
          constraintIndex,
        )
          ? point
          : null
      },
    )

    return splitBoundarySamples(samples, true).map((points) => ({
      mode: constraint.mode,
      points,
    }))
  })

const buildLineBoundarySegments = (
  circleConstraints: CircleConstraint[],
  halfPlaneConstraints: HalfPlaneConstraint[],
  viewBox: ViewBox,
) =>
  halfPlaneConstraints.flatMap((constraint, constraintIndex) => {
    const displayLine =
      constraint.kind === 'extension'
        ? extendedLine(constraint.start, constraint.end, viewBox)
        : { start: constraint.start, end: constraint.end }
    const samples = Array.from(
      { length: CONSTRAINT_LINE_SAMPLES + 1 },
      (_, sampleIndex) => {
        const t = sampleIndex / CONSTRAINT_LINE_SAMPLES
        const point = {
          x: displayLine.start.x + (displayLine.end.x - displayLine.start.x) * t,
          y: displayLine.start.y + (displayLine.end.y - displayLine.start.y) * t,
        }

        return isPointAllowedByConstraints(
          point,
          circleConstraints,
          halfPlaneConstraints,
          -1,
          constraintIndex,
        )
          ? point
          : null
      },
    )

    return splitBoundarySamples(samples).map((points) => ({
      kind: constraint.kind,
      points,
    }))
  })

const clampAlongDragPath = (
  start: Point,
  end: Point,
  isValid: (point: Point) => boolean,
) => {
  if (isValid(end)) {
    return { point: end, constrained: false }
  }

  if (!isValid(start)) {
    return { point: start, constrained: true }
  }

  let low = 0
  let high = 1

  for (let iteration = 0; iteration < 32; iteration += 1) {
    const mid = (low + high) / 2
    const candidate = {
      x: start.x + (end.x - start.x) * mid,
      y: start.y + (end.y - start.y) * mid,
    }

    if (isValid(candidate)) {
      low = mid
    } else {
      high = mid
    }
  }

  return {
    point: {
      x: start.x + (end.x - start.x) * low,
      y: start.y + (end.y - start.y) * low,
    },
    constrained: true,
  }
}

const extendedLine = (start: Point, end: Point, viewBox: ViewBox) => {
  const deltaX = end.x - start.x
  const deltaY = end.y - start.y
  const length = Math.hypot(deltaX, deltaY)
  const span = Math.max(viewBox.width, viewBox.height) * 2

  if (length <= GEOMETRY_TOLERANCE) {
    return { start, end }
  }

  const unitX = deltaX / length
  const unitY = deltaY / length

  return {
    start: {
      x: start.x - unitX * span,
      y: start.y - unitY * span,
    },
    end: {
      x: end.x + unitX * span,
      y: end.y + unitY * span,
    },
  }
}

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
      return t.status.copied(status.label)
    case 'copyFailed':
      return t.status.copyFailed(status.message)
    case 'fullConfigPasted':
      return t.status.fullConfigPasted(status.count)
    case 'pasteFailed':
      return t.status.pasteFailed(status.message)
    case 'parseError':
      return t.parseErrors[status.code]
    case 'pointCountRange':
      return t.status.pointCountRange(status.min, status.max)
    case 'constraintDragConstrained':
      return t.status.constraintDragConstrained(status.label)
    case 'constraintDragRejected':
      return t.status.constraintDragRejected(status.label)
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
  const [showSheetView, setShowSheetView] = useState(true)
  const [showRobotView, setShowRobotView] = useState(true)
  const [enforceGeometryConstraint, setEnforceGeometryConstraint] =
    useState(false)
  const [constraintDragRejected, setConstraintDragRejected] = useState(false)
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
  const constraintValidation = useMemo(
    () => validateGeometryConstraint(sheet, robots),
    [robots, sheet],
  )
  const constraintDistanceViolationLabels = useMemo(
    () =>
      constraintValidation.distanceViolations.map(
        ({ firstIndex, secondIndex }) =>
          t.canvas.constraintPairLabel(
            pointLabel('robots', firstIndex, indexBase),
            pointLabel('robots', secondIndex, indexBase),
            pointLabel('sheet', firstIndex, indexBase),
            pointLabel('sheet', secondIndex, indexBase),
          ),
      ),
    [constraintValidation.distanceViolations, indexBase, t],
  )
  const hasConstraintViolation =
    enforceGeometryConstraint &&
    (constraintValidation.distanceViolations.length > 0 ||
      constraintValidation.invalidSheet ||
      constraintValidation.invalidRobots ||
      constraintValidation.windingMismatch)
  const constraintWarningText = constraintValidation.distanceViolations.length
    ? t.canvas.constraintDistanceViolationWarning(
        constraintDistanceViolationLabels.join(', '),
      )
    : constraintValidation.windingMismatch
      ? t.canvas.constraintWindingWarning
      : t.canvas.constraintConvexityWarning
  const statusText =
    hasConstraintViolation
      ? constraintValidation.distanceViolations.length
        ? t.status.constraintDistanceViolation(
            constraintDistanceViolationLabels.join(', '),
          )
        : constraintValidation.windingMismatch
          ? t.status.constraintWindingViolation
          : t.status.constraintConvexityViolation
      : formatStatusMessage(status, t)

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
      const fk = new VvcmFk(holdHeight, toPointMatrixInput(sheet))

      try {
        const result = fk.updateStableSolutions(toPointMatrixInput(robots))

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
  const visibleSceneSolutions = useMemo<RobotSceneSolutionEntry[]>(
    () =>
      displayedSolutionEntries.map(({ index, solution }) => ({
        color: getSolutionColor(index),
        index,
        solution,
      })),
    [displayedSolutionEntries],
  )
  const showTautCableSegments = displayedSolutionEntries.length === 1
  const fkResultJson = useMemo(() => fkResultToJson(solveState), [solveState])

  const canvasPoints = useMemo(() => {
    const points = [
      ...(showSheetView ? sheet : []),
      ...(showRobotView ? robots : []),
    ]
    if (showRobotView) {
      points.push(
        ...displayedSolutionEntries.map(({ solution }) => ({
          x: solution.po.x,
          y: solution.po.y,
        })),
      )
    }

    if (showSheetView) {
      points.push(...displayedSolutionEntries.map(({ solution }) => solution.vo))
    }

    return points
  }, [displayedSolutionEntries, robots, sheet, showRobotView, showSheetView])

  const [viewBox, setViewBox] = useState<ViewBox>(() =>
    buildViewBox(canvasPoints),
  )
  const grid = useMemo(() => makeGrid(viewBox), [viewBox])
  const viewBoxText = `${viewBox.minX} ${viewBox.minY} ${viewBox.width} ${viewBox.height}`
  const sheetPolygonPoints = useMemo(
    () =>
      sheet
        .map(toSvgPoint)
        .map((point) => `${point.x},${point.y}`)
        .join(' '),
    [sheet],
  )
  const violatingSheetIndexSet = useMemo(
    () => new Set(constraintValidation.violatingSheetIndices),
    [constraintValidation.violatingSheetIndices],
  )
  const violatingRobotIndexSet = useMemo(
    () => new Set(constraintValidation.violatingRobotIndices),
    [constraintValidation.violatingRobotIndices],
  )
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
  const activeConstraintDrag =
    enforceGeometryConstraint && canvasInteraction?.type === 'point'
      ? canvasInteraction
      : null
  const constraintCircleBoundarySegments = useMemo(() => {
    if (!activeConstraintDrag) {
      return []
    }

    const { index, kind } = activeConstraintDrag
    const circleConstraints = buildDistanceConstraints(kind, index, sheet, robots)
    const halfPlaneConstraints = buildConvexityConstraints(
      kind,
      index,
      sheet,
      robots,
    )

    return buildCircleBoundarySegments(
      circleConstraints,
      halfPlaneConstraints,
    )
  }, [activeConstraintDrag, robots, sheet])
  const constraintLineBoundarySegments = useMemo(() => {
    if (!activeConstraintDrag || robotCount < 3) {
      return []
    }

    const { index, kind } = activeConstraintDrag
    const circleConstraints = buildDistanceConstraints(kind, index, sheet, robots)
    const halfPlaneConstraints = buildConvexityConstraints(
      kind,
      index,
      sheet,
      robots,
    )

    return buildLineBoundarySegments(
      circleConstraints,
      halfPlaneConstraints,
      viewBox,
    )
  }, [
    activeConstraintDrag,
    robotCount,
    robots,
    sheet,
    viewBox,
  ])

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

  const updateDraggedPoint = (kind: PointKind, index: number, point: Point) => {
    const safePoint = { x: round(point.x), y: round(point.y) }

    if (!enforceGeometryConstraint) {
      setConstraintDragRejected(false)
      updatePoint(kind, index, safePoint)
      return
    }

    const label = pointLabel(kind, index, indexBase)
    const currentPoint = getPointByKind(kind, index)
    if (!currentPoint) {
      return
    }

    const constrained = nearestLegalGeometryPoint(
      kind,
      index,
      safePoint,
      currentPoint,
      sheet,
      robots,
    )

    if (constrained.constrained) {
      setConstraintDragRejected(true)
      setStatus({ type: 'constraintDragConstrained', label })
    } else {
      setConstraintDragRejected(false)
    }

    if (squaredDistance(currentPoint, constrained.point) <= GEOMETRY_TOLERANCE) {
      if (constrained.constrained) {
        setStatus({ type: 'constraintDragRejected', label })
      }
      return
    }

    updatePoint(kind, index, constrained.point)
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

      setConstraintDragRejected(false)
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
        updateDraggedPoint(canvasInteraction.kind, canvasInteraction.index, {
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
    setConstraintDragRejected(false)
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

  const copyText = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setStatus({ type: 'copied', label })
    } catch (error) {
      setStatus({ type: 'copyFailed', message: getErrorMessage(error) })
    }
  }

  const copyAllConfig = () =>
    copyText(
      t.labels.allConfig,
      allConfigToJson(robotCount, holdHeight, sheet, robots),
    )

  const pasteAllConfig = async () => {
    try {
      const text = await navigator.clipboard.readText()
      const config = parseFullConfigText(text)
      const nextSheetText = pointsToJson(config.sheet)
      const nextRobotsText = pointsToJson(config.robots)

      setRobotCount(config.robotCount)
      setHoldHeight(config.holdHeight)
      setSheet(config.sheet)
      setRobots(config.robots)
      setSelectedIndex((current) => Math.min(current, config.robotCount - 1))
      setSheetText(nextSheetText)
      setRobotsText(nextRobotsText)
      setSheetTextDirty(false)
      setRobotsTextDirty(false)
      setStatus({ type: 'fullConfigPasted', count: config.robotCount })
    } catch (error) {
      setStatus({
        type: 'pasteFailed',
        message:
          error instanceof FullConfigParseError
            ? t.fullConfigErrors[error.code]
            : getErrorMessage(error),
      })
    }
  }

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
          <div className="version-pill">vvcm-rs {version()}</div>
          <nav
            className="source-links"
            aria-label={t.header.sourceLinksAriaLabel}
          >
            <a
              className="source-link"
              href="https://github.com/MorningFrog/vvcm-rs"
              target="_blank"
              rel="noreferrer"
              aria-label={t.header.vvcmSourceAriaLabel}
              title={t.header.vvcmSourceAriaLabel}
            >
              <svg aria-hidden="true" focusable="false">
                <use href={GITHUB_ICON_HREF} />
              </svg>
              <span>VVCM</span>
            </a>
            <a
              className="source-link"
              href="https://github.com/MorningFrog/vvcm-web"
              target="_blank"
              rel="noreferrer"
              aria-label={t.header.webSourceAriaLabel}
              title={t.header.webSourceAriaLabel}
            >
              <svg aria-hidden="true" focusable="false">
                <use href={GITHUB_ICON_HREF} />
              </svg>
              <span>Web</span>
            </a>
          </nav>
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

          <section className="panel full-config-panel">
            <div className="panel-heading">
              <h2>{t.fullConfig.title}</h2>
            </div>
            <div
              className="full-config-actions"
              role="group"
              aria-label={t.fullConfig.ariaLabel}
            >
              <button type="button" className="secondary-button" onClick={copyAllConfig}>
                {t.fullConfig.copyAllConfig}
              </button>
              <button type="button" className="primary-button" onClick={pasteAllConfig}>
                {t.fullConfig.pasteAllConfig}
              </button>
            </div>
          </section>

          <section className="panel status-panel">
            <div className="panel-heading">
              <h2>{t.data.statusTitle}</h2>
            </div>
            <p role="status" aria-live="polite">
              {statusText}
            </p>
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
            onCopy={() => copyText(t.labels.sheet, pointsToJson(sheet))}
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
            onCopy={() => copyText(t.labels.robots, pointsToJson(robots))}
          />
        </aside>

        <section className="visual-column">
          <section className="canvas-panel">
            <div className="panel-heading canvas-heading">
              <div className="canvas-heading-main">
                <h2>{t.canvas.title}</h2>
                <div className="canvas-heading-actions">
                  <div
                    className="canvas-layer-toggles"
                    role="group"
                    aria-label={t.canvas.visibilityControlsAriaLabel}
                  >
                    <label className="canvas-layer-toggle">
                      <input
                        type="checkbox"
                        checked={showSheetView}
                        onChange={(event) =>
                          setShowSheetView(event.currentTarget.checked)
                        }
                      />
                      <span>{t.canvas.showSheetView}</span>
                    </label>
                    <label className="canvas-layer-toggle">
                      <input
                        type="checkbox"
                        checked={showRobotView}
                        onChange={(event) =>
                          setShowRobotView(event.currentTarget.checked)
                        }
                      />
                      <span>{t.canvas.showRobotView}</span>
                    </label>
                    <label
                      className={`canvas-layer-toggle constraint-toggle ${
                        hasConstraintViolation ? 'warning' : ''
                      }`}
                      title={
                        hasConstraintViolation
                          ? constraintWarningText
                          : t.canvas.geometryConstraintHint
                      }
                    >
                      <input
                        type="checkbox"
                        aria-invalid={hasConstraintViolation}
                        aria-label={t.canvas.geometryConstraint}
                        checked={enforceGeometryConstraint}
                        onChange={(event) => {
                          setEnforceGeometryConstraint(
                            event.currentTarget.checked,
                          )
                          setConstraintDragRejected(false)
                        }}
                      />
                      <span>{t.canvas.geometryConstraint}</span>
                    </label>
                  </div>
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
                </div>
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
            <svg
              ref={svgRef}
              className={`coordinate-canvas ${
                canvasInteraction?.type === 'pan' ? 'panning' : ''
              } ${
                canvasInteraction?.type === 'point' ? 'point-dragging' : ''
              } ${constraintDragRejected ? 'constraint-rejected' : ''}`}
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
              {showSheetView && (
                <polygon
                  className="sheet-polygon"
                  points={sheetPolygonPoints}
                />
              )}
              {activeConstraintDrag && (
                <g
                  className={`constraint-guides ${
                    constraintDragRejected || hasConstraintViolation
                      ? 'warning'
                      : ''
                  }`}
                >
                  {constraintCircleBoundarySegments.map((segment, index) => (
                    <polyline
                      className={`constraint-guide-arc ${segment.mode}`}
                      key={`constraint-arc-${index}`}
                      points={segment.points
                        .map(toSvgPoint)
                        .map((point) => `${point.x},${point.y}`)
                        .join(' ')}
                    />
                  ))}
                  {constraintLineBoundarySegments.map((segment, index) => (
                    <polyline
                      className={`constraint-guide-line ${segment.kind}`}
                      key={`constraint-line-${index}`}
                      points={segment.points
                        .map(toSvgPoint)
                        .map((point) => `${point.x},${point.y}`)
                        .join(' ')}
                    />
                  ))}
                </g>
              )}
              {showRobotView && (
                <polyline
                  className="robot-polyline"
                  points={[...robots, robots[0]]
                    .filter(Boolean)
                    .map(toSvgPoint)
                    .map((point) => `${point.x},${point.y}`)
                    .join(' ')}
                />
              )}
              {showSheetView && showRobotView && (
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
              )}
              {enforceGeometryConstraint &&
                hasConstraintViolation &&
                showSheetView &&
                showRobotView && (
                  <g className="constraint-violation-lines">
                    {constraintValidation.distanceViolations.flatMap(
                      ({ firstIndex, secondIndex }) => {
                        const firstRobot = robots[firstIndex]
                        const secondRobot = robots[secondIndex]
                        const firstSheet = sheet[firstIndex]
                        const secondSheet = sheet[secondIndex]

                        if (
                          !firstRobot ||
                          !secondRobot ||
                          !firstSheet ||
                          !secondSheet
                        ) {
                          return []
                        }

                        const firstRobotSvg = toSvgPoint(firstRobot)
                        const secondRobotSvg = toSvgPoint(secondRobot)
                        const firstSheetSvg = toSvgPoint(firstSheet)
                        const secondSheetSvg = toSvgPoint(secondSheet)

                        return [
                          <line
                            className="robot-side"
                            key={`constraint-robot-${firstIndex}-${secondIndex}`}
                            x1={firstRobotSvg.x}
                            y1={firstRobotSvg.y}
                            x2={secondRobotSvg.x}
                            y2={secondRobotSvg.y}
                          />,
                          <line
                            className="sheet-side"
                            key={`constraint-sheet-${firstIndex}-${secondIndex}`}
                            x1={firstSheetSvg.x}
                            y1={firstSheetSvg.y}
                            x2={secondSheetSvg.x}
                            y2={secondSheetSvg.y}
                          />,
                        ]
                      },
                    )}
                  </g>
                )}
              {showTautCableSegments && (showSheetView || showRobotView) && (
                <g className="taut-cable-lines">
                  {displayedSolutionEntries.flatMap(({ index, solution }) => {
                    const voSvg = toSvgPoint(solution.vo)
                    const roSvg = toSvgPoint(solution.po)

                    return solution.tautCables.flatMap((cableIndex) => {
                      const sheetPoint = sheet[cableIndex]
                      const robotPoint = robots[cableIndex]
                      if (
                        (showSheetView && !sheetPoint) ||
                        (showRobotView && !robotPoint)
                      ) {
                        return []
                      }

                      return [
                        showSheetView && sheetPoint ? (
                          <line
                            key={`taut-sheet-${index}-${cableIndex}`}
                            className="sheet-side"
                            x1={toSvgPoint(sheetPoint).x}
                            y1={toSvgPoint(sheetPoint).y}
                            x2={voSvg.x}
                            y2={voSvg.y}
                          />
                        ) : null,
                        showRobotView && robotPoint ? (
                          <line
                            key={`taut-robot-${index}-${cableIndex}`}
                            className="robot-side"
                            x1={toSvgPoint(robotPoint).x}
                            y1={toSvgPoint(robotPoint).y}
                            x2={roSvg.x}
                            y2={roSvg.y}
                          />
                        ) : null,
                      ]
                    })
                  })}
                </g>
              )}
              {displayedSolutionEntries.map(({ index, solution }) => {
                const objectPoint = toSvgPoint(solution.po)
                const virtualPoint = toSvgPoint(solution.vo)
                const solutionState = solution.stable ? 'stable' : 'unstable'

                if (!showRobotView && !showSheetView) {
                  return null
                }

                return (
                  <g
                    key={`object-${index}`}
                    style={solutionColorStyle(index)}
                  >
                    {showRobotView && (
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
                    )}
                    {showSheetView && (
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
                    )}
                  </g>
                )
              })}
              {showSheetView && (
                <g className="sheet-points">
                  {sheet.map((point, index) => {
                    const svgPoint = toSvgPoint(point)
                    const active =
                      selectedKind === 'sheet' && selectedIndex === index
                    const invalid =
                      enforceGeometryConstraint &&
                      violatingSheetIndexSet.has(index)

                    return (
                      <g
                        className={invalid ? 'invalid-constraint-point' : ''}
                        key={`sheet-${index}`}
                      >
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
              )}
              {showRobotView && (
                <g className="robot-points">
                  {robots.map((point, index) => {
                    const svgPoint = toSvgPoint(point)
                    const active =
                      selectedKind === 'robots' && selectedIndex === index
                    const invalid =
                      enforceGeometryConstraint &&
                      violatingRobotIndexSet.has(index)

                    return (
                      <g
                        className={invalid ? 'invalid-constraint-point' : ''}
                        key={`robot-${index}`}
                      >
                        <circle
                          className="point-hit-target"
                          cx={svgPoint.x}
                          cy={svgPoint.y}
                          r={canvasMetrics.robotHitRadius}
                          onPointerDown={handlePointPointerDown(
                            'robots',
                            index,
                          )}
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
                          onPointerDown={handlePointPointerDown(
                            'robots',
                            index,
                          )}
                        />
                        <text
                          x={svgPoint.x + canvasMetrics.pointLabelXOffset}
                          y={svgPoint.y + canvasMetrics.robotLabelYOffset}
                          onPointerDown={handlePointPointerDown(
                            'robots',
                            index,
                          )}
                        >
                          {pointLabel('robots', index, indexBase)}
                        </text>
                      </g>
                    )
                  })}
                </g>
              )}
            </svg>
          </section>

          <RobotScene3D
            holdHeight={holdHeight}
            indexBase={indexBase}
            labels={t.scene3d}
            robots={robots}
            visibleSolutions={visibleSceneSolutions}
          />
        </section>

        <aside className="result-column" aria-label={t.results.title}>
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
                          <code>
                            lambda=[{formatNumberList(solution.lambdaValues)}]
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

          <JsonPreview
            copyLabel={t.data.copy}
            title={`${t.results.title} JSON`}
            value={fkResultJson}
            onCopy={() => copyText(`${t.results.title} JSON`, fkResultJson)}
          />
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

type JsonPreviewProps = {
  copyLabel: string
  title: string
  value: string
  onCopy: () => void
}

function JsonPreview({ copyLabel, title, value, onCopy }: JsonPreviewProps) {
  return (
    <section className="panel json-preview">
      <div className="panel-heading">
        <h2>{title}</h2>
        <button type="button" className="secondary-button" onClick={onCopy}>
          {copyLabel}
        </button>
      </div>
      <pre className="json-block"><code>{value}</code></pre>
    </section>
  )
}

export default App
