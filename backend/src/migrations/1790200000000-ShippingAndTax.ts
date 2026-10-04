import { MigrationInterface, QueryRunner } from 'typeorm';

// Shipping methods, zones and rates, and the itemised money breakdown on
// orders. Existing orders keep what they were actually charged.
export class ShippingAndTax1790200000000 implements MigrationInterface {
  name = 'ShippingAndTax1790200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.createShippingTables(queryRunner);
    await this.extendOrders(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('order', 'shipping_method_id')) {
      await queryRunner.query(
        'ALTER TABLE `order` DROP FOREIGN KEY `FK_order_shipping_method`',
      );
    }
    for (const column of [
      'items_total',
      'discount_amount',
      'shipping_cost',
      'tax_amount',
      'shipping_method_id',
      'shipping_method_title',
      'shipping_eta_days_min',
      'shipping_eta_days_max',
    ]) {
      if (await queryRunner.hasColumn('order', column)) {
        await queryRunner.query(
          `ALTER TABLE \`order\` DROP COLUMN \`${column}\``,
        );
      }
    }
    await queryRunner.query('DROP TABLE IF EXISTS `shipping_rates`');
    await queryRunner.query('DROP TABLE IF EXISTS `shipping_zones`');
    await queryRunner.query('DROP TABLE IF EXISTS `shipping_methods`');
  }

  private async createShippingTables(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('shipping_methods'))) {
      await queryRunner.query(
        'CREATE TABLE `shipping_methods` (' +
          '`id` int NOT NULL AUTO_INCREMENT, ' +
          '`title` varchar(255) NOT NULL, ' +
          '`code` varchar(190) NOT NULL, ' +
          '`description` varchar(500) NULL, ' +
          '`estimated_days_min` int UNSIGNED NOT NULL DEFAULT 1, ' +
          '`estimated_days_max` int UNSIGNED NOT NULL DEFAULT 3, ' +
          '`supports_cash_on_delivery` tinyint NOT NULL DEFAULT 0, ' +
          '`is_active` tinyint NOT NULL DEFAULT 1, ' +
          '`sort_order` int NOT NULL DEFAULT 0, ' +
          '`created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ' +
          '`updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), ' +
          '`deleted_at` datetime(6) NULL, ' +
          '`active_code` varchar(190) AS (IF(`deleted_at` IS NULL, `code`, NULL)) STORED, ' +
          'UNIQUE INDEX `UQ_shipping_method_active_code` (`active_code`), ' +
          'PRIMARY KEY (`id`)) ENGINE=InnoDB',
      );
      await this.registerGeneratedColumn(
        queryRunner,
        'shipping_methods',
        'active_code',
        'IF(`deleted_at` IS NULL, `code`, NULL)',
      );
    }

    if (!(await queryRunner.hasTable('shipping_zones'))) {
      await queryRunner.query(
        'CREATE TABLE `shipping_zones` (' +
          '`id` int NOT NULL AUTO_INCREMENT, ' +
          '`title` varchar(255) NOT NULL, ' +
          '`provinces` json NULL, ' +
          '`is_default` tinyint NOT NULL DEFAULT 0, ' +
          '`created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ' +
          '`updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), ' +
          '`deleted_at` datetime(6) NULL, ' +
          'PRIMARY KEY (`id`)) ENGINE=InnoDB',
      );
    }

    if (!(await queryRunner.hasTable('shipping_rates'))) {
      await queryRunner.query(
        'CREATE TABLE `shipping_rates` (' +
          '`id` int NOT NULL AUTO_INCREMENT, ' +
          '`method_id` int NOT NULL, ' +
          '`zone_id` int NOT NULL, ' +
          '`base_cost` int UNSIGNED NOT NULL DEFAULT 0, ' +
          '`per_kg_cost` int UNSIGNED NOT NULL DEFAULT 0, ' +
          '`free_shipping_threshold` int UNSIGNED NULL, ' +
          '`cash_on_delivery_fee` int UNSIGNED NOT NULL DEFAULT 0, ' +
          '`is_active` tinyint NOT NULL DEFAULT 1, ' +
          '`created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ' +
          '`updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), ' +
          '`deleted_at` datetime(6) NULL, ' +
          'UNIQUE INDEX `UQ_shipping_rate_method_zone` (`method_id`, `zone_id`), ' +
          'PRIMARY KEY (`id`)) ENGINE=InnoDB',
      );
      await queryRunner.query(
        'ALTER TABLE `shipping_rates` ADD CONSTRAINT `FK_rate_method` ' +
          'FOREIGN KEY (`method_id`) REFERENCES `shipping_methods`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
      );
      await queryRunner.query(
        'ALTER TABLE `shipping_rates` ADD CONSTRAINT `FK_rate_zone` ' +
          'FOREIGN KEY (`zone_id`) REFERENCES `shipping_zones`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
      );
    }
  }

  private async extendOrders(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('order'))) return;

    const columns: Array<[string, string]> = [
      ['items_total', 'bigint NOT NULL DEFAULT 0'],
      ['discount_amount', 'bigint NOT NULL DEFAULT 0'],
      ['shipping_cost', 'bigint NOT NULL DEFAULT 0'],
      ['tax_amount', 'bigint NOT NULL DEFAULT 0'],
      ['shipping_method_title', 'varchar(100) NULL'],
      ['shipping_eta_days_min', 'int UNSIGNED NULL'],
      ['shipping_eta_days_max', 'int UNSIGNED NULL'],
    ];
    for (const [name, definition] of columns) {
      if (!(await queryRunner.hasColumn('order', name))) {
        await queryRunner.query(
          `ALTER TABLE \`order\` ADD \`${name}\` ${definition}`,
        );
      }
    }

    if (!(await queryRunner.hasColumn('order', 'shipping_method_id'))) {
      await queryRunner.query(
        'ALTER TABLE `order` ADD `shipping_method_id` int NULL',
      );
      await queryRunner.query(
        'ALTER TABLE `order` ADD CONSTRAINT `FK_order_shipping_method` ' +
          'FOREIGN KEY (`shipping_method_id`) REFERENCES `shipping_methods`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION',
      );
    }

    if (await queryRunner.hasTable('order_items')) {
      await queryRunner.query(
        'UPDATE `order` o INNER JOIN (' +
          'SELECT `order_id`, SUM(`price` * `quantity`) AS goods FROM `order_items` GROUP BY `order_id`' +
          ') i ON i.`order_id` = o.`id` ' +
          'SET o.`items_total` = i.goods, ' +
          'o.`discount_amount` = GREATEST(i.goods - o.`total_price`, 0) ' +
          'WHERE o.`items_total` = 0',
      );
    }
  }

  private async registerGeneratedColumn(
    queryRunner: QueryRunner,
    table: string,
    column: string,
    expression: string,
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
        "VALUES ('GENERATED_COLUMN', NULL, DATABASE(), ?, ?, ?)",
      [table, column, expression],
    );
  }
}
