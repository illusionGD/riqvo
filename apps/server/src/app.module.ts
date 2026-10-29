import { Module, type DynamicModule } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';
import { API_CONFIG, type ApiConfig } from './config/config';

@Module({})
export class AppModule {
  /**
   * Assemble the API with already validated configuration.
   * @param config Server-only settings.
   * @returns Root Nest module; migrations remain an explicit CLI operation.
   */
  static register(config: ApiConfig): DynamicModule {
    return {
      module: AppModule,
      controllers: [HealthController],
      providers: [{ provide: API_CONFIG, useValue: config }, HealthService],
    };
  }
}
