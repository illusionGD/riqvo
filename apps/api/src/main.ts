import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { loadApiConfig } from './config/config';

/** Start the API without running schema migrations or any test jobs. */
async function bootstrap(): Promise<void> {
  const config = loadApiConfig(process.env);
  const app = await NestFactory.create(AppModule.register(config), {
    logger: ['log', 'warn', 'error'],
  });
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
