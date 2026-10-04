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
import AttributeTypeEnum from '../enums/attribute-type.enum';
import { AttributeOption } from './attribute-option.entity';

// A property a shop sells on: colour, size, storage, volume, SPF.
//
// The shop defines these; nothing here is hard-coded to a particular
// kind of product, which is what lets the same backend run a clothing
// shop and an electronics shop.
@Entity('attributes')
export class Attribute {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  title!: string;

  @Column({ type: 'varchar', length: 190 })
  code!: string;

  @Column({
    type: 'enum',
    enum: AttributeTypeEnum,
    default: AttributeTypeEnum.Select,
  })
  type!: AttributeTypeEnum;

  // "GB", "ml", "cm". Shown next to the value, never parsed.
  @Column({ type: 'varchar', length: 20, nullable: true })
  unit?: string | null;

  // Whether this attribute splits a product into separately priced and
  // separately counted variants. Colour usually does; screen size does
  // not. Only select/colour attributes can be axes - an axis needs a
  // fixed list of values to combine.
  @Column({ type: 'boolean', default: false })
  is_variant_axis!: boolean;

  @Column({ type: 'boolean', default: true })
  is_filterable!: boolean;

  @Column({ type: 'int', default: 0 })
  sort_order!: number;

  @OneToMany(() => AttributeOption, (option) => option.attribute)
  options!: AttributeOption[];

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deleted_at?: Date;

  // Unique among live rows only.
  @Index('UQ_attribute_active_code', { unique: true })
  @Column({
    type: 'varchar',
    length: 190,
    nullable: true,
    asExpression: 'IF(`deleted_at` IS NULL, `code`, NULL)',
    generatedType: 'STORED',
    insert: false,
    update: false,
    select: false,
  })
  active_code?: string | null;
}
