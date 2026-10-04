import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ShippingService } from './shipping.service';
import { ShippingController } from './shipping.controller';
import { ShippingMethod } from './entities/shipping-method.entity';
import { ShippingZone } from './entities/shipping-zone.entity';
import { ShippingRate } from './entities/shipping-rate.entity';
import { Address } from '../address/entities/address.entity';
import { ProductVariant } from '../products/entities/product-variant.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ShippingMethod,
      ShippingZone,
      ShippingRate,
      Address,
      ProductVariant,
    ]),
  ],
  controllers: [ShippingController],
  providers: [ShippingService],
  exports: [ShippingService],
})
export class ShippingModule {}
