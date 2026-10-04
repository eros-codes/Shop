import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { BrandsService } from './brands.service';
import { CreateBrandDto } from './dto/create-brand.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';
import { FilterBrandDto } from './dto/filter-brand.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import userRoleEnum from '../users/enums/userRoleEnum';
import { ParseIdPipe } from '../common/pipes/parse-id.pipe';
import { CatalogCache } from '../common/cache/catalog-cache.interceptor';
import { CatalogCacheScope } from '../common/cache/catalog-cache.service';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Brands')
@Controller('brands')
export class BrandsController {
  constructor(private readonly brandsService: BrandsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(userRoleEnum.AdminUser)
  @Post()
  async create(@Body() createBrandDto: CreateBrandDto) {
    const brand = await this.brandsService.create(createBrandDto);
    return { data: brand, message: 'Brand Created Successfully' };
  }

  @CatalogCache(CatalogCacheScope.Categories)
  @Get()
  async findAll(@Query() query: FilterBrandDto) {
    const brands = await this.brandsService.findAll(query);
    return { data: brands, message: 'Brands Found' };
  }

  @CatalogCache(CatalogCacheScope.Categories)
  @Get('slug/:slug')
  async findBySlug(@Param('slug') slug: string) {
    const brand = await this.brandsService.findBySlug(slug);
    return { data: brand, message: 'Brand Found' };
  }

  @CatalogCache(CatalogCacheScope.Categories)
  @Get(':id')
  async findOne(@Param('id', ParseIdPipe) id: number) {
    const brand = await this.brandsService.findOne(id);
    return { data: brand, message: 'Brand Found' };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(userRoleEnum.AdminUser)
  @Patch(':id')
  async update(
    @Param('id', ParseIdPipe) id: number,
    @Body() updateBrandDto: UpdateBrandDto,
  ) {
    const brand = await this.brandsService.update(id, updateBrandDto);
    return { data: brand, message: 'Brand Updated Successfully' };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(userRoleEnum.AdminUser)
  @Delete(':id')
  async remove(@Param('id', ParseIdPipe) id: number) {
    await this.brandsService.remove(id);
    return { message: 'Brand Deleted Successfully' };
  }
}
