import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { fetchHealth } from '../services/health-service';
import type { HealthSnapshot } from '../types/health';

export const useHealthStore = defineStore('health', () => {
  const snapshot = ref<HealthSnapshot | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const checkedAt = ref<string | null>(null);
  const ready = computed(() => snapshot.value?.status === 'ready');

  /** Refresh the snapshot; clear stale success when the API becomes unreachable. */
  async function refresh(): Promise<void> {
    if (loading.value) return;
    loading.value = true;
    error.value = null;
    try {
      snapshot.value = await fetchHealth();
    } catch {
      snapshot.value = null;
      error.value = '无法连接平台服务，请确认服务已启动后重新检查。';
    } finally {
      checkedAt.value = new Date().toLocaleTimeString('zh-CN');
      loading.value = false;
    }
  }

  return { snapshot, loading, error, checkedAt, ready, refresh };
});
