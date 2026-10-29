<template>
  <PlatformShell
    :section="section"
    :connected="store.connected"
    :status-label="statusLabel"
    @select="selectSection"
  >
    <main class="pc-view">
      <header class="pc-view__header">
        <div>
          <h1>{{ pageTitle }}</h1>
          <p>{{ pageDescription }}</p>
        </div>
        <span class="pc-view__context">{{ store.draft.target.browser }} · PC</span>
      </header>
      <NAlert
        v-if="store.connectionError && section !== 'health'"
        type="warning"
        title="连接中断"
        role="alert"
        >{{ store.connectionError }}</NAlert
      >
      <NAlert v-if="store.error" type="error" title="操作未完成" role="alert">{{
        store.error
      }}</NAlert>
      <NAlert v-if="issue" type="warning" title="请检查本次会话" role="alert">{{ issue }}</NAlert>
      <section v-show="section === 'workbench'" class="pc-view__panel" aria-label="用例与运行配置">
        <NForm label-placement="top" :disabled="store.busy">
          <div class="pc-view__config">
            <NFormItem label="用例名称"
              ><NInput
                :value="store.draft.case.title"
                :input-props="{ 'aria-label': '用例名称' }"
                @update:value="store.setTitle"
            /></NFormItem>
            <NFormItem label="浏览器"
              ><NSelect
                :value="store.draft.target.browser"
                :options="BROWSER_OPTIONS"
                aria-label="浏览器"
                @update:value="store.setBrowser"
            /></NFormItem>
            <NFormItem label="回放方式"
              ><NSelect
                :value="store.replayMode"
                :options="MODE_OPTIONS"
                aria-label="回放方式"
                @update:value="store.setMode"
            /></NFormItem>
          </div>
        </NForm>
        <SiteEditor
          v-for="entry in sites"
          :key="entry.name"
          :name="entry.name"
          :url="entry.url"
          :disabled="store.busy"
          @change="store.setUrl"
        />
        <div class="pc-view__actions">
          <NButton type="primary" :disabled="store.busy || !store.connected" @click="store.record"
            >开始新录制</NButton
          >
          <NButton
            v-if="store.remote?.mode === 'recording'"
            type="warning"
            :loading="store.loading"
            @click="store.stop"
            >停止录制</NButton
          >
          <NButton :disabled="store.busy || !store.connected" @click="store.replay"
            >回放用例</NButton
          >
          <NButton v-if="store.busy" :disabled="store.loading" @click="store.cancel"
            >取消会话</NButton
          >
          <NButton :disabled="store.busy" @click="store.addAssertion">添加步骤 / 断言</NButton>
          <NButton :disabled="store.busy" @click="exportCase">导出用例</NButton>
          <label class="pc-view__import"
            >导入用例<input
              type="file"
              accept="application/json,.json"
              aria-label="导入用例 JSON"
              :disabled="store.busy"
              @change="importCase"
          /></label>
        </div>
        <p class="pc-view__hint">
          新录制会替换当前草稿，请先导出需要保留的用例。录制始终打开可见窗口；回放会创建独立浏览器会话。
        </p>
      </section>
      <section
        v-show="section === 'workbench'"
        v-if="store.variableNames.length"
        class="pc-view__panel"
        aria-label="本次运行变量"
      >
        <h2>本次运行变量</h2>
        <p class="pc-view__hint">
          值仅保留当前页面会话，导出用例不包含这些值。密码录制为变量后，需要在此补填。
        </p>
        <div class="pc-view__variables">
          <NFormItem v-for="name in store.variableNames" :key="name" :label="name"
            ><NInput
              :value="store.values[name] ?? ''"
              type="password"
              show-password-on="click"
              :input-props="{ autocomplete: 'off', 'aria-label': `变量 ${name}` }"
              :disabled="store.busy"
              @update:value="store.setVariable(name, $event)"
          /></NFormItem>
        </div>
      </section>
      <div v-show="section === 'workbench'" class="pc-view__workspace">
        <section class="pc-view__panel" aria-label="步骤列表">
          <div class="pc-view__section-heading">
            <h2>当前草稿</h2>
            <span>{{ store.draft.case.steps.length }} 步 · v{{ store.draft.case.version }}</span>
          </div>
          <NEmpty v-if="!store.draft.case.steps.length" description="录制操作或添加步骤" />
          <ol class="pc-view__steps">
            <li
              v-for="(step, index) in store.draft.case.steps"
              :key="step.id"
              :class="{ 'is-active': step.id === store.selectedId }"
            >
              <button
                type="button"
                class="pc-view__step"
                :data-testid="`step-${step.id}`"
                :aria-current="step.id === store.selectedId ? 'step' : undefined"
                @click="store.select(step.id)"
              >
                <span class="pc-view__number">{{ index + 1 }}</span
                ><span
                  ><strong>{{ ACTION_LABELS[step.action] }}</strong
                  ><small>{{ stepSummary(step) }}</small></span
                >
              </button>
            </li>
          </ol>
        </section>
        <section class="pc-view__panel" aria-label="步骤编辑">
          <h2>编辑步骤</h2>
          <template v-if="store.selectedStep">
            <div class="pc-view__actions pc-view__actions--editor">
              <NButton size="small" :disabled="store.busy" @click="moveUp">上移</NButton
              ><NButton size="small" :disabled="store.busy" @click="moveDown">下移</NButton
              ><NButton size="small" type="error" ghost :disabled="store.busy" @click="removeStep"
                >删除步骤</NButton
              >
            </div>
            <StepEditor
              :key="store.selectedId"
              :step="store.selectedStep"
              :site="store.site"
              :disabled="store.busy"
              @change="store.updateStep"
            /> </template
          ><NEmpty v-else description="选择一个步骤查看详情" />
        </section>
      </div>
      <div v-show="section === 'workbench' || section === 'results'" class="pc-view__panel">
        <RunReport :state="store.remote" />
      </div>
      <HealthView v-if="section === 'health'" />
      <section v-if="section === 'guide'" class="pc-view__panel pc-view__guide">
        <h2>从录制到验证</h2>
        <ol>
          <li>
            <strong>配置环境</strong>
            <p>
              填写站点地址并选择已安装的浏览器。同一份用例可以切换站点地址，在测试、预发布等环境运行。
            </p>
          </li>
          <li>
            <strong>录制操作</strong>
            <p>
              点击「开始新录制」，在打开的独立浏览器窗口中操作。回到工作台停止录制，再编辑步骤、定位方式与断言。
            </p>
          </li>
          <li>
            <strong>填写变量并回放</strong>
            <p>密码会录制为变量引用，需在本次运行变量中补填。默认后台回放，也可以切换可视模式。</p>
          </li>
          <li>
            <strong>检查结果</strong>
            <p>
              在运行结果中查看每一步的状态，以及本次任务采集的截图、录像。没有断言的用例会标为未验证。
            </p>
          </li>
        </ol>
        <NAlert type="info" title="保存草稿"
          >编辑内容需要导出为 JSON
          保存。刷新页面会丢弃未导出的编辑；导出文件不包含运行变量值。</NAlert
        >
        <p class="pc-view__hint">
          当前支持普通导航与表单流程。上传、iframe
          内操作、新标签页等复杂交互暂不支持，录制时会给出提示。
        </p>
      </section>
    </main>
  </PlatformShell>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { NAlert, NButton, NEmpty, NForm, NFormItem, NInput, NSelect } from 'naive-ui';
