import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Attribute } from './attribute.entity';
import { AttributeOption } from './attribute-option.entity';
import { Product } from '../../products/entities/product.entity';

// A property of the product as a whole rather than of one variant:
// screen size, fabric, SPF, warranty length. These describe and filter;
// they never split the product into separately counted stock.
@Entity('product_attribute_values')
@Unique('UQ_product_attribute', ['product', 'attribute'])
@Index('IDX_product_value_option', ['option'])
export class ProductAttributeValue {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Product, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'product_id',
    foreignKeyConstraintName: 'FK_product_value_product',
  })
  product!: Product;

  @ManyToOne(() => Attribute, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'attribute_id',
    foreignKeyConstraintName: 'FK_product_value_attribute',
  })
  attribute!: Attribute;

  // Set for select and colour attributes.
  @ManyToOne(() => AttributeOption, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'option_id',
    foreignKeyConstraintName: 'FK_product_value_option',
  })
  option?: AttributeOption | null;

  // Set for the free-form types instead.
  @Column({ type: 'varchar', length: 500, nullable: true })
  value_text?: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 3, nullable: true })
  value_number?: string | null;

  @Column({ type: 'boolean', nullable: true })
  value_boolean?: boolean | null;
}
