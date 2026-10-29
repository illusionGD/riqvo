import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { freePort, runNode, waitForHttp } from '../helpers.mjs';

assert.equal(
  process.env.RIQVO_INTEGRATION,
  '1',
  'Run via pnpm test:integration to use disposable services.',
);

test(
  'a fresh MySQL instance requires explicit migration and repeated migration preserves readiness',
  { timeout: 30000 },
  async (t) => {
    const port = await freePort();
    const api = runNode('apps/server/dist/main.js', [], { API_PORT: String(port) });
    t.after(() => api.stop());
    await waitForHttp(`http://127.0.0.1:${port}/api/health/live`, api);
    const missing = await fetch(`http://127.0.0.1:${port}/api/health/ready`);
    assert.equal(missing.status, 503);
    assert.deepEqual((await missing.json()).checks, {
      mysql: 'migration_required',
      redis: 'ready',
      artifacts: 'ready',
    });

    const pending = await runNode('apps/server/dist/database/migrate.js', ['status']).done;
    assert.equal(pending.code, 0, pending.output);
    assert.deepEqual(JSON.parse(pending.output), { status: 'ok', pending: true });

    const first = await runNode('apps/server/dist/database/migrate.js', ['up']).done;
    assert.equal(first.code, 0, first.output);
    assert.deepEqual(JSON.parse(first.output), { status: 'ok', applied: 1 });
    const second = await runNode('apps/server/dist/database/migrate.js', ['up']).done;
    assert.equal(second.code, 0, second.output);
    assert.deepEqual(JSON.parse(second.output), { status: 'ok', applied: 0 });
    const state = await runNode('apps/server/dist/database/migrate.js', ['status']).done;
    assert.equal(state.code, 0, state.output);
    assert.deepEqual(JSON.parse(state.output), { status: 'ok', pending: false });

    const ready = await fetch(`http://127.0.0.1:${port}/api/health/ready`);
    assert.equal(ready.status, 200);
    assert.deepEqual(await ready.json(), {
      status: 'ready',
      service: 'riqvo-api',
      checks: { mysql: 'ready', redis: 'ready', artifacts: 'ready' },
    });
  },
);

test(
  'runner observes a real API and reconnects after the service restarts',
  { timeout: 25000 },
  async (t) => {
    const migration = await runNode('apps/server/dist/database/migrate.js', ['up']).done;
    assert.equal(migration.code, 0, migration.output);
    const port = await freePort();
    const runnerEnv = {
      RUNNER_API_URL: `http://127.0.0.1:${port}`,
      RUNNER_POLL_INTERVAL_MS: '1000',
    };
    const runner = runNode('apps/runner/dist/main.js', [], runnerEnv);
    t.after(() => runner.stop());
    async function waitForState(state, count = 1) {
      for (let attempt = 0; attempt < 60; attempt += 1) {
        const events = runner
          .output()
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line));
        if (events.filter((event) => event.api === state).length >= count) return;
        await delay(100);
      }
      assert.fail(`Runner did not reach ${state}: ${runner.output()}`);
    }
    await waitForState('unreachable');
    const api = runNode('apps/server/dist/main.js', [], { API_PORT: String(port) });
    t.after(() => api.stop());
    await waitForHttp(`http://127.0.0.1:${port}/api/health/live`, api);
    await waitForState('ready');
    const check = await runNode('apps/runner/dist/main.js', ['--check'], runnerEnv).done;
    assert.equal(check.code, 0, check.output);
    assert.deepEqual(JSON.parse(check.output), {
      service: 'riqvo-runner',
      api: 'ready',
      mode: 'connectivity-only',
    });
    await api.stop();
    await waitForState('unreachable', 2);
    const restarted = runNode('apps/server/dist/main.js', [], { API_PORT: String(port) });
    t.after(() => restarted.stop());
    await waitForState('ready', 2);
    await runner.stop();
    assert.equal((await runner.done).code, 0);
  },
);

test(
  'the built web page shows real dependency readiness through its API proxy',
  { timeout: 20000 },
  async (t) => {
    const migration = await runNode('apps/server/dist/database/migrate.js', ['up']).done;
    assert.equal(migration.code, 0, migration.output);
    const apiPort = await freePort();
    const webPort = await freePort();
    const api = runNode('apps/server/dist/main.js', [], { API_PORT: String(apiPort) });
    t.after(() => api.stop());
    await waitForHttp(`http://127.0.0.1:${apiPort}/api/health/live`, api);
    const web = runNode(
      'node_modules/vite/bin/vite.js',
      ['preview'],
      {
        WEB_HOST: '127.0.0.1',
        WEB_PORT: String(webPort),
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
    await page.getByRole('button', { name: '系统状态', exact: true }).click();
    await page.getByRole('heading', { name: '服务已就绪', exact: true }).waitFor({ timeout: 5000 });
    assert.equal(await page.getByText('已就绪', { exact: true }).count(), 3);
    assert.equal(await page.getByRole('alert').count(), 0);
  },
);
