import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { assertDisposableTestDatabase } from './assert-test-database';
import { bootApp, createAccount } from './shop-helpers';
import userRoleEnum from '../src/users/enums/userRoleEnum';
import { Ticket } from '../src/tickets/entities/ticket.entity';

assertDisposableTestDatabase();

// A support conversation the way the storefront and the admin panel hold
// it: one thread head, replies posted with reply_to, the status moving with
// whoever spoke last, and the limits answering with codes a client can
// translate instead of a bare 429.
describe('Support tickets (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let admin: { id: number; token: string };
  let customer: { id: number; token: string };
  let stranger: { id: number; token: string };
  let threadId: number;

  const api = () => request(app.getHttpServer());
  const as = (account: { token: string }) => `Bearer ${account.token}`;

  // Every account is held to one message per 30 seconds. Moving its last
  // message into the past is how the suite gets the next one through
  // without sleeping.
  const skipCooldown = (userId: number) =>
    dataSource.query(
      'UPDATE `tickets` SET `created_at` = DATE_SUB(`created_at`, INTERVAL 1 MINUTE) WHERE `userId` = ?',
      [userId],
    );

  const reply = (account: { token: string }, description: string) =>
    api().post('/tickets').set('Authorization', as(account)).send({
      title: 'Order late',
      subject: 'order',
      description,
      reply_to: threadId,
    });

  const head = async () =>
    (await api().get(`/tickets/${threadId}`).set('Authorization', as(customer)))
      .body.data;

  beforeAll(async () => {
    app = await bootApp();
    dataSource = app.get(DataSource);
    admin = await createAccount(app, userRoleEnum.AdminUser);
    customer = await createAccount(app, userRoleEnum.NormalUser);
    stranger = await createAccount(app, userRoleEnum.NormalUser);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('opens a thread for the customer', async () => {
    const res = await api()
      .post('/tickets')
      .set('Authorization', as(customer))
      .send({
        title: 'Order late',
        subject: 'order',
        description: 'Where is it?',
      })
      .expect(201);

    threadId = res.body.data.id;
    expect(res.body.data.status).toBe('open');
  });

  it('answers a second message inside the cooldown with TICKET_COOLDOWN', async () => {
    const res = await reply(customer, 'Any news?').expect(429);

    expect(res.body.code).toBe('TICKET_COOLDOWN');
    expect(res.body.details.retryAfter).toBeGreaterThan(0);
  });

  it('lists the thread for its owner only', async () => {
    const mine = await api()
      .get('/tickets')
      .set('Authorization', as(customer))
      .expect(200);
    expect(mine.body.data.items.map((t: Ticket) => t.id)).toContain(threadId);
    expect(mine.body.data.items[0].repliesCount).toBe(0);

    const theirs = await api()
      .get('/tickets')
      .set('Authorization', as(stranger))
      .expect(200);
    expect(theirs.body.data.items.map((t: Ticket) => t.id)).not.toContain(
      threadId,
    );

    await api()
      .get(`/tickets/${threadId}`)
      .set('Authorization', as(stranger))
      .expect(403);
  });

  it("marks the thread answered when support replies, and names support as the reply's author", async () => {
    const inbox = await api()
      .get('/tickets?status=open&limit=100')
      .set('Authorization', as(admin))
      .expect(200);
    expect(inbox.body.data.items.map((t: Ticket) => t.id)).toContain(threadId);

    await reply(admin, 'It ships today.').expect(201);
    expect((await head()).status).toBe('answered');

    const replies = await api()
      .get(`/tickets/${threadId}/replies`)
      .set('Authorization', as(customer))
      .expect(200);
    // Both clients tell the two sides apart by comparing a reply's author
    // with the thread's owner.
    expect(replies.body.data.items).toHaveLength(1);
    expect(replies.body.data.items[0].user.id).toBe(admin.id);
    expect((await head()).user.id).toBe(customer.id);
  });

  it('moves the thread back to open when the customer writes again', async () => {
    await skipCooldown(customer.id);
    await reply(customer, 'Thanks, which courier?').expect(201);

    const thread = await head();
    expect(thread.status).toBe('open');
    expect(thread.repliesCount).toBe(2);
  });

  it('lets only support change the status', async () => {
    await api()
      .patch(`/tickets/${threadId}`)
      .set('Authorization', as(customer))
      .send({ status: 'closed' })
      .expect(403);

    await api()
      .patch(`/tickets/${threadId}`)
      .set('Authorization', as(admin))
      .send({ status: 'closed' })
      .expect(200);
  });

  it('refuses a reply to a closed thread with TICKET_CLOSED', async () => {
    await skipCooldown(customer.id);
    const res = await reply(customer, 'One more thing').expect(400);

    expect(res.body.code).toBe('TICKET_CLOSED');
  });

  it('puts a Persian message under each missing field', async () => {
    await skipCooldown(customer.id);
    const res = await api()
      .post('/tickets')
      .set('Authorization', as(customer))
      .send({ subject: 'order', description: 'no title' })
      .expect(400);

    expect(res.body.code).toBe('VALIDATION_FAILED');
    expect(res.body.details.fields.title).toMatch(/[؀-ۿ]/);
  });

  it('caps open threads per account with TICKET_LIMIT_REACHED', async () => {
    const tickets = dataSource.getRepository(Ticket);
    await tickets.save(
      Array.from({ length: 10 }, (_, index) =>
        tickets.create({
          title: `Filler ${index}`,
          subject: 'other',
          description: 'filler',
          user: { id: stranger.id },
        }),
      ),
    );
    await skipCooldown(stranger.id);

    const res = await api()
      .post('/tickets')
      .set('Authorization', as(stranger))
      .send({ title: 'Eleventh', subject: 'other', description: 'too many' })
      .expect(429);

    expect(res.body.code).toBe('TICKET_LIMIT_REACHED');
    expect(res.body.details).toMatchObject({ openThreads: 10, limit: 10 });
  });

  it('deletes a thread together with its replies for its owner', async () => {
    await api()
      .delete(`/tickets/${threadId}`)
      .set('Authorization', as(stranger))
      .expect(403);

    await api()
      .delete(`/tickets/${threadId}`)
      .set('Authorization', as(customer))
      .expect(200);

    await api()
      .get(`/tickets/${threadId}`)
      .set('Authorization', as(customer))
      .expect(404);
    const left = await dataSource
      .getRepository(Ticket)
      .count({ where: { reply_to: { id: threadId } } });
    expect(left).toBe(0);
  });
});
