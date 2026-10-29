import { DataSource } from 'typeorm';
import type { ApiConfig } from '../config/config';
import { InitializePlatform1793203200000 } from './migrations/1793203200000-initialize-platform';

/**
 * Construct the migration connection; schema changes are always explicit.
 * @param config Validated server configuration.
 * @returns An uninitialized data source for the maintenance command.
 */
export function createDataSource(config: ApiConfig): DataSource {
  return new DataSource({
    type: 'mysql',
    host: config.MYSQL_HOST,
    port: config.MYSQL_PORT,
    username: config.MYSQL_USER,
    password: config.MYSQL_PASSWORD,
    database: config.MYSQL_DATABASE,
    charset: 'utf8mb4_unicode_ci',
    timezone: 'Z',
    connectTimeout: 3000,
    extra: { connectionLimit: 3 },
    synchronize: false,
    migrationsRun: false,
    logging: false,
    migrationsTransactionMode: 'none',
    migrationsTableName: 'riqvo_migrations',
    migrations: [InitializePlatform1793203200000],
  });
}
