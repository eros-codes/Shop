import { NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { User } from '../entities/user.entity';

export async function lockUserRow(
  manager: EntityManager,
  userId: number,
): Promise<void> {
  const user = await manager.findOne(User, {
    select: { id: true },
    where: { id: userId },
    lock: { mode: 'pessimistic_write' },
  });
  if (!user) {
    throw new NotFoundException(`Could not find user ${userId}`);
  }
}
