import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ShippingMethod } from './entities/shipping-method.entity';
import { ShippingZone } from './entities/shipping-zone.entity';
import { ShippingRate } from './entities/shipping-rate.entity';
import {
  CreateShippingMethodDto,
  CreateShippingZoneDto,
  UpdateShippingMethodDto,
  UpdateShippingZoneDto,
  UpsertShippingRateDto,
} from './dto/shipping.dto';
import { slugify } from '../common/utils/slugify';
import { isDuplicateEntryError } from '../common/database/mysql-errors';
import { Address } from '../address/entities/address.entity';
import { ProductVariant } from '../products/entities/product-variant.entity';
import { AppError } from '../common/errors/app-error';
import { normalizePersianText } from '../common/validation/normalize';
import { ErrorCodes } from '../common/errors/error-codes';

export interface ShippingOption {
  methodId: number;
  code: string;
  title: string;
  description?: string | null;
  cost: number;
  freeShippingApplied: boolean;
  cashOnDeliveryFee: number;
  supportsCashOnDelivery: boolean;
  estimatedDaysMin: number;
  estimatedDaysMax: number;
}

@Injectable()
export class ShippingService {
  constructor(
    @InjectRepository(ShippingMethod)
    private readonly methodsRepository: Repository<ShippingMethod>,
    @InjectRepository(ShippingZone)
    private readonly zonesRepository: Repository<ShippingZone>,
    @InjectRepository(ShippingRate)
    private readonly ratesRepository: Repository<ShippingRate>,
    @InjectRepository(Address)
    private readonly addressesRepository: Repository<Address>,
    @InjectRepository(ProductVariant)
    private readonly variantsRepository: Repository<ProductVariant>,
  ) {}

  async createMethod(dto: CreateShippingMethodDto): Promise<ShippingMethod> {
    const code = slugify(dto.code ?? dto.title);
    if (!code) {
      throw new BadRequestException(
        'This title cannot be turned into a code - please provide one explicitly',
      );
    }
    this.assertEtaOrder(dto.estimated_days_min, dto.estimated_days_max);
    try {
      return await this.methodsRepository.save(
        this.methodsRepository.create({ ...dto, code }),
      );
    } catch (error) {
      if (isDuplicateEntryError(error)) {
        throw new ConflictException(
          `A shipping method "${code}" already exists`,
        );
      }
      throw error;
    }
  }

  async findMethods(includeInactive = false): Promise<ShippingMethod[]> {
    return this.methodsRepository.find({
      where: includeInactive ? {} : { is_active: true },
      relations: { rates: { zone: true } },
      order: { sort_order: 'ASC', id: 'ASC' },
    });
  }

  async findMethod(id: number): Promise<ShippingMethod> {
    const method = await this.methodsRepository.findOne({
      where: { id },
      relations: { rates: { zone: true } },
    });
    if (!method) {
      throw new NotFoundException(`Shipping method ${id} not found`);
    }
    return method;
  }

  async updateMethod(
    id: number,
    dto: UpdateShippingMethodDto,
  ): Promise<ShippingMethod> {
    const method = await this.findMethod(id);
    this.assertEtaOrder(
      dto.estimated_days_min ?? method.estimated_days_min,
      dto.estimated_days_max ?? method.estimated_days_max,
    );
    Object.assign(method, dto, dto.code ? { code: slugify(dto.code) } : {});
    try {
      return await this.methodsRepository.save(method);
    } catch (error) {
      if (isDuplicateEntryError(error)) {
        throw new ConflictException('Another shipping method uses that code');
      }
      throw error;
    }
  }

  async removeMethod(id: number): Promise<void> {
    const result = await this.methodsRepository.softDelete({ id });
    if (!result.affected) {
      throw new NotFoundException(`Shipping method ${id} not found`);
    }
  }

  async createZone(dto: CreateShippingZoneDto): Promise<ShippingZone> {
    if (dto.is_default) {
      await this.clearDefaultZone();
    }
    return this.zonesRepository.save(
      this.zonesRepository.create({
        title: dto.title,
        provinces: dto.provinces ?? [],
        is_default: dto.is_default ?? false,
      }),
    );
  }

  async findZones(): Promise<ShippingZone[]> {
    return this.zonesRepository.find({ order: { id: 'ASC' } });
  }

