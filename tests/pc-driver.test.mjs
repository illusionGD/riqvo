import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runPcTask, openPcBrowser, attachPcRecorder } from '@riqvo/driver-playwright';
import { parseRunResult } from '@riqvo/contracts';
import { freePort, runNode, waitForHttp } from './helpers.mjs';

/** 使用真实 HTTP 站点与临时产物目录，避免测试污染开发数据。 */
async function fixture(t) {
  const port = await freePort();
  const site = runNode('apps/test-site/dist/main.js', [`--port=${port}`, '--environment=test']);
  t.after(() => site.stop());
  const origin = `http://127.0.0.1:${port}`;
  await waitForHttp(`${origin}/health`, site);
  const artifactDir = await mkdtemp(join(tmpdir(), 'riqvo-pc-'));
  t.after(() => rm(artifactDir, { recursive: true, force: true }));
  const task = JSON.parse(await readFile('examples/d02/task.json', 'utf8'));
  task.environment.sites.portal = `${origin}/`;
  task.target = { platform: 'pc', browser: 'chromium', mode: 'background' };
  task.artifacts = [];
  return { task, artifactDir, origin };
}

test('公开 PC 驱动完成真实登录、表单与查询，断言决定通过结果', { timeout: 30000 }, async (t) => {
  const { task, artifactDir } = await fixture(t);
  const result = await runPcTask(task, {
    artifactDir,
    executablePath: process.env.RIQVO_CHROMIUM_EXECUTABLE,
  });
  assert.equal(parseRunResult(task, result).status, 'passed');
  assert.equal(result.steps.length, 13);
  assert.equal(result.steps.at(-1).status, 'passed');
});

test(
  '真实浏览器操作录为可修改步骤，密码仅保留变量引用，停止后可回放',
  { timeout: 30000 },
  async (t) => {
    const { task, artifactDir, origin } = await fixture(t);
    const options = { artifactDir, executablePath: process.env.RIQVO_CHROMIUM_EXECUTABLE };
    const session = await openPcBrowser('chromium', 'background', false, options);
    t.after(() => session.finish());
    const recording = await attachPcRecorder(session.context, task);
    const page = await session.context.newPage();
    await page.goto(origin);
    await page.getByTestId('username').fill('tester');
    await page.getByTestId('password').fill('riqvo-demo');
    await page.getByTestId('login-submit').click();
    await page.getByTestId('title').fill('录制的记录');
    await page.getByLabel('联系邮箱').fill('record@example.test');
    await page.getByLabel('优先级').selectOption('high');
    await page.getByLabel('我仅使用演示数据').check();
    await page.getByTestId('record-submit').click();
    await page.getByTestId('records').getByText('录制的记录', { exact: false }).waitFor();
    const recorded = await recording.stop();
    assert.equal(recorded.issue, undefined);
    assert.equal(JSON.stringify(recorded).includes('riqvo-demo'), false);
    const password = recorded.task.case.steps.find(
      (step) => step.action === 'fill' && step.value.source === 'variable',
    );
    assert.ok(password);
    const edited = structuredClone(recorded.task);
    edited.variables[password.value.name] = 'riqvo-demo';
    const title = edited.case.steps.find(
      (step) => step.action === 'fill' && step.value.value === '录制的记录',
    );
    title.value.value = '编辑后的记录';
    edited.case.steps.push({
      id: 'verify',
      action: 'assertText',
      locator: { strategy: 'testId', value: 'records' },
      expected: { source: 'literal', value: '编辑后的记录' },
      match: 'contains',
      timeoutMs: 5000,
    });
    edited.artifacts = [];
    const result = await runPcTask(edited, options);
    assert.equal(result.status, 'passed');
  },
);

