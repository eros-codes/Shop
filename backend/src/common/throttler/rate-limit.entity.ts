import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('rate_limits')
@Index('IDX_rate_limit_expires', ['expires_at'])
export class RateLimit {
  @PrimaryColumn({ name: 'bucket_key', type: 'varchar', length: 191 })
  bucketKey!: string;

  @Column({ type: 'int', default: 0 })
  hits!: number;

  @Column({ type: 'datetime', precision: 3 })
  expires_at!: Date;

  @Column({ type: 'datetime', precision: 3, nullable: true })
  blocked_until?: Date | null;
}
