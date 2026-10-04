import { MigrationInterface, QueryRunner } from 'typeorm';

// Support tickets, the shared rate-limit table and the indexes the
// deployment work needed.
export class Phase4DeploymentHardening1789800000000 implements MigrationInterface {
  name = 'Phase4DeploymentHardening1789800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('tickets')) {
      if (!(await queryRunner.hasColumn('tickets', 'deleted_at'))) {
        await queryRunner.query(
          'ALTER TABLE `tickets` ADD `deleted_at` datetime(6) NULL',
        );
      }
      await queryRunner.query(
        'ALTER TABLE `tickets` CHANGE `description` `description` text NOT NULL',
      );
      const ticketIndexes: Array<{ Key_name: string }> =
        await queryRunner.query(
          "SHOW INDEX FROM `tickets` WHERE Key_name = 'IDX_ticket_user_created'",
        );
      if (ticketIndexes.length === 0) {
        await queryRunner.query(
          'CREATE INDEX `IDX_ticket_user_created` ON `tickets` (`userId`, `created_at`)',
        );
      }
    }

    if (await queryRunner.hasTable('otp_verifications')) {
      const columns: Array<[string, string]> = [
        ['lastSentAt', 'datetime NULL'],
        ['sendCount', 'int NOT NULL DEFAULT 1'],
        ['windowStartedAt', 'datetime NULL'],
      ];
      for (const [name, definition] of columns) {
        if (!(await queryRunner.hasColumn('otp_verifications', name))) {
          await queryRunner.query(
            `ALTER TABLE \`otp_verifications\` ADD \`${name}\` ${definition}`,
          );
        }
      }
    }

    if (!(await queryRunner.hasTable('rate_limits'))) {
      await queryRunner.query(
        'CREATE TABLE `rate_limits` (' +
          '`bucket_key` varchar(191) NOT NULL, ' +
          '`hits` int NOT NULL DEFAULT 0, ' +
          '`expires_at` datetime(3) NOT NULL, ' +
          '`blocked_until` datetime(3) NULL, ' +
          'INDEX `IDX_rate_limit_expires` (`expires_at`), ' +
          'PRIMARY KEY (`bucket_key`)) ENGINE=InnoDB',
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `rate_limits`');
    if (await queryRunner.hasColumn('otp_verifications', 'lastSentAt')) {
      await queryRunner.query(
        'ALTER TABLE `otp_verifications` DROP COLUMN `lastSentAt`, DROP COLUMN `sendCount`, DROP COLUMN `windowStartedAt`',
      );
    }
    if (await queryRunner.hasColumn('tickets', 'deleted_at')) {
      await queryRunner.query('ALTER TABLE `tickets` DROP COLUMN `deleted_at`');
    }
  }
}
