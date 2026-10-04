import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { queryRows } from '../common/database/raw-query';

const PERSIAN_DIGITS = /[\u06F0-\u06F9]/g;
const PERSIAN_ZERO = 0x06f0;

@Injectable()
export class InvoiceService {
  // Invoices are filed under the Persian year. Intl carries that calendar
  // (Node ships full ICU) but answers in Persian digits, which are turned
  // back into ASCII here.
  persianYear(at: Date = new Date()): number {
    try {
      const formatted = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
        year: 'numeric',
        timeZone: 'Asia/Tehran',
      }).format(at);
      const ascii = formatted.replace(PERSIAN_DIGITS, (digit) =>
        String(digit.charCodeAt(0) - PERSIAN_ZERO),
      );
      const year = Number(ascii.replace(/[^0-9]/g, ''));
      if (Number.isInteger(year) && year > 1000) {
        return year;
      }
    } catch {
      // Falls back to the Gregorian year below.
    }
    return at.getFullYear();
  }

  // MySQL's sequence idiom: INSERT ... ON DUPLICATE KEY UPDATE with
  // LAST_INSERT_ID increments and reports the new value in one statement,
  // on this connection only, so two checkouts cannot share a number. The
  // row stays locked until the caller commits, so a rolled-back order
  // gives its number back.
  async nextNumber(
    manager: EntityManager,
    at: Date = new Date(),
  ): Promise<string> {
    const year = this.persianYear(at);

    await manager.query(
      'INSERT INTO `invoice_sequences` (`year`, `last_number`) VALUES (?, LAST_INSERT_ID(1)) ' +
        'ON DUPLICATE KEY UPDATE `last_number` = LAST_INSERT_ID(`last_number` + 1)',
      [year],
    );
    const [row] = await queryRows<{ number: number | string }>(
      manager,
      'SELECT LAST_INSERT_ID() AS number',
    );
    const number = Number(row?.number ?? 1);

    return `INV-${year}-${String(number).padStart(6, '0')}`;
  }
}
