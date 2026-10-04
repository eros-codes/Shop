import { InvoiceService } from './invoice.service';

describe('InvoiceService', () => {
  const service = new InvoiceService();

  describe('persianYear', () => {
    it('answers the Persian year for a Gregorian date', () => {
      expect(service.persianYear(new Date('2025-06-01T09:00:00Z'))).toBe(1404);
    });

    it('rolls over at Nowruz, not on 1 January', () => {
      expect(service.persianYear(new Date('2025-03-19T09:00:00Z'))).toBe(1403);
      expect(service.persianYear(new Date('2025-03-22T09:00:00Z'))).toBe(1404);
    });
  });

  describe('nextNumber', () => {
    it('formats the number with its year and a padded counter', async () => {
      const manager = {
        query: jest
          .fn()
          .mockResolvedValueOnce(undefined)
          .mockResolvedValueOnce([{ number: '42' }]),
      };

      const number = await service.nextNumber(
        manager as never,
        new Date('2025-06-01T09:00:00Z'),
      );

      expect(number).toBe('INV-1404-000042');
    });

    it('increments through a single atomic statement', async () => {
      const manager = {
        query: jest
          .fn()
          .mockResolvedValueOnce(undefined)
          .mockResolvedValueOnce([{ number: 1 }]),
      };

      await service.nextNumber(manager as never);

      expect(manager.query.mock.calls[0][0]).toContain(
        'ON DUPLICATE KEY UPDATE',
      );
      expect(manager.query.mock.calls[0][0]).toContain('LAST_INSERT_ID');
    });
  });
});
