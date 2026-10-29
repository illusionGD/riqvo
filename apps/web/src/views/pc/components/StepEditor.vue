<template>
  <NForm label-placement="top" :disabled="disabled" class="step-editor">
    <NFormItem label="操作类型"
      ><NSelect
        :value="step.action"
        :options="ACTION_OPTIONS"
        aria-label="操作类型"
        @update:value="changeAction"
    /></NFormItem>
    <template v-if="'site' in step">
      <NFormItem label="站点标识"
        ><NInput
          :value="step.site"
          :input-props="{ 'aria-label': '站点标识' }"
          @update:value="changeSite"
      /></NFormItem>
      <NFormItem label="相对路径"
        ><NInput
          :value="step.path"
          placeholder="例如 login，不含域名和开头斜线"
          :input-props="{ 'aria-label': '相对路径' }"
          @update:value="changePath"
      /></NFormItem>
      <NFormItem label="查询参数（JSON）"
        ><div class="step-editor__query">
          <NInput
            v-model:value="queryText"
            type="textarea"
            :input-props="{ 'aria-label': '查询参数 JSON' }"
          />
          <NButton size="small" :disabled="disabled" @click="applyQuery">应用查询参数</NButton>
          <span v-if="queryError" role="alert">{{ queryError }}</span>
        </div></NFormItem
      >
    </template>
    <template v-if="locator">
      <NFormItem label="定位方式"
        ><NSelect
          :value="locator.strategy"
          :options="LOCATOR_OPTIONS"
          aria-label="定位方式"
          @update:value="changeStrategy"
      /></NFormItem>
      <NFormItem v-if="locator.strategy === 'role'" label="角色"
        ><NInput
          :value="locator.role"
          :input-props="{ 'aria-label': '元素角色' }"
          @update:value="changeRole"
      /></NFormItem>
      <NFormItem :label="locator.strategy === 'role' ? '无障碍名称' : '定位值'">
        <NInput
          :value="locator.strategy === 'role' ? locator.name : locator.value"
          :input-props="{ 'aria-label': '定位值' }"
          @update:value="changeLocatorValue"
        />
      </NFormItem>
      <NCheckbox
        v-if="'exact' in locator"
        :checked="locator.exact"
        :disabled="disabled"
        @update:checked="changeExact"
        >精确匹配名称</NCheckbox
      >
    </template>
    <NFormItem v-if="'value' in step" label="输入内容"
      ><ValueEditor :value="step.value" label="输入内容" :disabled="disabled" @change="changeValue"
    /></NFormItem>
    <template v-if="step.action === 'assertText'">
      <NFormItem label="预期文本"
        ><ValueEditor
          :value="step.expected"
          label="预期文本"
          :disabled="disabled"
          @change="changeExpected"
      /></NFormItem>
      <NFormItem label="匹配规则"
        ><NSelect
          :value="step.match"
          :options="MATCH_OPTIONS"
          aria-label="文本匹配规则"
          @update:value="changeMatch"
      /></NFormItem>
    </template>
    <NFormItem v-if="step.action === 'check'" label="勾选状态"
      ><NSwitch :value="step.checked" aria-label="勾选状态" @update:value="changeChecked"
    /></NFormItem>
    <NFormItem v-if="step.action === 'assertVisible'" label="预期可见"
      ><NSwitch :value="step.visible" aria-label="预期可见" @update:value="changeVisible"
    /></NFormItem>
    <NFormItem v-if="step.action === 'waitFor'" label="等待状态"
      ><NSelect
        :value="step.state"
        :options="STATE_OPTIONS"
        aria-label="等待状态"
        @update:value="changeWaitState"
    /></NFormItem>
    <NFormItem label="超时（毫秒）"
      ><NInputNumber
        :value="step.timeoutMs"
        :min="1"
        :max="300000"
        :step="1000"
        aria-label="步骤超时"
        @update:value="changeTimeout"
    /></NFormItem>
  </NForm>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  NButton,
  NCheckbox,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NSelect,
  NSwitch,
} from 'naive-ui';
import { STEP_SCHEMA } from '@riqvo/contracts';
import type { InputValue, TestStep } from '@riqvo/contracts';
import ValueEditor from './ValueEditor.vue';
import { ACTION_OPTIONS } from '../pc-labels';

type Locator = Extract<TestStep, { action: 'click' }>['locator'];
const props = withDefaults(defineProps<{ step: TestStep; site: string; disabled?: boolean }>(), {
  disabled: false,
});
const emit = defineEmits<{ change: [step: TestStep] }>();
const queryText = ref('{}');
const queryError = ref('');
const locator = computed(() => ('locator' in props.step ? props.step.locator : undefined));
const LOCATOR_OPTIONS = [
  { label: '测试标识 testId', value: 'testId' },
  { label: '表单标签 label', value: 'label' },
  { label: '角色和名称', value: 'role' },
  { label: 'CSS 选择器', value: 'css' },
];
const MATCH_OPTIONS = [
  { label: '包含文本', value: 'contains' },
  { label: '完全相同', value: 'equals' },
];
const STATE_OPTIONS = [
  { label: '可见', value: 'visible' },
  { label: '隐藏', value: 'hidden' },
];
watch(
  () => props.step,
  (step) => {
    queryText.value = 'query' in step ? JSON.stringify(step.query, null, 2) : '{}';
    queryError.value = '';
  },
  { immediate: true },
);

