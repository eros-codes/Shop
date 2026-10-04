import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Attribute } from './attribute.entity';
import { Category } from '../../categories/entities/category.entity';

// Which attributes a category's products are described by.
//
// This is what lets the admin form build itself: pick "کفش" and the
// form asks for size and colour, pick "عطر" and it asks for volume.
// Without it, every product would offer every attribute in the shop.
@Entity('category_attributes')
@Unique('UQ_category_attribute', ['category', 'attribute'])
export class CategoryAttribute {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Category, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'category_id',
    foreignKeyConstraintName: 'FK_category_attribute_category',
  })
  category!: Category;

  @ManyToOne(() => Attribute, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'attribute_id',
    foreignKeyConstraintName: 'FK_category_attribute_attribute',
  })
  attribute!: Attribute;

  // A required axis has to be answered by every variant of a product in
  // this category: a shoe without a size is not a thing anyone can buy.
  @Column({ type: 'boolean', default: false })
  is_required!: boolean;

  @Column({ type: 'int', default: 0 })
  sort_order!: number;
}
