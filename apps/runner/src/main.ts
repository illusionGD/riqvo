import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { loadRunnerConfig } from './config';

const checkStatus = z.enum(['ready', 'unavailable', 'migration_required']);
const readinessSchema = z.object({
  service: z.literal('riqvo-api'),
  status: z.enum(['ready', 'unavailable']),
  checks: z.object({ mysql: checkStatus, redis: checkStatus, artifacts: checkStatus }),
});
type ApiStatus = 'ready' | 'unavailable' | 'unreachable' | 'invalid-response';

/**
 * Inspect the API's actual response, without claiming this runner has task capabilities.
 * @param origin Validated HTTP(S) API origin.
 * @param signal Executor shutdown signal.
 * @returns Connectivity/readiness state; no secret values are included.
 */
async function checkApi(origin: string, signal: AbortSignal): Promise<ApiStatus> {
  try {
    const response = await fetch(new URL('/api/health/ready', origin), {
      signal: AbortSignal.any([signal, AbortSignal.timeout(3000)]),
      redirect: 'error',
    });
    const body: unknown = await response.json();
    const result = readinessSchema.safeParse(body);
    if (!result.success) return 'invalid-response';
    const { status, checks } = result.data;
    if (
      response.status === 200 &&
      status === 'ready' &&
      Object.values(checks).every((value) => value === 'ready')
    )
      return 'ready';
    if (response.status === 503 && status === 'unavailable') return 'unavailable';
    return 'invalid-response';
  } catch {
    return 'unreachable';
  }
}

/** Start an outbound connectivity monitor; task registration and execution come later. */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== '--check')) {
    throw new Error('Usage: runner [--check]');
  }
  const config = loadRunnerConfig(process.env);
  const once = args[0] === '--check';
  const controller = new AbortController();
  const stop = (): void => controller.abort();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  let previous: ApiStatus | undefined;
  try {
    while (!controller.signal.aborted) {
      const api = await checkApi(config.RUNNER_API_URL, controller.signal);
      if (controller.signal.aborted) break;
      if (api !== previous)
        console.log(JSON.stringify({ service: 'riqvo-runner', api, mode: 'connectivity-only' }));
      previous = api;
      if (once) {
        process.exitCode = api === 'ready' ? 0 : 1;
        break;
      }
      await delay(config.RUNNER_POLL_INTERVAL_MS, undefined, { signal: controller.signal }).catch(
        (error: unknown) => {
          if (!controller.signal.aborted) throw error;
        },
      );
    }
  } finally {
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error &&
    (error.message.startsWith('Invalid configuration:') || error.message.startsWith('Usage:'))
      ? error.message
      : 'Runner startup failed. Check the local configuration.';
  console.error(message);
  process.exitCode = 1;
});
