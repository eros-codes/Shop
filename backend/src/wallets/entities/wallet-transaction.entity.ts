import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Wallet } from './wallet.entity';
import WalletTransactionTypeEnum from '../enums/wallet-transaction-type.enum';
import { bigintTransformer } from '../../common/database/bigint.transformer';

@Entity('wallet_transactions')
@Index(['wallet'])
export class WalletTransaction {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Wallet, { onDelete: 'RESTRICT' })
  wallet!: Wallet;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  amount!: number;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  balanceAfter!: number;

  @Column({ type: 'enum', enum: WalletTransactionTypeEnum })
  type!: WalletTransactionTypeEnum;

  @Column({ nullable: true })
  description?: string;

  @CreateDateColumn()
  createdAt!: Date;
}
