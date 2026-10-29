import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { parseTask } from '@riqvo/contracts';
import type { TestTask, TestStep } from '@riqvo/contracts';
import * as pc from '../services/pc-service';
import type { PcState } from '../types/pc';

/** 只在本机工作台使用的起始草稿，正式用例库在后续功能交付。 */
function initialTask(): TestTask {
  return parseTask({
    protocolVersion: 1,
    id: 'run_local',
    attempt: 1,
    case: {
      id: 'case_local',
      version: 1,
      title: '未命名用例',
      steps: [{ id: 'step_1', action: 'navigate', site: 'app', path: '', timeoutMs: 10000 }],
    },
    environment: {
      id: 'local',
      revision: 1,
      name: '本机环境',
      sites: { app: 'http://127.0.0.1:4174/' },
    },
    target: { platform: 'pc', browser: 'chromium', mode: 'background' },
    variables: {},
    artifacts: ['screenshot', 'video'],
  });
}

/** 录制、编辑及回放通过 action 更新，输入值仅保留当前页面会话。 */
export const usePcStore = defineStore('pc', () => {
  const draft = ref<TestTask>(initialTask());
  const remote = ref<PcState>();
  const values = ref<Record<string, string>>({});
  const replayMode = ref<'background' | 'visible'>('background');
  const selectedId = ref('step_1');
  const error = ref('');
  const loading = ref(false);
  const connected = ref(false);
  const connectionError = ref('');
  const busy = computed(() => loading.value || !!(remote.value && remote.value.mode !== 'idle'));
  const selectedStep = computed(() =>
    draft.value.case.steps.find((step) => step.id === selectedId.value),
  );
  const site = computed(() => {
    const first = draft.value.case.steps.find((step) => step.action === 'navigate');
    return first?.action === 'navigate'
      ? first.site
      : (Object.keys(draft.value.environment.sites)[0] ?? 'app');
  });
  const variableNames = computed(() => {
    const names = new Set<string>();
    for (const step of draft.value.case.steps) {
      const inputs =
        'query' in step
          ? Object.values(step.query)
          : 'value' in step
            ? [step.value]
            : 'expected' in step
              ? [step.expected]
              : [];
      for (const input of inputs) if (input.source === 'variable') names.add(input.name);
    }
    return [...names];
  });
  let unsubscribe: (() => void) | undefined;
  let recordingTaskId: string | undefined;

  /** 推送只更新对应录制草稿，运行结果和本地编辑始终分开。 */
  function receiveState(next: PcState): void {
    if (recordingTaskId && next.draft?.id === recordingTaskId) {
      draft.value = next.draft;
      if (!draft.value.case.steps.some((step) => step.id === selectedId.value))
        selectedId.value = draft.value.case.steps[0]?.id ?? '';
      if (next.mode === 'idle') recordingTaskId = undefined;
    }
    remote.value = next;
    connected.value = true;
    connectionError.value = '';
  }
  /** 建立唯一订阅；断线时由服务层重新认证并同步最新状态。 */
  function connect(): void {
    if (unsubscribe) return;
    unsubscribe = pc.subscribePcState(receiveState, (message) => {
      connected.value = false;
      connectionError.value = message;
    });
  }
  /** 停止推送和重试，不取消用户已启动的执行任务。 */
  function disconnect(): void {
    unsubscribe?.();
    unsubscribe = undefined;
    connected.value = false;
  }
  /** 统一加载、校验与错误反馈。 */
  async function act(action: () => Promise<void>): Promise<void> {
    loading.value = true;
    error.value = '';
    try {
      await action();
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '操作失败，请检查配置。';
    } finally {
      loading.value = false;
    }
  }
  /** 生成独立运行快照，变量不会写回草稿或导出文件。 */
  function taskForRun(): TestTask {
    for (const name of variableNames.value)
      if (!Object.hasOwn(values.value, name) || !values.value[name])
        throw new Error(`请填写运行变量：${name}`);
    return parseTask({
      ...draft.value,
      id: `run_${Date.now()}`,
      target: { ...draft.value.target, mode: replayMode.value },
      variables: values.value,
    });
  }
  /** 开始替换当前草稿的录制；密码由执行器转换为变量引用。 */
  async function record(): Promise<void> {
    await act(async () => {
      const first = draft.value.case.steps[0];
      if (!first || first.action !== 'navigate')
        throw new Error('请将打开页面放在第一步，再开始录制。');
      const input = parseTask({
        ...draft.value,
        id: `record_${Date.now()}`,
        case: { ...draft.value.case, version: draft.value.case.version + 1, steps: [first] },
        variables: values.value,
      });
      recordingTaskId = input.id;
      try {
        await pc.startRecording(input);
        values.value = {};
      } catch (cause) {
        recordingTaskId = undefined;
        throw cause;
      }
    });
  }
  /** 完成录制并取得媒体引用。 */
  async function stop(): Promise<void> {
    await act(pc.stopRecording);
  }
  /** 回放当前编辑版本；无断言的结果由驱动标为未验证。 */
  async function replay(): Promise<void> {
    await act(async () => {
      await pc.startReplay(taskForRun());
    });
  }
  /** 明确取消当前录制或回放。 */
  async function cancel(): Promise<void> {
    await act(pc.cancelPcTask);
  }
  /** 修改环境映射，不替换步骤内的字符串。 */
  function setUrl(value: string, name = site.value): void {
    draft.value.environment.sites[name] = value;
    draft.value.environment.revision += 1;
  }
  /** 设置当前选择的真实 PC 浏览器。 */
  function setBrowser(value: 'chromium' | 'chrome' | 'edge'): void {
    draft.value.target.browser = value;
  }
  /** 设置下一次回放模式，不改变录制窗口。 */
  function setMode(value: 'background' | 'visible'): void {
    replayMode.value = value;
  }
  /** 更新用例标题和本地版本。 */
  function setTitle(value: string): void {
    draft.value.case.title = value;
    draft.value.case.version += 1;
  }
  /** 更新仅会话内使用的运行变量。 */
  function setVariable(name: string, value: string): void {
    values.value[name] = value;
  }
  /** 选择要编辑的步骤。 */
  function select(id: string): void {
    selectedId.value = id;
  }
  /** 替换单个步骤并保留稳定标识。 */
  function updateStep(step: TestStep): void {
    const index = draft.value.case.steps.findIndex((value) => value.id === step.id);
    if (index < 0) return;
    draft.value.case.steps[index] = step;
    draft.value.case.version += 1;
  }
  /** 删除步骤，空草稿在运行校验时明确拒绝。 */
  function remove(id: string): void {
    draft.value.case.steps = draft.value.case.steps.filter((step) => step.id !== id);
    draft.value.case.version += 1;
    selectedId.value = draft.value.case.steps[0]?.id ?? '';
  }
  /** 在步骤列表中移动，不能越过列表边界。 */
  function move(id: string, direction: number): void {
    const index = draft.value.case.steps.findIndex((step) => step.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= draft.value.case.steps.length) return;
    const [step] = draft.value.case.steps.splice(index, 1);
    draft.value.case.steps.splice(target, 0, step!);
    draft.value.case.version += 1;
  }
  /** 添加可编辑断言，要求用户填写具体检查预期。 */
  function addAssertion(): void {
    const id = `assert_${Date.now()}`;
    draft.value.case.steps.push({
      id,
      action: 'assertText',
      locator: { strategy: 'testId', value: '' },
      expected: { source: 'literal', value: '' },
      match: 'contains',
      timeoutMs: 10000,
    });
    draft.value.case.version += 1;
    selectedId.value = id;
  }
  /** 从用户选择的 JSON 载入草稿；格式错误不覆盖原有编辑。 */
  function importJson(text: string): void {
    error.value = '';
    try {
      const task = parseTask(JSON.parse(text) as unknown);
      if (
        task.target.platform !== 'pc' ||
        !['chromium', 'chrome', 'edge'].includes(task.target.browser)
      )
        throw new Error('UNSUPPORTED');
      values.value = { ...task.variables };
      draft.value = { ...task, variables: {} };
      selectedId.value = task.case.steps[0]!.id;
      recordingTaskId = undefined;
    } catch {
      error.value = '用例 JSON 无效或不是当前支持的 PC 用例，原草稿已保留。';
    }
  }
  /** 导出步骤与环境，运行变量值不进入文件。 */
  function exportJson(): string | undefined {
    try {
      return JSON.stringify(
        parseTask({
          ...draft.value,
          target: { ...draft.value.target, mode: replayMode.value },
          variables: {},
        }),
        null,
        2,
      );
    } catch {
      error.value = '请先填写完整的步骤和环境，再导出用例。';
      return undefined;
    }
  }
  /** 显示文件读取等界面错误。 */
  function showError(message: string): void {
    error.value = message;
  }
  return {
    draft,
    remote,
    values,
    replayMode,
    selectedId,
    selectedStep,
    site,
    variableNames,
    error,
    loading,
    connected,
    connectionError,
    busy,
    connect,
    disconnect,
    record,
    stop,
    replay,
    cancel,
    setUrl,
    setBrowser,
    setMode,
    setTitle,
    setVariable,
    select,
    updateStep,
    remove,
    move,
    addAssertion,
    importJson,
    exportJson,
    showError,
  };
});
