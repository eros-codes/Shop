import { MigrationInterface, QueryRunner } from 'typeorm';

// The log of what the shop told each customer, and what became of it.
export class OrderNotifications1790400000000 implements MigrationInterface {
  name = 'OrderNotifications1790400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('notifications')) return;

    await queryRunner.query(
      'CREATE TABLE `notifications` (' +
        '`id` int NOT NULL AUTO_INCREMENT, ' +
        '`order_id` int NULL, ' +
        "`event` enum('order_placed','order_paid','order_sent','order_delivered','order_cancelled') NOT NULL, " +
        '`mobile` varchar(20) NOT NULL, ' +
        "`status` enum('pending','sent','failed','skipped') NOT NULL DEFAULT 'pending', " +
        '`attempts` int UNSIGNED NOT NULL DEFAULT 0, ' +
        '`provider_message_id` varchar(100) NULL, ' +
        '`error` varchar(500) NULL, ' +
        '`parameters` json NULL, ' +
        '`created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ' +
        '`updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), ' +
        'UNIQUE INDEX `UQ_notification_order_event` (`order_id`, `event`), ' +
        'INDEX `IDX_notification_status` (`status`), ' +
        'PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );
    await queryRunner.query(
      'ALTER TABLE `notifications` ADD CONSTRAINT `FK_notification_order` ' +
        'FOREIGN KEY (`order_id`) REFERENCES `order`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `notifications`');
  }
}
