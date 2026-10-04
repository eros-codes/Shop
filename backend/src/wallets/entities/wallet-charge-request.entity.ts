import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Wallet } from './wallet.entity';
import { bigintTransformer } from '../../common/database/bigint.transformer';

@Entity('wallet_charge_requests')
export class WalletChargeRequest {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true })
  authority!: string;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  amount!: number;

  @ManyToOne(() => Wallet, { onDelete: 'RESTRICT' })
  wallet!: Wallet;

  @Column({ default: 'pending' })
  status!: 'pending' | 'completed' | 'failed';

  @CreateDateColumn()
  createdAt!: Date;
}
