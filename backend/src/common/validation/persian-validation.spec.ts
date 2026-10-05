import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateCommentDto } from '../../comments/dto/create-comment.dto';
import { persianMessage, toFieldErrors } from './persian-validation';

// Run real DTOs through class-validator, so these tests break if a DTO's
// rules change in a way the Persian messages no longer describe.
const errorsFor = async (body: Record<string, unknown>) =>
  toFieldErrors(
    await validate(plainToInstance(CreateCommentDto, body), {
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

describe('Persian validation messages', () => {
  it('states the real limits, read from the DTO metadata', async () => {
    const fields = await errorsFor({ productId: 1, comment: 'کوتاه', rate: 9 });
    const byPath = Object.fromEntries(fields.map((f) => [f.path, f.message]));

    // The DTO's own English message ("Rate must not be greater than 5")
    // never reaches the user; the number still does.
    expect(byPath.rate).toBe('امتیاز نباید بیشتر از ۵ باشد.');
  });

  it('reports a length rule with both bounds', async () => {
    const fields = await errorsFor({ productId: 1, comment: 'abc', rate: 4 });
    expect(fields.find((f) => f.path === 'comment')?.message).toBe(
      'دیدگاه باید بین ۵ تا ۱٬۰۰۰ کاراکتر باشد.',
    );
  });

  it('gives one sentence per field, the most basic rule first', async () => {
    const fields = await errorsFor({
      comment: 'متن کافی برای دیدگاه',
      rate: 3,
    });
    const product = fields.filter((f) => f.path === 'productId');
    // productId breaks isNotEmpty, isInt and min at once; only "required"
    // is worth saying.
    expect(product).toHaveLength(1);
    expect(product[0].message).toBe('کالا الزامی است.');
  });

  it('names an unexpected property instead of guessing a label', async () => {
    const fields = await errorsFor({
      productId: 1,
      comment: 'متن کافی برای دیدگاه',
      rate: 3,
      price: 1,
    });
    expect(fields.find((f) => f.path === 'price')?.message).toBe(
      'فیلد «price» مجاز نیست.',
    );
  });

  it('calls a missing field required, not "must be text"', async () => {
    // comment has isString/isLength but the point is that it is absent.
    const fields = await errorsFor({ productId: 1, rate: 3 });
    expect(fields.find((f) => f.path === 'comment')?.message).toBe(
      'دیدگاه الزامی است.',
    );
  });

  it('never returns English for any constraint it knows about', () => {
    const keys = [
      'isNotEmpty',
      'isString',
      'isInt',
      'isNumber',
      'isBoolean',
      'isArray',
      'isEnum',
      'isDateString',
      'isUrl',
      'min',
      'max',
      'minLength',
      'maxLength',
      'isLength',
      'arrayMinSize',
      'arrayMaxSize',
      'arrayUnique',
      'matches',
      'somethingNew',
    ];
    for (const key of keys) {
      const message = persianMessage(key, 'title', [3, 10]);
      expect(message).toMatch(/[\u0600-\u06FF]/);
      expect(message).not.toMatch(/[A-Za-z]{3,}/);
    }
  });

  it('says "cannot be negative" rather than "not less than ۰"', () => {
    expect(persianMessage('min', 'stock', [0])).toBe(
      'موجودی نمی‌تواند منفی باشد.',
    );
  });
});
