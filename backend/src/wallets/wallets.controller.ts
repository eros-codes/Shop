import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { WalletsService } from './wallets.service';
import { CreateWalletDto } from './dto/create-wallet.dto';
import { AdjustWalletDto } from './dto/adjust-wallet.dto';
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
@ApiTags('Wallets')
@Controller('wallets')
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  @Post()
  async create(
    @Body() _createWalletDto: CreateWalletDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    const wallet = await this.walletsService.create(currentUser.userId);
    return { data: wallet, message: 'Wallet created successfully' };
  }

  @UseGuards(RolesGuard)
  @Roles(userRoleEnum.AdminUser)
  @Get()
  async findAll() {
    const wallets = await this.walletsService.findAll();
    return { data: wallets, message: 'Wallets found' };
  }

  @Get('user/:userId')
  async findByUserId(
    @Param('userId', ParseIdPipe) userId: number,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    const isOwner = userId === currentUser.userId;
    const isAdmin = currentUser.role === userRoleEnum.AdminUser;
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('You can only view your own wallet');
    }
    const wallet = await this.walletsService.findByUserId(userId);
    return { data: wallet, message: 'Wallet found' };
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseIdPipe) id: number,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    const wallet = await this.walletsService.findOne(id);
    const isOwner = wallet.user.id === currentUser.userId;
    const isAdmin = currentUser.role === userRoleEnum.AdminUser;
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('You can only view your own wallet');
    }
    return { data: wallet, message: 'Wallet found' };
  }

  @Post(':id/charge/request')
  async requestCharge(
    @Param('id', ParseIdPipe) id: number,
    @Body() adjustWalletDto: AdjustWalletDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    const existing = await this.walletsService.findOne(id);
    if (existing.user.id !== currentUser.userId) {
      throw new ForbiddenException('You can only charge your own wallet');
    }
    const result = await this.walletsService.requestCharge(id, adjustWalletDto);
    return {
      data: result,
      message: 'Redirect the user to paymentUrl to complete the top-up',
    };
  }

  @UseGuards(RolesGuard)
  @Roles(userRoleEnum.AdminUser)
  @Patch(':id/charge')
  async adminCharge(
    @Param('id', ParseIdPipe) id: number,
    @Body() adjustWalletDto: AdjustWalletDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    const wallet = await this.walletsService.adminCharge(id, adjustWalletDto, {
      userId: currentUser.userId,
      label: currentUser.mobile ?? null,
    });
    return { data: wallet, message: 'Wallet charged successfully' };
  }

  @Patch(':id/withdraw')
  async withdraw(
    @Param('id', ParseIdPipe) id: number,
    @Body() adjustWalletDto: AdjustWalletDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    const existing = await this.walletsService.findOne(id);
    const isOwner = existing.user.id === currentUser.userId;
    const isAdmin = currentUser.role === userRoleEnum.AdminUser;
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException(
        'You can only withdraw from your own wallet',
      );
    }
    const wallet = await this.walletsService.withdraw(id, adjustWalletDto);
    return { data: wallet, message: 'Wallet withdrawal successful' };
  }

  @Delete(':id')
  async remove(
    @Param('id', ParseIdPipe) id: number,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    const existing = await this.walletsService.findOne(id);
    const isOwner = existing.user.id === currentUser.userId;
    const isAdmin = currentUser.role === userRoleEnum.AdminUser;
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('You can only deactivate your own wallet');
    }
    const wallet = await this.walletsService.deactivate(id);
    return {
      data: wallet,
      message:
        'Wallet deactivated - its history is kept and it can be reactivated with POST /wallets',
    };
  }
}
