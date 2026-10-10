import {
  BadRequestException,
  ForbiddenException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { FilterTicketDto } from './dto/filter-ticket.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Ticket } from './entities/ticket.entity';
import { PaginatedResult } from '../common/interfaces/paginated-result.interface';
import { DataSource, In, IsNull, Not, Repository } from 'typeorm';
import { UsersService } from '../users/users.service';
import TicketStatusEnum from './enums/ticket-status.enum';
import { AppError } from '../common/errors/app-error';
import { ErrorCodes } from '../common/errors/error-codes';

const MAX_OPEN_THREADS_PER_USER = 10;
const TICKET_COOLDOWN_SECONDS = 30;

const TICKET_USER_FIELDS = ['user.id', 'user.display_name', 'user.mobile'];

@Injectable()
export class TicketsService {
  constructor(
    @InjectRepository(Ticket)
    private readonly ticketRepository: Repository<Ticket>,
    private readonly userService: UsersService,
    private readonly dataSource: DataSource,
  ) {}

  async create(
    userId: number,
    createTicketDto: CreateTicketDto,
    isAdmin = false,
  ): Promise<Ticket> {
    const { reply_to, ...ticketData } = createTicketDto;
    const user = await this.userService.findOne(userId);

    let parent: Ticket | null = null;
    if (reply_to !== undefined && reply_to !== null) {
      parent = await this.ticketRepository.findOne({
        where: { id: reply_to },
        relations: { user: true, reply_to: true },
      });

      if (!parent) {
        throw new NotFoundException(`Ticket with id ${reply_to} not found`);
      }
      if (parent.reply_to) {
        throw new BadRequestException(
          'You Can Not Reply To A Ticket That Has Been Replied To',
        );
      }
      if (!isAdmin && parent.user.id !== userId) {
        throw new ForbiddenException('You can only reply to your own tickets');
      }
      if (parent.status === TicketStatusEnum.Closed) {
        throw AppError.badRequest(
          ErrorCodes.TICKET_CLOSED,
          'This ticket is closed - open a new one instead of replying to it',
        );
      }
    }

    await this.assertNotFlooding(userId, !!parent);

    const ticket = this.ticketRepository.create({
      ...ticketData,
      user,
      reply_to: parent ?? null,
    });
    const saved = await this.ticketRepository.save(ticket);

    if (parent) {
      const nextStatus = isAdmin
        ? TicketStatusEnum.Answered
        : TicketStatusEnum.Open;
      if (parent.status !== nextStatus) {
        await this.ticketRepository.update(
          { id: parent.id },
          { status: nextStatus },
        );
      }
    }

    return saved;
  }

  private async assertNotFlooding(
    userId: number,
    isReply: boolean,
  ): Promise<void> {
    const lastTicket = await this.ticketRepository.findOne({
      where: { user: { id: userId } },
      order: { created_at: 'DESC', id: 'DESC' },
      select: { id: true, created_at: true },
    });
    if (lastTicket) {
      const secondsSince =
        (Date.now() - lastTicket.created_at.getTime()) / 1000;
      if (secondsSince < TICKET_COOLDOWN_SECONDS) {
        const retryAfter = Math.ceil(TICKET_COOLDOWN_SECONDS - secondsSince);
        throw new AppError(
          ErrorCodes.TICKET_COOLDOWN,
          `Please wait ${retryAfter}s before sending another message`,
          HttpStatus.TOO_MANY_REQUESTS,
          { retryAfter },
        );
      }
    }

    if (isReply) return;

    const openThreads = await this.ticketRepository.count({
      where: {
        user: { id: userId },
        reply_to: IsNull(),
        status: Not(TicketStatusEnum.Closed),
      },
    });
    if (openThreads >= MAX_OPEN_THREADS_PER_USER) {
      throw new AppError(
        ErrorCodes.TICKET_LIMIT_REACHED,
        `You already have ${openThreads} open tickets - please continue in one of them instead of opening another`,
        HttpStatus.TOO_MANY_REQUESTS,
        { openThreads, limit: MAX_OPEN_THREADS_PER_USER },
      );
    }
  }

  async findAll(
    userId: number,
    query: FilterTicketDto,
    isAdmin = false,
  ): Promise<PaginatedResult<Ticket>> {
    const { status, page, limit } = query;

    const qb = this.ticketRepository
      .createQueryBuilder('ticket')
      .leftJoin('ticket.user', 'user')
      .addSelect(TICKET_USER_FIELDS)
      .where('ticket.reply_to IS NULL');

    if (!isAdmin) {
      qb.andWhere('user.id = :userId', { userId });
    }
    if (status) {
      qb.andWhere('ticket.status = :status', { status });
    }

    const [items, total] = await qb
      .orderBy('ticket.created_at', 'DESC')
      .addOrderBy('ticket.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    await this.attachRepliesCount(items);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number): Promise<Ticket> {
    const ticket = await this.ticketRepository
      .createQueryBuilder('ticket')
      .leftJoin('ticket.user', 'user')
      .addSelect(TICKET_USER_FIELDS)
      .leftJoinAndSelect('ticket.reply_to', 'parent')
      .where('ticket.id = :id', { id })
      .getOne();

    if (!ticket) {
      throw new NotFoundException(`Ticket with id ${id} not found`);
    }
    await this.attachRepliesCount([ticket]);
    return ticket;
  }

  private async attachRepliesCount(tickets: Ticket[]): Promise<void> {
    const heads = tickets.filter((ticket) => !ticket.reply_to);
    if (heads.length === 0) return;

    const rows = await this.ticketRepository
      .createQueryBuilder('reply')
      .select('reply.reply_to', 'parentId')
      .addSelect('COUNT(*)', 'count')
      .where('reply.reply_to IN (:...ids)', { ids: heads.map((t) => t.id) })
      .groupBy('reply.reply_to')
      .getRawMany<{ parentId: number; count: string }>();

    const counts = new Map(
      rows.map((row) => [Number(row.parentId), Number(row.count)]),
    );
    for (const ticket of tickets) {
      ticket.repliesCount = counts.get(ticket.id) ?? 0;
    }
  }

  async findReplies(
    ticketId: number,
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<Ticket>> {
    const { page, limit } = query;

    const [items, total] = await this.ticketRepository
      .createQueryBuilder('ticket')
      .leftJoin('ticket.user', 'user')
      .addSelect(TICKET_USER_FIELDS)
      .where('ticket.reply_to = :ticketId', { ticketId })
      .orderBy('ticket.created_at', 'ASC')
      .addOrderBy('ticket.id', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async update(id: number, updateTicketDto: UpdateTicketDto): Promise<Ticket> {
    const ticket = await this.ticketRepository.findOneBy({ id });
    if (!ticket) {
      throw new NotFoundException(`Ticket with id ${id} not found`);
    }
    ticket.status = updateTicketDto.status;
    return await this.ticketRepository.save(ticket);
  }

  async remove(id: number): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const tickets = manager.getRepository(Ticket);
      const ticket = await tickets.findOne({
        where: { id },
        relations: { reply_to: true },
      });
      if (!ticket) {
        throw new NotFoundException(`Ticket with id ${id} not found`);
      }

      if (!ticket.reply_to) {
        const replies = await tickets.find({
          select: { id: true },
          where: { reply_to: { id } },
        });
        if (replies.length) {
          await tickets.softDelete({ id: In(replies.map((r) => r.id)) });
        }
      }
      await tickets.softDelete({ id });
    });
  }
}
