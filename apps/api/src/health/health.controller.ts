import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { HealthService, type Readiness } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** Report process liveness; dependency readiness is a separate check. */
  @Get('live')
  live(): { status: 'ok'; service: 'riqvo-api' } {
    return { status: 'ok', service: 'riqvo-api' };
  }

  /** Report dependency failures with 503 so callers cannot mistake them for success. */
  @Get('ready')
  async ready(): Promise<Readiness> {
    const result = await this.health.readiness();
    if (result.status !== 'ready') throw new ServiceUnavailableException(result);
    return result;
  }
}
