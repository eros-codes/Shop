import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ReturnRequest } from './return-request.entity';
import { OrderItem } from '../../orders/entities/order-item.entity';

@Entity('return_items')
export class ReturnItem {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => ReturnRequest, (request) => request.items, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'return_request_id',
    foreignKeyConstraintName: 'FK_return_item_request',
  })
  returnRequest!: ReturnRequest;

  @ManyToOne(() => OrderItem, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'order_item_id',
    foreignKeyConstraintName: 'FK_return_item_order_item',
  })
  orderItem!: OrderItem;

  @Column({ type: 'int', unsigned: true })
  quantity!: number;
}
