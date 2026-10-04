import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import OtpPurposeEnum from '../enums/otp-purpose.enum';

@Entity('otp_verifications')
@Index('IDX_otp_expires', ['expiresAt'])
// One pending code per (number, purpose): someone resetting their
// password must not wipe out a signup code for the same number, and the
// resend counters stay separate too.
@Unique('UQ_otp_mobile_purpose', ['mobile', 'purpose'])
export class OtpVerification {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  mobile!: string;

  @Column({
    type: 'enum',
    enum: OtpPurposeEnum,
    default: OtpPurposeEnum.Register,
  })
  purpose!: OtpPurposeEnum;

  @Column()
  codeHash!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  displayName?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  hashedPassword?: string | null;

  @Column()
  expiresAt!: Date;

  @Column({ default: 0 })
  attempts!: number;

  @Column({ type: 'datetime', nullable: true })
  lastSentAt?: Date | null;

  @Column({ type: 'int', default: 1 })
  sendCount!: number;

  @Column({ type: 'datetime', nullable: true })
  windowStartedAt?: Date | null;

  @CreateDateColumn()
  createdAt!: Date;
}
