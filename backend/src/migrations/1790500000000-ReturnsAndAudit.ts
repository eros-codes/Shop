import { MigrationInterface, QueryRunner } from 'typeorm';

// Returns, the audit trail, and delivered_at - the clock the return
// window runs on.
export class ReturnsAndAudit1790500000000 implements MigrationInterface {
  name = 'ReturnsAndAudit1790500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('audit_logs'))) {
      await queryRunner.query(
        'CREATE TABLE `audit_logs` (' +
          '`id` int NOT NULL AUTO_INCREMENT, ' +
          '`actor_id` int NULL, ' +
          '`actor_label` varchar(100) NULL, ' +
          '`action` varchar(100) NOT NULL, ' +
          '`entity_type` varchar(50) NOT NULL, ' +
          '`entity_id` int NULL, ' +
          '`changes` json NULL, ' +
          '`created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ' +
          'INDEX `IDX_audit_entity` (`entity_type`, `entity_id`), ' +
          'INDEX `IDX_audit_created` (`created_at`), ' +
          'PRIMARY KEY (`id`)) ENGINE=InnoDB',
      );
      await queryRunner.query(
        'ALTER TABLE `audit_logs` ADD CONSTRAINT `FK_audit_actor` ' +
          'FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION',
      );
    }

    if (await queryRunner.hasTable('order')) {
      if (!(await queryRunner.hasColumn('order', 'delivered_at'))) {
        await queryRunner.query(
          'ALTER TABLE `order` ADD `delivered_at` datetime NULL',
        );
        await queryRunner.query(
          "UPDATE `order` SET `delivered_at` = `updatedAt` WHERE `status` = 'delivered' AND `delivered_at` IS NULL",
        );
      }
    }

    if (!(await queryRunner.hasTable('return_requests'))) {
      await queryRunner.query(
        'CREATE TABLE `return_requests` (' +
          '`id` int NOT NULL AUTO_INCREMENT, ' +
          '`order_id` int NOT NULL, ' +
          '`user_id` int NOT NULL, ' +
          "`status` enum('requested','approved','rejected','received','refunded','cancelled') NOT NULL DEFAULT 'requested', " +
          "`reason` enum('damaged','wrong_item','not_as_described','changed_mind','other') NOT NULL, " +
          '`description` varchar(1000) NULL, ' +
          '`refund_amount` bigint NOT NULL DEFAULT 0, ' +
          '`restock` tinyint NOT NULL DEFAULT 1, ' +
          '`admin_note` varchar(500) NULL, ' +
          '`resolved_by_id` int NULL, ' +
          '`resolved_at` datetime NULL, ' +
          '`created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ' +
          '`updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), ' +
          'INDEX `IDX_return_status` (`status`), ' +
          'PRIMARY KEY (`id`)) ENGINE=InnoDB',
      );
      await queryRunner.query(
        'ALTER TABLE `return_requests` ADD CONSTRAINT `FK_return_order` ' +
          'FOREIGN KEY (`order_id`) REFERENCES `order`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
      );
      await queryRunner.query(
        'ALTER TABLE `return_requests` ADD CONSTRAINT `FK_return_user` ' +
          'FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
      );
      await queryRunner.query(
        'ALTER TABLE `return_requests` ADD CONSTRAINT `FK_return_resolved_by` ' +
          'FOREIGN KEY (`resolved_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION',
      );
    }

    if (!(await queryRunner.hasTable('return_items'))) {
      await queryRunner.query(
        'CREATE TABLE `return_items` (' +
          '`id` int NOT NULL AUTO_INCREMENT, ' +
          '`return_request_id` int NOT NULL, ' +
          '`order_item_id` int NOT NULL, ' +
          '`quantity` int UNSIGNED NOT NULL, ' +
          'PRIMARY KEY (`id`)) ENGINE=InnoDB',
      );
      await queryRunner.query(
        'ALTER TABLE `return_items` ADD CONSTRAINT `FK_return_item_request` ' +
          'FOREIGN KEY (`return_request_id`) REFERENCES `return_requests`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
      );
      await queryRunner.query(
        'ALTER TABLE `return_items` ADD CONSTRAINT `FK_return_item_order_item` ' +
          'FOREIGN KEY (`order_item_id`) REFERENCES `order_items`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `return_items`');
    await queryRunner.query('DROP TABLE IF EXISTS `return_requests`');
    await queryRunner.query('DROP TABLE IF EXISTS `audit_logs`');
    if (await queryRunner.hasColumn('order', 'delivered_at')) {
      await queryRunner.query('ALTER TABLE `order` DROP COLUMN `delivered_at`');
    }
  }
}
