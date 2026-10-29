import { HttpResponseInterceptor, HttpResponseFilter } from './http-response';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { loadApiConfig } from './config/config';

/** 启动 API，不执行数据库迁移或测试任务。 */
async function bootstrap(): Promise<void> {
  const config = loadApiConfig(process.env);
  const app = await NestFactory.create(AppModule.register(config), {
    logger: ['log', 'warn', 'error'],
  });
  app.useGlobalInterceptors(new HttpResponseInterceptor());
  app.useGlobalFilters(new HttpResponseFilter());
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  await app.listen(config.API_PORT, config.API_HOST);
}

bootstrap().catch((error: unknown) => {
  const message =
    error instanceof Error && error.message.startsWith('Invalid configuration:')
      ? error.message
      : 'API startup failed. Check the configuration and listening port.';
  console.error(message);
  process.exit(1);
});