import { usePcStore } from '../../stores/pc';
import PlatformShell from '../../components/PlatformShell.vue';
import type { WorkbenchSection } from '../../types/ui';
import SiteEditor from './components/SiteEditor.vue';
import StepEditor from './components/StepEditor.vue';
import RunReport from './components/RunReport.vue';
import HealthView from '../health/HealthView.vue';
import { ACTION_LABELS, ISSUE_LABELS, stepSummary } from './pc-labels';

const store = usePcStore();
const section = ref<WorkbenchSection>('workbench');
const pageTitle = computed(
  () =>
    ({ workbench: 'PC 录制与回放', results: '运行结果', guide: '使用说明', health: '系统状态' })[
      section.value
    ],
);
const pageDescription = computed(
  () =>
    ({
      workbench: '配置用例，录制浏览器操作，编辑步骤并验证结果。',
      results: '查看最近一次运行的步骤状态与测试证据。',
      guide: '了解录制、编辑与回放的基本流程。',
      health: '查看平台服务与基础依赖的实际状态。',
    })[section.value],
);
const statusLabel = computed(() =>
  store.connected ? MODE_LABELS[store.remote?.mode ?? 'idle'] : '连接执行器中',
);
const sites = computed(() =>
  Object.entries(store.draft.environment.sites).map(([name, url]) => ({ name, url })),
);
const issue = computed(() =>
  store.remote?.issue
    ? (ISSUE_LABELS[store.remote.issue] ?? '当前会话未完整完成，请检查已采集步骤。')
    : '',
);
const BROWSER_OPTIONS = [
  { label: 'Chromium', value: 'chromium' },
  { label: 'Google Chrome', value: 'chrome' },
  { label: 'Microsoft Edge', value: 'edge' },
];
const MODE_OPTIONS = [
  { label: '后台回放', value: 'background' },
  { label: '可视回放', value: 'visible' },
];
const MODE_LABELS = {
  idle: '执行器已连接 · 空闲',
  opening: '正在打开浏览器',
  recording: '正在录制',
  running: '正在回放',
  finishing: '正在保存录像',
};
onMounted(store.connect);
onUnmounted(store.disconnect);

