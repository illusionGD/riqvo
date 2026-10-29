import assert from 'node:assert/strict';
import test from 'node:test';
import { blockedArtifactPath, freePort, runNode, waitForHttp } from './helpers.mjs';

test(
  'API exposes a real liveness endpoint without starting business tasks',
  { timeout: 15000 },
  async (t) => {
    const port = await freePort();
    const api = runNode('apps/server/dist/main.js', [], {
      API_PORT: String(port),
      MYSQL_DATABASE: 'riqvo_test',
      MYSQL_USER: 'test',
      MYSQL_PASSWORD: 'not-a-real-password',
    });
    t.after(() => api.stop());
    const response = await waitForHttp(`http://127.0.0.1:${port}/api/health/live`, api);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      code: 0,
      data: { status: 'ok', service: 'riqvo-api' },
      message: '操作成功',
    });
    const missing = await fetch(`http://127.0.0.1:${port}/api/missing`);
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), { code: 40400, data: null, message: '资源不存在' });
  },
);

test(
  'invalid API configuration fails without echoing supplied credentials',
  { timeout: 10000 },
  async () => {
    const marker = 'test-value-that-must-not-be-logged';
    const result = await runNode('apps/server/dist/main.js', [], {
      API_PORT: 'invalid',
      MYSQL_DATABASE: 'riqvo_test',
      MYSQL_USER: 'test',
      MYSQL_PASSWORD: marker,
    }).done;
    assert.equal(result.code, 1);
    assert.match(result.output, /Invalid configuration: API_PORT/);
    assert.equal(result.output.includes(marker), false);
  },
);

test(
  'runner rejects credentials embedded in its API URL without logging them',
  { timeout: 10000 },
  async () => {
    const marker = 'private-url-test-value';
    const result = await runNode('apps/runner/dist/main.js', ['--check'], {
      RUNNER_API_URL: `http://user:${marker}@localhost:3000`,
    }).done;
    assert.equal(result.code, 1);
    assert.match(result.output, /Invalid configuration: RUNNER_API_URL/);
    assert.equal(result.output.includes(marker), false);
  },
);

test(
  'runner check exits unsuccessfully when the API cannot be reached',
  { timeout: 10000 },
  async () => {
    const port = await freePort();
    const result = await runNode('apps/runner/dist/main.js', ['--check'], {
      RUNNER_API_URL: `http://127.0.0.1:${port}`,
    }).done;
    assert.equal(result.code, 1);
    assert.deepEqual(JSON.parse(result.output), {
      service: 'riqvo-runner',
      api: 'unreachable',
      mode: 'connectivity-only',
    });
  },
);

test(
  'readiness reports unavailable dependencies instead of a false success',
  { timeout: 15000 },
  async (t) => {
    const port = await freePort();
    const api = runNode('apps/server/dist/main.js', [], {
      API_PORT: String(port),
      MYSQL_HOST: '127.0.0.1',
      MYSQL_PORT: '1',
      MYSQL_DATABASE: 'riqvo_test',
      MYSQL_USER: 'test',
      MYSQL_PASSWORD: 'not-a-real-password',
      REDIS_HOST: '127.0.0.1',
      REDIS_PORT: '1',
      ARTIFACT_DIR: await blockedArtifactPath(t),
    });
    t.after(() => api.stop());
    await waitForHttp(`http://127.0.0.1:${port}/api/health/live`, api);
    const response = await fetch(`http://127.0.0.1:${port}/api/health/ready`);
    assert.equal(response.status, 503);
    const envelope = await response.json();
    assert.equal(envelope.code, 50300);
    assert.equal(envelope.message, '服务暂不可用');
    assert.deepEqual(envelope.data, {
      status: 'unavailable',
      service: 'riqvo-api',
      checks: { mysql: 'unavailable', redis: 'unavailable', artifacts: 'unavailable' },
    });
  },
);
