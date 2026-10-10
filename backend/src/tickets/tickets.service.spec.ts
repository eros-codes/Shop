import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TicketsService } from './tickets.service';
import { Ticket } from './entities/ticket.entity';
import { UsersService } from '../users/users.service';
import TicketStatusEnum from './enums/ticket-status.enum';
import { ErrorCodes } from '../common/errors/error-codes';

const mockRepo = () => ({
  findOne: jest.fn(),
  findOneBy: jest.fn(),
  find: jest.fn().mockResolvedValue([]),
  findAndCount: jest.fn(),
  count: jest.fn().mockResolvedValue(0),
  create: jest.fn((d) => d),
  save: jest.fn((d) => Promise.resolve({ id: 1, ...d })),
  update: jest.fn(),
  delete: jest.fn(),
  softDelete: jest.fn(),
  createQueryBuilder: jest.fn(),
});

describe('TicketsService', () => {
  let service: TicketsService;
  let ticketRepo: ReturnType<typeof mockRepo>;
  let usersService: { findOne: jest.Mock };
  let qb: Record<string, jest.Mock>;

  const headTicket = (overrides: Record<string, unknown> = {}) => ({
    id: 5,
    status: TicketStatusEnum.Open,
    user: { id: 7 },
    reply_to: null,
    ...overrides,
  });
  const body = { title: 'Help', subject: 'x', description: 'y' };

  const mockLookups = (parent: unknown = null, lastTicket: unknown = null) => {
    ticketRepo.findOne.mockImplementation((options: any) =>
      Promise.resolve(options?.select?.created_at ? lastTicket : parent),
    );
  };

  beforeEach(async () => {
    ticketRepo = mockRepo();
    usersService = { findOne: jest.fn().mockResolvedValue({ id: 7 }) };

    qb = {};
    for (const method of [
      'leftJoin',
      'leftJoinAndSelect',
      'addSelect',
      'select',
      'where',
      'andWhere',
      'orderBy',
      'addOrderBy',
      'groupBy',
      'skip',
      'take',
    ]) {
      qb[method] = jest.fn(() => qb);
    }
    qb.getOne = jest.fn().mockResolvedValue(null);
    qb.getManyAndCount = jest.fn().mockResolvedValue([[], 0]);
    qb.getRawMany = jest.fn().mockResolvedValue([]);
    ticketRepo.createQueryBuilder.mockImplementation(() => qb);

    const mockManager = { getRepository: jest.fn(() => ticketRepo) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TicketsService,
        { provide: getRepositoryToken(Ticket), useValue: ticketRepo },
        { provide: UsersService, useValue: usersService },
        {
          provide: DataSource,
          useValue: { transaction: jest.fn((cb: any) => cb(mockManager)) },
        },
      ],
    }).compile();

    service = module.get(TicketsService);
  });

  describe('create', () => {
    it('creates a standalone ticket with no reply_to', async () => {
      mockLookups();

      const created = await service.create(7, { ...body });

      expect(ticketRepo.save).toHaveBeenCalled();
      expect(ticketRepo.save.mock.calls[0][0].reply_to).toBeNull();
      expect(created).toBeDefined();
    });

    it('links reply_to when replying to your own head ticket', async () => {
      mockLookups(headTicket());

      await service.create(7, { ...body, reply_to: 5 });

      const saved = ticketRepo.save.mock.calls[0][0];
      expect(saved.reply_to).toMatchObject({ id: 5 });
    });

    it("refuses to post into someone else's thread", async () => {
      mockLookups(headTicket({ user: { id: 999 } }));

      await expect(
        service.create(7, { ...body, reply_to: 5 } as any),
      ).rejects.toThrow(ForbiddenException);
      expect(ticketRepo.save).not.toHaveBeenCalled();
    });

    it('lets support staff reply to any thread, and marks it answered', async () => {
      mockLookups(headTicket({ user: { id: 999 } }));

      await service.create(1, { ...body, reply_to: 5 }, true);

      expect(ticketRepo.save).toHaveBeenCalled();
      expect(ticketRepo.update).toHaveBeenCalledWith(
        { id: 5 },
        { status: TicketStatusEnum.Answered },
      );
    });

    it('404s on an unknown reply_to instead of creating a new ticket', async () => {
      mockLookups(null);

      await expect(
        service.create(7, { ...body, reply_to: 999999 } as any),
      ).rejects.toThrow(NotFoundException);
      expect(ticketRepo.save).not.toHaveBeenCalled();
    });

    it('refuses to reply to a closed ticket', async () => {
      mockLookups(headTicket({ status: TicketStatusEnum.Closed }));

      await expect(
        service.create(7, { ...body, reply_to: 5 } as any),
      ).rejects.toMatchObject({ status: 400, code: ErrorCodes.TICKET_CLOSED });
    });

    it('rejects replying to a ticket that is already itself a reply', async () => {
      mockLookups(headTicket({ reply_to: { id: 1 } }));

      await expect(
        service.create(7, { ...body, reply_to: 5 } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('applies a cooldown between messages', async () => {
      mockLookups(null, { id: 3, created_at: new Date() });

      await expect(service.create(7, { ...body } as any)).rejects.toMatchObject(
        {
          status: 429,
          code: ErrorCodes.TICKET_COOLDOWN,
          details: { retryAfter: expect.any(Number) },
        },
      );
    });

    it('caps how many threads one account can leave open', async () => {
      mockLookups();
      ticketRepo.count.mockResolvedValue(10);

      await expect(service.create(7, { ...body } as any)).rejects.toMatchObject(
        {
          status: 429,
          code: ErrorCodes.TICKET_LIMIT_REACHED,
          details: { limit: 10 },
        },
      );
      expect(ticketRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException - not an ORM error the filter turns into a 500', async () => {
      qb.getOne.mockResolvedValue(null);

      await expect(service.findOne(999999)).rejects.toThrow(NotFoundException);
    });

    it('returns the ticket with a reply count instead of every reply', async () => {
      qb.getOne.mockResolvedValue({ id: 5, reply_to: null });
      qb.getRawMany.mockResolvedValue([{ parentId: 5, count: '42' }]);

      const ticket = await service.findOne(5);

      expect(ticket.repliesCount).toBe(42);
      expect((ticket as { replies?: unknown }).replies).toBeUndefined();
    });
  });

  describe('findAll', () => {
    it('scopes to the caller when not an admin', async () => {
      await service.findAll(7, { page: 1, limit: 10 }, false);

      expect(qb.andWhere).toHaveBeenCalledWith('user.id = :userId', {
        userId: 7,
      });
    });

    it('does not scope to a user when the caller is an admin', async () => {
      await service.findAll(7, { page: 1, limit: 10 }, true);

      expect(qb.andWhere).not.toHaveBeenCalledWith(
        'user.id = :userId',
        expect.anything(),
      );
    });
  });

  describe('findReplies', () => {
    it("does not hand a customer the support agent's mobile number", async () => {
      await service.findReplies(5, { page: 1, limit: 10 });

      expect(qb.addSelect).toHaveBeenCalledWith([
        'user.id',
        'user.display_name',
      ]);
    });

    it('gives staff the mobile number of whoever wrote each message', async () => {
      await service.findReplies(5, { page: 1, limit: 10 }, true);

      expect(qb.addSelect).toHaveBeenCalledWith([
        'user.id',
        'user.display_name',
        'user.mobile',
      ]);
    });
  });

  describe('remove', () => {
    it('soft-deletes a thread head together with its replies', async () => {
      mockLookups({ id: 5, reply_to: null });
      ticketRepo.find.mockResolvedValue([{ id: 6 }, { id: 7 }]);

      await service.remove(5);

      expect(ticketRepo.delete).not.toHaveBeenCalled();
      expect(ticketRepo.softDelete).toHaveBeenCalledTimes(2);
      expect(ticketRepo.softDelete).toHaveBeenLastCalledWith({ id: 5 });
    });

    it('throws NotFoundException for a ticket that does not exist', async () => {
      mockLookups(null);

      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
    });
  });
});
