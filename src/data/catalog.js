// GoLemon product catalog. Each product carries the D1 two-layer mapping:
//   shelf_category   -> shelf-life taxonomy (drives urgency / the digital fridge)
//   recipe_categories-> archetype required_categories (drives meal matching)
// taxonomy is GoLemon's coarse catalog node. This file is the SKU->category map (D1).
export const CATALOG = [
  // --- Fresh leafy greens ---
  { id: 'ugu',        name: 'Ugu (pumpkin leaf)', unit: '1 bunch',  price: 700,  was: 0,    taxonomy: 'Fresh produce', shelf_category: 'fresh_leafy_green', recipe_categories: ['fresh_leafy_green'], emoji: '🥬', tint: 'var(--t-mint)' },
  { id: 'bitterleaf', name: 'Bitter leaf',         unit: '1 bunch',  price: 800,  was: 0,    taxonomy: 'Fresh produce', shelf_category: 'fresh_leafy_green', recipe_categories: ['bitter_leaf','fresh_leafy_green'], emoji: '🌿', tint: 'var(--t-mint)' },
  { id: 'spinach',    name: 'Spinach (efo)',       unit: '1 bunch',  price: 600,  was: 0,    taxonomy: 'Fresh produce', shelf_category: 'fresh_leafy_green', recipe_categories: ['fresh_leafy_green'], emoji: '🥬', tint: 'var(--t-mint)' },
  { id: 'scentleaf',  name: 'Scent leaf (nchanwu)',unit: '1 handful',price: 300,  was: 0,    taxonomy: 'Fresh produce', shelf_category: 'fresh_leafy_green', recipe_categories: ['scent_leaf_or_uziza'], emoji: '🌿', tint: 'var(--t-mint)' },
  // --- Proteins ---
  { id: 'titus',      name: 'Titus fish',          unit: '1kg',      price: 3500, was: 0,    taxonomy: 'Proteins', shelf_category: 'fresh_protein_fish',   recipe_categories: ['any_protein'], emoji: '🐟', tint: 'var(--t-blue)' },
  { id: 'catfish',    name: 'Catfish',             unit: '1kg',      price: 3000, was: 0,    taxonomy: 'Proteins', shelf_category: 'fresh_protein_fish',   recipe_categories: ['any_protein'], emoji: '🐟', tint: 'var(--t-blue)' },
  { id: 'beef',       name: 'Beef',                unit: '1kg',      price: 4500, was: 0,    taxonomy: 'Proteins', shelf_category: 'fresh_protein_meat',   recipe_categories: ['any_protein','proteins_beef_or_kpomo'], emoji: '🥩', tint: 'var(--t-peach)' },
  { id: 'chicken',    name: 'Chicken',             unit: '1kg',      price: 4000, was: 0,    taxonomy: 'Proteins', shelf_category: 'fresh_protein_poultry',recipe_categories: ['any_protein'], emoji: '🍗', tint: 'var(--t-peach)' },
  { id: 'kpomo',      name: 'Kpomo (cow skin)',    unit: '500g',     price: 1500, was: 0,    taxonomy: 'Proteins', shelf_category: 'fresh_protein_offal',  recipe_categories: ['any_protein','proteins_beef_or_kpomo'], emoji: '🟤', tint: 'var(--t-peach)' },
  { id: 'eggs',       name: 'Eggs',                unit: '1 crate',  price: 4500, was: 0,    taxonomy: 'Proteins', shelf_category: 'eggs',                 recipe_categories: ['eggs'], emoji: '🥚', tint: 'var(--t-cream)' },
  { id: 'crayfish',   name: 'Dried crayfish',      unit: '250g',     price: 1800, was: 0,    taxonomy: 'Proteins', shelf_category: 'dried_preserved_protein', recipe_categories: ['dried_crayfish'], emoji: '🦐', tint: 'var(--t-peach)' },
  { id: 'stockfish',  name: 'Stockfish',           unit: '200g',     price: 2500, was: 0,    taxonomy: 'Proteins', shelf_category: 'dried_preserved_protein', recipe_categories: ['stockfish','any_protein'], emoji: '🐟', tint: 'var(--t-peach)' },
  // --- Tomato / pepper / allium ---
  { id: 'tomato',     name: 'Fresh tomatoes',      unit: '1 paint',  price: 1200, was: 0,    taxonomy: 'Fresh produce', shelf_category: 'fresh_tomato_family', recipe_categories: ['fresh_tomato_family'], emoji: '🍅', tint: 'var(--t-pink)' },
  { id: 'pepper',     name: 'Scotch bonnet (ata rodo)', unit: '1 cup', price: 800, was: 0,   taxonomy: 'Fresh produce', shelf_category: 'fresh_pepper', recipe_categories: ['fresh_pepper'], emoji: '🌶️', tint: 'var(--t-pink)' },
  { id: 'tatashe',    name: 'Tatashe (bell pepper)', unit: '4 pcs',  price: 900,  was: 0,    taxonomy: 'Fresh produce', shelf_category: 'fresh_pepper', recipe_categories: ['tatashe_bell_pepper','fresh_pepper'], emoji: '🫑', tint: 'var(--t-pink)' },
  { id: 'misfit',     name: 'Shombo pepper [misfit]', unit: '300g',  price: 309,  was: 882,  taxonomy: 'Fresh produce', shelf_category: 'fresh_pepper', recipe_categories: ['fresh_pepper'], emoji: '🌶️', tint: 'var(--t-pink)' },
  { id: 'onion',      name: 'Onions',              unit: '1kg',      price: 1000, was: 0,    taxonomy: 'Fresh produce', shelf_category: 'alliums', recipe_categories: ['alliums'], emoji: '🧅', tint: 'var(--t-cream)' },
  // --- Other fresh veg ---
  { id: 'okra',       name: 'Okra',                unit: '1 cup',    price: 600,  was: 0,    taxonomy: 'Fresh produce', shelf_category: 'fresh_vegetable', recipe_categories: ['fresh_okra'], emoji: '🌿', tint: 'var(--t-mint)' },
  { id: 'gardenegg',  name: 'Garden egg',          unit: '6 pcs',    price: 700,  was: 0,    taxonomy: 'Fresh produce', shelf_category: 'fresh_vegetable', recipe_categories: ['garden_egg'], emoji: '🍆', tint: 'var(--t-mint)' },
  { id: 'carrot',     name: 'Carrots',             unit: '500g',     price: 900,  was: 0,    taxonomy: 'Fresh produce', shelf_category: 'fresh_vegetable', recipe_categories: ['carrots'], emoji: '🥕', tint: 'var(--t-peach)' },
  { id: 'greenbeans', name: 'Green beans',         unit: '500g',     price: 1100, was: 0,    taxonomy: 'Fresh produce', shelf_category: 'fresh_vegetable', recipe_categories: ['green_beans'], emoji: '🫛', tint: 'var(--t-mint)' },
  // --- Starchy ---
  { id: 'yam',        name: 'Yam',                 unit: '1 tuber',  price: 2500, was: 0,    taxonomy: 'Fresh produce', shelf_category: 'starchy_tuber', recipe_categories: ['yam_cut_pieces'], emoji: '🍠', tint: 'var(--t-cream)' },
  { id: 'sweetpotato',name: 'Sweet potato',        unit: '1kg',      price: 1400, was: 0,    taxonomy: 'Fresh produce', shelf_category: 'starchy_tuber', recipe_categories: ['sweet_potato'], emoji: '🍠', tint: 'var(--t-amber)' },
  { id: 'cocoyam',    name: 'Cocoyam',             unit: '1kg',      price: 1600, was: 0,    taxonomy: 'Fresh produce', shelf_category: 'starchy_tuber', recipe_categories: ['cocoyam'], emoji: '🥔', tint: 'var(--t-cream)' },
  { id: 'plantain',   name: 'Ripe plantain',       unit: '3 fingers',price: 1500, was: 0,    taxonomy: 'Fresh produce', shelf_category: 'starchy_fruit', recipe_categories: ['ripe_plantain'], emoji: '🍌', tint: 'var(--t-amber)' },
  // --- Pantry / grains / legumes ---
  { id: 'rice',       name: 'Parboiled rice',      unit: '5kg',      price: 6500, was: 0,    taxonomy: 'Grains', shelf_category: 'dry_grain_pantry', recipe_categories: ['parboiled_rice'], emoji: '🍚', tint: 'var(--t-amber)' },
  { id: 'beans',      name: 'Honey beans (oloyin)',unit: '2kg',      price: 3200, was: 0,    taxonomy: 'Grains', shelf_category: 'dry_legume_pantry', recipe_categories: ['dried_beans_honey_beans'], emoji: '🫘', tint: 'var(--t-amber)' },
  { id: 'egusi',      name: 'Egusi (melon seed)',  unit: '500g',     price: 2000, was: 0,    taxonomy: 'Pantry', shelf_category: 'dry_grain_pantry', recipe_categories: ['egusi_seeds'], emoji: '🟡', tint: 'var(--t-amber)' },
  { id: 'ogbono',     name: 'Ogbono (ground)',     unit: '250g',     price: 2200, was: 0,    taxonomy: 'Pantry', shelf_category: 'dry_grain_pantry', recipe_categories: ['ogbono_seeds'], emoji: '🟤', tint: 'var(--t-amber)' },
  { id: 'spaghetti',  name: 'Spaghetti',           unit: '500g',     price: 900,  was: 0,    taxonomy: 'Pantry', shelf_category: 'dry_starch_pantry', recipe_categories: ['dry_pasta'], emoji: '🍝', tint: 'var(--t-amber)' },
  { id: 'palmoil',    name: 'Palm oil',            unit: '1 litre',  price: 2500, was: 0,    taxonomy: 'Pantry', shelf_category: 'cooking_oil_pantry', recipe_categories: ['palm_oil'], emoji: '🟠', tint: 'var(--t-peach)' },
  { id: 'vegoil',     name: 'Vegetable oil',       unit: '1 litre',  price: 2800, was: 0,    taxonomy: 'Pantry', shelf_category: 'cooking_oil_pantry', recipe_categories: ['cooking_oil'], emoji: '🫗', tint: 'var(--t-cream)' },
  { id: 'stockcube',  name: 'Stock cubes',         unit: '1 pack',   price: 500,  was: 0,    taxonomy: 'Pantry', shelf_category: 'fermented_condiment_pantry', recipe_categories: ['stock_cube'], emoji: '🧊', tint: 'var(--t-cream)' },
  // --- Bakery / breakfast / fruit (shelf_category outside the 40-list -> fallback "3 days") ---
  { id: 'bread',      name: 'Agege bread',         unit: '1 loaf',   price: 1000, was: 0,    taxonomy: 'Bakery', shelf_category: 'bakery_bread', recipe_categories: ['sliced_bread'], emoji: '🍞', tint: 'var(--t-cream)' },
  { id: 'akamu',      name: 'Akamu / pap (ogi)',   unit: '4 wraps',  price: 800,  was: 0,    taxonomy: 'Pantry', shelf_category: 'fresh_vegetable', recipe_categories: ['akamu_ogi_pap'], emoji: '🥣', tint: 'var(--t-cream)' },
  { id: 'custard',    name: 'Custard powder',      unit: '500g',     price: 1200, was: 0,    taxonomy: 'Pantry', shelf_category: 'dry_starch_pantry', recipe_categories: ['custard_powder'], emoji: '🥣', tint: 'var(--t-amber)' },
  { id: 'noodles',    name: 'Instant noodles',     unit: '1 carton', price: 4800, was: 0,    taxonomy: 'Pantry', shelf_category: 'dry_starch_pantry', recipe_categories: ['instant_noodles'], emoji: '🍜', tint: 'var(--t-amber)' },
  { id: 'flour',      name: 'Plain flour',         unit: '2kg',      price: 2400, was: 0,    taxonomy: 'Pantry', shelf_category: 'dry_grain_pantry', recipe_categories: ['flour'], emoji: '🌾', tint: 'var(--t-cream)' },
  { id: 'groundnut',  name: 'Roasted groundnut',   unit: '500g',     price: 1300, was: 0,    taxonomy: 'Pantry', shelf_category: 'dry_legume_pantry', recipe_categories: ['groundnut'], emoji: '🥜', tint: 'var(--t-amber)' },
  { id: 'pineapple',  name: 'Pineapple',           unit: '1 piece',  price: 1500, was: 0,    taxonomy: 'Fresh produce', shelf_category: 'fruit', recipe_categories: ['pineapple','mixed_fruit'], emoji: '🍍', tint: 'var(--t-amber)' },
  { id: 'watermelon', name: 'Watermelon',          unit: '1 piece',  price: 2000, was: 0,    taxonomy: 'Fresh produce', shelf_category: 'fruit', recipe_categories: ['watermelon','mixed_fruit'], emoji: '🍉', tint: 'var(--t-pink)' },
  { id: 'banana',     name: 'Bananas',             unit: '1 bunch',  price: 1200, was: 0,    taxonomy: 'Fresh produce', shelf_category: 'starchy_fruit', recipe_categories: ['banana','mixed_fruit'], emoji: '🍌', tint: 'var(--t-amber)' },
  { id: 'sugar',      name: 'Sugar',               unit: '1kg',      price: 1200, was: 0,    taxonomy: 'Pantry', shelf_category: 'dry_grain_pantry', recipe_categories: ['sugar'], emoji: '🍬', tint: 'var(--t-cream)' },
  { id: 'yeast',      name: 'Baking yeast',        unit: '100g',     price: 600,  was: 0,    taxonomy: 'Pantry', shelf_category: 'dry_grain_pantry', recipe_categories: ['yeast'], emoji: '🫧', tint: 'var(--t-cream)' },
  { id: 'zobo',       name: 'Dried zobo (hibiscus)', unit: '250g',   price: 900,  was: 0,    taxonomy: 'Pantry', shelf_category: 'dry_grain_pantry', recipe_categories: ['zobo_hibiscus_leaves'], emoji: '🌺', tint: 'var(--t-pink)' },
];
