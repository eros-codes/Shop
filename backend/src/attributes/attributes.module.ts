import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AttributesService } from './attributes.service';
import { AttributesController } from './attributes.controller';
import { CategoryAttributesController } from './category-attributes.controller';
import { Attribute } from './entities/attribute.entity';
import { AttributeOption } from './entities/attribute-option.entity';
import { CategoryAttribute } from './entities/category-attribute.entity';
import { VariantAttributeValue } from './entities/variant-attribute-value.entity';
import { ProductAttributeValue } from './entities/product-attribute-value.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Attribute,
      AttributeOption,
      CategoryAttribute,
      VariantAttributeValue,
      ProductAttributeValue,
    ]),
  ],
  controllers: [AttributesController, CategoryAttributesController],
  providers: [AttributesService],
  exports: [AttributesService],
})
export class AttributesModule {}
