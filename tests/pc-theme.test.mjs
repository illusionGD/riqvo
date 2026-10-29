import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';
import { startWorkbench } from './pc-helpers.mjs';

test('后台导航可切换工作区，主题选择持久化并响应系统配色', { timeout: 20000 }, async (t) => {
  const { origin } = await startWorkbench(t);
  const browser = await chromium.launch({ executablePath: process.env.RIQVO_CHROMIUM_EXECUTABLE });
  t.after(() => browser.close());
  const page = await browser.newPage({ colorScheme: 'light' });
  await page.goto(`${origin}/pc`);
  await page.getByRole('navigation', { name: '平台导航' }).waitFor({ timeout: 3000 });
  await page.getByRole('button', { name: '深色主题', exact: true }).click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  const darkBackground = await page
    .locator('body')
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  await page.reload();
  await page.getByRole('button', { name: '深色主题', exact: true }).waitFor();
  assert.equal(
    await page.getByRole('button', { name: '深色主题', exact: true }).getAttribute('aria-pressed'),
    'true',
  );
  assert.equal(
    await page.locator('body').evaluate((element) => getComputedStyle(element).backgroundColor),
    darkBackground,
  );
  await page.getByRole('button', { name: '浅色主题', exact: true }).click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  assert.notEqual(
    await page.locator('body').evaluate((element) => getComputedStyle(element).backgroundColor),
    darkBackground,
  );
  await page.getByRole('button', { name: '跟随系统主题', exact: true }).click();
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  await page.getByRole('button', { name: '运行结果', exact: true }).click();
  await page.getByRole('heading', { name: '运行结果', exact: true }).waitFor();
  await page.getByRole('button', { name: '使用说明', exact: true }).click();
  await page.getByRole('heading', { name: '使用说明', exact: true }).waitFor();
  await page.getByRole('button', { name: '测试工作台', exact: true }).click();
  await page.getByRole('heading', { name: 'PC 录制与回放' }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    false,
  );
});
