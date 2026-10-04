// Attributes the shop defines for itself: colour, size, storage, volume.
// Variants stop being described by free text and start pointing at rows,
// which is what makes filtering and the option picker possible.
//
// Existing variants are migrated from their `options` JSON: each key
// becomes an attribute, each distinct value an option, and every variant
// is linked to the rows it was already describing. Nothing is lost and
// nothing has to be re-entered.
import { MigrationInterface, QueryRunner } from 'typeorm';

interface VariantOptionsRow {
  id: number;
  options: string | Record<string, string> | null;
}

export class ProductAttributes1790700000000 implements MigrationInterface {
  name = 'ProductAttributes1790700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.createTables(queryRunner);
    await this.backfillFromVariantOptions(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of [
      'variant_attribute_values',
      'product_attribute_values',
      'category_attributes',
      'attribute_options',
      'attributes',
    ]) {
      await queryRunner.query(`DROP TABLE IF EXISTS \`${table}\``);
    }
    await queryRunner.query(
      "DELETE FROM `typeorm_metadata` WHERE `type` = 'GENERATED_COLUMN' AND `table` = 'attributes'",
    );
  }

  private async createTables(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('attributes'))) {
      await queryRunner.query(
        'CREATE TABLE `attributes` (' +
          '`id` int NOT NULL AUTO_INCREMENT, ' +
          '`title` varchar(255) NOT NULL, ' +
          '`code` varchar(190) NOT NULL, ' +
          "`type` enum('select','color','number','text','boolean') NOT NULL DEFAULT 'select', " +
          '`unit` varchar(20) NULL, ' +
          '`is_variant_axis` tinyint NOT NULL DEFAULT 0, ' +
          '`is_filterable` tinyint NOT NULL DEFAULT 1, ' +
          '`sort_order` int NOT NULL DEFAULT 0, ' +
          '`created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ' +
          '`updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), ' +
          '`deleted_at` datetime(6) NULL, ' +
          '`active_code` varchar(190) AS (IF(`deleted_at` IS NULL, `code`, NULL)) STORED, ' +
          'UNIQUE INDEX `UQ_attribute_active_code` (`active_code`), ' +
          'PRIMARY KEY (`id`)) ENGINE=InnoDB',
      );
      await queryRunner.query(
        'CREATE TABLE IF NOT EXISTS `typeorm_metadata` (`type` varchar(255) NOT NULL, ' +
          '`database` varchar(255) NULL, `schema` varchar(255) NULL, `table` varchar(255) NULL, ' +
          '`name` varchar(255) NULL, `value` text NULL) ENGINE=InnoDB',
      );
      await queryRunner.query(
        'INSERT INTO `typeorm_metadata`(`type`, `database`, `schema`, `table`, `name`, `value`) ' +
          "VALUES ('GENERATED_COLUMN', NULL, DATABASE(), 'attributes', 'active_code', " +
          "'IF(`deleted_at` IS NULL, `code`, NULL)')",
      );
    }

    if (!(await queryRunner.hasTable('attribute_options'))) {
      await queryRunner.query(
        'CREATE TABLE `attribute_options` (' +
          '`id` int NOT NULL AUTO_INCREMENT, ' +
          '`attribute_id` int NOT NULL, ' +
          '`value` varchar(255) NOT NULL, ' +
          '`slug` varchar(190) NOT NULL, ' +
          '`hex` varchar(9) NULL, ' +
          '`sort_order` int NOT NULL DEFAULT 0, ' +
          '`numeric_value` decimal(12,3) NULL, ' +
          '`created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ' +
          '`updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), ' +
          '`deleted_at` datetime(6) NULL, ' +
          'INDEX `IDX_attribute_option_attribute` (`attribute_id`), ' +
          'PRIMARY KEY (`id`)) ENGINE=InnoDB',
      );
      await queryRunner.query(
        'ALTER TABLE `attribute_options` ADD CONSTRAINT `FK_attribute_option_attribute` ' +
          'FOREIGN KEY (`attribute_id`) REFERENCES `attributes`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
      );
    }

    if (!(await queryRunner.hasTable('category_attributes'))) {
      await queryRunner.query(
        'CREATE TABLE `category_attributes` (' +
          '`id` int NOT NULL AUTO_INCREMENT, ' +
          '`category_id` int NOT NULL, ' +
          '`attribute_id` int NOT NULL, ' +
          '`is_required` tinyint NOT NULL DEFAULT 0, ' +
          '`sort_order` int NOT NULL DEFAULT 0, ' +
          'UNIQUE INDEX `UQ_category_attribute` (`category_id`, `attribute_id`), ' +
          'PRIMARY KEY (`id`)) ENGINE=InnoDB',
      );
      await queryRunner.query(
        'ALTER TABLE `category_attributes` ADD CONSTRAINT `FK_category_attribute_category` ' +
          'FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
      );
      await queryRunner.query(
        'ALTER TABLE `category_attributes` ADD CONSTRAINT `FK_category_attribute_attribute` ' +
          'FOREIGN KEY (`attribute_id`) REFERENCES `attributes`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
      );
    }

    if (!(await queryRunner.hasTable('variant_attribute_values'))) {
      await queryRunner.query(
        'CREATE TABLE `variant_attribute_values` (' +
          '`id` int NOT NULL AUTO_INCREMENT, ' +
          '`variant_id` int NOT NULL, ' +
          '`attribute_id` int NOT NULL, ' +
          '`option_id` int NOT NULL, ' +
          'UNIQUE INDEX `UQ_variant_attribute` (`variant_id`, `attribute_id`), ' +
          'INDEX `IDX_variant_value_option` (`option_id`), ' +
          'PRIMARY KEY (`id`)) ENGINE=InnoDB',
      );
      for (const [constraint, column, target] of [
        ['FK_variant_value_variant', 'variant_id', 'product_variants'],
        ['FK_variant_value_attribute', 'attribute_id', 'attributes'],
        ['FK_variant_value_option', 'option_id', 'attribute_options'],
      ]) {
        await queryRunner.query(
          `ALTER TABLE \`variant_attribute_values\` ADD CONSTRAINT \`${constraint}\` ` +
            `FOREIGN KEY (\`${column}\`) REFERENCES \`${target}\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
      }
    }

    if (!(await queryRunner.hasTable('product_attribute_values'))) {
      await queryRunner.query(
        'CREATE TABLE `product_attribute_values` (' +
          '`id` int NOT NULL AUTO_INCREMENT, ' +
          '`product_id` int NOT NULL, ' +
          '`attribute_id` int NOT NULL, ' +
          '`option_id` int NULL, ' +
          '`value_text` varchar(500) NULL, ' +
          '`value_number` decimal(12,3) NULL, ' +
          '`value_boolean` tinyint NULL, ' +
          'UNIQUE INDEX `UQ_product_attribute` (`product_id`, `attribute_id`), ' +
          'INDEX `IDX_product_value_option` (`option_id`), ' +
          'PRIMARY KEY (`id`)) ENGINE=InnoDB',
      );
      for (const [constraint, column, target] of [
        ['FK_product_value_product', 'product_id', 'products'],
        ['FK_product_value_attribute', 'attribute_id', 'attributes'],
        ['FK_product_value_option', 'option_id', 'attribute_options'],
      ]) {
        await queryRunner.query(
          `ALTER TABLE \`product_attribute_values\` ADD CONSTRAINT \`${constraint}\` ` +
            `FOREIGN KEY (\`${column}\`) REFERENCES \`${target}\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
      }
    }
  }

  // Reads what the shop already typed into each variant's options JSON
  // and turns it into attributes, options and links. Runs once: it skips
  // variants that already have structured values.
  private async backfillFromVariantOptions(
    queryRunner: QueryRunner,
  ): Promise<void> {
    if (!(await queryRunner.hasTable('product_variants'))) return;

    const variants: VariantOptionsRow[] = await queryRunner.query(
      'SELECT v.`id`, v.`options` FROM `product_variants` v ' +
        'WHERE v.`options` IS NOT NULL ' +
        'AND NOT EXISTS (SELECT 1 FROM `variant_attribute_values` x WHERE x.`variant_id` = v.`id`)',
    );
    if (variants.length === 0) return;

    const attributeIds = new Map<string, number>();
    const optionIds = new Map<string, number>();

    for (const variant of variants) {
      const parsed =
        typeof variant.options === 'string'
          ? (JSON.parse(variant.options) as Record<string, string>)
          : variant.options;
      if (!parsed || typeof parsed !== 'object') continue;

      for (const [title, value] of Object.entries(parsed)) {
        if (!title || value === null || value === undefined) continue;
        const label = String(value);

        let attributeId = attributeIds.get(title);
        if (!attributeId) {
          const code = this.toCode(title);
          const existing: Array<{ id: number }> = await queryRunner.query(
            'SELECT `id` FROM `attributes` WHERE `code` = ? AND `deleted_at` IS NULL',
            [code],
          );
          if (existing.length > 0) {
            attributeId = existing[0].id;
          } else {
            const inserted = await queryRunner.query(
              'INSERT INTO `attributes` (`title`, `code`, `type`, `is_variant_axis`, `is_filterable`) ' +
                "VALUES (?, ?, 'select', 1, 1)",
              [title, code],
            );
            attributeId = Number(
              (inserted as { insertId?: number }).insertId ?? 0,
            );
          }
          attributeIds.set(title, attributeId);
        }

        const optionKey = `${attributeId}:${label}`;
        let optionId = optionIds.get(optionKey);
        if (!optionId) {
          const slug = this.toCode(label);
          const existing: Array<{ id: number }> = await queryRunner.query(
            'SELECT `id` FROM `attribute_options` WHERE `attribute_id` = ? AND `slug` = ? AND `deleted_at` IS NULL',
            [attributeId, slug],
          );
          if (existing.length > 0) {
            optionId = existing[0].id;
          } else {
            const inserted = await queryRunner.query(
              'INSERT INTO `attribute_options` (`attribute_id`, `value`, `slug`) VALUES (?, ?, ?)',
              [attributeId, label, slug],
            );
            optionId = Number(
              (inserted as { insertId?: number }).insertId ?? 0,
            );
          }
          optionIds.set(optionKey, optionId);
        }

        await queryRunner.query(
          'INSERT IGNORE INTO `variant_attribute_values` (`variant_id`, `attribute_id`, `option_id`) ' +
            'VALUES (?, ?, ?)',
          [variant.id, attributeId, optionId],
        );
      }
    }
  }

  // Same shape the application's slugify produces: letters and digits
  // kept, everything else a single dash.
  private toCode(value: string): string {
    const slug = value
      .trim()
      .toLowerCase()
      .replace(/[\u064A]/g, '\u06CC')
      .replace(/[\u0643]/g, '\u06A9')
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 180);
    return slug || `a-${Date.now()}`;
  }
}
