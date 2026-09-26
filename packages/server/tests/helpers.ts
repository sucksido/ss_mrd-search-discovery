import { resolve } from 'node:path';
import { CatalogRepository } from '../src/catalog/catalog.repository.js';

export const CATALOG_PATH = resolve(import.meta.dirname, '../src/data/catalog.json');

export const repo = CatalogRepository.fromFile(CATALOG_PATH);

/** A tiny, fully-controlled catalog for the pure search tests. */
export const fixtureRepo = CatalogRepository.fromArray([
  {
    id: 'a1', name: 'Double Smash Burger', description: 'Two beef patties and cheese', category: 'Fast Food',
    tags: ['burger', 'beef'], vendor: 'Grill Co', basePrice: 10000, rating: 4.6, popularity: 90, emoji: '🍔',
  },
  {
    id: 'a2', name: 'Veg Smash Burger', description: 'Plant patty with smoky mayo', category: 'Fast Food',
    tags: ['burger', 'vegan'], vendor: 'Green Grill', basePrice: 12000, rating: 4.1, popularity: 50, emoji: '🥬',
  },
  {
    id: 'a3', name: 'Loaded Chips', description: 'Fries served with our burger sauce', category: 'Fast Food',
    tags: ['chips'], vendor: 'Grill Co', basePrice: 5000, rating: 4.0, popularity: 70, emoji: '🍟',
  },
  {
    id: 'b1', name: 'Café Mocha', description: 'Espresso and chocolate', category: 'Drinks',
    tags: ['coffee'], vendor: 'Bean There', basePrice: 4000, rating: 4.4, popularity: 80, emoji: '☕',
  },
  {
    id: 'b2', name: 'Margherita Pizza', description: 'Tomato, mozzarella, basil', category: 'Pizza & Pasta',
    tags: ['pizza', 'vegetarian'], vendor: 'Forno', basePrice: 13000, rating: 4.8, popularity: 95, emoji: '🍕',
  },
]);
