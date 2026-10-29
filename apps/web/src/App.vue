<template>
  <NConfigProvider :locale="zhCN" :date-locale="dateZhCN" :theme-overrides="UI_THEME">
    <HealthView />
  </NConfigProvider>
</template>

<script setup lang="ts">
import { NConfigProvider, dateZhCN, zhCN } from 'naive-ui';
import { UI_THEME } from './constants/ui-theme';
import HealthView from './views/health/HealthView.vue';
</script>
