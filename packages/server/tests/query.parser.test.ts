import type { Category } from '@mrd/shared';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../src/lib/api-error.js';
import { parseSearchQuery } from '../src/search/query.parser.js';

const CATEGORIES: Category[] = ['Fast Food', 'Drinks'];
const parse = (raw: Record<string, unknown>): ReturnType<typeof parseSearchQuery> => parseSearchQuery(raw, CATEGORIES);

describe('parseSearchQuery', () => {
  it('applies defaults for an empty query string', () => {
    expect(parse({})).toEqual({ q: '', category: null, sort: 'relevance', page: 1, pageSize: 12 });
  });

  it('trims the query and accepts valid values', () => {
    expect(parse({ q: '  burger ', category: 'Drinks', sort: 'price_asc', page: '3', pageSize: '5' })).toEqual({
      q: 'burger', category: 'Drinks', sort: 'price_asc', page: 3, pageSize: 5,
    });
  });

  it('treats category=all and empty strings as "no filter"', () => {
    expect(parse({ category: 'all' }).category).toBeNull();
    expect(parse({ category: '' }).category).toBeNull();
  });

  it('matches category case-insensitively', () => {
    expect(parse({ category: 'fast food' }).category).toBe('Fast Food');
  });

  it('rejects an unknown category with a field-level detail', () => {
    try {
      parse({ category: 'Spaceships' });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      const apiError = error as ApiError;
      expect(apiError.statusCode).toBe(400);
      expect(apiError.code).toBe('VALIDATION_ERROR');
      expect(apiError.details?.[0]?.field).toBe('category');
    }
  });

  it('rejects an unknown sort option', () => {
    expect(() => parse({ sort: 'price' })).toThrowError(ApiError);
  });

  it('rejects non-integer and out-of-range pagination', () => {
    expect(() => parse({ page: '1.5' })).toThrowError(ApiError);
    expect(() => parse({ page: '0' })).toThrowError(ApiError);
    expect(() => parse({ pageSize: '500' })).toThrowError(ApiError);
  });

  it('collects every problem into one response instead of failing fast', () => {
    try {
      parse({ category: 'Nope', sort: 'nope', page: '-2' });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as ApiError).details).toHaveLength(3);
    }
  });

  it('rejects a repeated parameter (?q=a&q=b arrives as an array)', () => {
    expect(() => parse({ q: ['a', 'b'] })).toThrowError(ApiError);
  });

  it('rejects an over-long query', () => {
    expect(() => parse({ q: 'x'.repeat(200) })).toThrowError(ApiError);
  });
});
