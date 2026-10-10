import { restoreStock } from './product-stock';
import { Product } from '../entities/product.entity';

describe('restoreStock', () => {
  // Checkout locks products, then variants. Giving stock back the other way
  // round let a cancellation and a checkout of the same product deadlock.
  it('locks the product rows before it touches their variants', async () => {
    const calls: string[] = [];
    const variants = {
      find: jest.fn().mockResolvedValue([
        { id: 12, product: { id: 4 } },
        { id: 11, product: { id: 3 } },
      ]),
      increment: jest.fn(() => {
        calls.push('increment');
        return Promise.resolve();
      }),
    };
    const manager = {
      getRepository: jest.fn(() => variants),
      find: jest.fn((entity: unknown) => {
        calls.push(entity === Product ? 'lock-products' : 'other');
        return Promise.resolve([]);
      }),
      query: jest.fn(() => {
        calls.push('sync');
        return Promise.resolve();
      }),
    };

    const productIds = await restoreStock(manager as never, [
      { variantId: 12, quantity: 1 },
      { variantId: 11, quantity: 2 },
    ]);

    expect(productIds).toEqual([3, 4]);
    expect(calls).toEqual(['lock-products', 'increment', 'increment', 'sync']);
    expect(manager.find).toHaveBeenCalledWith(
      Product,
      expect.objectContaining({
        order: { id: 'ASC' },
        lock: { mode: 'pessimistic_write' },
      }),
    );
  });

  it('does nothing for an empty list', async () => {
    const manager = { getRepository: jest.fn(), find: jest.fn() };

    await expect(restoreStock(manager as never, [])).resolves.toEqual([]);
    expect(manager.find).not.toHaveBeenCalled();
  });
});
