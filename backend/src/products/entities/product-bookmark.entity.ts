import {
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Product } from './product.entity';
import { User } from '../../users/entities/user.entity';

@Unique(['product', 'user'])
@Entity('bookmarks')
export class BookmarkProduct {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Product, (p) => p.bookmarks)
  @JoinColumn({ name: 'product_id' })
  product!: Product;

  @ManyToOne(() => User, (u) => u.bookmarks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;
}
