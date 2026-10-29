import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { attachPcRecorder, openPcBrowser, runPcTask } from '@riqvo/driver-playwright';
import { freePort, runNode, waitForHttp } from '../helpers.mjs';

const execute = promisify(execFile);

/** 用真实解码验证视频，不以文件存在代替可播放。 */
async function verifyVideo(artifacts, root) {
  const video = artifacts.find((value) => value.kind === 'video' && value.state === 'available');
  assert.ok(video, '会话必须生成录像');
  const path = join(root, `${video.reference}.webm`);
  const { stdout } = await execute('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration:stream=codec_name,width,height',
    '-of',
    'json',
    path,
  ]);
  const metadata = JSON.parse(stdout);
  assert.ok(Number(metadata.format.duration) > 0);
  assert.ok(metadata.streams[0].width > 0);
  await execute('ffmpeg', ['-v', 'error', '-i', path, '-f', 'null', '-']);
}

for (const [browser, variable] of [
  ['chrome', 'RIQVO_CHROME_EXECUTABLE'],
  ['edge', 'RIQVO_EDGE_EXECUTABLE'],
]) {
  test(
    `${browser} 可视录制、编辑、两环境复用和后台/可视回放的视频可解码`,
    { timeout: 60000 },
    async (t) => {
      assert.ok(process.env[variable], `必须提供真实浏览器路径 ${variable}，不能用 Chromium 替代`);
      const artifactDir = await mkdtemp(join(tmpdir(), `riqvo-${browser}-`));
      t.after(() => rm(artifactDir, { recursive: true, force: true }));
      const origins = [];
      for (const environment of ['test', 'preprod']) {
        const port = await freePort();
        const site = runNode('apps/test-site/dist/main.js', [
          `--port=${port}`,
          `--environment=${environment}`,
        ]);
        t.after(() => site.stop());
        await waitForHttp(`http://127.0.0.1:${port}/health`, site);
        origins.push(`http://127.0.0.1:${port}/`);
      }
      const task = JSON.parse(await readFile('examples/d02/task.json', 'utf8'));
      task.environment.sites.portal = origins[0];
      task.target = { platform: 'pc', browser, mode: 'visible' };
      task.artifacts = ['video', 'screenshot'];
      const options = { artifactDir, executablePath: process.env[variable] };
      const session = await openPcBrowser(browser, 'visible', true, options);
      t.after(() => session.finish());
      t.diagnostic(`${browser}: ${session.browser.version()}`);
      const recording = await attachPcRecorder(session.context, task);
      const page = await session.context.newPage();
      await page.goto(`${origins[0]}login`);
      await page.getByLabel('演示账号').fill('tester');
      await page.getByLabel('演示密码').fill('riqvo-demo');
      await page.getByRole('button', { name: '登录工作台' }).click();
      await page.getByLabel('记录标题').fill('录制初稿');
      await page.getByLabel('联系邮箱').fill('record@example.test');
      await page.getByLabel('优先级').selectOption('high');
      await page.getByLabel('我仅使用演示数据').check();
      await page.getByRole('button', { name: '创建记录' }).click();
      await page.getByTestId('feedback').getByText('记录已创建').waitFor();
      const draft = await recording.stop();
      assert.equal(draft.issue, undefined);
      assert.equal(JSON.stringify(draft).includes('riqvo-demo'), false);
      await verifyVideo(await session.finish(page), artifactDir);
      const edited = draft.task;
      const secret = edited.case.steps.find(
        (step) => step.action === 'fill' && step.value.source === 'variable',
      );
      edited.variables[secret.value.name] = 'riqvo-demo';
      const title = edited.case.steps.find(
        (step) => step.action === 'fill' && step.value.value === '录制初稿',
      );
      title.value = { source: 'literal', value: '修改后跨环境' };
      edited.case.steps.push({
        id: 'verify',
        action: 'assertText',
        locator: { strategy: 'testId', value: 'records' },
        expected: { source: 'literal', value: '修改后跨环境' },
        match: 'contains',
        timeoutMs: 5000,
      });
      for (const [index, origin] of origins.entries()) {
        edited.environment.sites.portal = origin;
        edited.target.mode = index === 0 ? 'background' : 'visible';
        const result = await runPcTask(edited, options);
        assert.equal(result.status, 'passed', JSON.stringify(result));
        assert.ok(
          result.artifacts.some(
            (value) => value.kind === 'screenshot' && value.state === 'available',
          ),
        );
        await verifyVideo(result.artifacts, artifactDir);
      }
    },
  );
}

test('可视工作台通过网页启动和停止本机录制，并播放会话录像', { timeout: 30000 }, async (t) => {
  const { startWorkbench } = await import('../pc-helpers.mjs');
  const { origin, request } = await startWorkbench(t);
  const port = await freePort();
  const site = runNode('apps/test-site/dist/main.js', [`--port=${port}`, '--environment=test']);
  t.after(() => site.stop());
  await waitForHttp(`http://127.0.0.1:${port}/health`, site);
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ executablePath: process.env.RIQVO_CHROMIUM_EXECUTABLE });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.goto(`${origin}/pc`);
  await page.getByLabel('站点 app 地址', { exact: true }).fill(`http://127.0.0.1:${port}/`);
  await page.getByRole('button', { name: '开始新录制' }).click();
  await page.getByRole('button', { name: '停止录制' }).waitFor();
  await page.getByRole('button', { name: '停止录制' }).click();
  await page.getByLabel('运行录像').evaluate(async (video) => {
    video.muted = true;
    await video.play();
  });
  await page.waitForFunction(() => document.querySelector('video')?.currentTime > 0);
  const state = (await (await request('state')).json()).data;
  assert.equal(state.mode, 'idle');
  assert.equal(state.draft.case.steps[0].action, 'navigate');
  assert.equal(state.issue, undefined);
});
