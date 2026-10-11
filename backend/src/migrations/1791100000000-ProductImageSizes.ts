// Uploaded photos are kept at several widths (400 / 800 / 1600, WebP), so
// a product card no longer downloads a full camera photo to draw 180px.
// This column lists them: [{ width, url }], smallest first. Images from
// before it (and the demo's SVG drawings) have NULL and are served as-is.
import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProductImageSizes1791100000000 implements MigrationInterface {
  name = 'ProductImageSizes1791100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('product_images', 'sizes'))) {
      await queryRunner.query(
        'ALTER TABLE `product_images` ADD `sizes` json NULL',
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('product_images', 'sizes')) {
      await queryRunner.query(
        'ALTER TABLE `product_images` DROP COLUMN `sizes`',
      );
    }
  }
}
