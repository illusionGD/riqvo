import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** 在普通文件下构造路径，确保所有系统都无法在该位置创建目录。 */
export async function blockedArtifactPath(t) {
  const directory = await mkdtemp(join(tmpdir(), 'riqvo-blocked-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, 'file');
  await writeFile(file, 'not a directory');
  return join(file, 'artifacts');
}

/** 为测试进程查找未使用的回环端口。 */
export async function freePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

/** 启动真实编译入口，仅提供进程输出和生命周期控制。 */
export function runNode(entrypoint, args = [], env = {}, options = {}) {
  const child = spawn(process.execPath, [entrypoint, ...args], {
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
  let output = '';
  child.stdout.on('data', (data) => {
    output += data.toString();
  });
  child.stderr.on('data', (data) => {
    output += data.toString();
  });
  const done = once(child, 'exit').then(([code, signal]) => ({ code, signal, output }));
  return {
    child,
    done,
    output: () => output,
    async stop() {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
      await done;
    },
  };
}

/** 等待真实 HTTP 响应；进程退出时立即报告失败。 */
export async function waitForHttp(url, processHandle) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (processHandle.child.exitCode !== null) throw new Error(processHandle.output());
    try {
      return await fetch(url, { signal: AbortSignal.timeout(500) });
    } catch {
      await delay(100);
    }
  }
  throw new Error(`Service did not respond: ${processHandle.output()}`);
}
