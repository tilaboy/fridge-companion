/* Built-in recipe collection (spec > Components > Built-in data files).
 *
 * "A couple dozen" recipes, every ingredient drawn from the built-in tray
 * (data/ingredients.js) — the tray deliberately covers exactly this
 * collection (the POC's fixed-ingredient decision).
 *
 * Loaded as a plain script before app.js; in node (verification harnesses)
 * the same file is require()d. */
(function (root) {
  'use strict';

  var recipes = [
    {
      id: 'scrambled_eggs',
      name: 'Scrambled Eggs',
      dishEmoji: '\uD83C\uDF73',
      ingredients: [
        { ingredientId: 'egg', amount: 3 },
        { ingredientId: 'butter', amount: 10 },
        { ingredientId: 'salt', amount: 2 }
      ],
      steps: [
        'Crack the eggs into a bowl and beat them with a pinch of salt.',
        'Melt the butter in a pan over low heat.',
        'Pour in the eggs and stir gently until soft curds form.',
        'Serve warm — maybe with toast.'
      ]
    },
    {
      id: 'tomato_pasta',
      name: 'Tomato Pasta',
      dishEmoji: '\uD83C\uDF45',
      ingredients: [
        { ingredientId: 'pasta', amount: 200 },
        { ingredientId: 'tomato', amount: 2 },
        { ingredientId: 'garlic', amount: 2 },
        { ingredientId: 'olive_oil', amount: 15 },
        { ingredientId: 'salt', amount: 2 }
      ],
      steps: [
        'Boil the pasta in salted water until al dente.',
        'Chop the tomatoes and slice the garlic.',
        'Warm the olive oil, soften the garlic, then add the tomatoes.',
        'Toss the drained pasta through the sauce.'
      ]
    },
    {
      id: 'home_fries',
      name: 'Home Fries',
      dishEmoji: '\uD83E\uDD54',
      ingredients: [
        { ingredientId: 'potato', amount: 3 },
        { ingredientId: 'olive_oil', amount: 20 },
        { ingredientId: 'salt', amount: 2 },
        { ingredientId: 'bell_pepper', amount: 1 }
      ],
      steps: [
        'Cut the potatoes into cubes.',
        'Fry them in olive oil over medium heat until golden.',
        'Add the diced bell pepper and cook until soft.',
        'Season with salt and serve.'
      ]
    },
    {
      id: 'cheese_toast',
      name: 'Cheese Toast',
      dishEmoji: '\uD83E\uDDC0',
      ingredients: [
        { ingredientId: 'bread', amount: 2 },
        { ingredientId: 'cheese', amount: 40 },
        { ingredientId: 'butter', amount: 10 }
      ],
      steps: [
        'Butter the bread on both sides.',
        'Top with cheese.',
        'Toast in a pan until golden and the cheese melts.'
      ]
    },
    {
      id: 'broccoli_stir_fry',
      name: 'Broccoli Stir-Fry',
      dishEmoji: '\uD83E\uDD66',
      ingredients: [
        { ingredientId: 'broccoli', amount: 2 },
        { ingredientId: 'soy_sauce', amount: 20 },
        { ingredientId: 'garlic', amount: 2 },
        { ingredientId: 'olive_oil', amount: 15 }
      ],
      steps: [
        'Cut the broccoli into florets.',
        'Heat the oil and fry the garlic until fragrant.',
        'Add the broccoli and stir-fry for 4-5 minutes.',
        'Splash in the soy sauce and toss.'
      ]
    },
    {
      id: 'egg_fried_rice',
      name: 'Egg Fried Rice',
      dishEmoji: '\uD83C\uDF73',
      ingredients: [
        { ingredientId: 'cooked_rice', amount: 300 },
        { ingredientId: 'egg', amount: 2 },
        { ingredientId: 'soy_sauce', amount: 20 },
        { ingredientId: 'onion', amount: 1 }
      ],
      steps: [
        'Scramble the eggs in a hot pan and set aside.',
        'Fry the diced onion until soft.',
        'Add the cold cooked rice and break it up.',
        'Return the eggs, add soy sauce, and toss everything together.'
      ]
    },
    {
      id: 'creamy_carrot_soup',
      name: 'Creamy Carrot Soup',
      dishEmoji: '\uD83E\uDD55',
      ingredients: [
        { ingredientId: 'carrot', amount: 4 },
        { ingredientId: 'milk', amount: 200 },
        { ingredientId: 'butter', amount: 15 },
        { ingredientId: 'salt', amount: 2 }
      ],
      steps: [
        'Chop the carrots.',
        'Boil them in water until very soft.',
        'Blend with the milk and butter until smooth.',
        'Season with salt and serve warm.'
      ]
    },
    {
      id: 'garlic_bread',
      name: 'Garlic Bread',
      dishEmoji: '\uD83E\uDDC4',
      ingredients: [
        { ingredientId: 'bread', amount: 4 },
        { ingredientId: 'garlic', amount: 3 },
        { ingredientId: 'butter', amount: 30 },
        { ingredientId: 'salt', amount: 2 }
      ],
      steps: [
        'Mix softened butter with minced garlic and a pinch of salt.',
        'Spread it over the bread.',
        'Toast until the edges are crisp.'
      ]
    },
    {
      id: 'mushroom_omelette',
      name: 'Mushroom Omelette',
      dishEmoji: '\uD83C\uDF44',
      ingredients: [
        { ingredientId: 'egg', amount: 3 },
        { ingredientId: 'mushroom', amount: 100 },
        { ingredientId: 'butter', amount: 15 },
        { ingredientId: 'salt', amount: 2 }
      ],
      steps: [
        'Slice the mushrooms and fry them in butter.',
        'Beat the eggs with salt.',
        'Pour the eggs over the mushrooms and cook until set.',
        'Fold in half and serve.'
      ]
    },
    {
      id: 'lemon_butter_pasta',
      name: 'Lemon Butter Pasta',
      dishEmoji: '\uD83C\uDF4B',
      ingredients: [
        { ingredientId: 'pasta', amount: 200 },
        { ingredientId: 'lemon', amount: 1 },
        { ingredientId: 'butter', amount: 20 },
        { ingredientId: 'cheese', amount: 30 }
      ],
      steps: [
        'Boil the pasta.',
        'Melt the butter with lemon juice.',
        'Toss the pasta through the sauce.',
        'Finish with grated cheese.'
      ]
    },
    {
      id: 'honey_toast',
      name: 'Honey Toast',
      dishEmoji: '\uD83C\uDF6F',
      ingredients: [
        { ingredientId: 'bread', amount: 2 },
        { ingredientId: 'honey', amount: 20 },
        { ingredientId: 'butter', amount: 10 }
      ],
      steps: [
        'Toast the bread.',
        'Spread with butter.',
        'Drizzle honey on top.'
      ]
    },
    {
      id: 'spinach_and_eggs',
      name: 'Spinach and Eggs',
      dishEmoji: '\uD83E\uDD6C',
      ingredients: [
        { ingredientId: 'spinach', amount: 1 },
        { ingredientId: 'egg', amount: 2 },
        { ingredientId: 'garlic', amount: 2 },
        { ingredientId: 'olive_oil', amount: 10 }
      ],
      steps: [
        'Wilt the spinach in olive oil with the garlic.',
        'Push the spinach aside and fry the eggs in the same pan.',
        'Serve together, straight from the pan.'
      ]
    },
    {
      id: 'soy_rice_bowl',
      name: 'Soy Rice Bowl',
      dishEmoji: '\uD83C\uDF5B',
      ingredients: [
        { ingredientId: 'cooked_rice', amount: 250 },
        { ingredientId: 'egg', amount: 2 },
        { ingredientId: 'soy_sauce', amount: 15 }
      ],
      steps: [
        'Fry the egg to your liking.',
        'Warm the cooked rice.',
        'Drizzle soy sauce over the bowl and top with the egg.'
      ]
    },
    {
      id: 'potato_carrot_stew',
      name: 'Potato Carrot Stew',
      dishEmoji: '\uD83C\uDF72',
      ingredients: [
        { ingredientId: 'potato', amount: 2 },
        { ingredientId: 'carrot', amount: 2 },
        { ingredientId: 'milk', amount: 150 },
        { ingredientId: 'salt', amount: 2 },
        { ingredientId: 'butter', amount: 10 }
      ],
      steps: [
        'Cube the potato and carrot.',
        'Boil in water until tender.',
        'Add milk and butter, and simmer into a creamy stew.',
        'Season with salt.'
      ]
    },
    {
      id: 'leftover_pasta_toss',
      name: 'Leftover Pasta Toss',
      dishEmoji: '\uD83E\uDED1',
      ingredients: [
        { ingredientId: 'cooked_pasta', amount: 250 },
        { ingredientId: 'bell_pepper', amount: 2 },
        { ingredientId: 'olive_oil', amount: 15 },
        { ingredientId: 'garlic', amount: 2 },
        { ingredientId: 'cheese', amount: 20 }
      ],
      steps: [
        'Slice the bell pepper and garlic.',
        'Fry both in olive oil until soft.',
        'Toss through the cold cooked pasta.',
        'Top with cheese.'
      ]
    },
    {
      id: 'pasta_aglio_e_olio',
      name: 'Pasta Aglio e Olio',
      dishEmoji: '\uD83C\uDF5D',
      ingredients: [
        { ingredientId: 'pasta', amount: 200 },
        { ingredientId: 'garlic', amount: 3 },
        { ingredientId: 'olive_oil', amount: 20 },
        { ingredientId: 'salt', amount: 2 }
      ],
      steps: [
        'Boil the pasta.',
        'Gently fry sliced garlic in olive oil — do not burn it.',
        'Toss the pasta through the oil with a splash of pasta water.',
        'Season with salt.'
      ]
    },
    {
      id: 'eggs_in_tomato_sauce',
      name: 'Eggs in Tomato Sauce',
      dishEmoji: '\uD83C\uDF45',
      ingredients: [
        { ingredientId: 'tomato', amount: 3 },
        { ingredientId: 'egg', amount: 3 },
        { ingredientId: 'onion', amount: 1 },
        { ingredientId: 'garlic', amount: 2 },
        { ingredientId: 'olive_oil', amount: 10 }
      ],
      steps: [
        'Soften the onion and garlic in olive oil.',
        'Add the chopped tomatoes and simmer into a sauce.',
        'Crack in the eggs and cover until set.',
        'Scoop it out with bread.'
      ]
    },
    {
      id: 'french_onion_soup',
      name: 'French Onion Soup',
      dishEmoji: '\uD83E\uDDC5',
      ingredients: [
        { ingredientId: 'onion', amount: 3 },
        { ingredientId: 'cheese', amount: 50 },
        { ingredientId: 'bread', amount: 2 },
        { ingredientId: 'butter', amount: 20 }
      ],
      steps: [
        'Slice the onions and cook them slowly in butter until caramelized.',
        'Add water and simmer.',
        'Pour into bowls, top with bread and cheese, and toast under a grill.'
      ]
    },
    {
      id: 'mashed_potatoes',
      name: 'Mashed Potatoes',
      dishEmoji: '\uD83E\uDD54',
      ingredients: [
        { ingredientId: 'potato', amount: 4 },
        { ingredientId: 'milk', amount: 100 },
        { ingredientId: 'butter', amount: 20 },
        { ingredientId: 'salt', amount: 2 }
      ],
      steps: [
        'Boil the potatoes until soft.',
        'Mash with butter and warm milk.',
        'Season with salt.'
      ]
    },
    {
      id: 'mushroom_pasta',
      name: 'Mushroom Pasta',
      dishEmoji: '\uD83C\uDF44',
      ingredients: [
        { ingredientId: 'pasta', amount: 200 },
        { ingredientId: 'mushroom', amount: 150 },
        { ingredientId: 'garlic', amount: 2 },
        { ingredientId: 'olive_oil', amount: 15 },
        { ingredientId: 'cheese', amount: 20 }
      ],
      steps: [
        'Slice the mushrooms.',
        'Fry them with the garlic in olive oil until golden.',
        'Boil the pasta and toss it through the mushrooms.',
        'Top with cheese.'
      ]
    },
    {
      id: 'spinach_fried_rice',
      name: 'Spinach Fried Rice',
      dishEmoji: '\uD83E\uDD6C',
      ingredients: [
        { ingredientId: 'cooked_rice', amount: 250 },
        { ingredientId: 'spinach', amount: 1 },
        { ingredientId: 'egg', amount: 2 },
        { ingredientId: 'soy_sauce', amount: 15 },
        { ingredientId: 'garlic', amount: 2 }
      ],
      steps: [
        'Scramble the egg and set it aside.',
        'Fry the garlic and spinach until wilted.',
        'Add the rice and fry until hot.',
        'Mix in the egg and soy sauce.'
      ]
    },
    {
      id: 'cheese_potato_bake',
      name: 'Cheese Potato Bake',
      dishEmoji: '\uD83E\uDDC0',
      ingredients: [
        { ingredientId: 'potato', amount: 3 },
        { ingredientId: 'cheese', amount: 60 },
        { ingredientId: 'milk', amount: 100 },
        { ingredientId: 'butter', amount: 15 },
        { ingredientId: 'salt', amount: 2 }
      ],
      steps: [
        'Slice the potatoes thin.',
        'Layer them in a dish with butter, milk, and cheese.',
        'Bake until the potatoes are soft and the top is golden.',
        'Season with salt.'
      ]
    },
    {
      id: 'tomato_veggie_rice',
      name: 'Tomato Veggie Rice',
      dishEmoji: '\uD83C\uDF45',
      ingredients: [
        { ingredientId: 'cooked_rice', amount: 250 },
        { ingredientId: 'tomato', amount: 2 },
        { ingredientId: 'carrot', amount: 1 },
        { ingredientId: 'onion', amount: 1 },
        { ingredientId: 'garlic', amount: 2 }
      ],
      steps: [
        'Dice the tomato, carrot, and onion.',
        'Fry the onion, garlic, and carrot.',
        'Add the tomato and let it sauce up.',
        'Fold everything through the cooked rice.'
      ]
    },
    {
      id: 'pancakes',
      name: 'Pancakes',
      dishEmoji: '\uD83E\uDD5E',
      ingredients: [
        { ingredientId: 'flour', amount: 150 },
        { ingredientId: 'milk', amount: 200 },
        { ingredientId: 'egg', amount: 2 },
        { ingredientId: 'sugar', amount: 20 },
        { ingredientId: 'butter', amount: 15 }
      ],
      steps: [
        'Mix the flour, sugar, egg, and milk into a batter.',
        'Melt a little butter in a pan.',
        'Pour in small ladles of batter and flip when bubbles form.',
        'Stack them up and serve.'
      ]
    },
    {
      id: 'rice_pudding',
      name: 'Rice Pudding',
      dishEmoji: '\uD83C\uDF5A',
      ingredients: [
        { ingredientId: 'rice', amount: 80 },
        { ingredientId: 'milk', amount: 300 },
        { ingredientId: 'sugar', amount: 30 }
      ],
      steps: [
        'Simmer the rice in the milk until thick and creamy.',
        'Stir in the sugar.',
        'Serve warm or cold.'
      ]
    },
    {
      id: 'one_pan_potato_bake',
      name: 'One-Pan Potato Bake',
      dishEmoji: '\uD83C\uDF72',
      ingredients: [
        { ingredientId: 'potato', amount: 2 },
        { ingredientId: 'carrot', amount: 1 },
        { ingredientId: 'onion', amount: 1 },
        { ingredientId: 'olive_oil', amount: 15 },
        { ingredientId: 'salt', amount: 2 },
        { ingredientId: 'cheese', amount: 30 }
      ],
      steps: [
        'Thin-slice the potatoes, carrot, and onion.',
        'Layer them in a pan with olive oil and salt.',
        'Top with cheese.',
        'Bake until everything is tender and the cheese is golden.'
      ]
    }
  ];

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = recipes;
  } else {
    root.FDC_RECIPES = recipes;
  }
})(typeof window !== 'undefined' ? window : globalThis);
