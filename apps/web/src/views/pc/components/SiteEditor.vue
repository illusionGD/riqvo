<template>
  <NFormItem :label="`站点 ${name} 地址`" label-placement="top">
    <NInput
      :value="url"
      :disabled="disabled"
      :input-props="{ 'aria-label': `站点 ${name} 地址` }"
      placeholder="https://test.example.com/"
      @update:value="changeUrl"
    />
  </NFormItem>
</template>

<script setup lang="ts">
import { NFormItem, NInput } from 'naive-ui';

const props = defineProps<{ name: string; url: string; disabled: boolean }>();
const emit = defineEmits<{ change: [url: string, name: string] }>();

/** 地址以站点标识关联，由父层统一增加环境版本。 */
function changeUrl(url: string): void {
  emit('change', url, props.name);
}
</script>
