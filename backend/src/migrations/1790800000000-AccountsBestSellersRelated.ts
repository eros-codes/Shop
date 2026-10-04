// Three small additions the storefront needs: password-reset codes,
// a sales counter to sort "best selling" on, and nothing else - related
// products are read from data that already exists.
//
// The sales counter is backfilled from the orders already in the
// database, so the first listing is not all zeros.
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AccountsBestSellersRelated1790800000000 implements MigrationInterface {
  name = 'AccountsBestSellersRelated1790800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('otp_verifications')) {
      if (!(await queryRunner.hasColumn('otp_verifications', 'purpose'))) {
        await queryRunner.query(
          "ALTER TABLE `otp_verifications` ADD `purpose` enum('register','password_reset') NOT NULL DEFAULT 'register'",
        );
      }

      // The unique key moves from the number to (number, purpose), so a
      // reset code and a signup code can exist side by side. The old
      // index has to go first - it would refuse the second row.
      const uniques: Array<{ INDEX_NAME: string }> = await queryRunner.query(
        'SELECT DISTINCT INDEX_NAME FROM information_schema.STATISTICS ' +
          "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'otp_verifications' " +
          "AND NON_UNIQUE = 0 AND INDEX_NAME <> 'PRIMARY' " +
          "AND INDEX_NAME <> 'UQ_otp_mobile_purpose' AND COLUMN_NAME = 'mobile'",
      );
      const hasNew: Array<unknown> = await queryRunner.query(
        "SHOW INDEX FROM `otp_verifications` WHERE Key_name = 'UQ_otp_mobile_purpose'",
      );
      if (hasNew.length === 0) {
        await queryRunner.query(
          'CREATE UNIQUE INDEX `UQ_otp_mobile_purpose` ON `otp_verifications` (`mobile`, `purpose`)',
        );
      }
      for (const index of uniques) {
        await queryRunner.query(
          `DROP INDEX \`${index.INDEX_NAME}\` ON \`otp_verifications\``,
        );
      }

      // A reset code carries neither of these.
      await queryRunner.query(
        'ALTER TABLE `otp_verifications` MODIFY `displayName` varchar(255) NULL',
      );
      await queryRunner.query(
        'ALTER TABLE `otp_verifications` MODIFY `hashedPassword` varchar(255) NULL',
      );
    }

    if (!(await queryRunner.hasTable('products'))) return;

    if (!(await queryRunner.hasColumn('products', 'sales_count'))) {
      await queryRunner.query(
        'ALTER TABLE `products` ADD `sales_count` int UNSIGNED NOT NULL DEFAULT 0',
      );
      await queryRunner.query(
        'CREATE INDEX `IDX_product_sales_count` ON `products` (`sales_count`)',
      );

      if (await queryRunner.hasTable('order_items')) {
        await queryRunner.query(
          'UPDATE `products` p INNER JOIN (' +
            'SELECT oi.`product_id`, SUM(oi.`quantity`) AS q ' +
            'FROM `order_items` oi INNER JOIN `order` o ON o.`id` = oi.`order_id` ' +
            "WHERE o.`status` IN ('paid','processing','sent','delivered') " +
            'AND o.`deletedAt` IS NULL GROUP BY oi.`product_id`' +
            ') s ON s.`product_id` = p.`id` SET p.`sales_count` = s.q',
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('products', 'sales_count')) {
      await queryRunner.query(
        'ALTER TABLE `products` DROP COLUMN `sales_count`',
      );
    }
    if (await queryRunner.hasColumn('otp_verifications', 'purpose')) {
      await queryRunner.query(
        'DROP INDEX `UQ_otp_mobile_purpose` ON `otp_verifications`',
      );
      await queryRunner.query(
        'ALTER TABLE `otp_verifications` DROP COLUMN `purpose`',
      );
      await queryRunner.query(
        'CREATE UNIQUE INDEX `IDX_otp_mobile` ON `otp_verifications` (`mobile`)',
      );
    }
  }
}
