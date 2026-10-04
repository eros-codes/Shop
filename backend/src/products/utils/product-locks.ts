import { NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { In } from 'typeorm';
import { Product } from '../entities/product.entity';
import { ProductVariant } from '../entities/product-variant.entity';

export type RowLockMode = 'pessimistic_read' | 'pessimistic_write';

export async function lockActiveProduct(
  manager: EntityManager,
  productId: number,
  mode: RowLockMode,
): Promise<Product> {
  const product = await manager.findOne(Product, {
    select: { id: true, title: true, price: true, stock: true },
    where: { id: productId },
    lock: { mode },
  });
  if (!product) {
    throw new NotFoundException(`Product with ID ${productId} not found`);
  }
  return product;
}

export async function lockVariantsForCheckout(
  manager: EntityManager,
  variantIds: number[],
): Promise<Map<number, ProductVariant>> {
  const ids = [...new Set(variantIds)].sort((a, b) => a - b);
  if (ids.length === 0) {
    return new Map();
  }

  const variants = await manager.find(ProductVariant, {
    where: { id: In(ids) },
    order: { id: 'ASC' },
    lock: { mode: 'pessimistic_write' },
  });

  const productIds = [
    ...new Set(
      variants.map(
        (variant) =>
          (variant as unknown as { product_id?: number }).product_id ?? 0,
      ),
    ),
  ];
  void productIds;
  return new Map(variants.map((variant) => [variant.id, variant]));
}
