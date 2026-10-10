import { NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Product } from '../entities/product.entity';
import { AppError } from '../../common/errors/app-error';
import { ErrorCodes } from '../../common/errors/error-codes';

export type RowLockMode = 'pessimistic_read' | 'pessimistic_write';

export async function lockActiveProduct(
  manager: EntityManager,
  productId: number,
  mode: RowLockMode,
): Promise<Product> {
  const product = await manager.findOne(Product, {
    select: {
      id: true,
      title: true,
      price: true,
      sale_price: true,
      stock: true,
      is_published: true,
    },
    where: { id: productId },
    lock: { mode },
  });
  if (!product) {
    throw new NotFoundException(`Product with ID ${productId} not found`);
  }
  return product;
}

// For what a customer does with a product - basket, favourites. A draft is
// hidden from the shop, so it cannot be collected by id either. (The admin
// paths that also lock products deliberately do not call this.)
export function assertPublished(product: Product): void {
  if (!product.is_published) {
    throw AppError.badRequest(
      ErrorCodes.VARIANT_NOT_FOR_SALE,
      `${product.title} is not for sale`,
      { productId: product.id },
    );
  }
}
