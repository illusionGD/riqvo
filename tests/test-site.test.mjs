import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { prepareTask } from '@riqvo/contracts';
import { freePort, runNode, waitForHttp } from './helpers.mjs';

async function startSite(t, environment) {
  const port = await freePort();
  const site = runNode('apps/test-site/dist/main.js', [
    `--port=${port}`,
    `--environment=${environment}`,
  ]);
  t.after(() => site.stop());
  const origin = `http://127.0.0.1:${port}`;
  await waitForHttp(`${origin}/health`, site);
  return origin;
}

async function post(origin, path, data, cookie = '') {
  return fetch(`${origin}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie, origin },
    body: JSON.stringify(data),
  });
}

test(
  '测试站真实 HTTP 支持登录及会话隔离，每个环境独立保存演示记录',
  { timeout: 20000 },
  async (t) => {
    const first = await startSite(t, 'test');
    const second = await startSite(t, 'preprod');
    assert.equal((await (await fetch(`${first}/health`)).json()).environment, 'test');
    assert.equal((await fetch(`${first}/api/records`)).status, 401);
    assert.equal(
      (await post(first, '/api/login', { username: 'tester', password: 'wrong' })).status,
      401,
    );
    const login = await post(first, '/api/login', { username: 'tester', password: 'riqvo-demo' });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const record = {
      title: '环境隔离记录',
      email: 'demo@example.test',
      priority: 'high',
      agreed: true,
    };
    assert.equal((await post(first, '/api/records', record, cookie)).status, 201);
    const records = await (
      await fetch(`${first}/api/records?q=${encodeURIComponent('环境隔离')}`, {
        headers: { cookie },
      })
    ).json();
    assert.equal(records.records.length, 1);
    assert.equal(records.records[0].title, record.title);
    assert.equal((await fetch(`${second}/api/records`, { headers: { cookie } })).status, 401);
    const otherLogin = await post(first, '/api/login', {
      username: 'tester',
      password: 'riqvo-demo',
    });
    const otherCookie = otherLogin.headers.get('set-cookie').split(';')[0];
    const other = await (
      await fetch(`${first}/api/records`, { headers: { cookie: otherCookie } })
    ).json();
    assert.equal(other.records.length, 0);
    assert.equal((await post(first, '/api/records', { ...record, title: '' }, cookie)).status, 400);
    assert.equal((await post(first, '/api/reset', {}, cookie)).status, 200);
    assert.equal(
      (await (await fetch(`${first}/api/records`, { headers: { cookie } })).json()).records.length,
      0,
    );
    assert.equal((await post(first, '/api/logout', {}, cookie)).status, 200);
    assert.equal((await fetch(`${first}/api/records`, { headers: { cookie } })).status, 401);
  },
);

test(
  '同一份 JSON 样例在两个真实站点完成登录、表单和查询，移动布局可操作',
  { timeout: 30000 },
  async (t) => {
    const input = JSON.parse(await readFile('examples/d02/task.json', 'utf8'));
    const capabilities = JSON.parse(await readFile('examples/d02/capabilities.json', 'utf8'));
    const original = structuredClone(input);
    const browser = await chromium.launch({
      executablePath: process.env.RIQVO_CHROMIUM_EXECUTABLE,
    });
    t.after(() => browser.close());
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    for (const [index, environment] of ['test', 'preprod'].entries()) {
      const origin = await startSite(t, environment);
      await page.setViewportSize(
        index === 0 ? { width: 1280, height: 900 } : { width: 390, height: 844 },
      );
      const prepared = prepareTask(
        {
          ...input,
          environment: { ...input.environment, id: environment, sites: { portal: `${origin}/` } },
        },
        capabilities,
      );
      assert.equal(prepared.status, 'ready');
      // 仅用于验收公开的固定样例，正式浏览器驱动在 D03 实现。
      for (const step of prepared.steps) {
        if (step.action === 'navigate') {
          await page.goto(step.url);
          continue;
        }
        const target =
          step.locator.strategy === 'label'
            ? page.getByLabel(step.locator.value, { exact: true })
            : step.locator.strategy === 'role'
              ? page.getByRole(step.locator.role, { name: step.locator.name, exact: true })
              : page.getByTestId(step.locator.value);
        switch (step.action) {
          case 'fill':
            await target.fill(step.value);
            break;
          case 'select':
            await target.selectOption(step.value);
            break;
          case 'check':
            await target.setChecked(step.checked);
            break;
          case 'click':
            await target.click();
            break;
          case 'assertText':
            await target.filter({ hasText: step.expected }).waitFor();
            if (step.match === 'equals')
              assert.equal((await target.textContent()).trim(), step.expected);
            else assert.ok((await target.textContent()).includes(step.expected));
            break;
          default:
            assert.fail(`固定样例包含未支持的动作：${step.action}`);
        }
      }
      assert.equal(
        await page.getByTestId('environment').textContent(),
        index === 0 ? '测试环境' : '预发布环境',
      );
      assert.equal(await page.getByTestId('record-item').count(), 1);
      if (index === 1) {
        await page.getByRole('button', { name: '展开菜单' }).click();
        await page.getByRole('link', { name: '交互样例' }).click();
        await page.getByRole('heading', { name: '交互样例' }).waitFor();
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
          true,
        );
      }
    }
    assert.deepEqual(input, original);
    assert.deepEqual(errors, []);
  },
);

test(
  '演示页面显示登录和查询失败，并提供文件、iframe、新标签页交互',
  { timeout: 20000 },
  async (t) => {
    const origin = await startSite(t, 'test');
    const browser = await chromium.launch({
      executablePath: process.env.RIQVO_CHROMIUM_EXECUTABLE,
    });
    t.after(() => browser.close());
    const page = await browser.newPage();
    page.setDefaultTimeout(5000);
    await page.goto(`${origin}/login`);
    await page.getByLabel('演示账号', { exact: true }).fill('tester');
    await page.getByLabel('演示密码', { exact: true }).fill('wrong');
    await page.getByRole('button', { name: '登录工作台' }).click();
    await page.getByRole('alert').filter({ hasText: '演示账号或密码错误' }).waitFor();
    await page.getByLabel('演示密码', { exact: true }).fill('riqvo-demo');
    await page.getByRole('button', { name: '登录工作台' }).click();
    await page.getByRole('heading', { name: '创建演示记录' }).waitFor();
    await page.getByLabel('查询关键词').fill('不存在');
    await page.getByRole('button', { name: '查询记录' }).click();
    await page.getByText('没有匹配的记录', { exact: true }).waitFor();
    await page
      .getByLabel('选择演示文件')
      .setInputFiles({ name: 'demo.txt', mimeType: 'text/plain', buffer: Buffer.from('demo') });
    await page.getByText('demo.txt · 4 字节（仅本地预览）', { exact: true }).waitFor();
    const frame = page.frameLocator('iframe[title="备注交互样例"]');
    await frame.getByLabel('备注').fill('iframe 验证');
    await frame.getByRole('button', { name: '确认备注' }).click();
    await frame.getByRole('status').filter({ hasText: '已确认：iframe 验证' }).waitFor();
    const popupPromise = page.waitForEvent('popup');
    await page.getByRole('link', { name: '在新标签页查看说明' }).click();
    const popup = await popupPromise;
    await popup.getByRole('heading', { name: '交互样例说明' }).waitFor();
    assert.equal(new URL(popup.url()).origin, origin);
    await page.getByRole('button', { name: '退出登录' }).click();
    await page.getByRole('button', { name: '登录工作台' }).waitFor();
  },
);
