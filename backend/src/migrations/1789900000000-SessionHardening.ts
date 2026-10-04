import { MigrationInterface, QueryRunner } from 'typeorm';

// Refresh-token families and usedAt, so a leaked token can be detected
// and its whole session invalidated.
export class SessionHardening1789900000000 implements MigrationInterface {
  name = 'SessionHardening1789900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('refresh_tokens')) {
      if (!(await queryRunner.hasColumn('refresh_tokens', 'familyId'))) {
        await queryRunner.query(
          'ALTER TABLE `refresh_tokens` ADD `familyId` varchar(36) NULL',
        );
        await queryRunner.query(
          'UPDATE `refresh_tokens` SET `familyId` = UUID() WHERE `familyId` IS NULL',
        );
        await queryRunner.query(
          'ALTER TABLE `refresh_tokens` CHANGE `familyId` `familyId` varchar(36) NOT NULL',
        );
      }
      if (!(await queryRunner.hasColumn('refresh_tokens', 'usedAt'))) {
        await queryRunner.query(
          'ALTER TABLE `refresh_tokens` ADD `usedAt` datetime NULL',
        );
      }
      await this.ensureIndex(
        queryRunner,
        'refresh_tokens',
        'IDX_refresh_token_expires',
        '(`expiresAt`)',
      );
      await this.ensureIndex(
        queryRunner,
        'refresh_tokens',
        'IDX_refresh_token_family',
        '(`familyId`)',
      );
    }

    if (await queryRunner.hasTable('otp_verifications')) {
      await this.ensureIndex(
        queryRunner,
        'otp_verifications',
        'IDX_otp_expires',
        '(`expiresAt`)',
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.dropIndex(
      queryRunner,
      'refresh_tokens',
      'IDX_refresh_token_family',
    );
    await this.dropIndex(
      queryRunner,
      'refresh_tokens',
      'IDX_refresh_token_expires',
    );
    await this.dropIndex(queryRunner, 'otp_verifications', 'IDX_otp_expires');
    if (await queryRunner.hasColumn('refresh_tokens', 'usedAt')) {
      await queryRunner.query(
        'ALTER TABLE `refresh_tokens` DROP COLUMN `usedAt`',
      );
    }
    if (await queryRunner.hasColumn('refresh_tokens', 'familyId')) {
      await queryRunner.query(
        'ALTER TABLE `refresh_tokens` DROP COLUMN `familyId`',
      );
    }
  }

  private async ensureIndex(
    queryRunner: QueryRunner,
    table: string,
    name: string,
    columns: string,
  ): Promise<void> {
    const existing: unknown[] = await queryRunner.query(
      `SHOW INDEX FROM \`${table}\` WHERE Key_name = '${name}'`,
    );
    if (existing.length === 0) {
      await queryRunner.query(
        `CREATE INDEX \`${name}\` ON \`${table}\` ${columns}`,
      );
    }
  }

  private async dropIndex(
    queryRunner: QueryRunner,
    table: string,
    name: string,
  ): Promise<void> {
    if (!(await queryRunner.hasTable(table))) return;
    const existing: unknown[] = await queryRunner.query(
      `SHOW INDEX FROM \`${table}\` WHERE Key_name = '${name}'`,
    );
    if (existing.length > 0) {
      await queryRunner.query(`DROP INDEX \`${name}\` ON \`${table}\``);
    }
  }
}
