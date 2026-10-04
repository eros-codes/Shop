import { MigrationInterface, QueryRunner } from 'typeorm';

const SCHEMA_STATEMENTS: string[] = [
  "CREATE TABLE `tickets` (`id` int NOT NULL AUTO_INCREMENT, `title` varchar(255) NOT NULL, `subject` varchar(255) NOT NULL, `description` text NOT NULL, `status` enum ('open', 'answered', 'closed') NOT NULL DEFAULT 'open', `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `deleted_at` datetime(6) NULL, `userId` int NULL, `replyToId` int NULL, INDEX `IDX_ticket_user_created` (`userId`, `created_at`), INDEX `IDX_12b901b34113688b4786368510` (`status`), PRIMARY KEY (`id`)) ENGINE=InnoDB",
  'CREATE TABLE `categories` (`id` int NOT NULL AUTO_INCREMENT, `title` varchar(255) NOT NULL, `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), `deleted_at` datetime(6) NULL, `active_title` varchar(255) AS (IF(`deleted_at` IS NULL, `title`, NULL)) STORED NULL, UNIQUE INDEX `UQ_categories_active_title` (`active_title`), PRIMARY KEY (`id`)) ENGINE=InnoDB',
  "CREATE TABLE `comments` (`id` int NOT NULL AUTO_INCREMENT, `comment` text NOT NULL, `rate` tinyint NULL, `status` enum ('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending', `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), `deleted_at` datetime(6) NULL, `user_id` int NULL, `product_id` int NULL, `parent_id` int NULL, PRIMARY KEY (`id`)) ENGINE=InnoDB",
  "CREATE TABLE `discount_codes` (`id` int NOT NULL AUTO_INCREMENT, `code` varchar(255) NOT NULL, `capacity` int NOT NULL, `off_percent` tinyint NOT NULL, `status` enum ('active', 'inactive') NOT NULL DEFAULT 'active', `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), `deleted_at` datetime(6) NULL, UNIQUE INDEX `IDX_b967edd0d46547d4a92b4a1c6b` (`code`), PRIMARY KEY (`id`)) ENGINE=InnoDB",
  "CREATE TABLE `order` (`id` int NOT NULL AUTO_INCREMENT, `status` enum ('pending', 'awaiting_payment', 'paid', 'processing', 'sent', 'delivered', 'cancelled') NOT NULL DEFAULT 'pending', `payed_time` timestamp NULL, `payment_method` enum ('wallet', 'zarinpal') NULL, `payment_reference` varchar(255) NULL, `payment_expires_at` datetime NULL, `discount_reserved` tinyint NOT NULL DEFAULT 0, `idempotency_key` varchar(64) NULL, `idempotency_fingerprint` char(64) NULL, `refunded_amount` bigint NOT NULL DEFAULT '0', `zarinpalAuthority` varchar(255) NULL, `shippingAddressSnapshot` json NULL, `total_price` bigint NOT NULL DEFAULT '0', `total_quantity` int NOT NULL DEFAULT '0', `tracking_code` varchar(255) NULL, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), `deletedAt` datetime(6) NULL, `userId` int NULL, `address_id` int NULL, `discount_id` int NULL, INDEX `IDX_order_payment_expires` (`payment_expires_at`), INDEX `IDX_order_user_created` (`userId`, `createdAt`), INDEX `IDX_7a9573d6a1fb982772a9123320` (`status`), UNIQUE INDEX `IDX_f6edad467abb3a6931c8f8a3dd` (`zarinpalAuthority`), UNIQUE INDEX `UQ_order_user_idempotency_key` (`userId`, `idempotency_key`), PRIMARY KEY (`id`)) ENGINE=InnoDB",
  'CREATE TABLE `order_items` (`id` int NOT NULL AUTO_INCREMENT, `price` bigint NOT NULL, `quantity` int NOT NULL, `order_id` int NULL, `product_id` int NULL, PRIMARY KEY (`id`)) ENGINE=InnoDB',
  "CREATE TABLE `basket_items` (`id` int NOT NULL AUTO_INCREMENT, `quantity` int NOT NULL DEFAULT '1', `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), `userId` int NULL, `productId` int NULL, UNIQUE INDEX `IDX_dfc0295ae6c133569c1f525498` (`userId`, `productId`), PRIMARY KEY (`id`)) ENGINE=InnoDB",
  "CREATE TABLE `product_images` (`id` int NOT NULL AUTO_INCREMENT, `filename` varchar(255) NOT NULL, `url` varchar(255) NOT NULL, `order` int NOT NULL DEFAULT '0', `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `productId` int NULL, UNIQUE INDEX `UQ_product_images_product_order` (`productId`, `order`), PRIMARY KEY (`id`)) ENGINE=InnoDB",
  'CREATE TABLE `products` (`id` int NOT NULL AUTO_INCREMENT, `title` varchar(255) NOT NULL, `description` varchar(255) NOT NULL, `price` int UNSIGNED NOT NULL, `stock` int UNSIGNED NOT NULL, `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), `deleted_at` datetime(6) NULL, FULLTEXT INDEX `IDX_products_title_fulltext` (`title`), PRIMARY KEY (`id`)) ENGINE=InnoDB',
  'CREATE TABLE `bookmarks` (`id` int NOT NULL AUTO_INCREMENT, `product_id` int NULL, `user_id` int NULL, UNIQUE INDEX `IDX_5a5fb8dbaf3e1659830623ebb6` (`product_id`, `user_id`), PRIMARY KEY (`id`)) ENGINE=InnoDB',
  "CREATE TABLE `wallets` (`id` int NOT NULL AUTO_INCREMENT, `amount` bigint NOT NULL DEFAULT '0', `is_active` tinyint NOT NULL DEFAULT 1, `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), `user_id` int NULL, UNIQUE INDEX `REL_92558c08091598f7a4439586cd` (`user_id`), PRIMARY KEY (`id`)) ENGINE=InnoDB",
  "CREATE TABLE `users` (`id` int NOT NULL AUTO_INCREMENT, `display_name` varchar(255) NULL, `mobile` varchar(255) NOT NULL, `password` varchar(255) NOT NULL, `role` enum ('user', 'admin') NOT NULL DEFAULT 'user', `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), `deletedAt` datetime(6) NULL, UNIQUE INDEX `IDX_d376a9f93bba651f32a2c03a7d` (`mobile`), PRIMARY KEY (`id`)) ENGINE=InnoDB",
  'CREATE TABLE `addresses` (`id` int NOT NULL AUTO_INCREMENT, `province` varchar(255) NOT NULL, `city` varchar(255) NOT NULL, `address` varchar(255) NOT NULL, `postal_code` varchar(10) NOT NULL, `receiver_mobile` varchar(11) NOT NULL, `description` varchar(255) NULL, `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), `userId` int NULL, PRIMARY KEY (`id`)) ENGINE=InnoDB',
  "CREATE TABLE `otp_verifications` (`id` int NOT NULL AUTO_INCREMENT, `mobile` varchar(255) NOT NULL, `codeHash` varchar(255) NOT NULL, `displayName` varchar(255) NOT NULL, `hashedPassword` varchar(255) NOT NULL, `expiresAt` datetime NOT NULL, `attempts` int NOT NULL DEFAULT '0', `lastSentAt` datetime NULL, `sendCount` int NOT NULL DEFAULT '1', `windowStartedAt` datetime NULL, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX `IDX_8feb686e6fecd7080de89f9b29` (`mobile`), PRIMARY KEY (`id`)) ENGINE=InnoDB",
  'CREATE TABLE `refresh_tokens` (`id` int NOT NULL AUTO_INCREMENT, `tokenHash` varchar(255) NOT NULL, `expiresAt` datetime NOT NULL, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `userId` int NULL, UNIQUE INDEX `IDX_c25bc63d248ca90e8dcc1d92d0` (`tokenHash`), PRIMARY KEY (`id`)) ENGINE=InnoDB',
  "CREATE TABLE `rate_limits` (`bucket_key` varchar(191) NOT NULL, `hits` int NOT NULL DEFAULT '0', `expires_at` datetime(3) NOT NULL, `blocked_until` datetime(3) NULL, INDEX `IDX_rate_limit_expires` (`expires_at`), PRIMARY KEY (`bucket_key`)) ENGINE=InnoDB",
  "CREATE TABLE `wallet_charge_requests` (`id` int NOT NULL AUTO_INCREMENT, `authority` varchar(255) NOT NULL, `amount` bigint NOT NULL, `status` varchar(255) NOT NULL DEFAULT 'pending', `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `walletId` int NULL, UNIQUE INDEX `IDX_92f31a1a254b038f1ee70bfa6e` (`authority`), PRIMARY KEY (`id`)) ENGINE=InnoDB",
  "CREATE TABLE `wallet_transactions` (`id` int NOT NULL AUTO_INCREMENT, `amount` bigint NOT NULL, `balanceAfter` bigint NOT NULL, `type` enum ('admin_charge', 'zarinpal_charge', 'order_payment', 'withdrawal', 'refund') NOT NULL, `description` varchar(255) NULL, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `walletId` int NULL, INDEX `IDX_8a94d9d61a2b05123710b325fb` (`walletId`), PRIMARY KEY (`id`)) ENGINE=InnoDB",
  'CREATE TABLE `product_category` (`product_id` int NOT NULL, `category_id` int NOT NULL, INDEX `IDX_0374879a971928bc3f57eed0a5` (`product_id`), INDEX `IDX_2df1f83329c00e6eadde0493e1` (`category_id`), PRIMARY KEY (`product_id`, `category_id`)) ENGINE=InnoDB',
  'ALTER TABLE `tickets` ADD CONSTRAINT `FK_4bb45e096f521845765f657f5c8` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
  'ALTER TABLE `tickets` ADD CONSTRAINT `FK_be12b36377c4154a94f5608588b` FOREIGN KEY (`replyToId`) REFERENCES `tickets`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
  'ALTER TABLE `comments` ADD CONSTRAINT `FK_4c675567d2a58f0b07cef09c13d` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
  'ALTER TABLE `comments` ADD CONSTRAINT `FK_8f405e50bbc3adb9a80fac0f928` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
  'ALTER TABLE `comments` ADD CONSTRAINT `FK_d6f93329801a93536da4241e386` FOREIGN KEY (`parent_id`) REFERENCES `comments`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
  'ALTER TABLE `order` ADD CONSTRAINT `FK_caabe91507b3379c7ba73637b84` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
  'ALTER TABLE `order` ADD CONSTRAINT `FK_f07603e96b068aae820d4590270` FOREIGN KEY (`address_id`) REFERENCES `addresses`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION',
  'ALTER TABLE `order` ADD CONSTRAINT `FK_d25d419f5d23bbcfe590ffe4444` FOREIGN KEY (`discount_id`) REFERENCES `discount_codes`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
  'ALTER TABLE `order_items` ADD CONSTRAINT `FK_145532db85752b29c57d2b7b1f1` FOREIGN KEY (`order_id`) REFERENCES `order`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
  'ALTER TABLE `order_items` ADD CONSTRAINT `FK_9263386c35b6b242540f9493b00` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
  'ALTER TABLE `basket_items` ADD CONSTRAINT `FK_2945698449c10cabf02d858cf7a` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
  'ALTER TABLE `basket_items` ADD CONSTRAINT `FK_bca53dec99316713d968c6a2141` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
  'ALTER TABLE `product_images` ADD CONSTRAINT `FK_b367708bf720c8dd62fc6833161` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
  'ALTER TABLE `bookmarks` ADD CONSTRAINT `FK_05c5b94a5fbfaec47b1632bf5b1` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
  'ALTER TABLE `bookmarks` ADD CONSTRAINT `FK_58a0fbaee65cd8959a870ee678c` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
  'ALTER TABLE `wallets` ADD CONSTRAINT `FK_92558c08091598f7a4439586cda` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
  'ALTER TABLE `addresses` ADD CONSTRAINT `FK_95c93a584de49f0b0e13f753630` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
  'ALTER TABLE `refresh_tokens` ADD CONSTRAINT `FK_610102b60fea1455310ccd299de` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
  'ALTER TABLE `wallet_charge_requests` ADD CONSTRAINT `FK_668d1e1af83fbd2f454648736bc` FOREIGN KEY (`walletId`) REFERENCES `wallets`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION',
  'ALTER TABLE `wallet_transactions` ADD CONSTRAINT `FK_8a94d9d61a2b05123710b325fbf` FOREIGN KEY (`walletId`) REFERENCES `wallets`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION',
  'ALTER TABLE `product_category` ADD CONSTRAINT `FK_0374879a971928bc3f57eed0a59` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE',
  'ALTER TABLE `product_category` ADD CONSTRAINT `FK_2df1f83329c00e6eadde0493e16` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
];

