import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Order } from '../../orders/entities/order.entity';
import { User } from '../../users/entities/user.entity';
import { ReturnItem } from './return-item.entity';
import ReturnStatusEnum from '../enums/return-status.enum';
import ReturnReasonEnum from '../enums/return-reason.enum';
import { bigintTransformer } from '../../common/database/bigint.transformer';

@Entity('return_requests')
@Index('IDX_return_status', ['status'])
export class ReturnRequest {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Order, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id', foreignKeyConstraintName: 'FK_return_order' })
  order!: Order;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'FK_return_user' })
  user!: User;

  @OneToMany(() => ReturnItem, (item) => item.returnRequest, { cascade: true })
  items!: ReturnItem[];

  @Column({
    type: 'enum',
    enum: ReturnStatusEnum,
    default: ReturnStatusEnum.Requested,
  })
  status!: ReturnStatusEnum;

  @Column({ type: 'enum', enum: ReturnReasonEnum })
  reason!: ReturnReasonEnum;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  description?: string | null;

  @Column({ type: 'bigint', default: 0, transformer: bigintTransformer })
  refund_amount!: number;

  @Column({ type: 'boolean', default: true })
  restock!: boolean;

  @Column({ type: 'varchar', length: 500, nullable: true })
  admin_note?: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'resolved_by_id',
    foreignKeyConstraintName: 'FK_return_resolved_by',
  })
  resolved_by?: User | null;

  @Column({ type: 'datetime', nullable: true })
  resolved_at?: Date | null;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
