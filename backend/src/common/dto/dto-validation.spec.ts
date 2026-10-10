import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PaginationQueryDto } from './pagination-query.dto';
import { CreateProductDto } from '../../products/dto/create-product.dto';
import { FilterProductDto } from '../../products/dto/filter-product.dto';
import { CreateOrderDto } from '../../orders/dto/create-order.dto';
import { FilterOrderDto } from '../../orders/dto/filter-order.dto';
import { UpdateCommentDto } from '../../comments/dto/update-comment.dto';
import { CreateCommentDto } from '../../comments/dto/create-comment.dto';
import { CreateCategoryDto } from '../../categories/dto/create-category.dto';
import { LoginDto } from '../../auth/dto/login.dto';
import { VerifyOtpDto } from '../../auth/dto/verify-otp.dto';
import { ResetPasswordDto } from '../../auth/dto/password.dto';
import { CreateAddressDto } from '../../address/dto/create-address.dto';

async function errorsFor<T extends object>(cls: new () => T, plain: object) {
  const instance = plainToInstance(cls, plain);
  const errors = await validate(instance, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return errors.map((error) => error.property);
}

describe('DTO validation', () => {
  it('caps page size and page number (also for DTOs that extend it)', async () => {
    expect(await errorsFor(PaginationQueryDto, { limit: '101' })).toContain(
      'limit',
    );
    expect(await errorsFor(PaginationQueryDto, { page: '10001' })).toContain(
      'page',
    );
    expect(await errorsFor(FilterProductDto, { limit: '1000' })).toContain(
      'limit',
    );
    expect(await errorsFor(FilterOrderDto, { page: '0' })).toContain('page');
    expect(
      await errorsFor(FilterProductDto, { limit: '100', page: '2' }),
    ).toEqual([]);
  });

  const validProduct = {
    title: 'Phone',
    description: 'A phone',
    price: 10,
    stock: 5,
  };

  it('rejects negative price and stock', async () => {
    expect(
      await errorsFor(CreateProductDto, { ...validProduct, price: -1 }),
    ).toContain('price');
    expect(
      await errorsFor(CreateProductDto, { ...validProduct, stock: -5 }),
    ).toContain('stock');
    expect(await errorsFor(CreateProductDto, validProduct)).toEqual([]);
  });

  it('rejects text longer than the VARCHAR(255) columns', async () => {
    expect(
      await errorsFor(CreateProductDto, {
        ...validProduct,
        title: 'x'.repeat(256),
      }),
    ).toContain('title');
    expect(
      await errorsFor(CreateCategoryDto, { title: 'x'.repeat(256) }),
    ).toContain('title');
  });

  it('validates each category id, duplicates and count', async () => {
    expect(
      await errorsFor(CreateProductDto, {
        ...validProduct,
        categoryIds: ['a'],
      }),
    ).toContain('categoryIds');
    expect(
      await errorsFor(CreateProductDto, {
        ...validProduct,
        categoryIds: [1, 1],
      }),
    ).toContain('categoryIds');
    expect(
      await errorsFor(CreateProductDto, { ...validProduct, categoryIds: [0] }),
    ).toContain('categoryIds');
    expect(
      await errorsFor(CreateProductDto, {
        ...validProduct,
        categoryIds: Array.from({ length: 21 }, (_, i) => i + 1),
      }),
    ).toContain('categoryIds');
    expect(
      await errorsFor(CreateProductDto, {
        ...validProduct,
        categoryIds: [1, 2],
      }),
    ).toEqual([]);
  });

  it('order quantities must be positive and an order needs items', async () => {
    const order = { addressId: 1, items: [{ productId: 1, quantity: -3 }] };
    expect(await errorsFor(CreateOrderDto, order)).toContain('items');
    expect(
      await errorsFor(CreateOrderDto, { addressId: 1, items: [] }),
    ).toContain('items');
    expect(
      await errorsFor(CreateOrderDto, {
        addressId: 1,
        items: [{ productId: 1, quantity: 2 }],
      }),
    ).toEqual([]);
  });

  it('an edit can only change the text and the rate', async () => {
    expect(await errorsFor(UpdateCommentDto, { productId: 2 })).toContain(
      'productId',
    );
    expect(await errorsFor(UpdateCommentDto, { parentId: 9 })).toContain(
      'parentId',
    );
    expect(
      await errorsFor(UpdateCommentDto, { comment: 'Better now' }),
    ).toEqual([]);
  });

  it('a review needs a rate, a reply does not', async () => {
    expect(
      await errorsFor(CreateCommentDto, {
        productId: 1,
        comment: 'Great product',
      }),
    ).toContain('rate');
    expect(
      await errorsFor(CreateCommentDto, {
        productId: 1,
        comment: 'Thanks a lot',
        parentId: 3,
      }),
    ).toEqual([]);
  });

  // A phone's Persian keyboard types ۰-۹. Those used to fail every
  // mobile-number pattern, so the customer could not sign in at all.
  describe('Persian and Arabic digits', () => {
    it('accepts a mobile number typed with Persian digits and stores it as ASCII', async () => {
      const dto = plainToInstance(LoginDto, {
        mobile: '۰۹۱۲ ۳۴۵ ۶۷۸۹',
        password: 'Secret123',
      });
      expect(dto.mobile).toBe('09123456789');
      expect(
        await errorsFor(LoginDto, {
          mobile: '۰۹۱۲۳۴۵۶۷۸۹',
          password: 'Secret123',
        }),
      ).toEqual([]);
    });

    it('accepts an OTP typed with Arabic-Indic digits', async () => {
      const dto = plainToInstance(VerifyOtpDto, {
        mobile: '09123456789',
        code: '١٢٣٤٥٦',
      });
      expect(dto.code).toBe('123456');
      expect(
        await errorsFor(VerifyOtpDto, {
          mobile: '09123456789',
          code: '١٢٣٤٥٦',
        }),
      ).toEqual([]);
    });

    it('still rejects a code that is not six digits', async () => {
      expect(
        await errorsFor(ResetPasswordDto, {
          mobile: '09123456789',
          code: '12a456',
          password: 'NewPassword1',
        }),
      ).toContain('code');
    });

    it('checks the shape of postal codes and receiver numbers, whatever the digits', async () => {
      const address = {
        province: 'تهران',
        city: 'تهران',
        address: 'خیابان آزادی',
        postal_code: '۱۲۳۴۵۶۷۸۹۰',
        receiver_mobile: '۰۹۱۲۳۴۵۶۷۸۹',
      };
      expect(await errorsFor(CreateAddressDto, address)).toEqual([]);
      expect(
        await errorsFor(CreateAddressDto, {
          ...address,
          postal_code: 'abcdefghij',
        }),
      ).toContain('postal_code');
      expect(
        await errorsFor(CreateAddressDto, {
          ...address,
          receiver_mobile: 'abcdefghijk',
        }),
      ).toContain('receiver_mobile');
    });

    it('lets a 72-character password - the most reset allows - through sign-in', async () => {
      expect(
        await errorsFor(LoginDto, {
          mobile: '09123456789',
          password: 'A1'.repeat(36),
        }),
      ).toEqual([]);
    });
  });
});
