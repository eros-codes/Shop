import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Order } from './order.entity';
import { Product } from '../../products/entities/product.entity';
import { ProductVariant } from '../../products/entities/product-variant.entity';
import { bigintTransformer } from '../../common/database/bigint.transformer';

@Entity('order_items')
export class OrderItem {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Order, (order) => order.items)
  @JoinColumn({ name: 'order_id' })
  order!: Order;

  @ManyToOne(() => Product, (product) => product.order_items)
  @JoinColumn({ name: 'product_id' })
  product!: Product;

  @Column({
    type: 'bigint',
    transformer: bigintTransformer,
  })
  price!: number;

  @Column({ type: 'int' })
  quantity!: number;

  @ManyToOne(() => ProductVariant, { nullable: true })
  @JoinColumn({
    name: 'variant_id',
    foreignKeyConstraintName: 'FK_order_item_variant',
  })
  variant?: ProductVariant | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  variant_title?: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  variant_sku?: string | null;
}
