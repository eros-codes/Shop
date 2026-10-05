// Access tokens are stateless JWTs, so revoking the refresh tokens on a
// password change only stopped them being renewed - an access token already
// in someone else's hands kept working until it expired on its own. That is
// the one moment it matters most: a password reset is what a customer does
// when they think their account has been taken.
//
// This stamp marks the instant every token issued before it stopped being
// acceptable. The JWT strategy compares it with the token's `iat`.
import { MigrationInterface, QueryRunner } from 'typeorm';

export class TokensValidAfter1790900000000 implements MigrationInterface {
  name = 'TokensValidAfter1790900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('users', 'tokens_valid_after'))) {
      await queryRunner.query(
        'ALTER TABLE `users` ADD `tokens_valid_after` datetime(3) NULL',
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('users', 'tokens_valid_after')) {
      await queryRunner.query(
        'ALTER TABLE `users` DROP COLUMN `tokens_valid_after`',
      );
    }
  }
}
