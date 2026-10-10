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
  UseInterceptors,
  UploadedFiles,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import {
  CreateProductVariantDto,
  UpdateProductVariantDto,
} from './dto/product-variant.dto';
import { CreateBookmarkDto } from './dto/create-bookmark.dto';
import { MergeBasketDto } from './dto/merge-basket.dto';
import { FilterProductDto } from './dto/filter-product.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { ProductViewQueryDto } from './dto/product-view-query.dto';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import userRoleEnum from '../users/enums/userRoleEnum';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../auth/decorators/current-user.decorator';
import { ParseIdPipe } from '../common/pipes/parse-id.pipe';
import { CatalogCache } from '../common/cache/catalog-cache.interceptor';
import { CatalogCacheScope } from '../common/cache/catalog-cache.service';
import {
  MAX_IMAGE_SIZE_BYTES,
  MAX_IMAGES_PER_UPLOAD,
  ProductImagesPipe,
  ValidatedImage,
} from './pipes/product-images.pipe';
import { ApiTags } from '@nestjs/swagger';

// Unpublished products are the admin's work in progress. They are served
// only on an explicit ?includeDrafts=true from a signed-in admin; anyone
// else asking is told so (401 lets the panel refresh an expired token
// rather than quietly getting a list with the drafts missing).
function draftsAllowed(
  flag: string | undefined,
  user: CurrentUserPayload | null,
): boolean {
  if (flag !== 'true') return false;
  if (!user) {
    throw new UnauthorizedException(
      'Sign in as an admin to see unpublished products',
    );
  }
  if (user.role !== userRoleEnum.AdminUser) {
    throw new ForbiddenException('Only an admin can see unpublished products');
  }
  return true;
}

