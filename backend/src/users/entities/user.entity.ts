import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import userRoleEnum from '../enums/userRoleEnum';
import { Address } from '../../address/entities/address.entity';
import { Ticket } from '../../tickets/entities/ticket.entity';
import { BookmarkProduct } from '../../products/entities/product-bookmark.entity';
import { Order } from '../../orders/entities/order.entity';
import { Comment } from '../../comments/entities/comment.entity';
import { BasketItem } from './basket-item.entity';
import { Wallet } from '../../wallets/entities/wallet.entity';

@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ nullable: true })
  display_name!: string;

  @Column({ unique: true })
  mobile!: string;

  @Column({ select: false })
  password!: string;

  @Column({
    type: 'enum',
    enum: userRoleEnum,
    default: userRoleEnum.NormalUser,
  })
  role!: userRoleEnum;

  @OneToMany(() => Address, (address) => address.user)
  addresses!: Address[];

  @OneToMany(() => Ticket, (ticket) => ticket.user)
  tickets!: Ticket[];

  @OneToMany(() => Comment, (comment) => comment.user)
  comments!: Comment[];

  @OneToMany(() => BookmarkProduct, (b) => b.user)
  bookmarks!: BookmarkProduct[];

  @OneToMany(() => Order, (o) => o.user)
  orders!: Order[];

  @OneToMany(() => BasketItem, (basketItem) => basketItem.user)
  basket_items!: BasketItem[];

  @OneToOne(() => Wallet, (wallet) => wallet.user)
  wallet?: Wallet;

  // Tokens issued before this instant are refused. Set whenever the
  // password changes; see the JWT strategy for how it is checked.
  @Column({
    type: 'datetime',
    precision: 3,
    nullable: true,
    select: false,
  })
  tokens_valid_after?: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}
