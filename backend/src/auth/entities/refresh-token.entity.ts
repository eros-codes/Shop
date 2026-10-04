import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('refresh_tokens')
@Index('IDX_refresh_token_expires', ['expiresAt'])
@Index('IDX_refresh_token_family', ['familyId'])
export class RefreshToken {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true })
  tokenHash!: string;

  @Column({ type: 'varchar', length: 36 })
  familyId!: string;

  @Column({ type: 'datetime', nullable: true })
  usedAt?: Date | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user!: User;

  @Column()
  expiresAt!: Date;

  @CreateDateColumn()
  createdAt!: Date;
}
