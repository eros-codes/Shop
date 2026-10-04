import { slugify, uniqueSlug } from './slugify';

describe('slugify', () => {
  it('turns a Latin title into a dashed slug', () => {
    expect(slugify('  iPhone 15 Pro Max!  ')).toBe('iphone-15-pro-max');
  });

  it('keeps Persian text instead of guessing a transliteration', () => {
    expect(slugify('گوشی سامسونگ گلکسی A54')).toBe('گوشی-سامسونگ-گلکسی-a54');
  });

  it('normalises Arabic letter forms so one product gets one slug', () => {
    expect(slugify('كيف چرمي')).toBe(slugify('کیف چرمی'));
  });

  it('never produces leading, trailing or repeated dashes', () => {
    expect(slugify('--- a // b ---')).toBe('a-b');
  });

  it('returns an empty string when there is nothing to slug', () => {
    expect(slugify('!!! ???')).toBe('');
  });

  describe('uniqueSlug', () => {
    it('uses the plain slug when it is free', () => {
      expect(uniqueSlug('Leather bag', [])).toBe('leather-bag');
    });

    it('adds a counter when the slug is taken', () => {
      expect(uniqueSlug('Leather bag', ['leather-bag', 'leather-bag-2'])).toBe(
        'leather-bag-3',
      );
    });

    it('falls back when the title has no usable characters', () => {
      expect(uniqueSlug('###', [], 'product')).toBe('product');
    });
  });
});
