import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Product } from './product.entity';

// One stored width of an uploaded photo.
export interface ImageSize {
  width: number;
  url: string;
}

@Entity('product_images')
@Unique('UQ_product_images_product_order', ['product', 'order'])
export class ProductImage {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  filename!: string;

  @Column()
  url!: string;

  @Column({ default: 0 })
  order!: number;

  // Every width the photo is stored at, smallest first; `url` is the
  // largest. NULL for images from before resizing, and for SVG drawings,
  // which scale on their own.
  @Column({ type: 'json', nullable: true })
  sizes!: ImageSize[] | null;

  @ManyToOne(() => Product, (product) => product.images, {
    onDelete: 'CASCADE',
  })
  product!: Product;

  @CreateDateColumn()
  createdAt!: Date;
}
