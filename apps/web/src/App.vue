<template>
  <NConfigProvider :locale="zhCN" :date-locale="dateZhCN" :theme-overrides="UI_THEME">
    <PcView v-if="isPcWorkbench" />
    <HealthView v-else />
  </NConfigProvider>
</template>

<script setup lang="ts">
import { defineAsyncComponent } from 'vue';
import { NConfigProvider, dateZhCN, zhCN } from 'naive-ui';
import { UI_THEME } from './constants/ui-theme';
import HealthView from './views/health/HealthView.vue';

const PcView = defineAsyncComponent(() => import('./views/pc/PcView.vue'));
const isPcWorkbench = window.location.pathname === '/pc';
</script>
