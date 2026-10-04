import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Order } from '../../orders/entities/order.entity';

@Entity('addresses')
export class Address {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ nullable: false })
  province!: string;

  @Column({ nullable: false })
  city!: string;

  @Column({ nullable: false })
  address!: string;

  @Column({ nullable: false, length: 10 })
  postal_code!: string;

  @Column({ nullable: false, length: 11 })
  receiver_mobile!: string;

  @Column({ nullable: true })
  description!: string;

  @ManyToOne(() => User, (user) => user.addresses, { onDelete: 'CASCADE' })
  user!: User;

  @OneToMany(() => Order, (a) => a.address)
  orders!: Order[];

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
