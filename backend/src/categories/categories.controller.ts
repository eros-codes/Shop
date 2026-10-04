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
} from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { FilterCategoryDto } from './dto/filter-category.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import userRoleEnum from '../users/enums/userRoleEnum';
import { ParseIdPipe } from '../common/pipes/parse-id.pipe';
import { CatalogCache } from '../common/cache/catalog-cache.interceptor';
import { CatalogCacheScope } from '../common/cache/catalog-cache.service';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(userRoleEnum.AdminUser)
  @Post()
  async create(@Body() createCategoryDto: CreateCategoryDto) {
    const newCategory = await this.categoriesService.create(createCategoryDto);
    return { data: newCategory, message: 'Category Created Successfully' };
  }

  @CatalogCache(CatalogCacheScope.Categories)
  @Get()
  async findAll(@Query() query: FilterCategoryDto) {
    const categories = await this.categoriesService.findAll(query);
    return { data: categories, message: 'Categories Found' };
  }

  @CatalogCache(CatalogCacheScope.Categories)
  @Get('tree')
  async findTree() {
    const tree = await this.categoriesService.findTree();
    return { data: tree, message: 'Category Tree' };
  }

  @CatalogCache(CatalogCacheScope.Categories)
  @Get('slug/:slug')
  async findBySlug(@Param('slug') slug: string) {
    const category = await this.categoriesService.findBySlug(slug);
    return { data: category, message: 'Category Found' };
  }

  @CatalogCache(CatalogCacheScope.Categories)
  @Get(':id')
  async findOne(@Param('id', ParseIdPipe) id: number) {
    const category = await this.categoriesService.findOne(id);
    return { data: category, message: 'Category Found' };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(userRoleEnum.AdminUser)
  @Patch(':id')
  async update(
    @Param('id', ParseIdPipe) id: number,
    @Body() updateCategoryDto: UpdateCategoryDto,
  ) {
    const updatedCategory = await this.categoriesService.update(
      id,
      updateCategoryDto,
    );
    return { data: updatedCategory, message: 'Category Updated Successfully' };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(userRoleEnum.AdminUser)
  @Delete('remove-only-category/:id')
  async removeOnlyCategory(@Param('id', ParseIdPipe) id: number) {
    await this.categoriesService.remove(id);
    return { message: 'Category Deleted Successfully' };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(userRoleEnum.AdminUser)
  @Delete('remove/:id')
  async remove(@Param('id', ParseIdPipe) id: number) {
    const result = await this.categoriesService.removeWithProds(id);
    return {
      data: result,
      message: 'Category Along All Products Related Deleted Successfully',
    };
  }
}
