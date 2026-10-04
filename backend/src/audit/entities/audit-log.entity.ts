import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('audit_logs')
@Index('IDX_audit_entity', ['entity_type', 'entity_id'])
@Index('IDX_audit_created', ['created_at'])
export class AuditLog {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'actor_id', foreignKeyConstraintName: 'FK_audit_actor' })
  actor?: User | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  actor_label?: string | null;

  @Column({ type: 'varchar', length: 100 })
  action!: string;

  @Column({ type: 'varchar', length: 50 })
  entity_type!: string;

  @Column({ type: 'int', nullable: true })
  entity_id?: number | null;

  @Column({ type: 'json', nullable: true })
  changes?: Record<string, unknown> | null;

  @CreateDateColumn()
  created_at!: Date;
}
