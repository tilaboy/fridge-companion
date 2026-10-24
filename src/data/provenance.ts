/* Provenance for the built-in recipe collection.
 *
 * The recipes are written for this project, not copied from a cookbook. They
 * ship under the repository's MIT license, and every built-in recipe records
 * that source explicitly so the collection can be audited and reused without
 * guessing where a recipe came from.
 */
import type { RecipeSource } from '../domain/types';

export const ORIGINAL_RECIPE_SOURCE: RecipeSource = {
  kind: 'original',
  author: 'Fridge Door Companion contributors',
  license: 'MIT',
  url: 'https://github.com/tilaboy/fridge-companion',
};
