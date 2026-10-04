import { MigrationInterface, QueryRunner } from 'typeorm';

// Payment columns: the awaiting-payment window, the gateway reference,
// refund bookkeeping and the discount reservation counters.
export class Phase3PaymentIntegrity1789712004311 implements MigrationInterface {
  name = 'Phase3PaymentIntegrity1789712004311';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.extendEnums(queryRunner);
    await this.addOrderPaymentColumns(queryRunner);
    await this.backfillOrders(queryRunner);
  }

  public async down(): Promise<void> {}

  private async extendEnums(queryRunner: QueryRunner) {
    if (await queryRunner.hasTable('order')) {
      await queryRunner.query(
        "ALTER TABLE `order` CHANGE `status` `status` enum('pending','awaiting_payment','paid','processing','sent','delivered','cancelled') NOT NULL DEFAULT 'pending'",
      );
    }
    if (await queryRunner.hasTable('wallet_transactions')) {
      await queryRunner.query(
        "ALTER TABLE `wallet_transactions` CHANGE `type` `type` enum('admin_charge','zarinpal_charge','order_payment','withdrawal','refund') NOT NULL",
      );
    }
  }

  private async addOrderPaymentColumns(queryRunner: QueryRunner) {
    if (!(await queryRunner.hasTable('order'))) return;

    const columns: Array<[string, string]> = [
      ['payment_method', "enum('wallet','zarinpal') NULL"],
      ['payment_reference', 'varchar(255) NULL'],
      ['payment_expires_at', 'datetime NULL'],
      ['discount_reserved', 'tinyint NOT NULL DEFAULT 0'],
      ['idempotency_key', 'varchar(64) NULL'],
      ['idempotency_fingerprint', 'char(64) NULL'],
      ['refunded_amount', 'bigint NOT NULL DEFAULT 0'],
    ];
    for (const [name, definition] of columns) {
      if (!(await queryRunner.hasColumn('order', name))) {
        await queryRunner.query(
          `ALTER TABLE \`order\` ADD \`${name}\` ${definition}`,
        );
      }
    }
  }

  private async backfillOrders(queryRunner: QueryRunner) {
    if (!(await queryRunner.hasTable('order'))) return;

    await queryRunner.query(
      "UPDATE `order` SET `payment_method` = 'zarinpal' WHERE `payment_method` IS NULL AND `zarinpalAuthority` IS NOT NULL",
    );
    await queryRunner.query(
      "UPDATE `order` SET `payment_method` = 'wallet' WHERE `payment_method` IS NULL AND `status` IN ('paid','processing','sent','delivered')",
    );

    await queryRunner.query(
      "UPDATE `order` SET `discount_reserved` = 1 WHERE `discount_id` IS NOT NULL AND (`payment_method` = 'wallet' OR `status` IN ('paid','processing','sent','delivered'))",
    );

    if (await queryRunner.hasTable('addresses')) {
      await queryRunner.query(
        'UPDATE `order` o INNER JOIN `addresses` a ON a.`id` = o.`address_id` ' +
          'SET o.`shippingAddressSnapshot` = JSON_OBJECT(' +
          "'province', a.`province`, 'city', a.`city`, 'address', a.`address`, " +
          "'postal_code', a.`postal_code`, 'receiver_mobile', a.`receiver_mobile`, " +
          "'description', a.`description`) " +
          'WHERE o.`shippingAddressSnapshot` IS NULL',
      );
    }

    await queryRunner.query(
      "UPDATE `order` SET `status` = 'awaiting_payment', `payment_expires_at` = NOW() " +
        "WHERE `status` = 'pending' AND `zarinpalAuthority` IS NOT NULL AND `deletedAt` IS NULL",
    );
  }
}
