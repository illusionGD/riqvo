<template>
  <main class="pc-view">
    <header class="pc-view__header">
      <div>
        <span class="pc-view__brand">RIQVO / 本机工作台</span>
        <h1>PC 录制与回放</h1>
        <p>在独立浏览器中操作，在这里编辑步骤、切换环境并验证结果。</p>
      </div>
      <NTag :type="store.connected ? 'success' : 'warning'">{{
        store.connected ? MODE_LABELS[store.remote?.mode ?? 'idle'] : '连接执行器中'
      }}</NTag>
    </header>
    <NAlert v-if="store.error" type="error" title="操作未完成" role="alert">{{
      store.error
    }}</NAlert>
    <NAlert v-if="issue" type="warning" title="请检查本次会话" role="alert">{{ issue }}</NAlert>
    <section class="pc-view__panel" aria-label="用例与运行配置">
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
        <NButton :disabled="store.busy || !store.connected" @click="store.replay">回放用例</NButton>
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
    <section v-if="store.variableNames.length" class="pc-view__panel" aria-label="本次运行变量">
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
    <div class="pc-view__workspace">
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
    <div class="pc-view__panel"><RunReport :state="store.remote" /></div>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import { NAlert, NButton, NEmpty, NForm, NFormItem, NInput, NSelect, NTag } from 'naive-ui';
import { usePcStore } from '../../stores/pc';
import SiteEditor from './components/SiteEditor.vue';
import StepEditor from './components/StepEditor.vue';
import RunReport from './components/RunReport.vue';
import { ACTION_LABELS, ISSUE_LABELS, stepSummary } from './pc-labels';

const store = usePcStore();
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
  max-width: 1280px;
  margin: 0 auto;
  padding: var(--space-xl);
  display: grid;
  gap: var(--space-lg);
  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-lg);
  }
  &__header h1 {
    margin: var(--space-sm) 0;
    font-size: 28px;
  }
  &__header p,
  &__hint {
    color: var(--color-muted);
    margin: var(--space-sm) 0 0;
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
    padding: var(--space-lg);
    min-width: 0;
  }
  &__panel h2 {
    font-size: 17px;
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
    grid-template-columns: minmax(260px, 1fr) minmax(320px, 1.4fr);
    gap: var(--space-lg);
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
    max-height: 640px;
    overflow-y: auto;
  }
  &__steps li {
    border: 1px solid transparent;
    border-radius: 8px;
    margin-bottom: 4px;
  }
  &__steps .is-active {
    border-color: var(--color-accent);
    background: #f0f7f3;
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
    padding: 12px;
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
    padding: var(--space-md);
    &__workspace,
    &__config {
      grid-template-columns: 1fr;
    }
    &__header {
      align-items: flex-start;
      flex-direction: column;
    }
  }
}
</style>
