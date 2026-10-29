import type { TestStep } from '@riqvo/contracts';

/** 工作台操作名称与共享协议一一对应。 */
export const ACTION_LABELS: Record<TestStep['action'], string> = {
  navigate: '打开页面',
  fill: '输入内容',
  click: '点击',
  select: '选择选项',
  check: '勾选',
  waitFor: '等待元素',
  assertText: '检查文本',
  assertVisible: '检查可见性',
  assertUrl: '检查地址',
  screenshot: '截图',
};
/** 操作类型选择器仅列出 PC 驱动当前支持项。 */
export const ACTION_OPTIONS = Object.entries(ACTION_LABELS).map(([value, label]) => ({
  value,
  label,
}));
/** 报告原始状态均有可区分的中文说明。 */
export const STATUS_LABELS: Record<string, string> = {
  passed: '通过',
  failed: '失败',
  unverified: '未验证',
  cancelled: '已取消',
  unsupported: '不支持',
  skipped: '已跳过',
};
/** 不支持的录制交互需要修正草稿后再运行。 */
export const ISSUE_LABELS: Record<string, string> = {
  FILE_INPUT: '此原型暂不录制文件上传。录制已停止采集，请停止会话并检查已录步骤。',
  MULTI_SELECT: '此原型暂不录制多选框列表，请停止会话并检查已录步骤。',
  KEYBOARD_ACTION: '此原型暂不录制回车提交或快捷键，请停止会话并改用点击按钮录制。',
  CONTENT_EDITABLE: '此原型暂不录制富文本编辑，请停止会话并检查已录步骤。',
  DRAG: '此原型暂不录制拖拽，请停止会话并检查已录步骤。',
  IFRAME_OR_POPUP: '此原型暂不录制 iframe 内交互或新标签页，请停止会话并检查已录步骤。',
  UNSUPPORTED_NAVIGATION: '页面地址超出已配置站点或不符合当前路由协议，录制已停止采集。',
  UNSUPPORTED_INTERACTION: '遇到当前协议无法表达的交互，录制已停止采集。',
  STEP_LIMIT: '已达到 1000 步上限，请停止录制。',
  BROWSER_CLOSED: '录制浏览器已关闭，已保留关闭前收到的步骤。',
  BROWSER_START_FAILED: '浏览器或起始页面打开失败，请检查浏览器安装、显示环境和站点地址。',
  RECORDING_FINISH_FAILED: '录制收尾失败，已释放浏览器，请检查草稿与可用产物。',
  RUN_FAILED: '执行器未能生成完整报告，请检查本机配置后重试。',
  CANCELLED: '会话已取消，已采集内容保留供检查。',
};

/**
 * 步骤摘要不展示输入内容，避免列表意外露出业务数据。
 * @param step 当前草稿步骤。
 * @returns 路由或定位摘要。
 */
export function stepSummary(step: TestStep): string {
  if ('site' in step) return `${step.site} / ${step.path}`;
  if ('locator' in step)
    return step.locator.strategy === 'role'
      ? `${step.locator.role} · ${step.locator.name}`
      : `${step.locator.strategy} · ${step.locator.value}`;
  return '保存当前页面';
}
