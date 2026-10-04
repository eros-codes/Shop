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
  ForbiddenException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { FilterUserDto } from './dto/filter-users.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import userRoleEnum from './enums/userRoleEnum';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../auth/decorators/current-user.decorator';
import { ParseIdPipe } from '../common/pipes/parse-id.pipe';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(userRoleEnum.AdminUser)
  @Post()
  async create(@Body() createUserDto: CreateUserDto) {
    const newUser = await this.usersService.create(createUserDto);
    return { data: newUser, message: 'User created successfully' };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(userRoleEnum.AdminUser)
  @Get()
  async findAll(@Query() query: FilterUserDto) {
    const users = await this.usersService.findAll(query);
    return { data: users, message: 'Users Found' };
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async findOne(
    @Param('id', ParseIdPipe) id: number,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    const isOwner = id === currentUser.userId;
    const isAdmin = currentUser.role === userRoleEnum.AdminUser;
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('You can only view your own profile');
    }
    const foundUser = await this.usersService.findOne(id);
    return { data: foundUser, message: 'User Found' };
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  async update(
    @Param('id', ParseIdPipe) id: number,
    @Body() updateUserDto: UpdateUserDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    const isOwner = id === currentUser.userId;
    const isAdmin = currentUser.role === userRoleEnum.AdminUser;
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('You can only update your own profile');
    }
    const updatedUser = await this.usersService.update(id, updateUserDto);
    return { data: updatedUser, message: 'User Updated Successfully' };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(userRoleEnum.AdminUser)
  @Patch(':id/role')
  async updateRole(
    @Param('id', ParseIdPipe) id: number,
    @Body() updateUserRoleDto: UpdateUserRoleDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    const updatedUser = await this.usersService.updateRole(
      id,
      updateUserRoleDto.role,
      { userId: currentUser.userId, label: currentUser.mobile ?? null },
    );
    return { data: updatedUser, message: 'User role updated successfully' };
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async remove(
    @Param('id', ParseIdPipe) id: number,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    const isOwner = id === currentUser.userId;
    const isAdmin = currentUser.role === userRoleEnum.AdminUser;
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('You can only delete your own profile');
    }
    await this.usersService.remove(id);
    return { message: 'User Deleted Successfully' };
  }
}