/** 切换操作仅保留通用字段，防止旧字段混入新协议。 */
function changeAction(action: TestStep['action']): void {
  const base = { id: props.step.id, timeoutMs: props.step.timeoutMs };
  const target: Locator = locator.value ?? { strategy: 'testId', value: '' };
  let next: TestStep;
  if (action === 'navigate' || action === 'assertUrl')
    next = { ...base, action, site: props.site, path: '', query: {} };
  else if (action === 'screenshot') next = { ...base, action };
  else if (action === 'fill' || action === 'select')
    next = { ...base, action, locator: target, value: { source: 'literal', value: '' } };
  else if (action === 'check') next = { ...base, action, locator: target, checked: true };
  else if (action === 'waitFor') next = { ...base, action, locator: target, state: 'visible' };
  else if (action === 'assertVisible') next = { ...base, action, locator: target, visible: true };
  else if (action === 'assertText')
    next = {
      ...base,
      action,
      locator: target,
      expected: { source: 'literal', value: '' },
      match: 'contains',
    };
  else next = { ...base, action, locator: target };
  emit('change', next);
}
/** 定位器变更通过父层保存；目标必须唯一。 */
function updateLocator(value: Locator): void {
  if ('locator' in props.step) emit('change', { ...props.step, locator: value });
}
/** 各定位策略采用完整结构，避免遗留字段。 */
function changeStrategy(strategy: Locator['strategy']): void {
  if (strategy === 'role') updateLocator({ strategy, role: 'button', name: '', exact: true });
  else if (strategy === 'label') updateLocator({ strategy, value: '', exact: true });
  else updateLocator({ strategy, value: '' });
}
/** 修改用户可见的定位文字。 */
function changeLocatorValue(value: string): void {
  if (locator.value)
    updateLocator(
      locator.value.strategy === 'role'
        ? { ...locator.value, name: value }
        : { ...locator.value, value },
    );
}
/** 更新无障碍角色。 */
function changeRole(role: string): void {
  if (locator.value?.strategy === 'role') updateLocator({ ...locator.value, role });
}
/** 名称默认精确匹配，可由用户显式放宽。 */
function changeExact(exact: boolean): void {
  if (locator.value && 'exact' in locator.value) updateLocator({ ...locator.value, exact });
}
/** 路由始终保存站点引用。 */
function changeSite(site: string): void {
  if ('site' in props.step) emit('change', { ...props.step, site });
}
/** 路径由运行预检再次验证。 */
function changePath(path: string): void {
  if ('path' in props.step) emit('change', { ...props.step, path });
}
/** 查询参数只有通过协议校验才覆盖原步骤。 */
function applyQuery(): void {
  try {
    const query: unknown = JSON.parse(queryText.value);
    const next = STEP_SCHEMA.parse({ ...props.step, query });
    emit('change', next);
    queryError.value = '';
  } catch {
    queryError.value = '参数格式无效。示例：{"keyword":{"source":"literal","value":"文本"}}';
  }
}
/** 输入内容支持固定文本和会话变量。 */
function changeValue(value: InputValue): void {
  if ('value' in props.step) emit('change', { ...props.step, value });
}
/** 预期值与操作输入使用相同变量规则。 */
function changeExpected(expected: InputValue): void {
  if (props.step.action === 'assertText') emit('change', { ...props.step, expected });
}
/** 更改文本断言规则。 */
function changeMatch(match: 'equals' | 'contains'): void {
  if (props.step.action === 'assertText') emit('change', { ...props.step, match });
}
/** 勾选动作描述最终状态。 */
function changeChecked(checked: boolean): void {
  if (props.step.action === 'check') emit('change', { ...props.step, checked });
}
/** 可见性断言同样支持检查隐藏。 */
function changeVisible(visible: boolean): void {
  if (props.step.action === 'assertVisible') emit('change', { ...props.step, visible });
}
/** 等待状态不代表业务断言。 */
function changeWaitState(state: 'visible' | 'hidden'): void {
  if (props.step.action === 'waitFor') emit('change', { ...props.step, state });
}
/** 清空数值输入时保留原超时，避免写入无效空值。 */
function changeTimeout(timeoutMs: number | null): void {
  if (timeoutMs !== null) emit('change', { ...props.step, timeoutMs });
}
</script>

<style scoped lang="scss">
.step-editor {
  &__query {
    display: grid;
    gap: var(--space-sm);
    width: 100%;
  }
}
</style>
