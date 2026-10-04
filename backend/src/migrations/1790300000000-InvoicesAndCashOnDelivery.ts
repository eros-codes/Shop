import { MigrationInterface, QueryRunner } from 'typeorm';

// Invoice numbering and cash on delivery. Orders sold before invoices
// existed are deliberately left without a number.
export class InvoicesAndCashOnDelivery1790300000000 implements MigrationInterface {
  name = 'InvoicesAndCashOnDelivery1790300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('invoice_sequences'))) {
      await queryRunner.query(
        'CREATE TABLE `invoice_sequences` (' +
          '`year` int NOT NULL, ' +
          '`last_number` int UNSIGNED NOT NULL DEFAULT 0, ' +
          '`updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), ' +
          'PRIMARY KEY (`year`)) ENGINE=InnoDB',
      );
    }

    if (!(await queryRunner.hasTable('order'))) return;

    if (!(await queryRunner.hasColumn('order', 'invoice_number'))) {
      await queryRunner.query(
        'ALTER TABLE `order` ADD `invoice_number` varchar(32) NULL',
      );
      await queryRunner.query(
        'CREATE UNIQUE INDEX `UQ_order_invoice_number` ON `order` (`invoice_number`)',
      );
    }

    if (!(await queryRunner.hasColumn('order', 'cod_fee'))) {
      await queryRunner.query(
        'ALTER TABLE `order` ADD `cod_fee` bigint NOT NULL DEFAULT 0',
      );
    }

    await queryRunner.query(
      "ALTER TABLE `order` CHANGE `payment_method` `payment_method` enum('wallet','zarinpal','cash_on_delivery') NULL",
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('order', 'cod_fee')) {
      await queryRunner.query('ALTER TABLE `order` DROP COLUMN `cod_fee`');
    }
    if (await queryRunner.hasColumn('order', 'invoice_number')) {
      await queryRunner.query(
        'DROP INDEX `UQ_order_invoice_number` ON `order`',
      );
      await queryRunner.query(
        'ALTER TABLE `order` DROP COLUMN `invoice_number`',
      );
    }
    await queryRunner.query('DROP TABLE IF EXISTS `invoice_sequences`');
  }
}
