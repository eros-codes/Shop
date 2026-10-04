import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Product } from '../../products/entities/product.entity';
import { ProductVariant } from '../../products/entities/product-variant.entity';

@Unique('UQ_basket_user_variant', ['user', 'variant'])
@Entity('basket_items')
export class BasketItem {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => User, (user) => user.basket_items, { onDelete: 'CASCADE' })
  user!: User;

  @ManyToOne(() => Product, (product) => product.basket_items, {
    onDelete: 'CASCADE',
  })
  product!: Product;

  @ManyToOne(() => ProductVariant, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'variant_id',
    foreignKeyConstraintName: 'FK_basket_variant',
  })
  variant?: ProductVariant | null;

  @Column({ type: 'int', default: 1 })
  quantity!: number;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
