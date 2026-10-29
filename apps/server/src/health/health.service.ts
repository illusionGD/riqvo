import { Inject, Injectable } from '@nestjs/common';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createConnection, type RowDataPacket } from 'mysql2/promise';
import Redis from 'ioredis';
import { API_CONFIG, type ApiConfig } from '../config/config';

type CheckStatus = 'ready' | 'unavailable' | 'migration_required';

/** 公共就绪响应，不暴露依赖地址、路径或凭据。 */
export interface Readiness {
  /** 已配置依赖的整体可用状态。 */
  status: 'ready' | 'unavailable';
  /** 提供给执行器等调用方的稳定服务标识。 */
  service: 'riqvo-api';
  /** 独立探针结果；缺少数据库结构与连接失败分别表示。 */
  checks: { mysql: CheckStatus; redis: CheckStatus; artifacts: CheckStatus };
}

@Injectable()
export class HealthService {
  constructor(@Inject(API_CONFIG) private readonly config: ApiConfig) {}

  /**
   * 检查真实依赖，不执行迁移或启动任务。
   * @returns 各项探针结果与整体就绪状态。
   */
  async readiness(): Promise<Readiness> {
    const [mysql, redis, artifacts] = await Promise.all([
      this.checkMysql(),
      this.checkRedis(),
      this.checkArtifacts(),
    ]);
    const checks = { mysql, redis, artifacts };
    return {
      status: Object.values(checks).every((value) => value === 'ready') ? 'ready' : 'unavailable',
      service: 'riqvo-api',
      checks,
    };
  }

  private async checkMysql(): Promise<CheckStatus> {
    let connection;
    try {
      connection = await createConnection({
        host: this.config.MYSQL_HOST,
        port: this.config.MYSQL_PORT,
        user: this.config.MYSQL_USER,
        password: this.config.MYSQL_PASSWORD,
        database: this.config.MYSQL_DATABASE,
        connectTimeout: 1500,
      });
      await connection.query({ sql: 'SELECT 1', timeout: 1500 });
      try {
        const [rows] = await connection.query<RowDataPacket[]>({
          sql: 'SELECT schema_revision FROM riqvo_metadata WHERE id = 1',
          timeout: 1500,
        });
        return rows[0]?.schema_revision === 1 ? 'ready' : 'migration_required';
      } catch (error: unknown) {
        if (
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 'ER_NO_SUCH_TABLE'
        ) {
          return 'migration_required';
        }
        return 'unavailable';
      }
    } catch {
      return 'unavailable';
    } finally {
      connection?.destroy();
    }
  }

  private async checkRedis(): Promise<CheckStatus> {
    const redis = new Redis({
      host: this.config.REDIS_HOST,
      port: this.config.REDIS_PORT,
      password: this.config.REDIS_PASSWORD || undefined,
      lazyConnect: true,
      connectTimeout: 1500,
      commandTimeout: 1500,
      maxRetriesPerRequest: 0,
      retryStrategy: () => null,
      enableOfflineQueue: false,
    });
    // 通过返回状态表示错误，不输出原始连接日志。
    redis.on('error', () => {});
    try {
      await redis.connect();
      return (await redis.ping()) === 'PONG' ? 'ready' : 'unavailable';
    } catch {
      return 'unavailable';
    } finally {
      redis.disconnect();
    }
  }

  private async checkArtifacts(): Promise<CheckStatus> {
    let directory: string | undefined;
    try {
      await mkdir(this.config.ARTIFACT_DIR, { recursive: true, mode: 0o700 });
      directory = await mkdtemp(join(this.config.ARTIFACT_DIR, '.health-'));
      const file = join(directory, 'probe');
      const value = randomUUID();
      await writeFile(file, value, { flag: 'wx', mode: 0o600 });
      const contents = await readFile(file, 'utf8');
      await rm(directory, { recursive: true });
      directory = undefined;
      return contents === value ? 'ready' : 'unavailable';
    } catch {
      return 'unavailable';
    } finally {
      if (directory) await rm(directory, { recursive: true, force: true }).catch(() => {});
    }
  }
}
