import { randomUUID } from 'node:crypto';
import { mkdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import type { Browser, BrowserContext, Page } from 'playwright';
import type { ArtifactReference, DriverCapabilities } from '@riqvo/contracts';

/** 当前 PC 原型可选择的 Chromium 系浏览器。 */
export type PcBrowser = 'chromium' | 'chrome' | 'edge';
/** 启动参数由本机执行程序配置，不接受被测页面或任务指定可执行文件。 */
export interface PcBrowserOptions {
  artifactDir: string;
  executablePath?: string;
}
/** 浏览器会话由调用方独占；采集器可接入其公开 context。 */
export interface PcBrowserSession {
  browser: Browser;
  context: BrowserContext;
  finish: (page?: Page) => Promise<ArtifactReference[]>;
}

/** 返回当前原型明确支持的能力，复杂交互不隐式降级。 */
export function getPcCapabilities(browser: PcBrowser): DriverCapabilities {
  return {
    protocolVersion: 1,
    driver: 'playwright',
    platform: 'pc',
    browser,
    actions: [
      'navigate',
      'fill',
      'select',
      'check',
      'click',
      'waitFor',
      'assertText',
      'assertVisible',
      'assertUrl',
      'screenshot',
    ],
    locators: ['testId', 'role', 'label', 'css'],
    modes: ['background', 'visible'],
    artifacts: ['screenshot', 'video'],
  };
}

/** 生成不含路径与业务数据的产物标识。 */
export function artifactId(): string {
  return `a_${randomUUID().replaceAll('-', '')}`;
}

/**
 * 创建隔离浏览器上下文，不复用用户日常浏览器的账号和 Cookie。
 * @param browserName 实际选择的浏览器。
 * @param mode 录制为可视，回放可后台运行。
 * @param video 是否录制当前上下文。
 * @param options 执行器本地配置。
 * @returns 公开会话及负责关闭、完成视频的清理函数。
 */
export async function openPcBrowser(
  browserName: PcBrowser,
  mode: 'visible' | 'background',
  video: boolean,
  options: PcBrowserOptions,
): Promise<PcBrowserSession> {
  await mkdir(options.artifactDir, { recursive: true, mode: 0o700 });
  const videoDirectory = join(options.artifactDir, `.capture_${artifactId()}`);
  const browser = await chromium.launch({
    headless: mode === 'background',
    executablePath: options.executablePath,
    channel:
      options.executablePath || browserName === 'chromium'
        ? undefined
        : browserName === 'edge'
          ? 'msedge'
          : 'chrome',
  });
  let context: BrowserContext;
  try {
    context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      acceptDownloads: false,
      recordVideo: video ? { dir: videoDirectory, size: { width: 1280, height: 800 } } : undefined,
    });
  } catch (error) {
    await browser.close();
    throw error;
  }
  let finished: Promise<ArtifactReference[]> | undefined;
  return {
    browser,
    context,
    finish(page) {
      finished ??= (async () => {
        const captured = page?.video();
        await context.close().catch(() => undefined);
        await browser.close().catch(() => undefined);
        if (!video) return [];
        const id = artifactId();
        try {
          if (!captured) throw new Error('VIDEO_MISSING');
          await rename(await captured.path(), join(options.artifactDir, `${id}.webm`));
          return [{ id, kind: 'video', state: 'available', reference: id }];
        } catch {
          return [{ id, kind: 'video', state: 'missing', reason: 'CAPTURE_FAILED' }];
        } finally {
          await rm(videoDirectory, { recursive: true, force: true }).catch(() => undefined);
        }
      })();
      return finished;
    },
  };
}

/** 将截图保存为受控引用；采集失败独立于业务断言结果。 */
export async function captureScreenshot(
  page: Page,
  artifactDir: string,
  stepId?: string,
): Promise<ArtifactReference> {
  const id = artifactId();
  try {
    await page.screenshot({ path: join(artifactDir, `${id}.png`), timeout: 5000 });
    return { id, kind: 'screenshot', stepId, state: 'available', reference: id };
  } catch {
    return { id, kind: 'screenshot', stepId, state: 'missing', reason: 'CAPTURE_FAILED' };
  }
}
