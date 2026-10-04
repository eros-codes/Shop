import { MigrationInterface, QueryRunner } from 'typeorm';

// Stock moves from the product to the variant. Every existing product
// gets one default variant carrying its stock, and existing order and
// basket lines are pointed at it, so nothing breaks while it happens.
export class ProductVariants1790100000000 implements MigrationInterface {
  name = 'ProductVariants1790100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('products'))) return;

    if (!(await queryRunner.hasTable('product_variants'))) {
      await queryRunner.query(
        'CREATE TABLE `product_variants` (' +
          '`id` int NOT NULL AUTO_INCREMENT, ' +
          '`product_id` int NOT NULL, ' +
          '`title` varchar(120) NOT NULL, ' +
          '`sku` varchar(80) NOT NULL, ' +
          '`options` json NULL, ' +
          '`price` int UNSIGNED NULL, ' +
          '`sale_price` int UNSIGNED NULL, ' +
          '`stock` int UNSIGNED NOT NULL DEFAULT 0, ' +
          '`weight_grams` int UNSIGNED NULL, ' +
          '`is_active` tinyint NOT NULL DEFAULT 1, ' +
          '`created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ' +
          '`updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), ' +
          '`deleted_at` datetime(6) NULL, ' +
          '`active_sku` varchar(80) AS (IF(`deleted_at` IS NULL, `sku`, NULL)) STORED, ' +
          'UNIQUE INDEX `UQ_variants_active_sku` (`active_sku`), ' +
          'INDEX `IDX_variant_product` (`product_id`), ' +
          'PRIMARY KEY (`id`)) ENGINE=InnoDB',
      );
      await queryRunner.query(
        'ALTER TABLE `product_variants` ADD CONSTRAINT `FK_variant_product` ' +
          'FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
      );
      await this.registerGeneratedColumn(
        queryRunner,
        'product_variants',
        'active_sku',
      );
    }

    await this.createDefaultVariants(queryRunner);
    await this.linkOrderItems(queryRunner);
    await this.linkBasketItems(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [table, column, constraint] of [
      ['order_items', 'variant_id', 'FK_order_item_variant'],
      ['basket_items', 'variant_id', 'FK_basket_variant'],
    ] as Array<[string, string, string]>) {
      if (await queryRunner.hasColumn(table, column)) {
        await queryRunner.query(
          `ALTER TABLE \`${table}\` DROP FOREIGN KEY \`${constraint}\``,
        );
        await queryRunner.query(
          `ALTER TABLE \`${table}\` DROP COLUMN \`${column}\``,
        );
      }
    }
    for (const column of ['variant_title', 'variant_sku']) {
      if (await queryRunner.hasColumn('order_items', column)) {
        await queryRunner.query(
          `ALTER TABLE \`order_items\` DROP COLUMN \`${column}\``,
        );
      }
    }
    await queryRunner.query('DROP TABLE IF EXISTS `product_variants`');
  }

  private async createDefaultVariants(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'INSERT INTO `product_variants` (`product_id`, `title`, `sku`, `stock`) ' +
        "SELECT p.`id`, 'Default', CONCAT(COALESCE(NULLIF(p.`slug`, ''), CONCAT('product-', p.`id`)), '-default'), p.`stock` " +
        'FROM `products` p ' +
        'WHERE NOT EXISTS (SELECT 1 FROM `product_variants` v WHERE v.`product_id` = p.`id`)',
    );
  }

  private async linkOrderItems(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('order_items'))) return;

    if (!(await queryRunner.hasColumn('order_items', 'variant_id'))) {
      await queryRunner.query(
        'ALTER TABLE `order_items` ADD `variant_id` int NULL',
      );
      await queryRunner.query(
        'ALTER TABLE `order_items` ADD `variant_title` varchar(120) NULL',
      );
      await queryRunner.query(
        'ALTER TABLE `order_items` ADD `variant_sku` varchar(80) NULL',
      );
      await queryRunner.query(
        'ALTER TABLE `order_items` ADD CONSTRAINT `FK_order_item_variant` ' +
          'FOREIGN KEY (`variant_id`) REFERENCES `product_variants`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
      );
    }

    await queryRunner.query(
      'UPDATE `order_items` oi ' +
        'INNER JOIN `product_variants` v ON v.`product_id` = oi.`product_id` ' +
        'SET oi.`variant_id` = v.`id`, oi.`variant_title` = v.`title`, oi.`variant_sku` = v.`sku` ' +
        'WHERE oi.`variant_id` IS NULL',
    );
  }

  private async linkBasketItems(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('basket_items'))) return;

    if (!(await queryRunner.hasColumn('basket_items', 'variant_id'))) {
      await queryRunner.query(
        'ALTER TABLE `basket_items` ADD `variant_id` int NULL',
      );
      await queryRunner.query(
        'UPDATE `basket_items` bi ' +
          'INNER JOIN `product_variants` v ON v.`product_id` = bi.`productId` ' +
          'SET bi.`variant_id` = v.`id` WHERE bi.`variant_id` IS NULL',
      );
      await queryRunner.query(
        'ALTER TABLE `basket_items` ADD CONSTRAINT `FK_basket_variant` ' +
          'FOREIGN KEY (`variant_id`) REFERENCES `product_variants`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
      );
    }

    const existing: Array<{ INDEX_NAME: string }> = await queryRunner.query(
      "SHOW INDEX FROM `basket_items` WHERE Key_name = 'UQ_basket_user_variant'",
    );
    if (existing.length === 0) {
      await queryRunner.query(
        'CREATE UNIQUE INDEX `UQ_basket_user_variant` ON `basket_items` (`userId`, `variant_id`)',
      );
    }

    const oldIndexes: Array<{ INDEX_NAME: string }> = await queryRunner.query(
      'SELECT DISTINCT INDEX_NAME FROM information_schema.STATISTICS ' +
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'basket_items' " +
        "AND NON_UNIQUE = 0 AND INDEX_NAME <> 'PRIMARY' AND INDEX_NAME <> 'UQ_basket_user_variant' " +
        "AND COLUMN_NAME = 'productId'",
    );
    for (const index of oldIndexes) {
      await queryRunner.query(
        `DROP INDEX \`${index.INDEX_NAME}\` ON \`basket_items\``,
      );
    }
  }

  private async registerGeneratedColumn(
    queryRunner: QueryRunner,
    table: string,
    column: string,
  ): Promise<void> {
    await queryRunner.query(
      'CREATE TABLE IF NOT EXISTS `typeorm_metadata` (`type` varchar(255) NOT NULL, ' +
        '`database` varchar(255) NULL, `schema` varchar(255) NULL, `table` varchar(255) NULL, ' +
        '`name` varchar(255) NULL, `value` text NULL) ENGINE=InnoDB',
    );
    await queryRunner.query(
      "DELETE FROM `typeorm_metadata` WHERE `type` = 'GENERATED_COLUMN' AND `table` = ? AND `name` = ?",
      [table, column],
    );
    await queryRunner.query(
      'INSERT INTO `typeorm_metadata`(`type`, `database`, `schema`, `table`, `name`, `value`) ' +
        "VALUES ('GENERATED_COLUMN', NULL, DATABASE(), ?, ?, 'IF(`deleted_at` IS NULL, `sku`, NULL)')",
      [table, column],
    );
  }
}
