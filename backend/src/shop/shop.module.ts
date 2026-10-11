import { Module } from '@nestjs/common';
import { ProductsModule } from '../products/products.module';
import { ShopController } from './shop.controller';

// What the storefront needs from the API that is about the shop rather
// than any one record: its stated policies, and link previews.
@Module({
  imports: [ProductsModule],
  controllers: [ShopController],
})
export class ShopModule {}
