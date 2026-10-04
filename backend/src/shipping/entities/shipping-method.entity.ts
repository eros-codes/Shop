import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ShippingRate } from './shipping-rate.entity';

@Entity('shipping_methods')
export class ShippingMethod {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  title!: string;

  @Column({ type: 'varchar', length: 190 })
  code!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description?: string | null;

  @Column({ type: 'int', unsigned: true, default: 1 })
  estimated_days_min!: number;

  @Column({ type: 'int', unsigned: true, default: 3 })
  estimated_days_max!: number;

  @Column({ type: 'boolean', default: false })
  supports_cash_on_delivery!: boolean;

  @Column({ type: 'boolean', default: true })
  is_active!: boolean;

  @Column({ type: 'int', default: 0 })
  sort_order!: number;

  @OneToMany(() => ShippingRate, (rate) => rate.method)
  rates!: ShippingRate[];

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deleted_at?: Date;

  @Index('UQ_shipping_method_active_code', { unique: true })
  @Column({
    type: 'varchar',
    length: 190,
    nullable: true,
    asExpression: 'IF(`deleted_at` IS NULL, `code`, NULL)',
    generatedType: 'STORED',
    insert: false,
    update: false,
    select: false,
  })
  active_code?: string | null;
}
