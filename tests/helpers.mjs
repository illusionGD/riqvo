import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Provide a path below a regular file; directory creation must fail on every OS. */
export async function blockedArtifactPath(t) {
  const directory = await mkdtemp(join(tmpdir(), 'riqvo-blocked-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, 'file');
  await writeFile(file, 'not a directory');
  return join(file, 'artifacts');
}

/** Reserve an unused loopback port for a test process. */
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

/** Start a real compiled entrypoint; expose only process output and lifetime. */
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

/** Wait for an actual HTTP response, failing early when the process exits. */
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
