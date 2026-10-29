import { resolve } from 'node:path';
import { z } from 'zod';

const port = z.coerce.number().int().min(1).max(65535);
const schema = z.object({
  API_HOST: z.string().min(1).default('127.0.0.1'),
  API_PORT: port.default(3000),
  MYSQL_HOST: z.string().min(1).default('127.0.0.1'),
  MYSQL_PORT: port.default(13306),
  MYSQL_DATABASE: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/),
  MYSQL_USER: z.string().min(1),
  MYSQL_PASSWORD: z
    .string()
    .min(1)
    .refine((value) => value !== 'GENERATED_BY_SETUP'),
  REDIS_HOST: z.string().min(1).default('127.0.0.1'),
  REDIS_PORT: port.default(16379),
  REDIS_PASSWORD: z.string().default(''),
  ARTIFACT_DIR: z.string().min(1).default('.local/artifacts'),
});

/** 仅供服务器使用的配置，不得序列化到日志或 HTTP 响应。 */
export type ApiConfig = z.infer<typeof schema>;

/** 已校验服务器配置的依赖注入标识。 */
export const API_CONFIG = Symbol('API_CONFIG');

/**
 * 校验运行配置，不回显任何输入值或密钥。
 * @param env 环境变量，仅读取已声明的键。
 * @returns 已校验配置，产物目录为绝对路径。
 */
export function loadApiConfig(env: NodeJS.ProcessEnv): ApiConfig {
  const result = schema.safeParse(env);
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))];
    throw new Error(`Invalid configuration: ${fields.join(', ')}`);
  }
  return {
    ...result.data,
    ARTIFACT_DIR: resolve(__dirname, '../../../..', result.data.ARTIFACT_DIR),
  };
}
