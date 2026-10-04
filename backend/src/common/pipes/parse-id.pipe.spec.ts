import { BadRequestException } from '@nestjs/common';
import { ParseIdPipe } from './parse-id.pipe';

describe('ParseIdPipe', () => {
  const pipe = new ParseIdPipe();
  const meta = { type: 'param', data: 'id' } as const;

  it.each(['1', '42', '2147483647'])('accepts the raw string %s', (value) => {
    expect(pipe.transform(value, meta)).toBe(Number(value));
  });

  it.each(['abc', '0', '-1', '1.5', '1e3', '01', ' 1', '2147483648', ''])(
    'rejects the raw string %p with a 400',
    (value) => {
      expect(() => pipe.transform(value, meta)).toThrow(BadRequestException);
    },
  );

  it.each([1, 13, 2147483647])(
    'accepts the pre-converted number %s',
    (value) => {
      expect(pipe.transform(value, meta)).toBe(value);
    },
  );

  it.each([NaN, 0, -3, 1.5, 2147483648, Infinity])(
    'rejects the pre-converted number %p with a 400',
    (value) => {
      expect(() => pipe.transform(value, meta)).toThrow(BadRequestException);
    },
  );
});
