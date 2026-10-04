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
import { ApiTags } from '@nestjs/swagger';
import { AttributesService } from './attributes.service';
import {
  CreateAttributeDto,
  CreateAttributeOptionDto,
  UpdateAttributeDto,
  UpdateAttributeOptionDto,
} from './dto/attribute.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import userRoleEnum from '../users/enums/userRoleEnum';
import { ParseIdPipe } from '../common/pipes/parse-id.pipe';

@ApiTags('Attributes')
@Controller('attributes')
export class AttributesController {
  constructor(private readonly attributesService: AttributesService) {}

  // Public: a storefront needs the list to build filter panels.
  @Get()
  async findAll() {
    const attributes = await this.attributesService.findAll();
    return { data: attributes, message: 'Attributes Found' };
  }

  @Get(':id')
  async findOne(@Param('id', ParseIdPipe) id: number) {
    const attribute = await this.attributesService.findOne(id);
    return { data: attribute, message: 'Attribute Found' };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(userRoleEnum.AdminUser)
  @Post()
  async create(@Body() dto: CreateAttributeDto) {
    const attribute = await this.attributesService.create(dto);
    return { data: attribute, message: 'Attribute Created' };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(userRoleEnum.AdminUser)
  @Patch(':id')
  async update(
    @Param('id', ParseIdPipe) id: number,
    @Body() dto: UpdateAttributeDto,
  ) {
    const attribute = await this.attributesService.update(id, dto);
    return { data: attribute, message: 'Attribute Updated' };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(userRoleEnum.AdminUser)
  @Delete(':id')
  async remove(@Param('id', ParseIdPipe) id: number) {
    await this.attributesService.remove(id);
    return { message: 'Attribute Removed' };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(userRoleEnum.AdminUser)
  @Post(':id/options')
  async addOption(
    @Param('id', ParseIdPipe) id: number,
    @Body() dto: CreateAttributeOptionDto,
  ) {
    const option = await this.attributesService.addOption(id, dto);
    return { data: option, message: 'Option Added' };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(userRoleEnum.AdminUser)
  @Patch(':id/options/:optionId')
  async updateOption(
    @Param('id', ParseIdPipe) id: number,
    @Param('optionId', ParseIdPipe) optionId: number,
    @Body() dto: UpdateAttributeOptionDto,
  ) {
    const option = await this.attributesService.updateOption(id, optionId, dto);
    return { data: option, message: 'Option Updated' };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(userRoleEnum.AdminUser)
  @Delete(':id/options/:optionId')
  async removeOption(
    @Param('id', ParseIdPipe) id: number,
    @Param('optionId', ParseIdPipe) optionId: number,
  ) {
    await this.attributesService.removeOption(id, optionId);
    return { message: 'Option Removed' };
  }
}
