import { DataSource } from 'typeorm';
import type { ApiConfig } from '../config/config';
import { InitializePlatform1793203200000 } from './migrations/1793203200000-initialize-platform';

/**
 * 创建迁移连接；数据库结构变更始终显式执行。
 * @param config 已校验的服务器配置。
 * @returns 供维护命令使用的未初始化数据源。
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
