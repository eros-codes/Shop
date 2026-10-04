import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ShippingService } from './shipping.service';
import {
  CreateShippingMethodDto,
  CreateShippingZoneDto,
  ShippingQuoteDto,
  UpdateShippingMethodDto,
  UpdateShippingZoneDto,
  UpsertShippingRateDto,
} from './dto/shipping.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../auth/decorators/current-user.decorator';
import userRoleEnum from '../users/enums/userRoleEnum';
import { ParseIdPipe } from '../common/pipes/parse-id.pipe';
import { CURRENCY_CODE, CURRENCY_LABEL } from '../common/constants/currency';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Shipping')
@Controller('shipping')
export class ShippingController {
  constructor(private readonly shippingService: ShippingService) {}

  @UseGuards(JwtAuthGuard)
  @Post('quote')
  async quote(
    @Body() dto: ShippingQuoteDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    const address = await this.shippingService.addressOf(
      dto.addressId,
      currentUser.userId,
    );
    const weightGrams = await this.shippingService.weighItems(dto.items);
    const options = await this.shippingService.quote(
      address.province,
      weightGrams,
      dto.goodsTotal ?? 0,
    );

    return {
      data: {
        province: address.province,
        weightGrams,
        currency: CURRENCY_CODE,
        currencyLabel: CURRENCY_LABEL,
        options,
      },
      message: options.length
        ? 'Shipping options found'
        : 'No shipping is configured - this order ships without a shipping charge',
    };
  }

  @Get('methods')
  async findMethods() {
    const methods = await this.shippingService.findMethods();
    return { data: methods, message: 'Shipping Methods Found' };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(userRoleEnum.AdminUser)
  @Post('methods')
  async createMethod(@Body() dto: CreateShippingMethodDto) {
    const method = await this.shippingService.createMethod(dto);
    return { data: method, message: 'Shipping Method Created' };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(userRoleEnum.AdminUser)
  @Patch('methods/:id')
  async updateMethod(
    @Param('id', ParseIdPipe) id: number,
    @Body() dto: UpdateShippingMethodDto,
  ) {
    const method = await this.shippingService.updateMethod(id, dto);
    return { data: method, message: 'Shipping Method Updated' };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(userRoleEnum.AdminUser)
  @Delete('methods/:id')
  async removeMethod(@Param('id', ParseIdPipe) id: number) {
    await this.shippingService.removeMethod(id);
    return { message: 'Shipping Method Removed' };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(userRoleEnum.AdminUser)
  @Post('methods/:id/rates')
  async upsertRate(
    @Param('id', ParseIdPipe) id: number,
    @Body() dto: UpsertShippingRateDto,
  ) {
    const rate = await this.shippingService.upsertRate(id, dto);
    return { data: rate, message: 'Shipping Rate Saved' };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(userRoleEnum.AdminUser)
  @Delete('methods/:id/rates/:rateId')
  async removeRate(
    @Param('id', ParseIdPipe) id: number,
    @Param('rateId', ParseIdPipe) rateId: number,
  ) {
    await this.shippingService.removeRate(id, rateId);
    return { message: 'Shipping Rate Removed' };
  }

  @Get('zones')
  async findZones() {
    const zones = await this.shippingService.findZones();
    return { data: zones, message: 'Shipping Zones Found' };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(userRoleEnum.AdminUser)
  @Post('zones')
  async createZone(@Body() dto: CreateShippingZoneDto) {
    const zone = await this.shippingService.createZone(dto);
    return { data: zone, message: 'Shipping Zone Created' };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(userRoleEnum.AdminUser)
  @Patch('zones/:id')
  async updateZone(
    @Param('id', ParseIdPipe) id: number,
    @Body() dto: UpdateShippingZoneDto,
  ) {
    const zone = await this.shippingService.updateZone(id, dto);
    return { data: zone, message: 'Shipping Zone Updated' };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(userRoleEnum.AdminUser)
  @Delete('zones/:id')
  async removeZone(@Param('id', ParseIdPipe) id: number) {
    await this.shippingService.removeZone(id);
    return { message: 'Shipping Zone Removed' };
  }
}
