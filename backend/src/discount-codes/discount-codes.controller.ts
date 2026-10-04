import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { DiscountCodesService } from './discount-codes.service';
import { CreateDiscountCodeDto } from './dto/create-discount-code.dto';
import { UpdateDiscountCodeDto } from './dto/update-discount-code.dto';
import { FilterDiscountCodeDto } from './dto/filter-discount-code.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import userRoleEnum from '../users/enums/userRoleEnum';
import { ParseIdPipe } from '../common/pipes/parse-id.pipe';
import { ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../auth/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(userRoleEnum.AdminUser)
@ApiTags('Discount codes')
@Controller('discount-codes')
export class DiscountCodesController {
  constructor(private readonly discountCodesService: DiscountCodesService) {}

  @Post()
  async create(
    @Body() createDiscountCodeDto: CreateDiscountCodeDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    const newDiscountCode = await this.discountCodesService.create(
      createDiscountCodeDto,
      { userId: currentUser.userId, label: currentUser.mobile ?? null },
    );
    return {
      data: newDiscountCode,
      message: 'Discount code created successfully',
    };
  }

  @Get()
  async findAll(@Query() query: FilterDiscountCodeDto) {
    const discountCodes = await this.discountCodesService.findAll(query);
    return { data: discountCodes, message: 'Discount codes found' };
  }

  @Get(':id')
  async findOne(@Param('id', ParseIdPipe) id: number) {
    const discountCode = await this.discountCodesService.findOne(id);
    return { data: discountCode, message: 'Discount code found' };
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIdPipe) id: number,
    @Body() updateDiscountCodeDto: UpdateDiscountCodeDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    const updated = await this.discountCodesService.update(
      id,
      updateDiscountCodeDto,
      { userId: currentUser.userId, label: currentUser.mobile ?? null },
    );
    return { data: updated, message: 'Discount code updated successfully' };
  }

  @HttpCode(HttpStatus.OK)
  @Delete(':id')
  async remove(
    @Param('id', ParseIdPipe) id: number,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    await this.discountCodesService.remove(id, {
      userId: currentUser.userId,
      label: currentUser.mobile ?? null,
    });
    return { message: 'Discount code deleted successfully' };
  }
}
