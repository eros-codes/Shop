import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ReturnsService } from './returns.service';
import {
  CreateReturnRequestDto,
  FilterReturnRequestDto,
  UpdateReturnStatusDto,
} from './dto/return.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../auth/decorators/current-user.decorator';
import userRoleEnum from '../users/enums/userRoleEnum';
import { ParseIdPipe } from '../common/pipes/parse-id.pipe';
import { ApiTags } from '@nestjs/swagger';

@UseGuards(JwtAuthGuard)
@ApiTags('Returns')
@Controller('returns')
export class ReturnsController {
  constructor(private readonly returnsService: ReturnsService) {}

  @Post()
  async create(
    @Body() dto: CreateReturnRequestDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    const request = await this.returnsService.create(currentUser.userId, dto);
    return { data: request, message: 'Return Requested' };
  }

  @Get()
  async findAll(
    @Query() query: FilterReturnRequestDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    const requests = await this.returnsService.findAll(
      currentUser.userId,
      query,
      currentUser.role === userRoleEnum.AdminUser,
    );
    return { data: requests, message: 'Return Requests Found' };
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseIdPipe) id: number,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    const request = await this.returnsService.findOne(id);
    const isOwner = request.user.id === currentUser.userId;
    const isAdmin = currentUser.role === userRoleEnum.AdminUser;
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('This return request is not yours');
    }
    return { data: request, message: 'Return Request Found' };
  }

  @UseGuards(RolesGuard)
  @Roles(userRoleEnum.AdminUser)
  @Patch(':id/status')
  async updateStatus(
    @Param('id', ParseIdPipe) id: number,
    @Body() dto: UpdateReturnStatusDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    const request = await this.returnsService.updateStatus(id, dto, {
      userId: currentUser.userId,
      label: currentUser.mobile ?? null,
    });
    return { data: request, message: 'Return Request Updated' };
  }

  @Delete(':id')
  async cancel(
    @Param('id', ParseIdPipe) id: number,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    await this.returnsService.cancel(id, currentUser.userId);
    return { message: 'Return Request Cancelled' };
  }
}
