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

/** Local executor settings; no backend database or team model credentials are required. */
export type RunnerConfig = z.infer<typeof schema>;

/**
 * Validate the outbound API origin and polling interval without echoing supplied values.
 * @param env Executor process environment.
 * @returns Executor-only configuration.
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
