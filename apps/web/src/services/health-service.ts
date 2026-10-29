import { parseApiResponse, codeForStatus } from '@riqvo/contracts';
import { z } from 'zod';
import type { HealthSnapshot } from '../types/health';

const check = z.enum(['ready', 'unavailable', 'migration_required']);
const schema = z.object({
  status: z.enum(['ready', 'unavailable']),
  service: z.literal('riqvo-api'),
  checks: z.object({ mysql: check, redis: check, artifacts: check }),
});

/**
 * 通过同源 API 代理读取后端的实际就绪状态。
 * @returns 已校验快照；503 表示有效的依赖失败响应。
 */
export async function fetchHealth(): Promise<HealthSnapshot> {
  const response = await fetch('/api/health/ready', {
    signal: AbortSignal.timeout(5000),
    cache: 'no-store',
  });
  if (response.status !== 200 && response.status !== 503) throw new Error('API unavailable');
  const envelope = parseApiResponse(await response.json());
  if (envelope.code !== codeForStatus(response.status)) throw new Error('INVALID_API_RESPONSE');
  const body = envelope.data;
  const result = schema.parse(body);
  if ((response.status === 200) !== (result.status === 'ready'))
    throw new Error('Invalid API status');
  if (
    (result.status === 'ready') !==
    Object.values(result.checks).every((status) => status === 'ready')
  ) {
    throw new Error('Inconsistent API readiness');
  }
  return result;
}
