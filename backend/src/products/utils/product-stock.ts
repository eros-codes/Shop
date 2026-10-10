import { EntityManager, In } from 'typeorm';
import { ProductVariant } from '../entities/product-variant.entity';
import { Product } from '../entities/product.entity';

export interface StockLine {
  variantId: number;
  quantity: number;
}

export function toStockLines(
  items: Array<{ variant?: { id: number } | null; quantity: number }> = [],
): StockLine[] {
  return items
    .filter((item) => !!item.variant)
    .map((item) => ({ variantId: item.variant!.id, quantity: item.quantity }));
}

// Atomic UPDATE ... stock = stock + n, in ascending id order (the order
// checkout locks rows in). Read-modify-write here would silently lose a
// concurrent decrement. Returns the product ids touched.
export async function restoreStock(
  manager: EntityManager,
  lines: StockLine[],
): Promise<number[]> {
  const totals = new Map<number, number>();
  for (const { variantId, quantity } of lines) {
    if (!variantId || !(quantity > 0)) {
      continue;
    }
    totals.set(variantId, (totals.get(variantId) ?? 0) + quantity);
  }
  if (totals.size === 0) {
    return [];
  }

  const variantIds = [...totals.keys()].sort((a, b) => a - b);
  const variants = manager.getRepository(ProductVariant);

  const owners = await variants.find({
    select: { id: true, product: { id: true } },
    where: { id: In(variantIds) },
    relations: { product: true },
    withDeleted: true,
  });
  const productIds = [
    ...new Set(owners.map((variant) => variant.product.id)),
  ].sort((a, b) => a - b);

  // Checkout locks product rows and then their variants. Giving stock back
  // used to take them the other way round - variants by the increment,
  // products by the sync below - so a cancellation and a checkout of the
  // same product could each hold what the other was waiting for.
  if (productIds.length > 0) {
    await manager.find(Product, {
      select: { id: true },
      where: { id: In(productIds) },
      withDeleted: true,
      order: { id: 'ASC' },
      lock: { mode: 'pessimistic_write' },
    });
  }

  for (const variantId of variantIds) {
    await variants.increment(
      { id: variantId },
      'stock',
      totals.get(variantId)!,
    );
  }

  await syncProductStock(manager, productIds);
  return productIds;
}

// products.stock is the sum of a product's live variants, recomputed
// rather than adjusted so it cannot drift.
export async function syncProductStock(
  manager: EntityManager,
  productIds: number[],
): Promise<void> {
  const ids = [...new Set(productIds)].filter((id) => !!id);
  if (ids.length === 0) return;

  await manager.query(
    'UPDATE `products` p SET p.`stock` = (' +
      'SELECT COALESCE(SUM(v.`stock`), 0) FROM `product_variants` v ' +
      'WHERE v.`product_id` = p.`id` AND v.`deleted_at` IS NULL AND v.`is_active` = 1' +
      `) WHERE p.\`id\` IN (${ids.map(() => '?').join(', ')})`,
    ids,
  );
}
