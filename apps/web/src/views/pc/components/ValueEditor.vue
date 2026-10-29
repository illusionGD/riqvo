<template>
  <div class="value-editor">
    <NSelect
      :value="value.source"
      :options="SOURCE_OPTIONS"
      :disabled="disabled"
      :aria-label="`${label}来源`"
      @update:value="changeSource"
    />
    <NInput
      :value="text"
      :disabled="disabled"
      :input-props="{ 'aria-label': value.source === 'variable' ? `${label}变量名` : label }"
      :placeholder="value.source === 'variable' ? '变量名，例如 secret_1' : '填写文本'"
      @update:value="changeText"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { NInput, NSelect } from 'naive-ui';
import type { InputValue } from '@riqvo/contracts';

const props = withDefaults(
  defineProps<{ value: InputValue; label: string; disabled?: boolean }>(),
  { disabled: false },
);
const emit = defineEmits<{ change: [value: InputValue] }>();
const text = computed(() =>
  props.value.source === 'literal' ? props.value.value : props.value.name,
);
const SOURCE_OPTIONS = [
  { label: '固定文本', value: 'literal' },
  { label: '运行变量', value: 'variable' },
];

/** 切换来源时不将原有敏感输入误当作变量名。 */
function changeSource(source: 'literal' | 'variable'): void {
  emit('change', source === 'literal' ? { source, value: '' } : { source, name: '' });
}
/** 由父层更新步骤，不直接修改输入对象。 */
function changeText(value: string): void {
  emit(
    'change',
    props.value.source === 'literal'
      ? { source: 'literal', value }
      : { source: 'variable', name: value },
  );
}
</script>

<style scoped lang="scss">
.value-editor {
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: var(--space-sm);
}
@media (max-width: 640px) {
  .value-editor {
    grid-template-columns: 1fr;
  }
}
</style>
