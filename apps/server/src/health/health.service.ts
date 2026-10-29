import { Inject, Injectable } from '@nestjs/common';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createConnection, type RowDataPacket } from 'mysql2/promise';
import Redis from 'ioredis';
import { API_CONFIG, type ApiConfig } from '../config/config';

type CheckStatus = 'ready' | 'unavailable' | 'migration_required';

/** Public readiness response. No dependency addresses, paths or credentials are exposed. */
export interface Readiness {
  /** Overall availability of the configured dependencies. */
  status: 'ready' | 'unavailable';
  /** Stable service identifier for callers, including the runner. */
  service: 'riqvo-api';
  /** Individual probe results; a missing schema is distinct from a disconnected database. */
  checks: { mysql: CheckStatus; redis: CheckStatus; artifacts: CheckStatus };
}

@Injectable()
export class HealthService {
  constructor(@Inject(API_CONFIG) private readonly config: ApiConfig) {}

  /**
   * Check actual dependencies without performing migrations or starting tasks.
   * @returns Independent probe outcomes and an aggregate readiness status.
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
    // Errors are represented by the returned status, never by raw connection logs.
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