/** 导航保留当前草稿和同一条状态连接。 */
function selectSection(value: WorkbenchSection): void {
  section.value = value;
}

/** 将用户显式选择的文件载入草稿，限制大小并反馈读取错误。 */
async function importCase(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    if (file.size > 1024 * 1024) throw new Error('TOO_LARGE');
    store.importJson(await file.text());
  } catch {
    store.showError('文件无法读取或超过 1 MiB，请选择较小的用例 JSON。');
  } finally {
    input.value = '';
  }
}
/** 只在用户点击时下载草稿，变量值由 store 移除。 */
function exportCase(): void {
  const content = store.exportJson();
  if (!content) return;
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'riqvo-case.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
/** 使用稳定步骤标识调整顺序。 */
function moveUp(): void {
  store.move(store.selectedId, -1);
}
/** 使用稳定步骤标识调整顺序。 */
function moveDown(): void {
  store.move(store.selectedId, 1);
}
/** 删除后由 store 选择剩余步骤。 */
function removeStep(): void {
  store.remove(store.selectedId);
}
</script>

<style scoped lang="scss">
.pc-view {
  padding: 20px 24px;
  display: grid;
  gap: 16px;
  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }
  &__header h1 {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
  }
  &__header p,
  &__hint {
    color: var(--color-muted);
    margin: var(--space-sm) 0 0;
  }
  &__context {
    color: var(--color-muted);
    font-size: 12px;
    white-space: nowrap;
    padding: 5px 9px;
    border: 1px solid var(--color-border);
    border-radius: 5px;
    background: var(--color-surface);
  }
  &__hint,
  &__header p {
    font-size: 12px;
  }
  &__panel :deep(.n-form-item-feedback-wrapper) {
    min-height: 10px;
  }
  &__panel :deep(.n-form-item-label) {
    font-size: 12px;
    padding-bottom: 5px;
  }
  &__guide {
    max-width: 900px;
  }
  &__guide ol {
    margin: 0 0 24px;
    padding-left: 24px;
  }
  &__guide li {
    padding: 8px 0;
  }
  &__guide p {
    color: var(--color-muted);
  }
  &__brand {
    color: var(--color-accent);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 2px;
  }
  &__panel {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-card);
    padding: 16px;
    min-width: 0;
  }
  &__panel h2 {
    font-size: 14px;
    margin: 0 0 var(--space-md);
  }
  &__config {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr;
    gap: var(--space-md);
  }
  &__actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-sm);
  }
  &__actions--editor {
    margin-bottom: var(--space-lg);
  }
  &__import {
    position: relative;
    display: inline-flex;
    padding: 6px 12px;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    cursor: pointer;
  }
  &__import input {
    position: absolute;
    inset: 0;
    width: 100%;
    opacity: 0;
    cursor: pointer;
  }
  &__import:focus-within {
    outline: 2px solid var(--color-accent);
  }
  &__variables {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: var(--space-md);
    margin-top: var(--space-md);
  }
  &__workspace {
    display: grid;
    grid-template-columns: minmax(240px, 0.9fr) minmax(280px, 1.6fr);
    gap: 16px;
    align-items: start;
  }
  &__section-heading {
    display: flex;
    justify-content: space-between;
    gap: var(--space-md);
  }
  &__section-heading span {
    color: var(--color-muted);
  }
  &__steps {
    list-style: none;
    padding: 0;
    margin: 0;
    max-height: 520px;
    overflow-y: auto;
  }
  &__steps li {
    border: 1px solid transparent;
    border-radius: 8px;
    margin-bottom: 4px;
  }
  &__steps .is-active {
    border-color: var(--color-accent);
    background: var(--color-selected);
  }
  &__step {
    display: flex;
    gap: var(--space-md);
    align-items: center;
    width: 100%;
    border: 0;
    background: none;
    text-align: left;
    color: inherit;
    padding: 10px;
    cursor: pointer;
    font: inherit;
  }
  &__step small {
    display: block;
    color: var(--color-muted);
    overflow-wrap: anywhere;
  }
  &__number {
    color: var(--color-accent);
    font-variant-numeric: tabular-nums;
    min-width: 20px;
  }
}
@media (max-width: 800px) {
  .pc-view {
    padding: 14px;
    &__workspace,
    &__config {
      grid-template-columns: minmax(0, 1fr);
    }
    &__header {
      align-items: flex-start;
      flex-direction: column;
    }
  }
}
</style>
