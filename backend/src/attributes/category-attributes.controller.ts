import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AttributesService } from './attributes.service';
import { AttachAttributeToCategoryDto } from './dto/attribute.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import userRoleEnum from '../users/enums/userRoleEnum';
import { ParseIdPipe } from '../common/pipes/parse-id.pipe';

// Which attributes a category's products are described by - this is what
// an admin form reads to build itself, and what tells a product which
// options it must answer.
@ApiTags('Attributes')
@Controller('categories/:categoryId/attributes')
export class CategoryAttributesController {
  constructor(private readonly attributesService: AttributesService) {}

  @Get()
  async forCategory(@Param('categoryId', ParseIdPipe) categoryId: number) {
    const links = await this.attributesService.forCategory(categoryId);
    return { data: links, message: 'Category Attributes Found' };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(userRoleEnum.AdminUser)
  @Post()
  async attach(
    @Param('categoryId', ParseIdPipe) categoryId: number,
    @Body() dto: AttachAttributeToCategoryDto,
  ) {
    const links = await this.attributesService.attachToCategory(
      categoryId,
      dto,
    );
    return { data: links, message: 'Attribute Attached' };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(userRoleEnum.AdminUser)
  @Delete(':attributeId')
  async detach(
    @Param('categoryId', ParseIdPipe) categoryId: number,
    @Param('attributeId', ParseIdPipe) attributeId: number,
  ) {
    await this.attributesService.detachFromCategory(categoryId, attributeId);
    return { message: 'Attribute Detached' };
  }
}
