import type { MigrationInterface, QueryRunner } from 'typeorm';

/** 仅包含工程元数据；业务表在对应功能中创建。 */
export class InitializePlatform1793203200000 implements MigrationInterface {
  name = 'InitializePlatform1793203200000';

  /**
   * 创建就绪接口需要的基础数据库结构。
   * @param queryRunner 由迁移执行器管理的连接。
   */
  async up(queryRunner: QueryRunner): Promise<void> {
    // MySQL DDL 会隐式提交；幂等语句允许在建表与记录迁移之间中断后
    // 重新执行这份基础迁移。
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
   * 框架回滚钩子；公共维护命令不开放此操作。
   * @param queryRunner 由迁移执行器管理的连接。
   */
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE riqvo_metadata');
  }
}
