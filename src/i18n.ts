export const translations = {
  'zh-CN': {
    language: {
      ariaLabel: '语言',
      name: '中文',
      selectorLabel: '语言',
    },
    header: {
      eyebrow: 'VVCM wasm visual test bench',
      indexBaseAriaLabel: '显示索引基准',
      indexBaseLabel: '索引',
      oneBasedIndex: '1-based',
      sourceLinksAriaLabel: 'GitHub 源代码链接',
      title: 'VVCM 可视化测试台',
      vvcmSourceAriaLabel: '在 GitHub 打开 VVCM 源代码',
      webSourceAriaLabel: '在 GitHub 打开 Web 页面源代码',
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
    fullConfig: {
      ariaLabel: '完整配置操作',
      copyAllConfig: '复制全部配置',
      pasteAllConfig: '粘贴全部配置',
      title: '完整配置',
    },
    canvas: {
      ariaLabel: 'VVCM 坐标画布',
      fitView: '适配',
      legendAriaLabel: '图例',
      robotLegend: '机器人',
      sheetLegend: '布顶点',
      showRobotView: '机器人视角',
      showSheetView: '布视角',
      stableSolutionLegend: '稳定解',
      title: '坐标画布',
      unstableSolutionLegend: '不稳定解',
      visibilityControlsAriaLabel: '画布显示控制',
      viewControlsAriaLabel: '画布视图控制',
      zoomIn: '放大',
      zoomOut: '缩小',
    },
    scene3d: {
      ariaLabel: '3D 视图控制',
      groundRobotLegend: 'r# 地面位置',
      holdPointLegend: 'p# hold 点位',
      legendAriaLabel: '3D 图例',
      objectLegend: 'po 物体位置',
      resetView: '重置视图',
      tautLineLegend: 'taut p#-po',
      title: '3D 视图',
      webglUnavailable: '当前浏览器无法初始化 WebGL 3D 视图',
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
    fullConfigErrors: {
      emptyInput: '剪贴板内容为空',
      invalidHoldHeight: 'holdHeight 需要是非负数',
      invalidJson: '剪贴板内容不是有效的 JSON',
      invalidPointItem: 'sheet 和 formation 的点需要是 [x, y] 或 { x, y }',
      invalidRobotCount: 'robotCount 需要是支持范围内的整数',
      jsonRootObject: '完整配置 JSON 根节点需要是对象',
      mismatchedCounts: 'robotCount、sheet 数量和 formation 数量需要一致',
      missingField: '完整配置需要包含 robotCount、holdHeight、sheet 和 formation',
      pointArrayRequired: 'sheet 和 formation 需要是点数组',
    },
    errors: {
      mismatchedCounts: '布顶点数量和机器人数量需要一致',
    },
    status: {
      copied: (label: string) => `${label} 已复制`,
      copyFailed: (message: string) => `复制失败：${message}`,
      countSet: (count: number) => `数量已设置为 ${count}`,
      fullConfigPasted: (count: number) => `完整配置已粘贴，数量 ${count}`,
      pasteFailed: (message: string) => `粘贴失败：${message}`,
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
      eyebrow: 'VVCM wasm visual test bench',
      indexBaseAriaLabel: 'Displayed index base',
      indexBaseLabel: 'Index',
      oneBasedIndex: '1-based',
      sourceLinksAriaLabel: 'GitHub source links',
      title: 'VVCM Visual Test Bench',
      vvcmSourceAriaLabel: 'VVCM source code on GitHub',
      webSourceAriaLabel: 'Web source code on GitHub',
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
    fullConfig: {
      ariaLabel: 'Full config actions',
      copyAllConfig: 'Copy full config',
      pasteAllConfig: 'Paste full config',
      title: 'Full config',
    },
    canvas: {
      ariaLabel: 'VVCM coordinate canvas',
      fitView: 'Fit',
      legendAriaLabel: 'Legend',
      robotLegend: 'Robots',
      sheetLegend: 'Sheet vertices',
      showRobotView: 'Robot view',
      showSheetView: 'Sheet view',
      stableSolutionLegend: 'Stable solution',
      title: 'Coordinate Canvas',
      unstableSolutionLegend: 'Unstable solution',
      visibilityControlsAriaLabel: 'Canvas visibility controls',
      viewControlsAriaLabel: 'Canvas view controls',
      zoomIn: 'Zoom in',
      zoomOut: 'Zoom out',
    },
    scene3d: {
      ariaLabel: '3D view controls',
      groundRobotLegend: 'r# ground',
      holdPointLegend: 'p# hold point',
      legendAriaLabel: '3D legend',
      objectLegend: 'po object',
      resetView: 'Reset',
      tautLineLegend: 'taut p#-po',
      title: '3D View',
      webglUnavailable: 'This browser could not initialize the WebGL 3D view',
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
    fullConfigErrors: {
      emptyInput: 'Clipboard content is empty',
      invalidHoldHeight: 'holdHeight must be a non-negative number',
      invalidJson: 'Clipboard content is not valid JSON',
      invalidPointItem: 'sheet and formation points must be [x, y] or { x, y }',
      invalidRobotCount: 'robotCount must be an integer in the supported range',
      jsonRootObject: 'Full config JSON root must be an object',
      mismatchedCounts: 'robotCount, sheet count, and formation count must match',
      missingField: 'Full config must include robotCount, holdHeight, sheet, and formation',
      pointArrayRequired: 'sheet and formation must be point arrays',
    },
    errors: {
      mismatchedCounts: 'Sheet vertex count and robot count must match',
    },
    status: {
      copied: (label: string) => `${label} copied`,
      copyFailed: (message: string) => `Copy failed: ${message}`,
      countSet: (count: number) => `Count set to ${count}`,
      fullConfigPasted: (count: number) => `Full config pasted, count ${count}`,
      pasteFailed: (message: string) => `Paste failed: ${message}`,
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
export type FullConfigErrorCode = keyof typeof translations['zh-CN']['fullConfigErrors']
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
