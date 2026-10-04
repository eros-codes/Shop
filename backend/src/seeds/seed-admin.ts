import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import dataSource from '../data-source';
import { User } from '../users/entities/user.entity';
import userRoleEnum from '../users/enums/userRoleEnum';

async function seedAdmin() {
  const mobile = process.env.ADMIN_MOBILE;
  const password = process.env.ADMIN_PASSWORD;
  const displayName = process.env.ADMIN_DISPLAY_NAME ?? 'Admin';

  if (
    process.env.NODE_ENV === 'production' &&
    process.env.ALLOW_PRODUCTION_SEED !== 'true'
  ) {
    console.error(
      'Refusing to seed an admin while NODE_ENV=production.\n' +
        'If this really is intended, re-run with ALLOW_PRODUCTION_SEED=true ' +
        'and use a password you generated for this account alone.',
    );
    process.exit(1);
  }

  if (password && password.length < 10) {
    console.error(
      'ADMIN_PASSWORD must be at least 10 characters - this account can do anything in the shop.',
    );
    process.exit(1);
  }

  if (!mobile || !password) {
    console.error(
      'Set ADMIN_MOBILE and ADMIN_PASSWORD before running this script, e.g.:\n' +
        '  ADMIN_MOBILE=09120000000 ADMIN_PASSWORD=Passw0rd1 npm run seed:admin',
    );
    process.exit(1);
  }

  await dataSource.initialize();
  const userRepository = dataSource.getRepository(User);

  const existing = await userRepository.findOne({
    where: { mobile },
    select: { id: true, mobile: true, role: true },
  });

  if (existing) {
    if (existing.role === userRoleEnum.AdminUser) {
      console.log(`${mobile} is already an admin - nothing to do.`);
    } else {
      await userRepository.update(existing.id, {
        role: userRoleEnum.AdminUser,
      });
      console.log(`Promoted existing user ${mobile} to admin.`);
    }
  } else {
    const hashedPassword = await bcrypt.hash(password, 10);
    const admin = userRepository.create({
      mobile,
      display_name: displayName,
      password: hashedPassword,
      role: userRoleEnum.AdminUser,
    });
    await userRepository.save(admin);
    console.log(`Created admin account for ${mobile}.`);
  }

  await dataSource.destroy();
}

seedAdmin().catch((err) => {
  console.error(err);
  process.exit(1);
});
