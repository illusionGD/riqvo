<template>
  <NConfigProvider
    :locale="zhCN"
    :date-locale="dateZhCN"
    :theme="ui.isDark ? darkTheme : null"
    :theme-overrides="ui.isDark ? UI_DARK_THEME : UI_THEME"
  >
    <PcView v-if="isPcWorkbench" />
    <HealthView v-else />
  </NConfigProvider>
</template>

<script setup lang="ts">
import { defineAsyncComponent, onMounted, onUnmounted, watch } from 'vue';
import { NConfigProvider, darkTheme, dateZhCN, zhCN } from 'naive-ui';
import { UI_THEME, UI_DARK_THEME } from './constants/ui-theme';
import { useUiStore } from './stores/ui';
import HealthView from './views/health/HealthView.vue';

const ui = useUiStore();
const PcView = defineAsyncComponent(() => import('./views/pc/PcView.vue'));
const isPcWorkbench = window.location.pathname === '/pc';
watch(
  () => ui.isDark,
  (dark) => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  },
  { immediate: true },
);
onMounted(ui.connect);
onUnmounted(ui.disconnect);
</script>
