import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { ShippingService } from './shipping.service';
import { ShippingMethod } from './entities/shipping-method.entity';
import { ShippingZone } from './entities/shipping-zone.entity';
import { ShippingRate } from './entities/shipping-rate.entity';
import { Address } from '../address/entities/address.entity';
import { ProductVariant } from '../products/entities/product-variant.entity';
import { ErrorCodes } from '../common/errors/error-codes';

const repo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn(),
  findOneBy: jest.fn(),
  create: jest.fn((data) => data),
  save: jest.fn((data) => Promise.resolve({ id: 1, ...data })),
  update: jest.fn(),
  softDelete: jest.fn().mockResolvedValue({ affected: 1 }),
});

describe('ShippingService', () => {
  let service: ShippingService;
  let methods: ReturnType<typeof repo>;
  let zones: ReturnType<typeof repo>;
  let rates: ReturnType<typeof repo>;

  const method = (overrides: Record<string, unknown> = {}) => ({
    id: 1,
    code: 'post',
    title: 'پست پیشتاز',
    description: null,
    is_active: true,
    sort_order: 0,
    supports_cash_on_delivery: true,
    estimated_days_min: 2,
    estimated_days_max: 4,
    ...overrides,
  });
  const rate = (overrides: Record<string, unknown> = {}) => ({
    id: 1,
    method: method(),
    base_cost: 50_000,
    per_kg_cost: 20_000,
    free_shipping_threshold: null,
    cash_on_delivery_fee: 15_000,
    is_active: true,
    ...overrides,
  });

  beforeEach(async () => {
    methods = repo();
    zones = repo();
    rates = repo();

    const moduleRef = await Test.createTestingModule({
      providers: [
        ShippingService,
        { provide: getRepositoryToken(ShippingMethod), useValue: methods },
        { provide: getRepositoryToken(ShippingZone), useValue: zones },
        { provide: getRepositoryToken(ShippingRate), useValue: rates },
        { provide: getRepositoryToken(Address), useValue: repo() },
        { provide: getRepositoryToken(ProductVariant), useValue: repo() },
      ],
    }).compile();

    service = moduleRef.get(ShippingService);
  });

  describe('zones', () => {
    it('matches the province that lists it', async () => {
      zones.find.mockResolvedValue([
        { id: 1, title: 'تهران', provinces: ['تهران'], is_default: false },
        { id: 2, title: 'سایر', provinces: [], is_default: true },
      ]);

      expect((await service.resolveZone('تهران'))?.id).toBe(1);
    });

    it('falls back to the default zone for anywhere else', async () => {
      zones.find.mockResolvedValue([
        { id: 1, title: 'تهران', provinces: ['تهران'], is_default: false },
        { id: 2, title: 'سایر', provinces: [], is_default: true },
      ]);

      expect((await service.resolveZone('یزد'))?.id).toBe(2);
    });

    it('answers null when the shop has no zones at all', async () => {
      expect(await service.resolveZone('تهران')).toBeNull();
    });

    // Typed on an Arabic keyboard (ي, ك), with a half-space instead of a
    // space: the same province, which used to fall to the default zone.
    it('matches a province however it was typed', async () => {
      zones.find.mockResolvedValue([
        {
          id: 1,
          title: 'شمال‌غرب',
          provinces: ['آذربایجان شرقی', 'کرمانشاه'],
          is_default: false,
        },
        { id: 2, title: 'سایر', provinces: [], is_default: true },
      ]);

      expect((await service.resolveZone('آذربايجان‌شرقی '))?.id).toBe(1);
      expect((await service.resolveZone('كرمانشاه'))?.id).toBe(1);
    });
  });

  describe('rates', () => {
    // (method, zone) is unique across all rows, removed ones included, so
    // re-adding a rate that was deleted used to hit the index with a 500.
    it('brings a removed rate back instead of inserting a second row', async () => {
      methods.findOne.mockResolvedValue(method());
      zones.findOneBy.mockResolvedValue({ id: 3 });
      rates.findOne.mockResolvedValue({
        id: 9,
        base_cost: 1,
        per_kg_cost: 0,
        is_active: true,
        deleted_at: new Date(),
      });

      await service.upsertRate(1, { zoneId: 3, base_cost: 40_000 });

      expect(rates.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ withDeleted: true }),
      );
      expect(rates.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 9, deleted_at: null, base_cost: 40_000 }),
      );
    });
  });

  describe('pricing (Toman)', () => {
    beforeEach(() => {
      zones.find.mockResolvedValue([
        { id: 1, provinces: ['تهران'], is_default: true },
      ]);
    });

    it('charges the base cost for anything up to one kilogram', async () => {
      rates.find.mockResolvedValue([rate()]);

      const [option] = await service.quote('تهران', 800, 1_000_000);

      expect(option.cost).toBe(50_000);
      expect(option.estimatedDaysMin).toBe(2);
    });

    it('adds the per-kilogram cost for every started kilogram after the first', async () => {
      rates.find.mockResolvedValue([rate()]);

      const [option] = await service.quote('تهران', 2_100, 1_000_000);

      expect(option.cost).toBe(90_000);
    });

    it('ships free once the order passes the threshold', async () => {
      rates.find.mockResolvedValue([
        rate({ free_shipping_threshold: 2_000_000 }),
      ]);

      const [option] = await service.quote('تهران', 5_000, 2_000_000);

      expect(option.cost).toBe(0);
      expect(option.freeShippingApplied).toBe(true);
    });

    it('still charges just below the threshold', async () => {
      rates.find.mockResolvedValue([
        rate({ free_shipping_threshold: 2_000_000 }),
      ]);

      const [option] = await service.quote('تهران', 500, 1_999_999);

      expect(option.cost).toBe(50_000);
    });

    it('leaves out methods that are switched off', async () => {
      rates.find.mockResolvedValue([
        rate({ method: method({ is_active: false }) }),
      ]);

      expect(await service.quote('تهران', 500, 0)).toEqual([]);
    });
  });

  describe('priceForOrder', () => {
    beforeEach(() => {
      zones.find.mockResolvedValue([
        { id: 1, provinces: [], is_default: true },
      ]);
    });

    it('answers null when nothing is configured', async () => {
      expect(
        await service.priceForOrder({
          province: 'تهران',
          weightGrams: 0,
          goodsTotal: 0,
        }),
      ).toBeNull();
    });

    it('uses the only method without asking the customer to choose', async () => {
      rates.find.mockResolvedValue([rate()]);

      const option = await service.priceForOrder({
        province: 'تهران',
        weightGrams: 0,
        goodsTotal: 0,
      });

      expect(option?.methodId).toBe(1);
    });

    it('refuses to choose when there are several', async () => {
      rates.find.mockResolvedValue([
        rate(),
        rate({
          id: 2,
          method: method({ id: 2, code: 'tipax', title: 'تیپاکس' }),
        }),
      ]);

      await expect(
        service.priceForOrder({
          province: 'تهران',
          weightGrams: 0,
          goodsTotal: 0,
        }),
      ).rejects.toMatchObject({ code: ErrorCodes.SHIPPING_METHOD_REQUIRED });
    });

    it('refuses a method that does not serve this address', async () => {
      rates.find.mockResolvedValue([rate()]);

      await expect(
        service.priceForOrder({
          province: 'تهران',
          weightGrams: 0,
          goodsTotal: 0,
          methodId: 99,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
