import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';
import { blockedArtifactPath, freePort, runNode, waitForHttp } from './helpers.mjs';

test(
  'the built web page shows dependency failures and lets the user retry after losing the API',
  { timeout: 25000 },
  async (t) => {
    const apiPort = await freePort();
    const webPort = await freePort();
    const api = runNode('apps/server/dist/main.js', [], {
      API_PORT: String(apiPort),
      MYSQL_HOST: '127.0.0.1',
      MYSQL_PORT: '1',
      MYSQL_DATABASE: 'riqvo_test',
      MYSQL_USER: 'test',
      MYSQL_PASSWORD: 'not-a-real-password',
      REDIS_HOST: '127.0.0.1',
      REDIS_PORT: '1',
      ARTIFACT_DIR: await blockedArtifactPath(t),
    });
    t.after(() => api.stop());
    await waitForHttp(`http://127.0.0.1:${apiPort}/api/health/live`, api);
    const web = runNode(
      'node_modules/vite/bin/vite.js',
      ['preview'],
      {
        WEB_PORT: String(webPort),
        WEB_HOST: '127.0.0.1',
        WEB_API_PROXY_TARGET: `http://127.0.0.1:${apiPort}`,
      },
      { cwd: 'apps/web' },
    );
    t.after(() => web.stop());
    await waitForHttp(`http://127.0.0.1:${webPort}`, web);
    const browser = await chromium.launch({
      executablePath: process.env.RIQVO_CHROMIUM_EXECUTABLE,
    });
    t.after(() => browser.close());
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${webPort}`);
    await page
      .getByRole('heading', { name: '服务暂不可用', exact: true })
      .waitFor({ timeout: 5000 });
    assert.equal(await page.getByText('不可用', { exact: true }).count(), 3);
    await api.stop();
    await page.getByRole('button', { name: '重新检查' }).click();
    await page.getByRole('alert').waitFor();
    assert.match(await page.getByRole('alert').textContent(), /无法连接平台服务/);
    assert.equal(await page.getByRole('button', { name: '重新检查' }).isEnabled(), true);
  },
);