  async updateZone(
    id: number,
    dto: UpdateShippingZoneDto,
  ): Promise<ShippingZone> {
    const zone = await this.zonesRepository.findOneBy({ id });
    if (!zone) {
      throw new NotFoundException(`Shipping zone ${id} not found`);
    }
    if (dto.is_default) {
      await this.clearDefaultZone(id);
    }
    Object.assign(zone, dto);
    return this.zonesRepository.save(zone);
  }

  async removeZone(id: number): Promise<void> {
    const result = await this.zonesRepository.softDelete({ id });
    if (!result.affected) {
      throw new NotFoundException(`Shipping zone ${id} not found`);
    }
  }

  private async clearDefaultZone(exceptId?: number): Promise<void> {
    const current = await this.zonesRepository.find({
      select: { id: true },
      where: { is_default: true },
    });
    const ids = current.map((zone) => zone.id).filter((id) => id !== exceptId);
    if (ids.length > 0) {
      await this.zonesRepository.update({ id: In(ids) }, { is_default: false });
    }
  }

  async upsertRate(
    methodId: number,
    dto: UpsertShippingRateDto,
  ): Promise<ShippingRate> {
    await this.findMethod(methodId);
    const zone = await this.zonesRepository.findOneBy({ id: dto.zoneId });
    if (!zone) {
      throw new NotFoundException(`Shipping zone ${dto.zoneId} not found`);
    }

    // Including a removed one: the (method, zone) pair is unique among all
    // rows, so creating a fresh rate where one was deleted hit the unique
    // index and the panel got a 500. The old row is brought back instead.
    const existing = await this.ratesRepository.findOne({
      where: { method: { id: methodId }, zone: { id: dto.zoneId } },
      withDeleted: true,
    });
    if (existing?.deleted_at) {
      existing.deleted_at = null;
    }
    const rate =
      existing ??
      this.ratesRepository.create({
        method: { id: methodId } as ShippingMethod,
        zone: { id: dto.zoneId } as ShippingZone,
      });

    rate.base_cost = dto.base_cost;
    rate.per_kg_cost = dto.per_kg_cost ?? rate.per_kg_cost ?? 0;
    rate.free_shipping_threshold =
      dto.free_shipping_threshold === undefined
        ? (rate.free_shipping_threshold ?? null)
        : dto.free_shipping_threshold;
    rate.cash_on_delivery_fee =
      dto.cash_on_delivery_fee ?? rate.cash_on_delivery_fee ?? 0;
    rate.is_active = dto.is_active ?? rate.is_active ?? true;

    return this.ratesRepository.save(rate);
  }

  async removeRate(methodId: number, rateId: number): Promise<void> {
    const rate = await this.ratesRepository.findOne({
      where: { id: rateId },
      relations: { method: true },
    });
    if (!rate || rate.method.id !== methodId) {
      throw new NotFoundException(
        `Rate ${rateId} not found on method ${methodId}`,
      );
    }
    await this.ratesRepository.softDelete({ id: rateId });
  }

  async resolveZone(province: string): Promise<ShippingZone | null> {
    const zones = await this.zonesRepository.find({ order: { id: 'ASC' } });
    // The province is typed by the customer. Arabic keyboards give ي/ك
    // where the zone list has ی/ک, and spacing varies ("آذربایجان شرقی"
    // with a half-space) - compared raw, those fell through to the default
    // zone and were charged its price.
    const normalised = normalizePersianText(province ?? '');
    const match = zones.find((zone) =>
      (zone.provinces ?? []).some(
        (candidate) => normalizePersianText(candidate) === normalised,
      ),
    );
    return match ?? zones.find((zone) => zone.is_default) ?? null;
  }

  async quote(
    province: string,
    weightGrams: number,
    goodsTotal: number,
  ): Promise<ShippingOption[]> {
    const zone = await this.resolveZone(province);
    if (!zone) return [];

    const rates = await this.ratesRepository.find({
      where: { zone: { id: zone.id }, is_active: true },
      relations: { method: true },
    });

    return rates
      .filter((rate) => rate.method && rate.method.is_active)
      .sort(
        (a, b) =>
          a.method.sort_order - b.method.sort_order ||
          a.method.id - b.method.id,
      )
      .map((rate) => this.priceRate(rate, weightGrams, goodsTotal));
  }