test('断言失败、无断言、取消和能力拒绝不会误报通过', { timeout: 30000 }, async (t) => {
  const { task, artifactDir } = await fixture(t);
  const options = { artifactDir, executablePath: process.env.RIQVO_CHROMIUM_EXECUTABLE };
  const navigation = task.case.steps[0];
  task.case.steps = [navigation];
  assert.equal((await runPcTask(task, options)).status, 'unverified');
  task.case.steps.push({
    id: 'wrong',
    action: 'assertText',
    locator: { strategy: 'testId', value: 'login-submit' },
    expected: { source: 'literal', value: '错误文本' },
    match: 'equals',
    timeoutMs: 150,
  });
  const failed = await runPcTask(task, options);
  assert.equal(failed.status, 'failed');
  assert.equal(failed.steps.at(-1).error.code, 'ASSERTION_FAILED');
  const controller = new AbortController();
  const cancelled = await runPcTask(task, {
    ...options,
    signal: controller.signal,
    onStep(step) {
      if (step.stepId === navigation.id) controller.abort();
    },
  });
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.steps.at(-1).status, 'cancelled');
  task.artifacts = ['trace'];
  const unsupported = await runPcTask(task, { ...options, executablePath: '/does-not-exist' });
  assert.equal(unsupported.status, 'unsupported');
  assert.equal(unsupported.steps.length, 0);
});

test('无法表示的录制定位保留最后有效草稿并明确报错', { timeout: 15000 }, async (t) => {
  const { task, artifactDir, origin } = await fixture(t);
  const session = await openPcBrowser('chromium', 'background', false, {
    artifactDir,
    executablePath: process.env.RIQVO_CHROMIUM_EXECUTABLE,
  });
  t.after(() => session.finish());
  const recording = await attachPcRecorder(session.context, task);
  const page = await session.context.newPage();
  await page.goto(origin);
  await page.evaluate(() => {
    const button = document.createElement('button');
    button.dataset.testid = 'x'.repeat(501);
    button.textContent = '超长标识';
    document.body.append(button);
  });
  await page.getByText('超长标识').click();
  const recorded = await recording.stop();
  assert.equal(recorded.issue, 'UNSUPPORTED_INTERACTION');
  assert.equal(recorded.task.case.steps.length, 1);
});

test('回车提交属于未支持交互，不能静默生成缺少提交动作的用例', { timeout: 15000 }, async (t) => {
  const { task, artifactDir, origin } = await fixture(t);
  const session = await openPcBrowser('chromium', 'background', false, {
    artifactDir,
    executablePath: process.env.RIQVO_CHROMIUM_EXECUTABLE,
  });
  t.after(() => session.finish());
  const recording = await attachPcRecorder(session.context, task);
  const page = await session.context.newPage();
  await page.goto(origin);
  await page.getByTestId('username').fill('tester');
  await page.getByTestId('password').fill('riqvo-demo');
  await page.getByTestId('password').press('Enter');
  const recorded = await recording.stop();
  assert.equal(recorded.issue, 'KEYBOARD_ACTION');
  assert.equal(JSON.stringify(recorded).includes('riqvo-demo'), false);
});

test('文件选择、iframe 内交互和弹窗明确中止采集', { timeout: 20000 }, async (t) => {
  const { task, artifactDir, origin } = await fixture(t);
  for (const kind of ['file', 'iframe', 'popup']) {
    const session = await openPcBrowser('chromium', 'background', false, {
      artifactDir,
      executablePath: process.env.RIQVO_CHROMIUM_EXECUTABLE,
    });
    t.after(() => session.finish());
    const recording = await attachPcRecorder(session.context, task);
    const page = await session.context.newPage();
    await page.goto(origin);
    await page.evaluate((kind) => {
      if (kind === 'file') {
        const file = document.createElement('input');
        file.type = 'file';
        file.dataset.testid = 'test-upload';
        document.body.append(file);
      } else if (kind === 'iframe') {
        const frame = document.createElement('iframe');
        frame.srcdoc = '<button>内部按钮</button>';
        document.body.append(frame);
      } else {
        const link = document.createElement('a');
        link.href = '/login';
        link.target = '_blank';
        link.textContent = '打开测试弹窗';
        document.body.append(link);
      }
    }, kind);
    if (kind === 'file') await page.getByTestId('test-upload').click();
    else if (kind === 'iframe')
      await page.frameLocator('iframe').last().getByText('内部按钮').click();
    else {
      const popup = page.waitForEvent('popup');
      await page.getByText('打开测试弹窗').click();
      await popup;
    }
    const recorded = await recording.stop();
    assert.equal(recorded.issue, kind === 'file' ? 'FILE_INPUT' : 'IFRAME_OR_POPUP');
    await session.finish(page);
  }
});
