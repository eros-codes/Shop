import { EntityManager, In } from 'typeorm';
import { Product } from '../entities/product.entity';
import { BasketItem } from '../../users/entities/basket-item.entity';

// Retiring a product takes its variants with it. Deleting the product row
// alone left them live, and a live variant keeps its SKU reserved: the next
// product with the same title derives the same SKU ("phone-default") and
// could never be created. The rows stay (soft-deleted) for order history.
export async function softDeleteProducts(
  manager: EntityManager,
  productIds: number[],
): Promise<void> {
  const ids = [...new Set(productIds)].filter((id) => !!id);
  if (ids.length === 0) return;

  await manager.softDelete(Product, { id: In(ids) });
  await manager.query(
    'UPDATE `product_variants` SET `deleted_at` = NOW(6) ' +
      `WHERE \`deleted_at\` IS NULL AND \`product_id\` IN (${ids.map(() => '?').join(', ')})`,
    ids,
  );
  await manager
    .createQueryBuilder()
    .delete()
    .from(BasketItem)
    .where('productId IN (:...ids)', { ids })
    .execute();
}
