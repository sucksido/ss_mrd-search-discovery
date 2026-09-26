import { readFileSync } from 'node:fs';
import type { CatalogItem, Category, CategoryFacet } from '@mrd/shared';
import { normalize } from '../lib/text.js';

/** A catalog item with its searchable text pre-folded, computed once at boot. */
export interface IndexedItem extends CatalogItem {
  readonly searchable: {
    name: string;
    category: string;
    tags: string;
    description: string;
    vendor: string;
  };
}

function assertShape(value: unknown, index: number): asserts value is CatalogItem {
  const item = value as Partial<CatalogItem> | null;
  const problems: string[] = [];
  if (item === null || typeof item !== 'object') problems.push('not an object');
  else {
    if (typeof item.id !== 'string') problems.push('id');
    if (typeof item.name !== 'string') problems.push('name');
    if (typeof item.category !== 'string') problems.push('category');
    if (typeof item.basePrice !== 'number') problems.push('basePrice');
    if (!Array.isArray(item.tags)) problems.push('tags');
  }
  if (problems.length > 0) {
    throw new Error(`Catalog item at index ${index} is invalid: ${problems.join(', ')}`);
  }
}

/**
 * Loads the dataset once and keeps it in memory. 36 items make an index
 * pointless — a linear scan over pre-normalised strings is microseconds — so
 * the only "index" here is the folded text and an id lookup Map.
 */
export class CatalogRepository {
  private readonly items: IndexedItem[];
  private readonly byId: Map<string, IndexedItem>;

  private constructor(items: IndexedItem[]) {
    this.items = items;
    this.byId = new Map(items.map((item) => [item.id, item]));
  }

  static fromFile(path: string): CatalogRepository {
    const raw: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (!Array.isArray(raw)) throw new Error(`Catalog at ${path} must be a JSON array`);
    return CatalogRepository.fromArray(raw);
  }

  static fromArray(raw: unknown[]): CatalogRepository {
    const items = raw.map((value, index) => {
      assertShape(value, index);
      return {
        ...value,
        searchable: {
          name: normalize(value.name),
          category: normalize(value.category),
          tags: normalize(value.tags.join(' ')),
          description: normalize(value.description),
          vendor: normalize(value.vendor),
        },
      } satisfies IndexedItem;
    });

    const ids = new Set(items.map((item) => item.id));
    if (ids.size !== items.length) throw new Error('Catalog contains duplicate ids');

    return new CatalogRepository(items);
  }

  all(): readonly IndexedItem[] {
    return this.items;
  }

  get(id: string): IndexedItem | undefined {
    return this.byId.get(id);
  }

  get size(): number {
    return this.items.length;
  }

  /** Distinct categories with their catalog-wide counts, alphabetically. */
  categories(): CategoryFacet[] {
    const counts = new Map<Category, number>();
    for (const item of this.items) counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
    return [...counts.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => a.category.localeCompare(b.category));
  }
}
