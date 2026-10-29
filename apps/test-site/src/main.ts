import { parseArgs } from 'node:util';
import { createTestSite } from './server';

try {
  const { values } = parseArgs({
    options: {
      port: { type: 'string', default: '4174' },
      environment: { type: 'string', default: 'test' },
    },
  });
  const port = Number(values.port);
  const environment = values.environment!;
  if (
    !Number.isInteger(port) ||
    port < 1024 ||
    port > 65535 ||
    !/^[a-z][a-z0-9-]{0,31}$/.test(environment)
  )
    throw new Error('INVALID_CONFIG');
  const server = createTestSite(environment, port);
  server.requestTimeout = 10000;
  server.on('error', () => {
    console.error('测试站启动失败，请检查端口是否被占用');
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () =>
    console.log(JSON.stringify({ service: 'riqvo-test-site', environment, port })),
  );
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.once(signal, () => {
      server.close();
      server.closeAllConnections();
    });
} catch {
  console.error('测试站参数无效，请提供合法的 --port 和 --environment');
  process.exitCode = 1;
}
