import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { startWorkbench } from './pc-helpers.mjs';
import { freePort, runNode, waitForHttp } from './helpers.mjs';

/** 从真实 HTTP 流读取完整状态，关闭连接时同时释放读取任务。 */
async function openEvents(t, origin, headers) {
  const controller = new AbortController();
  t.after(() => controller.abort());
  const response = await fetch(`${origin}/api/pc/events`, { headers, signal: controller.signal });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^text\/event-stream/);
  const states = [];
  let failure;
  const reading = (async () => {
    const decoder = new TextDecoder();
    let buffer = '';
    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true });
      let end;
      while ((end = buffer.indexOf('\n\n')) >= 0) {
        const event = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (!event.startsWith('event: state\n')) continue;
        states.push(JSON.parse(event.slice('event: state\ndata: '.length)));
      }
    }
  })().catch((error) => {
    if (!controller.signal.aborted) failure = error;
  });
  async function close() {
    controller.abort();
    await reading;
  }
  t.after(close);
  return {
    states,
    close,
    async waitFor(predicate) {
      for (let count = 0; count < 200; count += 1) {
        if (failure) throw failure;
        const state = states.find(predicate);
        if (state) return state;
        await delay(50);
      }
      throw new Error('未收到预期 SSE 状态');
    },
  };
}

test('SSE 校验身份、推送真实回放进度，重连立即取得最新完整结果', { timeout: 25000 }, async (t) => {
  const { origin, headers, request } = await startWorkbench(t);
  assert.equal((await fetch(`${origin}/api/pc/events`)).status, 403);
  assert.equal(
    (
      await fetch(`${origin}/api/pc/events`, {
        headers: { ...headers, origin: 'https://untrusted.example' },
      })
    ).status,
    403,
  );
  const stream = await openEvents(t, origin, headers);
  await stream.waitFor((state) => state.mode === 'idle');
  await delay(1100);
  assert.equal(stream.states.length, 1, '空闲时不重复推送相同状态');
  const port = await freePort();
  const site = runNode('apps/test-site/dist/main.js', [`--port=${port}`, '--environment=test']);
  t.after(() => site.stop());
  await waitForHttp(`http://127.0.0.1:${port}/health`, site);
  const task = JSON.parse(await readFile('examples/d02/task.json', 'utf8'));
  task.environment.sites.portal = `http://127.0.0.1:${port}/`;
  assert.equal((await request('run', task)).status, 202);
  await stream.waitFor((state) => state.mode === 'running' && state.progress.length > 0);
  const completed = await stream.waitFor((state) => state.mode === 'idle' && state.result);
  assert.equal(completed.result.status, 'passed');
  assert.equal(completed.result.steps.length, 13);
  assert.equal(JSON.stringify(stream.states).includes('riqvo-demo'), false);
  await stream.close();
  const reconnected = await openEvents(t, origin, headers);
  assert.deepEqual(await reconnected.waitFor((state) => state.result), completed);
});

test(
  '工作台不再轮询状态，执行器重启后重新认证并保留正在编辑的草稿',
  { timeout: 30000 },
  async (t) => {
    const server = await startWorkbench(t);
    const browser = await chromium.launch({
      executablePath: process.env.RIQVO_CHROMIUM_EXECUTABLE,
    });
    t.after(() => browser.close());
    const page = await browser.newPage();
    const paths = [];
    page.on('request', (request) => paths.push(new URL(request.url()).pathname));
    await page.goto(`${server.origin}/pc`);
    await page.getByText('执行器已连接 · 空闲', { exact: true }).waitFor();
    await page.getByLabel('用例名称', { exact: true }).fill('保留我的草稿');
    await delay(1200);
    assert.equal(paths.filter((path) => path === '/api/pc/state').length, 0);
    assert.equal(paths.filter((path) => path === '/api/pc/events').length, 1);
    await server.processHandle.stop();
    await page.getByText('执行器连接中断，正在重新连接。', { exact: true }).waitFor();
    await startWorkbench(t, { port: Number(new URL(server.origin).port) });
    await page.getByText('执行器已连接 · 空闲', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('用例名称', { exact: true }).inputValue(), '保留我的草稿');
    assert.equal(
      await page.getByText('执行器连接中断，正在重新连接。', { exact: true }).count(),
      0,
    );
    assert.equal(paths.filter((path) => path === '/api/pc/state').length, 0);
    assert.ok(paths.filter((path) => path === '/api/pc/bootstrap').length >= 2);
  },
);
