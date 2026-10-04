import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('invoice_sequences')
export class InvoiceSequence {
  @PrimaryColumn({ type: 'int' })
  year!: number;

  @Column({ type: 'int', unsigned: true, default: 0 })
  last_number!: number;

  @UpdateDateColumn()
  updated_at!: Date;
}
