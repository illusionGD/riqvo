import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { freePort, runNode, waitForHttp } from './helpers.mjs';
import { startWorkbench, waitIdle } from './pc-helpers.mjs';

test(
  '本机工作台拒绝跨源或无令牌控制，通过公开接口回放并返回真实截图',
  { timeout: 30000 },
  async (t) => {
    const { origin, request, headers } = await startWorkbench(t);
    assert.equal(
      (
        await fetch(`${origin}/api/pc/bootstrap`, {
          headers: { origin: 'https://untrusted.example' },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(`${origin}/api/pc/run`, {
          method: 'POST',
          headers: { origin, 'content-type': 'application/json' },
          body: '{}',
        })
      ).status,
      403,
    );
    const invalid = await request('run', { bad: true });
    assert.equal(invalid.status, 400);
    assert.deepEqual(await invalid.json(), {
      code: 100001,
      data: null,
      message: '步骤、环境或变量无效',
    });
    const stopped = await request('stop', {});
    assert.equal(stopped.status, 409);
    assert.deepEqual(await stopped.json(), {
      code: 100004,
      data: null,
      message: '当前没有进行中的录制',
    });
    const sitePort = await freePort();
    const site = runNode('apps/test-site/dist/main.js', [
      `--port=${sitePort}`,
      '--environment=test',
    ]);
    t.after(() => site.stop());
    await waitForHttp(`http://127.0.0.1:${sitePort}/health`, site);
    const task = JSON.parse(await readFile('examples/d02/task.json', 'utf8'));
    task.environment.sites.portal = `http://127.0.0.1:${sitePort}/`;
    task.artifacts = ['screenshot'];
    assert.equal((await request('run', task)).status, 202);
    assert.equal((await request('run', task)).status, 409);
    const state = await waitIdle(request);
    assert.equal(state.result.status, 'passed');
    assert.equal(state.progress.length, 13);
    const image = state.result.artifacts.find(
      (artifact) => artifact.kind === 'screenshot' && artifact.state === 'available',
    );
    assert.ok(image);
    const response = await fetch(`${origin}/api/pc/artifacts/${image.reference}`, { headers });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/png');
    assert.deepEqual(
      [...new Uint8Array(await response.arrayBuffer()).slice(0, 8)],
      [137, 80, 78, 71, 13, 10, 26, 10],
    );
    assert.equal(JSON.stringify(state).includes('riqvo-demo'), false);
    assert.equal((await request('artifacts/not_an_artifact')).status, 404);
    task.artifacts = [];
    task.case.steps = [
      task.case.steps[0],
      {
        id: 'pending',
        action: 'waitFor',
        locator: { strategy: 'testId', value: 'never-present' },
        state: 'visible',
        timeoutMs: 10000,
      },
    ];
    assert.equal((await request('run', task)).status, 202);
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if ((await (await request('state')).json()).data.progress.length) break;
      await delay(100);
    }
    assert.equal((await request('cancel', {})).status, 200);
    const cancelled = await waitIdle(request);
    assert.equal(cancelled.result.status, 'cancelled');
    assert.equal(cancelled.mode, 'idle');
  },
);

test('网页工作台导入、编辑、切换环境和回放，导出不包含变量值', { timeout: 45000 }, async (t) => {
  const { origin, request, headers } = await startWorkbench(t);
  const sitePort = await freePort();
  const site = runNode('apps/test-site/dist/main.js', [
    `--port=${sitePort}`,
    '--environment=preprod',
  ]);
  t.after(() => site.stop());
  await waitForHttp(`http://127.0.0.1:${sitePort}/health`, site);
  const browser = await chromium.launch({ executablePath: process.env.RIQVO_CHROMIUM_EXECUTABLE });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${origin}/pc`);
  await page.getByRole('heading', { name: 'PC 录制与回放' }).waitFor({ timeout: 3000 });
  const task = JSON.parse(await readFile('examples/d02/task.json', 'utf8'));
  task.artifacts = ['screenshot', 'video'];
  await page.getByLabel('导入用例 JSON').setInputFiles({
    name: 'case.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(task)),
  });
  await page.getByLabel('站点 portal 地址').fill(`http://127.0.0.1:${sitePort}/`);
  await page.getByTestId('step-email').click();
  await page.getByLabel('输入内容', { exact: true }).fill('edited@example.test');
  await page.getByLabel('变量 title').fill('工作台编辑后的记录');
  await page.getByRole('button', { name: '回放用例', exact: true }).click();
  await page.getByTestId('run-status').getByText('通过', { exact: true }).waitFor();
  const state = (await (await request('state')).json()).data;
  assert.equal(state.result.status, 'passed');
  assert.equal(
    state.draft.case.steps.find((step) => step.id === 'email').value.value,
    'edited@example.test',
  );
  assert.equal(state.draft.environment.sites.portal, `http://127.0.0.1:${sitePort}/`);
  await page.getByText('查看截图（13）').click();
  await page.getByTestId('result-media').locator('img').first().waitFor();
  await page.getByLabel('运行录像').evaluate(async (video) => {
    video.muted = true;
    await video.play();
  });
  await page.waitForFunction(() => document.querySelector('video')?.currentTime > 0);
  const video = state.result.artifacts.find(
    (value) => value.kind === 'video' && value.state === 'available',
  );
  const range = await fetch(`${origin}/api/pc/artifacts/${video.reference}`, {
    headers: { ...headers, range: 'bytes=0-63' },
  });
  assert.equal(range.status, 206);
  assert.equal((await range.arrayBuffer()).byteLength, 64);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出用例' }).click();
  const download = await downloadPromise;
  const saved = JSON.parse(await readFile(await download.path(), 'utf8'));
  assert.deepEqual(saved.variables, {});
  assert.equal(JSON.stringify(saved).includes('riqvo-demo'), false);
  assert.deepEqual(errors, []);
});
