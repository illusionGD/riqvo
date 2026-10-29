import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { z } from 'zod';

const RECORD_SCHEMA = z.strictObject({
  title: z.string().trim().min(1).max(80),
  email: z.email().max(200),
  priority: z.enum(['normal', 'high']),
  agreed: z.literal(true),
});
const LOGIN_SCHEMA = z.strictObject({
  username: z.literal('tester'),
  password: z.literal('riqvo-demo'),
});
type DemoRecord = z.infer<typeof RECORD_SCHEMA> & { id: string };
interface Session {
  records: DemoRecord[];
  expiresAt: number;
}

/**
 * 返回 JSON 并禁止缓存会话或演示数据。
 * @param response HTTP 响应。
 * @param status 状态码。
 * @param body 可序列化结果。
 */
function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(body));
}

/**
 * 限制请求体长度并校验 JSON，错误不回显输入。
 * @param request 当前请求。
 * @returns 未经业务校验的 JSON。
 */
async function readJson(request: IncomingMessage): Promise<unknown> {
  if (request.headers['content-type']?.split(';')[0] !== 'application/json')
    throw new Error('INVALID_BODY');
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    length += buffer.length;
    if (length > 16384) throw new Error('INVALID_BODY');
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

/**
 * 创建独立演示站；内存数据仅供自动化验收，不连接平台 MySQL。
 * @param environment 页面和健康接口使用的环境标识。
 * @param port 监听端口，同时隔离同一主机不同实例的 Cookie 名称。
 * @returns 尚未监听的 HTTP 服务。
 */
export function createTestSite(environment: string, port: number): Server {
  const sessions = new Map<string, Session>();
  const cookieName = `riqvo_demo_${environment}_${port}`;
  return createServer(async (request, response) => {
    response.setHeader('x-content-type-options', 'nosniff');
    const host = request.headers.host;
    if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`)
      return json(response, 400, { error: '无效的站点地址' });
    const origin = `http://${host}`;
    let url: URL;
    try {
      url = new URL(request.url ?? '/', origin);
      if (url.origin !== origin) return json(response, 400, { error: '无效的请求地址' });
    } catch {
      return json(response, 400, { error: '无效的请求地址' });
    }
    const assets: Record<string, [string, string]> = {
      '/': ['../public/index.html', 'text/html'],
      '/login': ['../public/index.html', 'text/html'],
      '/records': ['../public/index.html', 'text/html'],
      '/assets/site.css': ['../public/site.css', 'text/css'],
      '/assets/client.js': ['browser/client.js', 'text/javascript'],
      '/frame': ['../public/frame.html', 'text/html'],
      '/help': ['../public/help.html', 'text/html'],
      '/assets/frame.js': ['browser/frame.js', 'text/javascript'],
    };
    const asset = assets[url.pathname];
    if (request.method === 'GET' && Object.hasOwn(assets, url.pathname) && asset) {
      try {
        const content = await readFile(join(__dirname, asset[0]));
        response.writeHead(200, {
          'content-type': `${asset[1]}; charset=utf-8`,
          'cache-control': 'no-store',
          'content-security-policy':
            "default-src 'self'; script-src 'self'; style-src 'self'; frame-src 'self'; frame-ancestors 'self'; form-action 'self'",
        });
        response.end(content);
      } catch {
        json(response, 500, { error: '演示资源缺失，请先构建测试站' });
      }
      return;
    }
    if (request.method === 'GET' && url.pathname === '/health')
      return json(response, 200, { status: 'ok', environment });
    const token = request.headers.cookie
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1);
    for (const [key, value] of sessions) if (value.expiresAt <= Date.now()) sessions.delete(key);
    const session = token ? sessions.get(token) : undefined;
    if (request.method === 'POST') {
      if (request.headers.origin !== origin)
        return json(response, 403, { error: '请从当前测试站提交请求' });
      let body: unknown;
      try {
        body = await readJson(request);
      } catch {
        return json(response, 400, { error: '请求格式无效' });
      }
      if (url.pathname === '/api/login') {
        if (!LOGIN_SCHEMA.safeParse(body).success)
          return json(response, 401, { error: '演示账号或密码错误' });
        if (sessions.size >= 200)
          return json(response, 503, { error: '演示会话已满，请重启测试站' });
        if (token) sessions.delete(token);
        const id = randomUUID();
        sessions.set(id, { records: [], expiresAt: Date.now() + 3600000 });
        response.setHeader(
          'set-cookie',
          `${cookieName}=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600`,
        );
        return json(response, 200, { username: 'tester' });
      }
      if (!session) return json(response, 401, { error: '请先登录演示账号' });
      if (url.pathname === '/api/records') {
        const record = RECORD_SCHEMA.safeParse(body);
        if (!record.success)
          return json(response, 400, { error: '请填写标题、有效邮箱并同意演示数据约定' });
        if (session.records.length >= 100)
          return json(response, 409, { error: '演示记录已满，请重置数据' });
        const created = { id: randomUUID(), ...record.data };
        session.records.push(created);
        return json(response, 201, { record: created });
      }
      if (url.pathname === '/api/reset') {
        session.records = [];
        return json(response, 200, { status: 'reset' });
      }
      if (url.pathname === '/api/logout') {
        sessions.delete(token!);
        response.setHeader(
          'set-cookie',
          `${cookieName}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`,
        );
        return json(response, 200, { status: 'logged-out' });
      }
    }
    if (request.method === 'GET' && url.pathname === '/api/session')
      return json(response, 200, { environment, username: session ? 'tester' : null });
    if (request.method === 'GET' && url.pathname === '/api/records') {
      if (!session) return json(response, 401, { error: '请先登录演示账号' });
      const query = (url.searchParams.get('q') ?? '').toLocaleLowerCase();
      return json(response, 200, {
        records: session.records.filter((record) =>
          record.title.toLocaleLowerCase().includes(query),
        ),
      });
    }
    json(response, 404, { error: '页面或接口不存在' });
  });
}
