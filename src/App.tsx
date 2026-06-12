import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from 'react'
import {
  VvcmFk,
  version,
  type FkSolutionOutput,
  type FkSolutionsOutput,
  type Point2Input,
} from '@morningfrog/vvcm-rs'
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

type DragState = {
  kind: PointKind
  index: number
  offsetX: number
  offsetY: number
}

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

type CanvasTextMetrics = {
  labelSize: number
  statusSize: number
  labelStroke: number
  pointLabelXOffset: number
  sheetLabelYOffset: number
  robotLabelYOffset: number
  objectLabelXOffset: number
  objectTitleYOffset: number
  objectStatusYOffset: number
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
const CANVAS_TEXT_TARGETS = {
  labelSize: 16,
  statusSize: 13,
  labelStroke: 3,
  pointLabelXOffset: 12,
  sheetLabelYOffset: -10,
  robotLabelYOffset: 21,
  objectLabelXOffset: 16,
  objectTitleYOffset: -14,
  objectStatusYOffset: 4,
} satisfies CanvasTextMetrics

const scaleCanvasTextMetrics = (
  unitsPerPixel: number,
): CanvasTextMetrics => {
  const scale = (value: number) => round(value * unitsPerPixel, 2)

  return {
    labelSize: scale(CANVAS_TEXT_TARGETS.labelSize),
    statusSize: scale(CANVAS_TEXT_TARGETS.statusSize),
    labelStroke: scale(CANVAS_TEXT_TARGETS.labelStroke),
    pointLabelXOffset: scale(CANVAS_TEXT_TARGETS.pointLabelXOffset),
    sheetLabelYOffset: scale(CANVAS_TEXT_TARGETS.sheetLabelYOffset),
    robotLabelYOffset: scale(CANVAS_TEXT_TARGETS.robotLabelYOffset),
    objectLabelXOffset: scale(CANVAS_TEXT_TARGETS.objectLabelXOffset),
    objectTitleYOffset: scale(CANVAS_TEXT_TARGETS.objectTitleYOffset),
    objectStatusYOffset: scale(CANVAS_TEXT_TARGETS.objectStatusYOffset),
  }
}

const DEFAULT_CANVAS_TEXT_METRICS = scaleCanvasTextMetrics(
  DEFAULT_CANVAS_UNITS_PER_PIXEL,
)

const sameCanvasTextMetrics = (
  current: CanvasTextMetrics,
  next: CanvasTextMetrics,
) =>
  (Object.keys(next) as Array<keyof CanvasTextMetrics>).every(
    (key) => current[key] === next[key],
  )

const formatNumber = (value: number) => {
  if (!Number.isFinite(value)) {
    return '0'
  }

  return Number.isInteger(value) ? String(value) : String(round(value))
}

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
  { x: -367.3, y: 664.2 },
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
  const [dragging, setDragging] = useState<DragState | null>(null)
  const [status, setStatus] = useState<StatusMessage>({ type: 'ready' })
  const [canvasTextMetrics, setCanvasTextMetrics] =
    useState<CanvasTextMetrics>(DEFAULT_CANVAS_TEXT_METRICS)
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

  const canvasPoints = useMemo(() => {
    const points = [...sheet, ...robots]
    points.push(
      ...displayedSolutionEntries.map(({ solution }) => ({
        x: solution.po.x,
        y: solution.po.y,
      })),
    )

    return points
  }, [displayedSolutionEntries, robots, sheet])

  const viewBox = useMemo(() => buildViewBox(canvasPoints), [canvasPoints])
  const grid = useMemo(() => makeGrid(viewBox), [viewBox])
  const viewBoxText = `${viewBox.minX} ${viewBox.minY} ${viewBox.width} ${viewBox.height}`
  const canvasStyle = useMemo(
    () =>
      ({
        '--canvas-label-size': `${canvasTextMetrics.labelSize}px`,
        '--canvas-status-size': `${canvasTextMetrics.statusSize}px`,
        '--canvas-label-stroke': `${canvasTextMetrics.labelStroke}px`,
      }) as CSSProperties,
    [canvasTextMetrics],
  )
  const selectedPoints = selectedKind === 'sheet' ? sheet : robots
  const selectedPoint = selectedPoints[selectedIndex] ?? selectedPoints[0]
  const selectedLabel = `${selectedKind === 'sheet' ? 'v' : 'r'}${selectedIndex + 1}`
  const tautCables = new Set(
    displayedSolutionEntries.flatMap(
      ({ solution }) => solution.tautCables,
    ),
  )

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) {
      return
    }

    const updateCanvasTextMetrics = () => {
      const { height, width } = svg.getBoundingClientRect()
      if (!height || !width) {
        return
      }

      const unitsPerPixel = Math.max(
        viewBox.width / width,
        viewBox.height / height,
      )
      const nextMetrics = scaleCanvasTextMetrics(unitsPerPixel)

      setCanvasTextMetrics((current) =>
        sameCanvasTextMetrics(current, nextMetrics) ? current : nextMetrics,
      )
    }

    updateCanvasTextMetrics()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateCanvasTextMetrics)
      return () => window.removeEventListener('resize', updateCanvasTextMetrics)
    }

    const resizeObserver = new ResizeObserver(updateCanvasTextMetrics)
    resizeObserver.observe(svg)

    return () => resizeObserver.disconnect()
  }, [viewBox])

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

  const getCanvasPoint = (event: PointerEvent<SVGElement>): Point | null => {
    const svg = svgRef.current
    const matrix = svg?.getScreenCTM()
    if (!svg || !matrix) {
      return null
    }

    const point = svg.createSVGPoint()
    point.x = event.clientX
    point.y = event.clientY
    const transformed = point.matrixTransform(matrix.inverse())
    return { x: round(transformed.x), y: round(-transformed.y) }
  }

  const getPointByKind = (kind: PointKind, index: number) => {
    const source = kind === 'sheet' ? sheet : robots
    return source[index] ?? null
  }

  const handleCanvasPointerDown = (event: PointerEvent<SVGRectElement>) => {
    const point = getCanvasPoint(event)
    if (!point) {
      return
    }

    updatePoint(selectedKind, selectedIndex, point)
    setDragging({
      kind: selectedKind,
      index: selectedIndex,
      offsetX: 0,
      offsetY: 0,
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
      setDragging({
        kind,
        index,
        offsetX: currentPoint.x - pointerPoint.x,
        offsetY: currentPoint.y - pointerPoint.y,
      })
      svgRef.current?.setPointerCapture(event.pointerId)
    }

  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (!dragging) {
      return
    }

    const point = getCanvasPoint(event)
    if (point) {
      updatePoint(dragging.kind, dragging.index, {
        x: point.x + dragging.offsetX,
        y: point.y + dragging.offsetY,
      })
    }
  }

  const handlePointerUp = (event: PointerEvent<SVGSVGElement>) => {
    if (!dragging) {
      return
    }

    setDragging(null)
    if (svgRef.current?.hasPointerCapture(event.pointerId)) {
      svgRef.current.releasePointerCapture(event.pointerId)
    }
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
            prefix="S"
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
            prefix="R"
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
              className="coordinate-canvas"
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
                      className={tautCables.has(index) ? 'taut' : ''}
                      x1={sheetSvg.x}
                      y1={sheetSvg.y}
                      x2={robotSvg.x}
                      y2={robotSvg.y}
                    />
                  )
                })}
              </g>
              {displayedSolutionEntries.map(({ index, solution }) => {
                const objectPoint = toSvgPoint(solution.po)
                const solutionState = solution.stable ? 'stable' : 'unstable'

                return (
                  <g
                    className={`object-marker ${solutionState}`}
                    key={`object-${index}`}
                  >
                    <circle cx={objectPoint.x} cy={objectPoint.y} r={14} />
                    <text
                      x={
                        objectPoint.x + canvasTextMetrics.objectLabelXOffset
                      }
                      y={
                        objectPoint.y + canvasTextMetrics.objectTitleYOffset
                      }
                    >
                      po{index + 1}
                    </text>
                    <text
                      className="object-status"
                      x={
                        objectPoint.x + canvasTextMetrics.objectLabelXOffset
                      }
                      y={
                        objectPoint.y + canvasTextMetrics.objectStatusYOffset
                      }
                    >
                      {solution.stable
                        ? t.results.stableBadge
                        : t.results.unstableBadge}
                    </text>
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
                        r={28}
                        onPointerDown={handlePointPointerDown('sheet', index)}
                      />
                      <circle
                        className={`point-marker ${active ? 'active' : ''}`}
                        cx={svgPoint.x}
                        cy={svgPoint.y}
                        r={active ? 13 : 10}
                        onPointerDown={handlePointPointerDown('sheet', index)}
                      />
                      <text
                        x={svgPoint.x + canvasTextMetrics.pointLabelXOffset}
                        y={svgPoint.y + canvasTextMetrics.sheetLabelYOffset}
                        onPointerDown={handlePointPointerDown('sheet', index)}
                      >
                        v{index + 1}
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
                        r={30}
                        onPointerDown={handlePointPointerDown('robots', index)}
                      />
                      <circle
                        className={`point-marker ${active ? 'active' : ''}`}
                        cx={svgPoint.x}
                        cy={svgPoint.y}
                        r={active ? 14 : 11}
                        onPointerDown={handlePointPointerDown('robots', index)}
                      />
                      <text
                        x={svgPoint.x + canvasTextMetrics.pointLabelXOffset}
                        y={svgPoint.y + canvasTextMetrics.robotLabelYOffset}
                        onPointerDown={handlePointPointerDown('robots', index)}
                      >
                        r{index + 1}
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
                            {t.results.solutionOption(index + 1, stateLabel)}
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
                          onClick={() => {
                            setSelectedSolutionIndex(index)
                            setSolutionDisplayMode('single')
                          }}
                        >
                          <span className="solution-index">#{index + 1}</span>
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
                            taut=[{solution.tautCables.join(', ') || '-'}]
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
                {prefix}{index + 1}
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
