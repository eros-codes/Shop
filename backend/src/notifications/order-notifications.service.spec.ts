import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { QueryFailedError } from 'typeorm';
import { OrderNotificationsService } from './order-notifications.service';
import { Notification } from './entities/notification.entity';
import NotificationEventEnum from './enums/notification-event.enum';
import { SmsService } from '../sms/sms.service';

const duplicate = () =>
  new QueryFailedError(
    'INSERT',
    [],
    Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY', errno: 1062 }),
  );

describe('OrderNotificationsService', () => {
  let service: OrderNotificationsService;
  let repo: Record<string, jest.Mock>;
  let sms: { sendTemplate: jest.Mock; isConfigured: boolean };
  let config: { get: jest.Mock };

  const order = (overrides: Record<string, unknown> = {}) =>
    ({
      id: 5,
      invoice_number: 'INV-1404-000007',
      total_price: 1_250_000,
      tracking_code: 'TRK-9',
      shipping_method_title: 'پست پیشتاز',
      shippingAddressSnapshot: { receiver_mobile: '09120000002' },
      user: { mobile: '09120000009' },
      ...overrides,
    }) as never;

  beforeEach(async () => {
    repo = {
      create: jest.fn((data) => data),
      save: jest.fn(async (data) => ({ id: 1, attempts: 0, ...data })),
      update: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
    };
    sms = {
      sendTemplate: jest
        .fn()
        .mockResolvedValue({ delivered: true, messageId: 'm-1' }),
      isConfigured: true,
    };
    config = { get: jest.fn(() => '12345') };

    const moduleRef = await Test.createTestingModule({
      providers: [
        OrderNotificationsService,
        { provide: getRepositoryToken(Notification), useValue: repo },
        { provide: SmsService, useValue: sms },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = moduleRef.get(OrderNotificationsService);
  });

  it('sends to the number the parcel is going to, not the account holder', async () => {
    await service.notify(order(), NotificationEventEnum.OrderPaid);

    expect(sms.sendTemplate).toHaveBeenCalledWith(
      '09120000002',
      '12345',
      expect.objectContaining({ ORDER: 'INV-1404-000007' }),
    );
  });

  it('falls back to the account number when the address carries none', async () => {
    await service.notify(
      order({ shippingAddressSnapshot: null }),
      NotificationEventEnum.OrderPaid,
    );

    expect(sms.sendTemplate).toHaveBeenCalledWith(
      '09120000009',
      expect.anything(),
      expect.anything(),
    );
  });

  it('puts the tracking code in a shipping message', async () => {
    await service.notify(order(), NotificationEventEnum.OrderSent);

    expect(sms.sendTemplate).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ TRACKING: 'TRK-9', CARRIER: 'پست پیشتاز' }),
    );
  });

  it('never sends the same event for the same order twice', async () => {
    repo.save.mockRejectedValue(duplicate());

    await service.notify(order(), NotificationEventEnum.OrderPaid);

    expect(sms.sendTemplate).not.toHaveBeenCalled();
  });

  it('records a skip when the shop has no template for that event yet', async () => {
    config.get.mockReturnValue(undefined);

    await service.notify(order(), NotificationEventEnum.OrderDelivered);

    expect(sms.sendTemplate).not.toHaveBeenCalled();
    expect(repo.update).toHaveBeenCalledWith(
      { id: 1 },
      expect.objectContaining({ status: 'skipped' }),
    );
  });

  it('records a failure instead of throwing, so the order is untouched', async () => {
    sms.sendTemplate.mockResolvedValue({
      delivered: false,
      error: 'provider down',
    });

    await expect(
      service.notify(order(), NotificationEventEnum.OrderPaid),
    ).resolves.toBeUndefined();
    expect(repo.update).toHaveBeenCalledWith(
      { id: 1 },
      expect.objectContaining({ status: 'failed', attempts: 1 }),
    );
  });

  it('survives a repository that throws, rather than breaking the order', async () => {
    repo.save.mockRejectedValue(new Error('database gone'));

    await expect(
      service.notify(order(), NotificationEventEnum.OrderPaid),
    ).resolves.toBeUndefined();
  });

  describe('retryFailed', () => {
    it('tries the failed ones again and marks the ones that get through', async () => {
      repo.find.mockResolvedValue([
        {
          id: 3,
          event: NotificationEventEnum.OrderSent,
          mobile: '09120000002',
          attempts: 1,
          parameters: { ORDER: 'INV-1404-000007' },
          order: order(),
        },
      ]);

      const retried = await service.retryFailed();

      expect(retried).toBe(1);
      expect(repo.update).toHaveBeenCalledWith(
        { id: 3 },
        expect.objectContaining({ status: 'sent', attempts: 2 }),
      );
    });
  });
});
