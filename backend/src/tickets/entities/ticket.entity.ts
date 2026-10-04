import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import TicketStatusEnum from '../enums/ticket-status.enum';

@Entity({ name: 'tickets' })
@Index(['status'])
@Index('IDX_ticket_user_created', ['user', 'created_at'])
export class Ticket {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  title!: string;

  @Column()
  subject!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({
    type: 'enum',
    enum: TicketStatusEnum,
    default: TicketStatusEnum.Open,
  })
  status!: TicketStatusEnum;

  @CreateDateColumn()
  created_at!: Date;

  @ManyToOne(() => User, (user) => user.tickets, { onDelete: 'CASCADE' })
  user!: User;

  @ManyToOne(() => Ticket, (ticket) => ticket.replies, { nullable: true })
  reply_to?: Ticket | null;

  @OneToMany(() => Ticket, (ticket) => ticket.reply_to)
  replies!: Ticket[];

  @DeleteDateColumn()
  deleted_at?: Date;

  repliesCount?: number;
}
