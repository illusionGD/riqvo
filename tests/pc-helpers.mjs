import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { freePort, runNode, waitForHttp } from './helpers.mjs';

/** 通过公开 HTTP 启动真实本机执行器，不依赖平台数据库。 */
export async function startWorkbench(t, options = {}) {
  const port = options.port ?? (await freePort());
  const artifactDir = await mkdtemp(join(tmpdir(), 'riqvo-workbench-'));
  t.after(() => rm(artifactDir, { recursive: true, force: true }));
  const processHandle = runNode('apps/runner/dist/pc-main.js', [], {
    RIQVO_PC_PORT: String(port),
    RIQVO_PC_ARTIFACT_DIR: artifactDir,
  });
  t.after(() => processHandle.stop());
  const origin = `http://127.0.0.1:${port}`;
  await waitForHttp(`${origin}/api/pc/bootstrap`, processHandle);
  const bootstrap = await (await fetch(`${origin}/api/pc/bootstrap`)).json();
  const headers = { origin, 'content-type': 'application/json', 'x-riqvo-token': bootstrap.token };
  const request = async (path, value) =>
    fetch(
      `${origin}/api/pc/${path}`,
      value === undefined ? { headers } : { method: 'POST', headers, body: JSON.stringify(value) },
    );
  return { origin, request, headers, processHandle };
}

/** 只从公共状态观察结束，等待上限有限。 */
export async function waitIdle(request) {
  for (let count = 0; count < 150; count += 1) {
    const state = await (await request('state')).json();
    if (state.mode === 'idle') return state;
    await delay(100);
  }
  throw new Error('工作台未按时结束');
}
