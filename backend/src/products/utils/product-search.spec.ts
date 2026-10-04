import { buildProductSearchPlan, escapeLikePattern } from './product-search';

describe('buildProductSearchPlan', () => {
  it('requires every indexable word as a prefix match', () => {
    expect(buildProductSearchPlan('Samsung Galaxy')).toEqual({
      fullTextQuery: '+samsung* +galaxy*',
      likePatterns: [],
    });
  });

  it('moves short words and InnoDB stopwords to LIKE filters (they are not in the index)', () => {
    expect(buildProductSearchPlan('The Witcher 3')).toEqual({
      fullTextQuery: '+witcher*',
      likePatterns: ['%the%', '%3%'],
    });
  });

  it('handles Persian text and strips boolean-mode operators', () => {
    expect(buildProductSearchPlan('+گوشی -"سامسونگ"* @A5')).toEqual({
      fullTextQuery: '+گوشی* +سامسونگ*',
      likePatterns: ['%a5%'],
    });
  });

  it('returns null when nothing searchable is left', () => {
    expect(buildProductSearchPlan('+-*"()~@')).toBeNull();
  });

  it('escapes LIKE wildcards', () => {
    expect(escapeLikePattern('50%_off\\')).toBe('50\\%\\_off\\\\');
  });
});
