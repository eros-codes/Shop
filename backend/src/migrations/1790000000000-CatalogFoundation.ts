import { MigrationInterface, QueryRunner } from 'typeorm';
import { uniqueSlug } from '../common/utils/slugify';

// Brands, a category tree, slugs, sale prices, stored ratings and weight.
// Backfills a slug for every existing product and category.
export class CatalogFoundation1790000000000 implements MigrationInterface {
  name = 'CatalogFoundation1790000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.createBrands(queryRunner);
    await this.extendCategories(queryRunner);
    await this.extendProducts(queryRunner);
    await this.backfillRatings(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `brands`');
    for (const [table, columns] of [
      ['categories', ['active_slug', 'slug', 'parent_id']],
      [
        'products',
        [
          'active_slug',
          'slug',
          'sale_price',
          'sale_starts_at',
          'sale_ends_at',
          'rating_avg',
          'rating_count',
          'weight_grams',
          'is_published',
          'brand_id',
        ],
      ],
    ] as Array<[string, string[]]>) {
      if (!(await queryRunner.hasTable(table))) continue;
      for (const column of columns) {
        if (await queryRunner.hasColumn(table, column)) {
          await queryRunner.query(
            `ALTER TABLE \`${table}\` DROP COLUMN \`${column}\``,
          );
        }
      }
    }
  }

  private async createBrands(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('brands')) return;
    await queryRunner.query(
      'CREATE TABLE `brands` (' +
        '`id` int NOT NULL AUTO_INCREMENT, ' +
        '`title` varchar(255) NOT NULL, ' +
        '`slug` varchar(190) NOT NULL, ' +
        '`description` varchar(500) NULL, ' +
        '`logo_url` varchar(500) NULL, ' +
        '`created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ' +
        '`updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), ' +
        '`deleted_at` datetime(6) NULL, ' +
        '`active_slug` varchar(190) AS (IF(`deleted_at` IS NULL, `slug`, NULL)) STORED, ' +
        'UNIQUE INDEX `UQ_brands_active_slug` (`active_slug`), ' +
        'PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );
    await this.registerGeneratedColumn(queryRunner, 'brands', 'active_slug');
  }

  private async extendCategories(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('categories'))) return;

    if (!(await queryRunner.hasColumn('categories', 'parent_id'))) {
      await queryRunner.query(
        'ALTER TABLE `categories` ADD `parent_id` int NULL',
      );
      await queryRunner.query(
        'ALTER TABLE `categories` ADD CONSTRAINT `FK_categories_parent` ' +
          'FOREIGN KEY (`parent_id`) REFERENCES `categories`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION',
      );
    }

    if (!(await queryRunner.hasColumn('categories', 'slug'))) {
      await queryRunner.query(
        'ALTER TABLE `categories` ADD `slug` varchar(190) NULL',
      );
      await this.backfillSlugs(queryRunner, 'categories', 'category');
      await queryRunner.query(
        'ALTER TABLE `categories` CHANGE `slug` `slug` varchar(190) NOT NULL',
      );
      await queryRunner.query(
        'ALTER TABLE `categories` ADD `active_slug` varchar(190) ' +
          'AS (IF(`deleted_at` IS NULL, `slug`, NULL)) STORED',
      );
      await queryRunner.query(
        'CREATE UNIQUE INDEX `UQ_categories_active_slug` ON `categories` (`active_slug`)',
      );
      await this.registerGeneratedColumn(
        queryRunner,
        'categories',
        'active_slug',
      );
    }
  }

  private async extendProducts(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('products'))) return;

    const columns: Array<[string, string]> = [
      ['sale_price', 'int UNSIGNED NULL'],
      ['sale_starts_at', 'datetime NULL'],
      ['sale_ends_at', 'datetime NULL'],
      ['rating_avg', "decimal(3,2) NOT NULL DEFAULT '0.00'"],
      ['rating_count', 'int UNSIGNED NOT NULL DEFAULT 0'],
      ['weight_grams', 'int UNSIGNED NOT NULL DEFAULT 0'],
      ['is_published', 'tinyint NOT NULL DEFAULT 1'],
    ];
    for (const [name, definition] of columns) {
      if (!(await queryRunner.hasColumn('products', name))) {
        await queryRunner.query(
          `ALTER TABLE \`products\` ADD \`${name}\` ${definition}`,
        );
      }
    }

    if (!(await queryRunner.hasColumn('products', 'brand_id'))) {
      await queryRunner.query('ALTER TABLE `products` ADD `brand_id` int NULL');
      await queryRunner.query(
        'ALTER TABLE `products` ADD CONSTRAINT `FK_products_brand` ' +
          'FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION',
      );
    }

    if (!(await queryRunner.hasColumn('products', 'slug'))) {
      await queryRunner.query(
        'ALTER TABLE `products` ADD `slug` varchar(190) NULL',
      );
      await this.backfillSlugs(queryRunner, 'products', 'product');
      await queryRunner.query(
        'ALTER TABLE `products` CHANGE `slug` `slug` varchar(190) NOT NULL',
      );
      await queryRunner.query(
        'ALTER TABLE `products` ADD `active_slug` varchar(190) ' +
          'AS (IF(`deleted_at` IS NULL, `slug`, NULL)) STORED',
      );
      await queryRunner.query(
        'CREATE UNIQUE INDEX `UQ_products_active_slug` ON `products` (`active_slug`)',
      );
      await this.registerGeneratedColumn(
        queryRunner,
        'products',
        'active_slug',
      );
    }
  }

  private async backfillRatings(queryRunner: QueryRunner): Promise<void> {
    if (
      !(await queryRunner.hasTable('products')) ||
      !(await queryRunner.hasTable('comments'))
    ) {
      return;
    }
    await queryRunner.query(
      'UPDATE `products` p ' +
        'LEFT JOIN (SELECT `product_id`, AVG(`rate`) avg_rate, COUNT(`rate`) rate_count ' +
        "FROM `comments` WHERE `status` = 'approved' AND `rate` IS NOT NULL AND `deleted_at` IS NULL " +
        'GROUP BY `product_id`) c ON c.`product_id` = p.`id` ' +
        'SET p.`rating_avg` = COALESCE(c.avg_rate, 0), p.`rating_count` = COALESCE(c.rate_count, 0)',
    );
  }

  private async backfillSlugs(
    queryRunner: QueryRunner,
    table: string,
    fallback: string,
  ): Promise<void> {
    const rows: Array<{ id: number; title: string }> = await queryRunner.query(
      `SELECT \`id\`, \`title\` FROM \`${table}\``,
    );
    const taken = new Set<string>();
    for (const row of rows) {
      const slug = uniqueSlug(row.title ?? '', taken, `${fallback}-${row.id}`);
      taken.add(slug);
      await queryRunner.query(
        `UPDATE \`${table}\` SET \`slug\` = ? WHERE \`id\` = ?`,
        [slug, row.id],
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
        "VALUES ('GENERATED_COLUMN', NULL, DATABASE(), ?, ?, 'IF(`deleted_at` IS NULL, `slug`, NULL)')",
      [table, column],
    );
  }
}
