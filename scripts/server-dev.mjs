import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import tsNode from 'ts-node';

// 与执行器一样直接读取共享协议源码，错误码修改后自动重启，无需手动构建。
tsNode.register({
  project: fileURLToPath(new URL('../apps/server/tsconfig.json', import.meta.url)),
  transpileOnly: true,
});
createRequire(import.meta.url)('../apps/server/src/main');
