import 'reflect-metadata';
import { createHash } from 'node:crypto';
import { loadApiConfig } from '../config/config';
import { createDataSource } from './data-source';

/** Run forward migrations under a database-level lock, or report pending work. */
async function main(): Promise<void> {
  const command = process.argv[2];
  if (command !== 'up' && command !== 'status') {
    throw new Error('Usage: migrate <up|status>');
  }
  const config = loadApiConfig(process.env);
  const source = createDataSource(config);
  await source.initialize();
  const runner = source.createQueryRunner();
  const lockName = `riqvo-migrate-${createHash('sha256').update(config.MYSQL_DATABASE).digest('hex').slice(0, 40)}`;
  let locked = false;
  try {
    const result: unknown = await runner.query('SELECT GET_LOCK(?, 5) AS acquired', [lockName]);
    // mysql2 may return the integer as a string when bigNumberStrings is enabled.
    if (!Array.isArray(result) || ![1, '1'].includes(result[0]?.acquired)) {
      throw new Error('Migration lock unavailable; another migration may be running.');
    }
    locked = true;
    if (command === 'status') {
      console.log(JSON.stringify({ status: 'ok', pending: await source.showMigrations() }));
    } else {
      const applied = await source.runMigrations();
      console.log(JSON.stringify({ status: 'ok', applied: applied.length }));
    }
  } finally {
    try {
      if (locked) await runner.query('SELECT RELEASE_LOCK(?)', [lockName]);
    } finally {
      await runner.release();
      await source.destroy();
    }
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error &&
    (error.message.startsWith('Invalid configuration:') ||
      error.message.startsWith('Usage:') ||
      error.message.startsWith('Migration lock'))
      ? error.message
      : 'Migration failed. Check database access and the migration state before retrying.';
  console.error(message);
  process.exitCode = 1;
});
