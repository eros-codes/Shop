import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToMany,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Product } from '../../products/entities/product.entity';

@Entity('categories')
export class Category {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ nullable: false })
  title!: string;

  @Column({ type: 'varchar', length: 190 })
  slug!: string;

  @ManyToOne(() => Category, (category) => category.children, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({
    name: 'parent_id',
    foreignKeyConstraintName: 'FK_categories_parent',
  })
  parent?: Category | null;

  @OneToMany(() => Category, (category) => category.parent)
  children!: Category[];

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deleted_at?: Date;

  @Index('UQ_categories_active_title', { unique: true })
  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    asExpression: 'IF(`deleted_at` IS NULL, `title`, NULL)',
    generatedType: 'STORED',
    insert: false,
    update: false,
    select: false,
  })
  active_title?: string | null;

  @Index('UQ_categories_active_slug', { unique: true })
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

  @ManyToMany(() => Product, (product) => product.categories)
  products!: Product[];
}
