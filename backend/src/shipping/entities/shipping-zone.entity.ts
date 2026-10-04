import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ShippingRate } from './shipping-rate.entity';

@Entity('shipping_zones')
export class ShippingZone {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  title!: string;

  @Column({ type: 'json', nullable: true })
  provinces?: string[] | null;

  @Column({ type: 'boolean', default: false })
  is_default!: boolean;

  @OneToMany(() => ShippingRate, (rate) => rate.zone)
  rates!: ShippingRate[];

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deleted_at?: Date;
}
