import { z } from 'zod';

const schema = z.object({
  RUNNER_API_URL: z
    .string()
    .url()
    .default('http://127.0.0.1:3000')
    .refine((value) => {
      const url = new URL(value);
      return (
        ['http:', 'https:'].includes(url.protocol) &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        url.pathname === '/'
      );
    }),
  RUNNER_POLL_INTERVAL_MS: z.coerce.number().int().min(1000).max(60000).default(5000),
});

/** 本地执行器配置，不需要后端数据库或团队模型凭据。 */
export type RunnerConfig = z.infer<typeof schema>;

/**
 * 校验目标 API 源地址和轮询间隔，不回显传入值。
 * @param env 执行器进程环境变量。
 * @returns 仅供执行器使用的配置。
 */
export function loadRunnerConfig(env: NodeJS.ProcessEnv): RunnerConfig {
  const result = schema.safeParse(env);
  if (!result.success) {
    throw new Error(
      `Invalid configuration: ${[...new Set(result.error.issues.map((issue) => issue.path.join('.')))].join(', ')}`,
    );
  }
  return result.data;
}
