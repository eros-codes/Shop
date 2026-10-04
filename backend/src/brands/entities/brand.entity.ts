import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Product } from '../../products/entities/product.entity';

@Entity('brands')
export class Brand {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  title!: string;

  @Column({ type: 'varchar', length: 190 })
  slug!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description?: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  logo_url?: string | null;

  @OneToMany(() => Product, (product) => product.brand)
  products!: Product[];

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deleted_at?: Date;

  @Index('UQ_brands_active_slug', { unique: true })
  @Column({
    type: 'varchar',
    length: 190,
    nullable: true,
    asExpression: 'IF(`deleted_at` IS NULL, `slug`, NULL)',
    generatedType: 'STORED',
    insert: false,
    update: false,
    select: false,
  })
  active_slug?: string | null;
}
