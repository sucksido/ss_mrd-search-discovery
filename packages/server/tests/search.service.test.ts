import { describe, expect, it } from 'vitest';
import {
  applyCategoryFilter,
  buildFacets,
  matchAndScore,
  paginate,
  sortNeedsEnrichment,
  sortResults,
} from '../src/search/search.service.js';
import { fixtureRepo } from './helpers.js';

const items = fixtureRepo.all();
const names = (entries: ReturnType<typeof matchAndScore>): string[] => entries.map((e) => e.item.name);

describe('matchAndScore', () => {
  it('returns the whole catalog for an empty query (browse mode, not an error)', () => {
    expect(matchAndScore(items, '')).toHaveLength(items.length);
  });

  it('ranks a name match above a description-only match', () => {
    const result = names(sortResults(matchAndScore(items, 'burger'), 'relevance'));
    expect(result[0]).toBe('Double Smash Burger');
    expect(result).toContain('Loaded Chips');
    // The description-only match must rank below both name matches.
    expect(result.indexOf('Loaded Chips')).toBe(result.length - 1);
  });

  it('ANDs multiple tokens — every token must match somewhere', () => {
    const result = names(matchAndScore(items, 'veg burger'));
    expect(result).toEqual(['Veg Smash Burger']);
  });

  it('returns nothing when one token of a multi-token query is absent', () => {
    expect(matchAndScore(items, 'burger unicorn')).toHaveLength(0);
  });

  it('folds case and diacritics: "cafe" matches "Café Mocha"', () => {
    expect(names(matchAndScore(items, 'cafe'))).toEqual(['Café Mocha']);
  });

  it('matches on category and on tags, not just the name', () => {
    expect(names(matchAndScore(items, 'drinks'))).toEqual(['Café Mocha']);
    expect(names(matchAndScore(items, 'vegetarian'))).toEqual(['Margherita Pizza']);
  });

  it('ignores punctuation and extra whitespace', () => {
    expect(names(matchAndScore(items, '  BURGER!!  '))).toHaveLength(3);
  });
});

describe('facets and filtering', () => {
  it('builds facet counts from the text match, before the category filter', () => {
    const matched = matchAndScore(items, '');
    expect(buildFacets(matched)).toEqual([
      { category: 'Drinks', count: 1 },
      { category: 'Fast Food', count: 3 },
      { category: 'Pizza & Pasta', count: 1 },
    ]);
  });

  it('narrows results to the selected category', () => {
    const matched = matchAndScore(items, '');
    expect(applyCategoryFilter(matched, 'Drinks')).toHaveLength(1);
    expect(applyCategoryFilter(matched, null)).toHaveLength(5);
  });
});

describe('sortResults', () => {
  const matched = matchAndScore(items, '');

  it('sorts by catalog price when no live values are supplied', () => {
    expect(names(sortResults(matched, 'price_asc'))[0]).toBe('Café Mocha');
    expect(names(sortResults(matched, 'price_desc'))[0]).toBe('Margherita Pizza');
  });

  it('sorts by live price when enrichment is supplied', () => {
    const live = new Map([
      ['a1', { status: 'ok', price: 100, currency: 'ZAR', available: true, stockLevel: 'in_stock', deliveryEtaMinutes: 40, surgeMultiplier: 1, fetchedAt: '', cached: false } as const],
      ['b1', { status: 'ok', price: 999_999, currency: 'ZAR', available: true, stockLevel: 'in_stock', deliveryEtaMinutes: 10, surgeMultiplier: 1, fetchedAt: '', cached: false } as const],
    ]);
    const sorted = names(sortResults(matched, 'price_asc', live));
    expect(sorted[0]).toBe('Double Smash Burger');
    expect(sorted[1]).toBe('Café Mocha');
  });

  it('places un-enriched items last instead of dropping them', () => {
    const live = new Map([
      ['a1', { status: 'ok', price: 500, currency: 'ZAR', available: true, stockLevel: 'in_stock', deliveryEtaMinutes: 40, surgeMultiplier: 1, fetchedAt: '', cached: false } as const],
      ['a2', { status: 'unavailable', reason: 'timeout', message: 'timed out' } as const],
    ]);
    const sorted = names(sortResults(matched, 'price_asc', live));
    expect(sorted[0]).toBe('Double Smash Burger');
    expect(sorted).toHaveLength(items.length);
    expect(sorted.at(-1)).not.toBe('Double Smash Burger');
  });

  it('sorts by rating and popularity without any upstream data', () => {
    expect(names(sortResults(matched, 'rating_desc'))[0]).toBe('Margherita Pizza');
    expect(names(sortResults(matched, 'popularity_desc'))[0]).toBe('Margherita Pizza');
  });

  it('knows which sorts require enrichment', () => {
    expect(sortNeedsEnrichment('price_asc')).toBe(true);
    expect(sortNeedsEnrichment('delivery_asc')).toBe(true);
    expect(sortNeedsEnrichment('relevance')).toBe(false);
    expect(sortNeedsEnrichment('rating_desc')).toBe(false);
  });

  it('does not mutate the array it is given', () => {
    const before = names(matched);
    sortResults(matched, 'price_desc');
    expect(names(matched)).toEqual(before);
  });
});

describe('paginate', () => {
  const rows = Array.from({ length: 25 }, (_, i) => i);

  it('slices the requested page', () => {
    const { slice, pagination } = paginate(rows, 2, 10);
    expect(slice).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    expect(pagination).toMatchObject({ page: 2, totalItems: 25, totalPages: 3, hasNext: true, hasPrev: true });
  });

  it('clamps a page beyond the end instead of returning an empty list', () => {
    const { slice, pagination } = paginate(rows, 99, 10);
    expect(pagination.page).toBe(3);
    expect(slice).toEqual([20, 21, 22, 23, 24]);
    expect(pagination.hasNext).toBe(false);
  });

  it('reports one page for an empty result set', () => {
    const { slice, pagination } = paginate([], 1, 10);
    expect(slice).toEqual([]);
    expect(pagination).toMatchObject({ page: 1, totalItems: 0, totalPages: 1, hasNext: false, hasPrev: false });
  });
});
