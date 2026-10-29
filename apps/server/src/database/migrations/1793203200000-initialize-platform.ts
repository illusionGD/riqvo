import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Infrastructure metadata only; business tables belong to their respective features. */
export class InitializePlatform1793203200000 implements MigrationInterface {
  name = 'InitializePlatform1793203200000';

  /**
   * Establish the baseline schema required by the readiness endpoint.
   * @param queryRunner Connection owned by the migration executor.
   */
  async up(queryRunner: QueryRunner): Promise<void> {
    // MySQL DDL implicitly commits. Idempotent statements allow this baseline to resume
    // if the process exits between creating the table and recording the migration.
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS riqvo_metadata (
      id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
      schema_revision INT UNSIGNED NOT NULL,
      initialized_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await queryRunner.query(
      'INSERT IGNORE INTO riqvo_metadata (id, schema_revision) VALUES (1, 1)',
    );
  }

  /**
   * Framework rollback hook; intentionally unavailable from the public maintenance CLI.
   * @param queryRunner Connection owned by the migration executor.
   */
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE riqvo_metadata');
  }
}
