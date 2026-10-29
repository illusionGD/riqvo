import { fileURLToPath } from 'node:url';
import tsNode from 'ts-node';

// 使用 TypeScript 的转换器，保持被注入浏览器的录制函数不依赖额外运行时辅助函数。
tsNode.register({
  project: fileURLToPath(new URL('../apps/runner/tsconfig.json', import.meta.url)),
  transpileOnly: true,
});
