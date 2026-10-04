import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Attribute } from './attribute.entity';

// One allowed value of an attribute: "مشکی", "XL", "256".
//
// Values are rows rather than free text on purpose. Free text is what
// makes a colour filter useless - one admin types "مشکی", the next
// types "سیاه", and the shop now has two colours that are the same
// colour.
@Entity('attribute_options')
@Index('IDX_attribute_option_attribute', ['attribute'])
export class AttributeOption {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Attribute, (attribute) => attribute.options, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'attribute_id',
    foreignKeyConstraintName: 'FK_attribute_option_attribute',
  })
  attribute!: Attribute;

  // What the customer sees.
  @Column()
  value!: string;

  // What a filter URL carries: ?color=black.
  @Column({ type: 'varchar', length: 190 })
  slug!: string;

  // For colour attributes, so a storefront can draw the swatch.
  @Column({ type: 'varchar', length: 9, nullable: true })
  hex?: string | null;

  // Sizes sort as S, M, L, XL - not alphabetically. Any attribute whose
  // values have a natural order carries it here.
  @Column({ type: 'int', default: 0 })
  sort_order!: number;

  // The number behind the label ("256" for "256 GB"), so a range filter
  // is possible without parsing the text.
  @Column({ type: 'decimal', precision: 12, scale: 3, nullable: true })
  numeric_value?: string | null;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deleted_at?: Date;
}
