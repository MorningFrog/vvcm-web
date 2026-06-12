export const translations = {
  'zh-CN': {
    language: {
      ariaLabel: '语言',
      name: '中文',
      selectorLabel: '语言',
    },
    header: {
      copyAllConfig: '复制全部配置',
      eyebrow: 'VVCM wasm visual test bench',
      indexBaseAriaLabel: '显示索引基准',
      indexBaseLabel: '索引',
      oneBasedIndex: '1-based',
      title: 'VVCM 可视化测试台',
      zeroBasedIndex: '0-based',
    },
    controls: {
      ariaLabel: '参数控制',
      editTargetAriaLabel: '编辑对象',
      holdHeightLabel: 'hold 高度',
      pointCount: (count: number) => `${count} 点`,
      robotCountLabel: '机器人 / 布顶点数量',
      robotTableTitle: '机器人位置',
      robotsButton: '机器人',
      sheetButton: '布顶点',
      sheetTableTitle: '柔性布顶点',
      tablePointHeader: '点',
      title: '参数',
    },
    canvas: {
      ariaLabel: 'VVCM 坐标画布',
      currentSelection: (label: string) => `当前选择 ${label}`,
      fitView: '适配',
      legendAriaLabel: '图例',
      robotLegend: '机器人',
      sheetLegend: '布顶点',
      stableSolutionLegend: '稳定解',
      title: '坐标画布',
      unstableSolutionLegend: '不稳定解',
      viewControlsAriaLabel: '画布视图控制',
      zoomIn: '放大',
      zoomOut: '缩小',
    },
    results: {
      allDisplay: '全部',
      displayModeAriaLabel: 'FK 解显示模式',
      noSolutions: '没有 FK 解',
      selectedSolutionLabel: '显示解',
      singleDisplay: '单解',
      solveError: '求解异常',
      stableCount: (stable: number, total: number) => `${stable}/${total} 稳定`,
      stableBadge: '稳定',
      solutionOption: (index: number, state: string) => `#${index} ${state}`,
      title: 'FK 结果',
      unstableBadge: '不稳定',
    },
    data: {
      apply: '应用',
      ariaLabel: '文本数据',
      copy: '复制',
      dirty: '已编辑',
      robotsJsonTitle: '机器人 JSON',
      sheetJsonTitle: '布顶点 JSON',
      statusTitle: '状态',
      sync: '同步',
      synced: '已同步',
    },
    labels: {
      allConfig: '完整配置',
      robots: '机器人位置',
      sheet: '布顶点',
    },
    parseErrors: {
      emptyInput: '输入为空',
      invalidPointItem: '数组元素需要是 [x, y] 或 { x, y }',
      jsonRootArray: 'JSON 根节点需要是数组',
      noCoordinateRows: '没有识别到坐标行',
    },
    errors: {
      mismatchedCounts: '布顶点数量和机器人数量需要一致',
    },
    status: {
      copied: (label: string) => `${label} 已复制`,
      copyFailed: (message: string) => `复制失败：${message}`,
      countSet: (count: number) => `数量已设置为 ${count}`,
      pointCountRange: (min: number, max: number) =>
        `点数量需要在 ${min} 到 ${max} 之间`,
      pointsApplied: (label: string, count: number) =>
        `${label}已应用，数量 ${count}`,
      ready: '准备就绪',
      robotsTextSynced: '机器人文本已同步',
      sheetTextSynced: '布顶点文本已同步',
    },
  },
  'en-US': {
    language: {
      ariaLabel: 'Language',
      name: 'English',
      selectorLabel: 'Language',
    },
    header: {
      copyAllConfig: 'Copy full config',
      eyebrow: 'VVCM wasm visual test bench',
      indexBaseAriaLabel: 'Displayed index base',
      indexBaseLabel: 'Index',
      oneBasedIndex: '1-based',
      title: 'VVCM Visual Test Bench',
      zeroBasedIndex: '0-based',
    },
    controls: {
      ariaLabel: 'Parameter controls',
      editTargetAriaLabel: 'Edit target',
      holdHeightLabel: 'Hold height',
      pointCount: (count: number) => `${count} points`,
      robotCountLabel: 'Robot / sheet vertex count',
      robotTableTitle: 'Robot positions',
      robotsButton: 'Robots',
      sheetButton: 'Sheet vertices',
      sheetTableTitle: 'Deformable sheet vertices',
      tablePointHeader: 'Point',
      title: 'Parameters',
    },
    canvas: {
      ariaLabel: 'VVCM coordinate canvas',
      currentSelection: (label: string) => `Current selection ${label}`,
      fitView: 'Fit',
      legendAriaLabel: 'Legend',
      robotLegend: 'Robots',
      sheetLegend: 'Sheet vertices',
      stableSolutionLegend: 'Stable solution',
      title: 'Coordinate Canvas',
      unstableSolutionLegend: 'Unstable solution',
      viewControlsAriaLabel: 'Canvas view controls',
      zoomIn: 'Zoom in',
      zoomOut: 'Zoom out',
    },
    results: {
      allDisplay: 'All',
      displayModeAriaLabel: 'FK solution display mode',
      noSolutions: 'No FK solutions',
      selectedSolutionLabel: 'Shown solution',
      singleDisplay: 'Single',
      solveError: 'Solve error',
      stableCount: (stable: number, total: number) => `${stable}/${total} stable`,
      stableBadge: 'Stable',
      solutionOption: (index: number, state: string) => `#${index} ${state}`,
      title: 'FK Result',
      unstableBadge: 'Unstable',
    },
    data: {
      apply: 'Apply',
      ariaLabel: 'Text data',
      copy: 'Copy',
      dirty: 'Edited',
      robotsJsonTitle: 'Robot JSON',
      sheetJsonTitle: 'Sheet vertices JSON',
      statusTitle: 'Status',
      sync: 'Sync',
      synced: 'Synced',
    },
    labels: {
      allConfig: 'Full config',
      robots: 'Robot positions',
      sheet: 'Sheet vertices',
    },
    parseErrors: {
      emptyInput: 'Input is empty',
      invalidPointItem: 'Array items must be [x, y] or { x, y }',
      jsonRootArray: 'JSON root must be an array',
      noCoordinateRows: 'No coordinate rows recognized',
    },
    errors: {
      mismatchedCounts: 'Sheet vertex count and robot count must match',
    },
    status: {
      copied: (label: string) => `${label} copied`,
      copyFailed: (message: string) => `Copy failed: ${message}`,
      countSet: (count: number) => `Count set to ${count}`,
      pointCountRange: (min: number, max: number) =>
        `Point count must be between ${min} and ${max}`,
      pointsApplied: (label: string, count: number) =>
        `${label} applied, count ${count}`,
      ready: 'Ready',
      robotsTextSynced: 'Robot position text synced',
      sheetTextSynced: 'Sheet vertex text synced',
    },
  },
} as const

export type Locale = keyof typeof translations
export type Messages = (typeof translations)[Locale]
export type LabelKey = keyof typeof translations['zh-CN']['labels']
export type ParseErrorCode = keyof typeof translations['zh-CN']['parseErrors']

export const localeOptions = Object.keys(translations).map((code) => {
  const locale = code as Locale

  return {
    code: locale,
    label: translations[locale].language.name,
  }
})

const defaultLocale: Locale = 'en-US'
const localeStorageKey = 'vvcm-web.locale.v2'

export const isLocale = (value: string | null): value is Locale =>
  value !== null && Object.prototype.hasOwnProperty.call(translations, value)

export const getInitialLocale = (): Locale => {
  try {
    const storedLocale = window.localStorage.getItem(localeStorageKey)
    return isLocale(storedLocale) ? storedLocale : defaultLocale
  } catch {
    return defaultLocale
  }
}

export const storeLocale = (locale: Locale) => {
  try {
    window.localStorage.setItem(localeStorageKey, locale)
  } catch {
    // Ignore storage failures; the selector still works for this session.
  }
}
