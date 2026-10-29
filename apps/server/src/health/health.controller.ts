import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { HealthService, type Readiness } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** 报告进程存活状态；依赖是否就绪另行检查。 */
  @Get('live')
  live(): { status: 'ok'; service: 'riqvo-api' } {
    return { status: 'ok', service: 'riqvo-api' };
  }

  /** 依赖失败时返回 503，避免调用方误判为成功。 */
  @Get('ready')
  async ready(): Promise<Readiness> {
    const result = await this.health.readiness();
    if (result.status !== 'ready') throw new ServiceUnavailableException(result);
    return result;
  }
}