  // Base cost covers the first kilogram; every started kilogram after it
  // adds per_kg_cost. Free above the zone's threshold, when one is set.
  private priceRate(
    rate: ShippingRate,
    weightGrams: number,
    goodsTotal: number,
  ): ShippingOption {
    const kilograms = Math.max(1, Math.ceil(Math.max(weightGrams, 0) / 1000));
    const free =
      rate.free_shipping_threshold !== null &&
      rate.free_shipping_threshold !== undefined &&
      goodsTotal >= rate.free_shipping_threshold;
    const cost = free ? 0 : rate.base_cost + rate.per_kg_cost * (kilograms - 1);

    return {
      methodId: rate.method.id,
      code: rate.method.code,
      title: rate.method.title,
      description: rate.method.description,
      cost,
      freeShippingApplied: free,
      cashOnDeliveryFee: rate.cash_on_delivery_fee,
      supportsCashOnDelivery: rate.method.supports_cash_on_delivery,
      estimatedDaysMin: rate.method.estimated_days_min,
      estimatedDaysMax: rate.method.estimated_days_max,
    };
  }

  // Returns null when the shop has no shipping configured. With several
  // methods available the customer has to choose - picking for them is how
  // an order arrives later than what was paid for.
  async priceForOrder(params: {
    province: string;
    weightGrams: number;
    goodsTotal: number;
    methodId?: number;
  }): Promise<ShippingOption | null> {
    const options = await this.quote(
      params.province,
      params.weightGrams,
      params.goodsTotal,
    );
    if (options.length === 0) {
      if (params.methodId) {
        throw new BadRequestException(
          'That shipping method is not available for this address',
        );
      }
      return null;
    }

    if (params.methodId) {
      const chosen = options.find(
        (option) => option.methodId === params.methodId,
      );
      if (!chosen) {
        throw new BadRequestException(
          'That shipping method is not available for this address',
        );
      }
      return chosen;
    }

    if (options.length > 1) {
      throw AppError.badRequest(
        ErrorCodes.SHIPPING_METHOD_REQUIRED,
        `Several shipping methods are available - send shippingMethodId (${options
          .map((option) => `${option.methodId}: ${option.title}`)
          .join(', ')})`,
        {
          methods: options.map((option) => ({
            methodId: option.methodId,
            title: option.title,
            cost: option.cost,
          })),
        },
      );
    }
    return options[0];
  }

  async weighItems(
    items: Array<{ productId: number; variantId?: number; quantity: number }>,
  ): Promise<number> {
    if (items.length === 0) return 0;

    const variantIds = items
      .map((item) => item.variantId)
      .filter((id): id is number => !!id);
    const variants = variantIds.length
      ? await this.variantsRepository.find({
          where: { id: In(variantIds) },
          relations: { product: true },
        })
      : [];
    const byVariant = new Map(variants.map((variant) => [variant.id, variant]));

    const productIds = items
      .filter((item) => !item.variantId)
      .map((item) => item.productId);
    const defaults = productIds.length
      ? await this.variantsRepository.find({
          where: { product: { id: In(productIds) }, is_active: true },
          relations: { product: true },
          order: { id: 'ASC' },
        })
      : [];
    const byProduct = new Map<number, ProductVariant>();
    for (const variant of defaults) {
      if (!byProduct.has(variant.product.id)) {
        byProduct.set(variant.product.id, variant);
      }
    }

    return items.reduce((total, item) => {
      const variant = item.variantId
        ? byVariant.get(item.variantId)
        : byProduct.get(item.productId);
      if (!variant) return total;
      return total + variant.weightGrams(variant.product) * item.quantity;
    }, 0);
  }

  async addressOf(addressId: number, userId: number): Promise<Address> {
    const address = await this.addressesRepository.findOne({
      where: { id: addressId },
      relations: { user: true },
    });
    if (!address) {
      throw new NotFoundException(`Address with id ${addressId} not found`);
    }
    if (address.user.id !== userId) {
      throw new BadRequestException('This address does not belong to you');
    }
    return address;
  }

  private assertEtaOrder(min?: number, max?: number): void {
    if (min !== undefined && max !== undefined && min > max) {
      throw new BadRequestException(
        'The earliest delivery day cannot be after the latest one',
      );
    }
  }
}
