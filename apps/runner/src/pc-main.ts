import { randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, resolve } from 'node:path';
import { z } from 'zod';
import { createPcWorkbench, WorkbenchError } from './pc-workbench';
import { streamPcEvents } from './pc-events';

const configSchema = z.object({
  RIQVO_PC_PORT: z.coerce.number().int().min(1).max(65535).default(4318),
  RIQVO_PC_ARTIFACT_DIR: z
    .string()
    .min(1)
    .default(resolve(__dirname, '../../../.local/pc-artifacts')),
  RIQVO_CHROMIUM_EXECUTABLE: z.string().min(1).optional(),
  RIQVO_CHROME_EXECUTABLE: z.string().min(1).optional(),
  RIQVO_EDGE_EXECUTABLE: z.string().min(1).optional(),
});

/** 有界读取 JSON，不将原始载荷或解析错误回显给客户端。 */
async function body(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += Buffer.byteLength(chunk);
    if (size > 1024 * 1024) throw new WorkbenchError('INVALID_TASK');
    chunks.push(Buffer.from(chunk));
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new WorkbenchError('INVALID_TASK');
  }
}

/** 返回不缓存的结构化响应。 */
function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(value));
}

/** 支持媒体范围请求，下载路径仅来自服务器登记的引用。 */
async function media(
  request: IncomingMessage,
  response: ServerResponse,
  path: string,
  kind: 'video' | 'screenshot',
): Promise<void> {
  const file = await stat(path);
  const range = request.headers.range;
  let start = 0;
  let end = file.size - 1;
  if (range) {
    const parsed = /^bytes=(\d+)-(\d*)$/.exec(range);
    if (!parsed) {
      response.writeHead(416, { 'content-range': `bytes */${file.size}` });
      response.end();
      return;
    }
    start = Number(parsed[1]);
    end = parsed[2] ? Math.min(Number(parsed[2]), end) : end;
    if (start > end || !Number.isSafeInteger(start)) {
      response.writeHead(416, { 'content-range': `bytes */${file.size}` });
      response.end();
      return;
    }
  }
  response.writeHead(range ? 206 : 200, {
    'content-type': kind === 'video' ? 'video/webm' : 'image/png',
    'content-length': end - start + 1,
    'accept-ranges': 'bytes',
    'cache-control': 'no-store',
    ...(range ? { 'content-range': `bytes ${start}-${end}/${file.size}` } : {}),
  });
  const stream = createReadStream(path, { start, end });
  stream.on('error', () => response.destroy());
  response.on('close', () => stream.destroy());
  stream.pipe(response);
}

