import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinTable,
  ManyToMany,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import DiscountStatusEnum from '../enums/discount-status.enum';
import DiscountTypeEnum from '../enums/discount-type.enum';
import { Order } from '../../orders/entities/order.entity';
import { Product } from '../../products/entities/product.entity';
import { Category } from '../../categories/entities/category.entity';

@Entity('discount_codes')
export class DiscountCode {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true })
  code!: string;

  @Column({ type: 'int' })
  capacity!: number;

  @Column({
    type: 'enum',
    enum: DiscountTypeEnum,
    default: DiscountTypeEnum.Percent,
  })
  type!: DiscountTypeEnum;

  @Column({ type: 'tinyint' })
  off_percent!: number;

  @Column({ type: 'int', unsigned: true, nullable: true })
  off_amount?: number | null;

  @Column({ type: 'int', unsigned: true, nullable: true })
  max_discount_amount?: number | null;

  @Column({ type: 'int', unsigned: true, nullable: true })
  min_order_amount?: number | null;

  @Column({ type: 'datetime', nullable: true })
  starts_at?: Date | null;

  @Column({ type: 'datetime', nullable: true })
  expires_at?: Date | null;

  @Column({ type: 'int', unsigned: true, nullable: true })
  per_user_limit?: number | null;

  @ManyToMany(() => Product)
  @JoinTable({
    name: 'discount_code_products',
    joinColumn: { name: 'discount_code_id' },
    inverseJoinColumn: { name: 'product_id' },
  })
  products!: Product[];

  @ManyToMany(() => Category)
  @JoinTable({
    name: 'discount_code_categories',
    joinColumn: { name: 'discount_code_id' },
    inverseJoinColumn: { name: 'category_id' },
  })
  categories!: Category[];

  @Column({
    type: 'enum',
    enum: DiscountStatusEnum,
    default: DiscountStatusEnum.Active,
  })
  status!: DiscountStatusEnum;

  @OneToMany(() => Order, (order) => order.discount)
  orders!: Order[];

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  @DeleteDateColumn()
  deleted_at?: Date;
}
