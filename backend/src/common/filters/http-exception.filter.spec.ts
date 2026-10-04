import { Logger, NotFoundException } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let logged: string[];
  let responseBody: unknown;
  let statusCode: number;

  const host = {
    switchToHttp: () => ({
      getResponse: () => ({
        status: (code: number) => {
          statusCode = code;
          return { json: (body: unknown) => (responseBody = body) };
        },
      }),
      getRequest: () => ({ method: 'POST', url: '/auth/register' }),
    }),
  } as never;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
    logged = [];
    jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation((message: unknown) => logged.push(String(message)));
  });

  afterEach(() => jest.restoreAllMocks());

  it('never writes the failing SQL or its parameters to the log', () => {
    const queryFailed = Object.assign(
      new Error("Duplicate entry '09120000000'"),
      {
        name: 'QueryFailedError',
        query: 'INSERT INTO `users`(`mobile`, `password`) VALUES (?, ?)',
        parameters: ['09120000000', '$2b$10$averyrealbcrypthash'],
        driverError: { code: 'ER_DUP_ENTRY' },
      },
    );

    filter.catch(queryFailed, host);

    const line = logged.join('\n');
    expect(line).toContain('POST /auth/register');
    expect(line).toContain('QueryFailedError');
    expect(line).toContain('ER_DUP_ENTRY');
    expect(line).not.toContain('INSERT INTO');
    expect(line).not.toContain('09120000000');
    expect(line).not.toContain('averyrealbcrypthash');
  });

  it('still answers the client in the standard shape', () => {
    filter.catch(new Error('boom'), host);

    expect(statusCode).toBe(500);
    expect(responseBody).toMatchObject({ statusCode: 500, data: null });
  });

  it('does not log expected HTTP errors at all', () => {
    filter.catch(new NotFoundException('Ticket with id 9 not found'), host);

    expect(logged).toHaveLength(0);
    expect(statusCode).toBe(404);
  });
});
