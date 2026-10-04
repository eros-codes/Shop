import { MigrationInterface, QueryRunner } from 'typeorm';

// Foreign keys, unique indexes and the soft-delete columns the catalogue
// and basket rely on.
export class Phase2DataIntegrity1789624094221 implements MigrationInterface {
  name = 'Phase2DataIntegrity1789624094221';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.fixNegativeProductNumbers(queryRunner);
    await this.dedupeCategoryTitles(queryRunner);
    await this.renumberProductImages(queryRunner);
    await this.mergeDuplicateBasketLines(queryRunner);
    await this.dedupeBookmarks(queryRunner);
  }

  public async down(): Promise<void> {}

  private async fixNegativeProductNumbers(queryRunner: QueryRunner) {
    if (!(await queryRunner.hasTable('products'))) return;
    await queryRunner.query(
      'UPDATE `products` SET `price` = 0, `stock` = 0 WHERE `price` < 0',
    );
    await queryRunner.query(
      'UPDATE `products` SET `stock` = 0 WHERE `stock` < 0',
    );
  }

  private async dedupeCategoryTitles(queryRunner: QueryRunner) {
    if (!(await queryRunner.hasTable('categories'))) return;
    const hasDeletedAt = await queryRunner.hasColumn(
      'categories',
      'deleted_at',
    );
    const activeOnly = hasDeletedAt ? 'WHERE `deleted_at` IS NULL' : '';
    const activeOnlyAliased = hasDeletedAt ? 'AND c.`deleted_at` IS NULL' : '';

    await queryRunner.query(
      'UPDATE `categories` SET `title` = TRIM(`title`) WHERE `title` <> TRIM(`title`)',
    );

    const duplicates: Array<{ id: number | string }> = await queryRunner.query(
      `SELECT c.id FROM \`categories\` c
       INNER JOIN (
         SELECT MIN(id) AS keep_id, title FROM \`categories\` ${activeOnly} GROUP BY title HAVING COUNT(*) > 1
       ) d ON c.title = d.title AND c.id <> d.keep_id
       WHERE 1 = 1 ${activeOnlyAliased}`,
    );
    const ids = duplicates.map((row) => Number(row.id));
    for (const chunk of this.chunks(ids, 500)) {
      await queryRunner.query(
        `UPDATE \`categories\` SET \`title\` = CONCAT(LEFT(\`title\`, 240), ' #', \`id\`) WHERE \`id\` IN (${chunk.map(() => '?').join(', ')})`,
        chunk,
      );
    }
  }

  private async renumberProductImages(queryRunner: QueryRunner) {
    if (!(await queryRunner.hasTable('product_images'))) return;
    const rows: Array<{
      id: number | string;
      productId: number | string | null;
      order: number | string;
    }> = await queryRunner.query(
      'SELECT `id`, `productId`, `order` FROM `product_images` ORDER BY `productId` ASC, `order` ASC, `id` ASC',
    );

    const changes: Array<{ id: number; order: number }> = [];
    let currentProduct: string | null = null;
    let next = 0;
    for (const row of rows) {
      const productKey = String(row.productId);
      if (productKey !== currentProduct) {
        currentProduct = productKey;
        next = 0;
      }
      if (Number(row.order) !== next) {
        changes.push({ id: Number(row.id), order: next });
      }
      next += 1;
    }

    for (const chunk of this.chunks(changes, 500)) {
      const cases = chunk.map(() => 'WHEN ? THEN ?').join(' ');
      const params = chunk.flatMap((change) => [change.id, change.order]);
      await queryRunner.query(
        `UPDATE \`product_images\` SET \`order\` = CASE \`id\` ${cases} END WHERE \`id\` IN (${chunk.map(() => '?').join(', ')}) ORDER BY \`order\` ASC, \`id\` ASC`,
        [...params, ...chunk.map((change) => change.id)],
      );
    }
  }

  private async mergeDuplicateBasketLines(queryRunner: QueryRunner) {
    if (!(await queryRunner.hasTable('basket_items'))) return;
    await queryRunner.query('DELETE FROM `basket_items` WHERE `quantity` <= 0');

    const groups: Array<{
      userId: number | string;
      productId: number | string;
      keepId: number | string;
      total: number | string;
    }> = await queryRunner.query(
      'SELECT `userId`, `productId`, MIN(`id`) AS keepId, SUM(`quantity`) AS total FROM `basket_items` GROUP BY `userId`, `productId` HAVING COUNT(*) > 1',
    );
    for (const group of groups) {
      await queryRunner.query(
        'DELETE FROM `basket_items` WHERE `userId` = ? AND `productId` = ? AND `id` <> ?',
        [group.userId, group.productId, group.keepId],
      );
      await queryRunner.query(
        'UPDATE `basket_items` SET `quantity` = ? WHERE `id` = ?',
        [Math.min(Number(group.total), 2147483647), group.keepId],
      );
    }
  }

  private async dedupeBookmarks(queryRunner: QueryRunner) {
    if (!(await queryRunner.hasTable('bookmarks'))) return;
    await queryRunner.query(
      'DELETE b FROM `bookmarks` b INNER JOIN `bookmarks` keeper ON keeper.`user_id` = b.`user_id` AND keeper.`product_id` = b.`product_id` AND keeper.`id` < b.`id`',
    );
  }

  private chunks<T>(items: T[], size: number): T[][] {
    const result: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
      result.push(items.slice(i, i + size));
    }
    return result;
  }
}
