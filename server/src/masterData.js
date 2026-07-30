// Group-wide fixed category master (seed data — admin can add more later).
// HouseKeeping & Maintenance never receives a min-max feed (hasMinMax: false).
// Demo items used by the seed script and the sample POS file generator.
export const DEMO_ITEMS = {
  Grocery: [['Basmati Rice', 'kg'], ['Toor Dal', 'kg'], ['Sunflower Oil', 'ltr'], ['Sugar', 'kg'], ['Wheat Flour', 'kg']],
  Provision: [['Tomato Ketchup', 'btl'], ['Soya Sauce', 'btl'], ['Pasta Penne', 'pkt'], ['Mayonnaise', 'kg']],
  'Vegetable/Fruits': [['Onion', 'kg'], ['Tomato', 'kg'], ['Potato', 'kg'], ['Coriander', 'kg'], ['Lemon', 'pc']],
  'Meat/Fish/Chicken': [['Chicken Curry Cut', 'kg'], ['Fish Basa', 'kg'], ['Mutton', 'kg']],
  'General/Parcel Items': [['Parcel Container 500ml', 'pc'], ['Carry Bags', 'pkt'], ['Aluminium Foil', 'roll']],
  'Dairy Product': [['Milk', 'ltr'], ['Paneer', 'kg'], ['Butter', 'kg'], ['Cheese Slice', 'pkt']],
  Liquor: [['Old Monk 750ml', 'btl'], ['Blenders Pride 750ml', 'btl'], ['Smirnoff 750ml', 'btl']],
  Beer: [['Kingfisher Premium 650ml', 'btl'], ['Budweiser 650ml', 'btl']],
  'Soda/Soft Drink': [['Coke 750ml', 'btl'], ['Soda 600ml', 'btl'], ['Sprite 750ml', 'btl']],
  Water: [['Mineral Water 1L', 'btl'], ['Mineral Water 500ml', 'btl']],
};

export const DEPARTMENT_MASTER = [
  {
    name: 'Main Kitchen',
    hasMinMax: true,
    categories: ['Grocery', 'Provision', 'Vegetable/Fruits', 'Meat/Fish/Chicken', 'General/Parcel Items', 'Dairy Product'],
  },
  {
    name: 'Bar',
    hasMinMax: true,
    categories: ['Liquor', 'Beer', 'Soda/Soft Drink', 'Water'],
  },
  {
    name: 'HouseKeeping & Maintenance',
    hasMinMax: false,
    categories: ['General Items', 'Stationery', 'Repairing & Maintenance', 'Housekeeping Material'],
  },
];
