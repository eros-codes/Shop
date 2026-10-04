import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Product } from './product.entity';
import { VariantAttributeValue } from '../../attributes/entities/variant-attribute-value.entity';

@Entity('product_variants')
@Index('IDX_variant_product', ['product'])
export class ProductVariant {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Product, (product) => product.variants, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'product_id',
    foreignKeyConstraintName: 'FK_variant_product',
  })
  product!: Product;

  @Column({ type: 'varchar', length: 120 })
  title!: string;

  @Column({ type: 'varchar', length: 80 })
  sku!: string;

  // The structured truth behind `options`: which option of which
  // attribute this variant is.
  @OneToMany(() => VariantAttributeValue, (value) => value.variant)
  attributeValues!: VariantAttributeValue[];

  @Column({ type: 'json', nullable: true })
  options?: Record<string, string> | null;

  @Column({ type: 'int', unsigned: true, nullable: true })
  price?: number | null;

  @Column({ type: 'int', unsigned: true, nullable: true })
  sale_price?: number | null;

  @Column({ type: 'int', unsigned: true, default: 0 })
  stock!: number;

  @Column({ type: 'int', unsigned: true, nullable: true })
  weight_grams?: number | null;

  @Column({ type: 'boolean', default: true })
  is_active!: boolean;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deleted_at?: Date;

  // Unique among live rows only: a soft-deleted variant must not hold its
  // SKU forever.
  @Index('UQ_variants_active_sku', { unique: true })
  @Column({
    type: 'varchar',
    length: 80,
    nullable: true,
    asExpression: 'IF(`deleted_at` IS NULL, `sku`, NULL)',
    generatedType: 'STORED',
    insert: false,
    update: false,
    select: false,
  })
  active_sku?: string | null;

  effectivePrice(product: Product, at: Date = new Date()): number {
    if (this.price === null || this.price === undefined) {
      return product.effectivePrice(at);
    }
    if (this.sale_price !== null && this.sale_price !== undefined) {
      const saleOn =
        (!product.sale_starts_at || at >= product.sale_starts_at) &&
        (!product.sale_ends_at || at <= product.sale_ends_at);
      if (saleOn) return Number(this.sale_price);
    }
    return Number(this.price);
  }

  weightGrams(product: Product): number {
    return this.weight_grams ?? product.weight_grams;
  }
}