const TABLES = [
  'tickets',
  'categories',
  'comments',
  'discount_codes',
  'order',
  'order_items',
  'basket_items',
  'product_images',
  'products',
  'bookmarks',
  'wallets',
  'users',
  'addresses',
  'otp_verifications',
  'refresh_tokens',
  'rate_limits',
  'wallet_charge_requests',
  'wallet_transactions',
  'product_category',
];

// The schema as it stands after the first four debugging phases. Written
// to be safe on an existing database: every object is created only if it
// is missing.
export class InitialSchema1789600000000 implements MigrationInterface {
  name = 'InitialSchema1789600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('users')) {
      return;
    }

    for (const statement of SCHEMA_STATEMENTS) {
      await queryRunner.query(statement);
    }

    await queryRunner.query(
      'CREATE TABLE IF NOT EXISTS `typeorm_metadata` (`type` varchar(255) NOT NULL, ' +
        '`database` varchar(255) NULL, `schema` varchar(255) NULL, `table` varchar(255) NULL, ' +
        '`name` varchar(255) NULL, `value` text NULL) ENGINE=InnoDB',
    );
    await queryRunner.query(
      "DELETE FROM `typeorm_metadata` WHERE `type` = 'GENERATED_COLUMN' " +
        "AND `table` = 'categories' AND `name` = 'active_title'",
    );
    await queryRunner.query(
      'INSERT INTO `typeorm_metadata`(`type`, `database`, `schema`, `table`, `name`, `value`) ' +
        "VALUES ('GENERATED_COLUMN', NULL, DATABASE(), 'categories', 'active_title', " +
        "'IF(`deleted_at` IS NULL, `title`, NULL)')",
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const table of TABLES) {
      await queryRunner.query(`DROP TABLE IF EXISTS \`${table}\``);
    }
    await queryRunner.query('SET FOREIGN_KEY_CHECKS = 1');
  }
}