@ApiTags('Products')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(userRoleEnum.AdminUser)
  @Post()
  async create(@Body() createProductDto: CreateProductDto) {
    const newProduct = await this.productsService.create(createProductDto);
    return { data: newProduct, message: 'Product Created Successfully' };
  }

  @UseGuards(OptionalJwtAuthGuard)
  @CatalogCache(CatalogCacheScope.Products)
  @Get()
  async findAll(
    @Query() query: FilterProductDto,
    @CurrentUser() currentUser: CurrentUserPayload | null,
  ) {
    const products = await this.productsService.findAll(query, {
      includeDrafts: draftsAllowed(query.includeDrafts, currentUser),
    });
    return { data: products, message: 'Products Found' };
  }

  // The filter panel: every filterable value with the number of
  // products that would remain if the shopper picked it too. Cached like
  // the listing it sits beside - it is the heaviest read in the shop.
  @CatalogCache(CatalogCacheScope.Products)
  @Get('facets')
  async facets(@Query() query: FilterProductDto) {
    const facets = await this.productsService.facets(query);
    return { data: facets, message: 'Facets Found' };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(userRoleEnum.AdminUser)
  @Post(':id/variants')
  async addVariant(
    @Param('id', ParseIdPipe) id: number,
    @Body() dto: CreateProductVariantDto,
  ) {
    const product = await this.productsService.addVariant(id, dto);
    return { data: product, message: 'Variant Added Successfully' };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(userRoleEnum.AdminUser)
  @Patch(':id/variants/:variantId')
  async updateVariant(
    @Param('id', ParseIdPipe) id: number,
    @Param('variantId', ParseIdPipe) variantId: number,
    @Body() dto: UpdateProductVariantDto,
  ) {
    const product = await this.productsService.updateVariant(
      id,
      variantId,
      dto,
    );
    return { data: product, message: 'Variant Updated Successfully' };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(userRoleEnum.AdminUser)
  @Delete(':id/variants/:variantId')
  async removeVariant(
    @Param('id', ParseIdPipe) id: number,
    @Param('variantId', ParseIdPipe) variantId: number,
  ) {
    const product = await this.productsService.removeVariant(id, variantId);
    return { data: product, message: 'Variant Removed Successfully' };
  }

  @UseGuards(OptionalJwtAuthGuard)
  @CatalogCache(CatalogCacheScope.Products)
  @Get('slug/:slug')
  async findBySlug(
    @Param('slug') slug: string,
    @Query() query: ProductViewQueryDto,
    @CurrentUser() currentUser: CurrentUserPayload | null,
  ) {
    const product = await this.productsService.findBySlug(slug, {
      includeDrafts: draftsAllowed(query.includeDrafts, currentUser),
    });
    return { data: product, message: 'Product Found' };
  }

  // "You might also like", from the same categories and brand.
  // Declared above @Get(':id') on purpose: Nest matches routes in order, so
  // a literal segment registered after the wildcard is read as an id.
  @UseGuards(JwtAuthGuard)
  @Get('bookmark')
  async listBookmarks(@CurrentUser() currentUser: CurrentUserPayload) {
    const productIds = await this.productsService.listBookmarkedProductIds(
      currentUser.userId,
    );
    return { data: { productIds }, message: 'Bookmarks fetched successfully' };
  }

  @Get(':id/related')
  async related(
    @Param('id', ParseIdPipe) id: number,
    @Query('limit') limit?: string,
  ) {
    const parsed = Number(limit);
    const products = await this.productsService.related(
      id,
      Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 24) : 8,
    );
    return { data: products, message: 'Related Products Found' };
  }

  @UseGuards(OptionalJwtAuthGuard)
  @CatalogCache(CatalogCacheScope.Products)
  @Get(':id')
  async findOne(
    @Param('id', ParseIdPipe) id: number,
    @Query() query: ProductViewQueryDto,
    @CurrentUser() currentUser: CurrentUserPayload | null,
  ) {
    const product = await this.productsService.findOne(id, {
      includeDrafts: draftsAllowed(query.includeDrafts, currentUser),
    });
    return { data: product, message: 'Product Found' };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(userRoleEnum.AdminUser)
  @Patch(':id')
  async update(
    @Param('id', ParseIdPipe) id: number,
    @Body() updateProductDto: UpdateProductDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    const updated = await this.productsService.update(id, updateProductDto, {
      userId: currentUser.userId,
      label: currentUser.mobile ?? null,
    });
    return { data: updated, message: 'Product Updated Successfully' };
  }

  @UseGuards(JwtAuthGuard)
  @Get('basket/:userId')
  async getUserBasket(
    @Param('userId', ParseIdPipe) userId: number,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    const isOwner = userId === currentUser.userId;
    const isAdmin = currentUser.role === userRoleEnum.AdminUser;
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('You can only view your own basket');
    }
    const basket = await this.productsService.getUserBasket(userId);
    return { data: basket, message: 'Basket found' };
  }

  @UseGuards(JwtAuthGuard)
  @Delete('basket')
  async removeItemFromBasket(
    @Body() createBookmarkDto: CreateBookmarkDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    await this.productsService.removeProductFromBasket(
      currentUser.userId,
      createBookmarkDto,
    );
    return { message: 'Product deleted from basket successfully' };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(userRoleEnum.AdminUser)
  @Delete(':id')
  async remove(@Param('id', ParseIdPipe) id: number) {
    await this.productsService.remove(id);
    return { message: 'Product Deleted Successfully' };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(userRoleEnum.AdminUser)
  @Post(':id/images')
  @UseInterceptors(
    FilesInterceptor('images', MAX_IMAGES_PER_UPLOAD, {
      storage: memoryStorage(),
      limits: {
        fileSize: MAX_IMAGE_SIZE_BYTES,
        files: MAX_IMAGES_PER_UPLOAD,
      },
    }),
  )
  async uploadImages(
    @Param('id', ParseIdPipe) id: number,
    @UploadedFiles(ProductImagesPipe) images: ValidatedImage[],
  ) {
    const product = await this.productsService.addImages(id, images);
    return { data: product, message: 'Images uploaded successfully' };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(userRoleEnum.AdminUser)
  @Delete(':id/images/:imageId')
  async removeImage(
    @Param('id', ParseIdPipe) id: number,
    @Param('imageId', ParseIdPipe) imageId: number,
  ) {
    const product = await this.productsService.removeImage(id, imageId);
    return { data: product, message: 'Image removed successfully' };
  }

  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @Post('bookmark')
  async toggleBookmark(
    @Body() createBookmarkDto: CreateBookmarkDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    const result = await this.productsService.toggleBookmark(
      currentUser.userId,
      createBookmarkDto,
    );
    return {
      data: result,
      message: result.bookmarked
        ? 'Product bookmarked successfully'
        : 'Bookmark removed successfully',
    };
  }

  // Signing in with a basket already in hand: the guest's lines are
  // folded into the account's basket instead of being thrown away.
  @UseGuards(JwtAuthGuard)
  @Post('basket/merge')
  async mergeBasket(
    @Body() dto: MergeBasketDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    const result = await this.productsService.mergeBasket(
      currentUser.userId,
      dto,
    );
    return { data: result, message: 'Basket Merged' };
  }

  @UseGuards(JwtAuthGuard)
  @Post('basket')
  async addItmeToBasket(
    @Body() createBookmarkDto: CreateBookmarkDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    const result = await this.productsService.addProductToBasket(
      currentUser.userId,
      createBookmarkDto,
    );
    return { data: result, message: 'Product added to basket successfully' };
  }
}