/** 启动仅本机可访问的 PC 原型，不充当远程设备管理 API。 */
async function main(): Promise<void> {
  const parsed = configSchema.safeParse(process.env);
  if (!parsed.success) throw new Error('INVALID_PC_CONFIG');
  const config = parsed.data;
  const token = randomBytes(32).toString('hex');
  const cookieName = `riqvo_pc_${config.RIQVO_PC_PORT}`;
  const workbench = createPcWorkbench({
    artifactDir: resolve(config.RIQVO_PC_ARTIFACT_DIR),
    browserPaths: {
      chromium: config.RIQVO_CHROMIUM_EXECUTABLE,
      chrome: config.RIQVO_CHROME_EXECUTABLE,
      edge: config.RIQVO_EDGE_EXECUTABLE,
    },
  });
  const webDir = resolve(__dirname, '../../web/dist');
  const server = createServer((request, response) => {
    response.setHeader('x-content-type-options', 'nosniff');
    response.setHeader('referrer-policy', 'no-referrer');
    response.setHeader(
      'content-security-policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'",
    );
    void (async () => {
      const host = request.headers.host;
      const origin = `http://${host}`;
      if (
        ![`127.0.0.1:${config.RIQVO_PC_PORT}`, `localhost:${config.RIQVO_PC_PORT}`].includes(
          host ?? '',
        ) ||
        (request.headers.origin && request.headers.origin !== origin) ||
        request.headers['sec-fetch-site'] === 'cross-site'
      ) {
        json(response, 403, { error: 'FORBIDDEN' });
        return;
      }
      const url = new URL(request.url ?? '/', origin);
      if (url.origin !== origin) {
        json(response, 403, { error: 'FORBIDDEN' });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/pc/bootstrap') {
        response.setHeader(
          'set-cookie',
          `${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/api/pc`,
        );
        json(response, 200, { token });
        return;
      }
      if (url.pathname.startsWith('/api/pc/')) {
        const headerAuth = request.headers['x-riqvo-token'] === token;
        const cookieAuth = request.headers.cookie
          ?.split(';')
          .some((part) => part.trim() === `${cookieName}=${token}`);
        if (!headerAuth && !(request.method === 'GET' && cookieAuth)) {
          json(response, 403, { error: 'FORBIDDEN' });
          return;
        }
        if (request.method === 'GET' && url.pathname === '/api/pc/events') {
          streamPcEvents(response, workbench.subscribe);
          return;
        }
        if (request.method === 'GET' && url.pathname === '/api/pc/state') {
          json(response, 200, workbench.snapshot());
          return;
        }
        if (request.method === 'GET' && url.pathname.startsWith('/api/pc/artifacts/')) {
          const id = url.pathname.slice('/api/pc/artifacts/'.length);
          const kind = workbench.artifacts.get(id);
          if (!kind || !/^a_[a-f0-9]{32}$/.test(id)) {
            json(response, 404, { error: 'NOT_FOUND' });
            return;
          }
          await media(
            request,
            response,
            join(
              resolve(config.RIQVO_PC_ARTIFACT_DIR),
              `${id}.${kind === 'video' ? 'webm' : 'png'}`,
            ),
            kind,
          );
          return;
        }
        if (request.method === 'POST') {
          if (request.headers['content-type']?.split(';')[0] !== 'application/json') {
            json(response, 415, { error: 'JSON_REQUIRED' });
            return;
          }
          if (url.pathname === '/api/pc/record') {
            workbench.record(await body(request));
            json(response, 202, { accepted: true });
            return;
          }
          if (url.pathname === '/api/pc/run') {
            workbench.run(await body(request));
            json(response, 202, { accepted: true });
            return;
          }
          if (url.pathname === '/api/pc/stop') {
            await workbench.stopRecording();
            json(response, 200, workbench.snapshot());
            return;
          }
          if (url.pathname === '/api/pc/cancel') {
            await workbench.cancel();
            json(response, 200, workbench.snapshot());
            return;
          }
        }
        json(response, 404, { error: 'NOT_FOUND' });
        return;
      }
      if (request.method !== 'GET') {
        json(response, 405, { error: 'METHOD_NOT_ALLOWED' });
        return;
      }
      if (url.pathname === '/') {
        response.writeHead(302, { location: '/pc' });
        response.end();
        return;
      }
      let file: string;
      if (url.pathname === '/pc') file = 'index.html';
      else if (/^\/assets\/[A-Za-z0-9_.-]+\.(?:js|css|svg)$/.test(url.pathname))
        file = url.pathname.slice(1);
      else {
        json(response, 404, { error: 'NOT_FOUND' });
        return;
      }
      const content = await readFile(join(webDir, file));
      const mime: Record<string, string> = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.svg': 'image/svg+xml',
      };
      response.writeHead(200, {
        'content-type': mime[extname(file)]!,
        'cache-control': 'no-cache',
      });
      response.end(content);
    })().catch((error: unknown) => {
      if (response.headersSent || response.destroyed) {
        response.destroy();
        return;
      }
      if (error instanceof WorkbenchError)
        json(response, error.code === 'BUSY' || error.code === 'NOT_RECORDING' ? 409 : 400, {
          error: error.code,
        });
      else json(response, 500, { error: 'LOCAL_SERVICE_ERROR' });
    });
  });
  server.requestTimeout = 30000;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.RIQVO_PC_PORT, '127.0.0.1', resolve);
  });
  console.log(
    JSON.stringify({
      service: 'riqvo-pc-workbench',
      url: `http://127.0.0.1:${config.RIQVO_PC_PORT}/pc`,
    }),
  );
  let stopping = false;
  const stop = (): void => {
    if (stopping) return;
    stopping = true;
    void workbench.cancel().finally(() => {
      server.close();
      server.closeAllConnections();
    });
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

main().catch(() => {
  console.error('PC 工作台启动失败，请检查端口与本机配置。');
  process.exitCode = 1;
});
