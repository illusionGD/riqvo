import { createRequire } from 'node:module';
import './register-pc-dev.mjs';

// 从 CommonJS 加载受 TypeScript 转换器管理的源码，避免 Node 原生类型剥离介入。
process.env.RIQVO_PC_PORT ??= '4319';
createRequire(import.meta.url)('../apps/runner/src/pc-main');
