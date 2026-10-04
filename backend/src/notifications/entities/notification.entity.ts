import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Order } from '../../orders/entities/order.entity';
import NotificationEventEnum from '../enums/notification-event.enum';

@Entity('notifications')
@Unique('UQ_notification_order_event', ['order', 'event'])
@Index('IDX_notification_status', ['status'])
export class Notification {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Order, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'order_id',
    foreignKeyConstraintName: 'FK_notification_order',
  })
  order?: Order | null;

  @Column({ type: 'enum', enum: NotificationEventEnum })
  event!: NotificationEventEnum;

  @Column({ type: 'varchar', length: 20 })
  mobile!: string;

  @Column({
    type: 'enum',
    enum: ['pending', 'sent', 'failed', 'skipped'],
    default: 'pending',
  })
  status!: 'pending' | 'sent' | 'failed' | 'skipped';

  @Column({ type: 'int', unsigned: true, default: 0 })
  attempts!: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  provider_message_id?: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  error?: string | null;

  @Column({ type: 'json', nullable: true })
  parameters?: Record<string, string> | null;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
