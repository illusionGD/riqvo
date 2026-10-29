import { Module, type DynamicModule } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';
import { API_CONFIG, type ApiConfig } from './config/config';

@Module({})
export class AppModule {
  /**
   * 使用已校验配置组装 API。
   * @param config 仅供服务器使用的设置。
   * @returns Nest 根模块；数据库迁移仍由显式命令执行。
   */
  static register(config: ApiConfig): DynamicModule {
    return {
      module: AppModule,
      controllers: [HealthController],
      providers: [{ provide: API_CONFIG, useValue: config }, HealthService],
    };
  }
}
