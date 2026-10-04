import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  BadRequestException,
  ForbiddenException,
  Headers,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { FilterOrderDto } from './dto/filter-order.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import userRoleEnum from '../users/enums/userRoleEnum';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../auth/decorators/current-user.decorator';
import { ParseIdPipe } from '../common/pipes/parse-id.pipe';
import { ApiTags } from '@nestjs/swagger';

@UseGuards(JwtAuthGuard)
@ApiTags('Orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  async create(
    @Body() createOrderDto: CreateOrderDto,
    @CurrentUser() currentUser: CurrentUserPayload,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!idempotencyKey || !/^[A-Za-z0-9_-]{8,64}$/.test(idempotencyKey)) {
      throw new BadRequestException(
        'An Idempotency-Key header is required: 8-64 characters of A-Z, a-z, 0-9, "-" or "_", unique per checkout attempt (a UUID works well)',
      );
    }
    const { order, paymentUrl } = await this.ordersService.create(
      currentUser.userId,
      createOrderDto,
      idempotencyKey,
    );
    return {
      data: paymentUrl ? { order, paymentUrl } : order,
      message: paymentUrl
        ? 'Order created - redirect the user to paymentUrl to complete payment'
        : 'Order Created Successfully',
    };
  }

  @Get()
  async findAll(
    @Query() query: FilterOrderDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    const isAdmin = currentUser.role === userRoleEnum.AdminUser;
    const orders = await this.ordersService.findAll(
      currentUser.userId,
      query,
      isAdmin,
    );
    return { data: orders, message: 'Orders Found' };
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseIdPipe) id: number,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    const order = await this.ordersService.findOne(id);
    const isOwner = order.user.id === currentUser.userId;
    const isAdmin = currentUser.role === userRoleEnum.AdminUser;
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('You can only view your own orders');
    }
    return { data: order, message: 'Order Found' };
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIdPipe) id: number,
    @Body() updateOrderDto: UpdateOrderDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    const existing = await this.ordersService.findOne(id);
    const isOwner = existing.user.id === currentUser.userId;
    const isAdmin = currentUser.role === userRoleEnum.AdminUser;
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('You can only update your own orders');
    }
    const updatedOrder = await this.ordersService.update(id, updateOrderDto);
    return { data: updatedOrder, message: 'Order Updated Successfully' };
  }

  @UseGuards(RolesGuard)
  @Roles(userRoleEnum.AdminUser)
  @Patch(':id/status')
  async updateStatus(
    @Param('id', ParseIdPipe) id: number,
    @Body() updateOrderStatusDto: UpdateOrderStatusDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    const updatedOrder = await this.ordersService.updateStatus(
      id,
      updateOrderStatusDto,
      { userId: currentUser.userId, label: currentUser.mobile ?? null },
    );
    return { data: updatedOrder, message: 'Order status updated successfully' };
  }

  @Delete(':id')
  async remove(
    @Param('id', ParseIdPipe) id: number,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    const existing = await this.ordersService.findOne(id);
    const isOwner = existing.user.id === currentUser.userId;
    const isAdmin = currentUser.role === userRoleEnum.AdminUser;
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('You can only delete your own orders');
    }
    await this.ordersService.remove(id);
    return { message: 'Order Deleted Successfully' };
  }
}
