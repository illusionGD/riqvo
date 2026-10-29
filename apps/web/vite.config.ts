import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, fileURLToPath(new URL('../../', import.meta.url)), '');
  const target = env.WEB_API_PROXY_TARGET || 'http://127.0.0.1:3000';
  const host = env.WEB_HOST || '127.0.0.1';
  const port = Number(env.WEB_PORT || 5173);
  return {
    plugins: [vue()],
    server: { host, port, strictPort: true, proxy: { '/api': { target } } },
    preview: { host, port, strictPort: true, proxy: { '/api': { target } } },
  };
});
