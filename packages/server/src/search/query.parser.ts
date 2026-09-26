import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, SORT_OPTIONS, type Category, type SearchQuery, type SortOption } from '@mrd/shared';
import { ApiError, type FieldIssue } from '../lib/api-error.js';

const MAX_QUERY_LENGTH = 128;

function single(value: unknown, field: string, issues: FieldIssue[]): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'string') return value;
  issues.push({ field, message: 'must be provided at most once' });
  return undefined;
}

function int(value: string | undefined, field: string, fallback: number, min: number, max: number, issues: FieldIssue[]): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    issues.push({ field, message: 'must be an integer' });
    return fallback;
  }
  if (parsed < min || parsed > max) {
    issues.push({ field, message: `must be between ${min} and ${max}` });
    return fallback;
  }
  return parsed;
}

/**
 * The single place where untrusted input becomes a typed SearchQuery.
 *
 * Hand-written rather than Zod: it is ~60 lines, it keeps the server at one
 * runtime dependency, and every rule is visible at the boundary where a
 * reviewer looks for it. All issues are collected so the client gets one
 * useful 400 instead of a game of whack-a-mole.
 */
export function parseSearchQuery(raw: Record<string, unknown>, knownCategories: readonly Category[]): SearchQuery {
  const issues: FieldIssue[] = [];

  const qRaw = single(raw['q'], 'q', issues) ?? '';
  if (qRaw.length > MAX_QUERY_LENGTH) {
    issues.push({ field: 'q', message: `must be at most ${MAX_QUERY_LENGTH} characters` });
  }

  const categoryRaw = single(raw['category'], 'category', issues);
  let category: Category | null = null;
  if (categoryRaw !== undefined && categoryRaw.trim() !== '' && categoryRaw !== 'all') {
    const match = knownCategories.find((known) => known.toLowerCase() === categoryRaw.toLowerCase());
    if (match === undefined) {
      issues.push({ field: 'category', message: `must be one of: ${knownCategories.join(', ')}` });
    } else {
      category = match;
    }
  }

  const sortRaw = single(raw['sort'], 'sort', issues);
  let sort: SortOption = 'relevance';
  if (sortRaw !== undefined && sortRaw.trim() !== '') {
    const match = SORT_OPTIONS.find((option) => option === sortRaw);
    if (match === undefined) {
      issues.push({ field: 'sort', message: `must be one of: ${SORT_OPTIONS.join(', ')}` });
    } else {
      sort = match;
    }
  }

  const page = int(single(raw['page'], 'page', issues), 'page', 1, 1, 1000, issues);
  const pageSize = int(single(raw['pageSize'], 'pageSize', issues), 'pageSize', DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE, issues);

  if (issues.length > 0) {
    throw ApiError.validation('One or more query parameters are invalid', issues);
  }

  return { q: qRaw.trim().slice(0, MAX_QUERY_LENGTH), category, sort, page, pageSize };
}
