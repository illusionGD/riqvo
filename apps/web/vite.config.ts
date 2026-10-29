import { fileURLToPath } from 'node:url';
import { defaultClientConditions, defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, fileURLToPath(new URL('../../', import.meta.url)), '');
  const target = env.WEB_API_PROXY_TARGET || 'http://127.0.0.1:3000';
  const pcTarget =
    env.WEB_PC_PROXY_TARGET ||
    `http://127.0.0.1:${env.RIQVO_PC_PORT || (mode === 'pc' ? '4319' : '4318')}`;
  const host = env.WEB_HOST || '127.0.0.1';
  const port = Number(env.WEB_PORT || 5173);
  return {
    plugins: [vue()],
    resolve: {
      conditions:
        mode === 'pc'
          ? ['riqvo-development', ...defaultClientConditions]
          : [...defaultClientConditions],
    },
    server: {
      host,
      port,
      strictPort: true,
      proxy: {
        '/api/pc': {
          target: pcTarget,
          changeOrigin: true,
          configure(proxy) {
            // 只转换来自当前开发站点的 Origin，其他来源继续由执行器拒绝。
            proxy.on('proxyReq', (forwarded, incoming) => {
              if (incoming.headers.origin === `http://${incoming.headers.host}`)
                forwarded.setHeader('origin', new URL(pcTarget).origin);
            });
          },
        },
        '/api': { target },
      },
    },
    preview: { host, port, strictPort: true, proxy: { '/api': { target } } },
  };
});
