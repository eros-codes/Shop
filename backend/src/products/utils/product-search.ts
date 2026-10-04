const INNODB_DEFAULT_STOPWORDS = new Set([
  'a',
  'about',
  'an',
  'are',
  'as',
  'at',
  'be',
  'by',
  'com',
  'de',
  'en',
  'for',
  'from',
  'how',
  'i',
  'in',
  'is',
  'it',
  'la',
  'of',
  'on',
  'or',
  'that',
  'the',
  'this',
  'to',
  'was',
  'what',
  'when',
  'where',
  'who',
  'will',
  'with',
  'und',
  'www',
]);

export const FULLTEXT_MIN_TOKEN_LENGTH = 3;
export const MAX_SEARCH_TERMS = 8;

export interface ProductSearchPlan {
  fullTextQuery: string | null;
  likePatterns: string[];
}

export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export function buildProductSearchPlan(
  search: string,
): ProductSearchPlan | null {
  const terms = [
    ...new Set(
      search
        .toLowerCase()
        .split(/[^\p{L}\p{M}\p{N}]+/u)
        .filter((term) => term.length > 0),
    ),
  ].slice(0, MAX_SEARCH_TERMS);

  if (terms.length === 0) {
    return null;
  }

  const fullTextTerms: string[] = [];
  const likePatterns: string[] = [];
  for (const term of terms) {
    const indexable =
      [...term].length >= FULLTEXT_MIN_TOKEN_LENGTH &&
      !INNODB_DEFAULT_STOPWORDS.has(term);
    if (indexable) {
      fullTextTerms.push(`+${term}*`);
    } else {
      likePatterns.push(`%${escapeLikePattern(term)}%`);
    }
  }

  return {
    fullTextQuery: fullTextTerms.length > 0 ? fullTextTerms.join(' ') : null,
    likePatterns,
  };
}
