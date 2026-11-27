/*
 * Phase 66 benchmark fixture data for the search-detail app: 30 products and
 * the store search used by results.html. Loaded as a classic script, so
 * CATALOG, searchCatalog and formatPrice are shared with the page script.
 *
 * A query matches a product when every query word is the start of a word in
 * the product's name, category or tags; a trailing plural 's' is ignored.
 */
const CATALOG = Object.freeze([
  { sku: 'TRS-4431', name: 'Stormline Trail Running Shoe', category: 'Trail running shoes', waterproof: true, price: 135 },
  { sku: 'TRS-4410', name: 'Ridgeback Trail Running Shoe', category: 'Trail running shoes', waterproof: false, price: 95 },
  { sku: 'RRS-3302', name: 'Tempo Road Running Shoe', category: 'Road running shoes', waterproof: false, price: 120 },
  { sku: 'TRS-4452', name: 'Canyon Dash Trail Running Shoe', category: 'Trail running shoes', waterproof: false, price: 128 },
  { sku: 'HKB-5105', name: 'Ridgeline Hiking Boot', category: 'Hiking boots', waterproof: true, price: 159 },
  { sku: 'TRS-4427', name: 'Summit Pass Trail Running Shoe', category: 'Trail running shoes', waterproof: true, price: 112 },
  { sku: 'APP-6201', name: 'Trail Running Vest', category: 'Running apparel', waterproof: false, price: 65 },
  { sku: 'RRS-3318', name: 'Harbor Road Running Shoe', category: 'Road running shoes', waterproof: true, price: 110 },
  { sku: 'TRS-4468', name: 'Mossback Trail Running Shoe', category: 'Trail running shoes', waterproof: false, price: 104 },
  { sku: 'HKB-5119', name: 'Trailhead Hiking Boot', category: 'Hiking boots', waterproof: true, price: 99 },
  { sku: 'ACC-2104', name: 'Trail Running Shoe Laces', category: 'Accessories', waterproof: false, price: 12 },
  { sku: 'TRS-4475', name: 'Glacier Line Trail Running Shoe', category: 'Trail running shoes', waterproof: true, price: 149 },
  { sku: 'APP-6214', name: 'Trail Running Jacket', category: 'Running apparel', waterproof: true, price: 149 },
  { sku: 'RRS-3325', name: 'Pacer Road Running Shoe', category: 'Road running shoes', waterproof: false, price: 89 },
  { sku: 'WLK-7110', name: 'Commuter Walking Shoe', category: 'Walking shoes', waterproof: true, price: 115 },
  { sku: 'HKB-5123', name: 'Basecamp Hiking Boot', category: 'Hiking boots', waterproof: false, price: 139 },
  { sku: 'APP-6222', name: 'Trail Running Socks, 3 pack', category: 'Running apparel', waterproof: false, price: 24 },
  { sku: 'RUN-1150', name: 'Track Spike Running Shoe', category: 'Running shoes', waterproof: false, price: 85 },
  { sku: 'WLK-7124', name: 'Everyday Walking Shoe', category: 'Walking shoes', waterproof: false, price: 79 },
  { sku: 'SND-8101', name: 'River Sport Sandal', category: 'Sandals', waterproof: true, price: 70 },
  { sku: 'APP-6230', name: 'Trail Running Cap', category: 'Running apparel', waterproof: false, price: 28 },
  { sku: 'ACC-2110', name: 'Merino Running Socks', category: 'Accessories', waterproof: false, price: 22 },
  { sku: 'ACC-2117', name: 'Shoe Waterproofing Spray', category: 'Accessories', waterproof: false, price: 14 },
  { sku: 'ACC-2123', name: 'Running Headlamp', category: 'Accessories', waterproof: false, price: 45 },
  { sku: 'KDS-9102', name: 'Kids Trail Sneaker', category: 'Kids shoes', waterproof: true, price: 60 },
  { sku: 'ACC-2130', name: 'Insulated Water Bottle', category: 'Accessories', waterproof: false, price: 30 },
  { sku: 'ACC-2136', name: 'Ankle Gaiters', category: 'Accessories', waterproof: true, price: 38 },
  { sku: 'CLM-4101', name: 'Granite Approach Shoe', category: 'Climbing shoes', waterproof: false, price: 130 },
  { sku: 'SND-8114', name: 'Recovery Slide', category: 'Sandals', waterproof: false, price: 45 },
  { sku: 'ACC-2142', name: 'Trekking Poles, pair', category: 'Accessories', waterproof: false, price: 89 },
].map((item) => Object.freeze(item)));

function catalogWords(text) {
  return String(text).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function searchCatalog(query) {
  const terms = catalogWords(query).map((term) => (term.length > 3 && term.endsWith('s') ? term.slice(0, -1) : term));
  if (terms.length === 0) return [];
  return CATALOG.filter((item) => {
    const words = catalogWords(`${item.name} ${item.category}${item.waterproof ? ' waterproof' : ''}`);
    return terms.every((term) => words.some((word) => word.startsWith(term)));
  });
}

function formatPrice(price) {
  return `$${price.toFixed(2)}`;
}
