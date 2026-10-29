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

/** Server-only configuration. Never serialize this object into logs or HTTP responses. */
export type ApiConfig = z.infer<typeof schema>;

/** Dependency-injection token for the validated server configuration. */
export const API_CONFIG = Symbol('API_CONFIG');

/**
 * Validate runtime settings without echoing any supplied values, including secrets.
 * @param env Environment variables; only declared keys are consumed.
 * @returns Validated configuration with an absolute artifact directory.
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
