/* Shared fixtures: the real built-in tray and recipe book, indexed once.
 *
 * Tests exercise the same catalog the browser builds in `src/app.js`, so a
 * data mistake shows up here before it reaches the fridge door. */
import { createCatalog } from '../src/domain/catalog';
import { ingredients } from '../src/data/ingredients';
import { recipes } from '../src/data/recipes';

export { ingredients, recipes };
export const catalog = createCatalog(ingredients, recipes);
