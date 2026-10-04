import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { ShippingMethod } from './shipping-method.entity';
import { ShippingZone } from './shipping-zone.entity';

@Entity('shipping_rates')
@Unique('UQ_shipping_rate_method_zone', ['method', 'zone'])
export class ShippingRate {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => ShippingMethod, (method) => method.rates, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'method_id', foreignKeyConstraintName: 'FK_rate_method' })
  method!: ShippingMethod;

  @ManyToOne(() => ShippingZone, (zone) => zone.rates, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'zone_id', foreignKeyConstraintName: 'FK_rate_zone' })
  zone!: ShippingZone;

  @Column({ type: 'int', unsigned: true, default: 0 })
  base_cost!: number;

  @Column({ type: 'int', unsigned: true, default: 0 })
  per_kg_cost!: number;

  @Column({ type: 'int', unsigned: true, nullable: true })
  free_shipping_threshold?: number | null;

  @Column({ type: 'int', unsigned: true, default: 0 })
  cash_on_delivery_fee!: number;

  @Column({ type: 'boolean', default: true })
  is_active!: boolean;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deleted_at?: Date;
}
