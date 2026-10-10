// Deleting a product used to soft-delete the product row and leave its
// variants live. A live variant keeps its SKU reserved (the unique index
// covers live rows only), so re-creating a product with the same title -
// which derives the same SKU - failed for ever after.
//
// Deletion now retires the variants with their product. This brings the
// rows already left behind into line: each takes its product's deletion
// time. Nothing to undo on the way down - it only marks rows that belong to
// deleted products.
import { MigrationInterface, QueryRunner } from 'typeorm';

export class RetireVariantsOfDeletedProducts1791000000000 implements MigrationInterface {
  name = 'RetireVariantsOfDeletedProducts1791000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'UPDATE `product_variants` v ' +
        'INNER JOIN `products` p ON p.`id` = v.`product_id` ' +
        'SET v.`deleted_at` = p.`deleted_at` ' +
        'WHERE p.`deleted_at` IS NOT NULL AND v.`deleted_at` IS NULL',
    );
  }

  public async down(): Promise<void> {
    // Intentionally empty - see above.
  }
}
