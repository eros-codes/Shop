import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  OneToMany,
  Index,
  Unique,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Address } from '../../address/entities/address.entity';
import { DiscountCode } from '../../discount-codes/entities/discount-code.entity';
import OrderStatusEnum from '../enums/order-status.enum';
import PaymentMethodEnum from '../enums/payment-method.enum';
import { OrderItem } from './order-item.entity';
import { ShippingMethod } from '../../shipping/entities/shipping-method.entity';
import { bigintTransformer } from '../../common/database/bigint.transformer';

@Entity()
@Index(['status'])
@Index('IDX_order_user_created', ['user', 'createdAt'])
@Index('IDX_order_payment_expires', ['payment_expires_at'])
@Unique('UQ_order_user_idempotency_key', ['user', 'idempotency_key'])
export class Order {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => User, (user) => user.orders, { onDelete: 'CASCADE' })
  user!: User;

  @Column({
    type: 'enum',
    enum: OrderStatusEnum,
    default: OrderStatusEnum.Pending,
  })
  status!: OrderStatusEnum;

  @Column({
    type: 'timestamp',
    nullable: true,
  })
  payed_time!: Date;

  @Column({ type: 'datetime', nullable: true })
  delivered_at?: Date | null;

  @Column({
    type: 'enum',
    enum: PaymentMethodEnum,
    nullable: true,
  })
  payment_method?: PaymentMethodEnum | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  payment_reference?: string | null;

  @Column({ type: 'datetime', nullable: true })
  payment_expires_at?: Date | null;

  @Column({ type: 'boolean', default: false })
  discount_reserved!: boolean;

  @Column({ type: 'varchar', length: 64, nullable: true })
  idempotency_key?: string | null;

  @Column({ type: 'char', length: 64, nullable: true, select: false })
  idempotency_fingerprint?: string | null;

  @Column({ type: 'bigint', default: 0, transformer: bigintTransformer })
  refunded_amount!: number;

  // Issued once the order becomes a real sale: paid, or placed as cash on
  // delivery. Unique across the shop; the index is named so it matches
  // the one the migration created.
  @Index('UQ_order_invoice_number', { unique: true })
  @Column({ type: 'varchar', length: 32, nullable: true })
  invoice_number?: string | null;

  @Column({ nullable: true, unique: true })
  zarinpalAuthority?: string;

  @ManyToOne(() => Address, (a) => a.orders, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'address_id' })
  address?: Address | null;

  @Column({ type: 'json', nullable: true })
  shippingAddressSnapshot?: {
    province: string;
    city: string;
    address: string;
    postal_code: string;
    receiver_mobile: string;
    description?: string;
  };

  @Column({ type: 'bigint', default: 0, transformer: bigintTransformer })
  // All money is Toman. The breakdown adds up to what was charged:
  // total_price = items_total - discount_amount + shipping_cost
  //               + tax_amount + cod_fee
  items_total!: number;

  @Column({ type: 'bigint', default: 0, transformer: bigintTransformer })
  discount_amount!: number;

  @Column({ type: 'bigint', default: 0, transformer: bigintTransformer })
  shipping_cost!: number;

  @Column({ type: 'bigint', default: 0, transformer: bigintTransformer })
  tax_amount!: number;

  @Column({ type: 'bigint', default: 0, transformer: bigintTransformer })
  cod_fee!: number;

  @Column({
    type: 'bigint',
    default: 0,
    transformer: bigintTransformer,
  })
  total_price!: number;

  @ManyToOne(() => ShippingMethod, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'shipping_method_id',
    foreignKeyConstraintName: 'FK_order_shipping_method',
  })
  shipping_method?: ShippingMethod | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  shipping_method_title?: string | null;

  @Column({ type: 'int', unsigned: true, nullable: true })
  shipping_eta_days_min?: number | null;

  @Column({ type: 'int', unsigned: true, nullable: true })
  shipping_eta_days_max?: number | null;

  @ManyToOne(() => DiscountCode, (discount) => discount.orders, {
    nullable: true,
  })
  @JoinColumn({ name: 'discount_id' })
  discount?: DiscountCode | null;

  @OneToMany(() => OrderItem, (item) => item.order, {
    cascade: true,
  })
  items!: OrderItem[];

  @Column({
    default: 0,
  })
  total_quantity!: number;

  @Column({
    nullable: true,
  })
  tracking_code!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}
