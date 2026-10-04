import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, FindOptionsWhere, Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';
import { User } from '../users/entities/user.entity';
import { PaginatedResult } from '../common/interfaces/paginated-result.interface';
import { FilterAuditLogDto } from './dto/filter-audit-log.dto';

export interface AuditActor {
  userId?: number | null;
  label?: string | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogs: Repository<AuditLog>,
  ) {}

  async record(params: {
    action: string;
    entityType: string;
    entityId?: number | null;
    actor?: AuditActor | null;
    changes?: Record<string, unknown> | null;
  }): Promise<void> {
    try {
      await this.auditLogs.save(
        this.auditLogs.create({
          action: params.action,
          entity_type: params.entityType,
          entity_id: params.entityId ?? null,
          actor: params.actor?.userId
            ? ({ id: params.actor.userId } as User)
            : null,
          actor_label: params.actor?.label ?? null,
          changes: params.changes ?? null,
        }),
      );
    } catch (error) {
      this.logger.error(
        `Could not write an audit entry for ${params.action}: ${(error as Error).message}`,
      );
    }
  }

  async findAll(query: FilterAuditLogDto): Promise<PaginatedResult<AuditLog>> {
    const { page, limit, action, entityType, entityId, actorId, from, to } =
      query;

    const where: FindOptionsWhere<AuditLog> = {};
    if (action) where.action = action;
    if (entityType) where.entity_type = entityType;
    if (entityId) where.entity_id = entityId;
    if (actorId) where.actor = { id: actorId };
    if (from && to) {
      where.created_at = Between(new Date(from), new Date(to));
    }

    const [items, total] = await this.auditLogs.findAndCount({
      where,
      relations: { actor: true },
      select: {
        id: true,
        action: true,
        entity_type: true,
        entity_id: true,
        actor_label: true,
        changes: true,
        created_at: true,
        actor: { id: true, display_name: true, mobile: true },
      },
      order: { created_at: 'DESC', id: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}
