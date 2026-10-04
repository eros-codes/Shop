import { MigrationInterface, QueryRunner } from 'typeorm';

// Discount codes gain fixed amounts, campaign windows, minimums,
// ceilings, per-customer limits and a product/category scope. Existing
// codes keep behaving exactly as they did.
export class RichDiscountCodes1790600000000 implements MigrationInterface {
  name = 'RichDiscountCodes1790600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('discount_codes'))) return;

    const columns: Array<[string, string]> = [
      ['type', "enum('percent','fixed') NOT NULL DEFAULT 'percent'"],
      ['off_amount', 'int UNSIGNED NULL'],
      ['max_discount_amount', 'int UNSIGNED NULL'],
      ['min_order_amount', 'int UNSIGNED NULL'],
      ['starts_at', 'datetime NULL'],
      ['expires_at', 'datetime NULL'],
      ['per_user_limit', 'int UNSIGNED NULL'],
    ];
    for (const [name, definition] of columns) {
      if (!(await queryRunner.hasColumn('discount_codes', name))) {
        await queryRunner.query(
          `ALTER TABLE \`discount_codes\` ADD \`${name}\` ${definition}`,
        );
      }
    }

    if (!(await queryRunner.hasTable('discount_code_products'))) {
      await queryRunner.query(
        'CREATE TABLE `discount_code_products` (`discount_code_id` int NOT NULL, ' +
          '`product_id` int NOT NULL, ' +
          'INDEX `IDX_748c8e370c2fa49e947afa2ee4` (`discount_code_id`), ' +
          'INDEX `IDX_75f733db6355f6eb68f1be1b64` (`product_id`), ' +
          'PRIMARY KEY (`discount_code_id`, `product_id`)) ENGINE=InnoDB',
      );
      await queryRunner.query(
        'ALTER TABLE `discount_code_products` ADD CONSTRAINT `FK_748c8e370c2fa49e947afa2ee46` ' +
          'FOREIGN KEY (`discount_code_id`) REFERENCES `discount_codes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE',
      );
      await queryRunner.query(
        'ALTER TABLE `discount_code_products` ADD CONSTRAINT `FK_75f733db6355f6eb68f1be1b642` ' +
          'FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE',
      );
    }

    if (!(await queryRunner.hasTable('discount_code_categories'))) {
      await queryRunner.query(
        'CREATE TABLE `discount_code_categories` (`discount_code_id` int NOT NULL, ' +
          '`category_id` int NOT NULL, ' +
          'INDEX `IDX_61f9c3bb58503eac81da060269` (`discount_code_id`), ' +
          'INDEX `IDX_0b4a409eacd31ab9cefa7f0ad1` (`category_id`), ' +
          'PRIMARY KEY (`discount_code_id`, `category_id`)) ENGINE=InnoDB',
      );
      await queryRunner.query(
        'ALTER TABLE `discount_code_categories` ADD CONSTRAINT `FK_61f9c3bb58503eac81da060269a` ' +
          'FOREIGN KEY (`discount_code_id`) REFERENCES `discount_codes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE',
      );
      await queryRunner.query(
        'ALTER TABLE `discount_code_categories` ADD CONSTRAINT `FK_0b4a409eacd31ab9cefa7f0ad19` ' +
          'FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE CASCADE ON UPDATE CASCADE',
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `discount_code_categories`');
    await queryRunner.query('DROP TABLE IF EXISTS `discount_code_products`');
    for (const column of [
      'type',
      'off_amount',
      'max_discount_amount',
      'min_order_amount',
      'starts_at',
      'expires_at',
      'per_user_limit',
    ]) {
      if (await queryRunner.hasColumn('discount_codes', column)) {
        await queryRunner.query(
          `ALTER TABLE \`discount_codes\` DROP COLUMN \`${column}\``,
        );
      }
    }
  }
}
