import {
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Attribute } from './attribute.entity';
import { AttributeOption } from './attribute-option.entity';
import { ProductVariant } from '../../products/entities/product-variant.entity';

// What one variant IS: colour = مشکی, storage = 256.
//
// The variant's `options` JSON still exists as a denormalised copy for
// fast reads, but these rows are the truth - they are what a filter
// joins against and what stops two variants of the same product from
// being the same combination.
@Entity('variant_attribute_values')
@Unique('UQ_variant_attribute', ['variant', 'attribute'])
@Index('IDX_variant_value_option', ['option'])
export class VariantAttributeValue {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => ProductVariant, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'variant_id',
    foreignKeyConstraintName: 'FK_variant_value_variant',
  })
  variant!: ProductVariant;

  @ManyToOne(() => Attribute, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'attribute_id',
    foreignKeyConstraintName: 'FK_variant_value_attribute',
  })
  attribute!: Attribute;

  @ManyToOne(() => AttributeOption, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'option_id',
    foreignKeyConstraintName: 'FK_variant_value_option',
  })
  option!: AttributeOption;
}
