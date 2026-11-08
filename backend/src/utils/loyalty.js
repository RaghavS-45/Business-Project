export const TIERS = [
  { name: "Platinum", min: 1000, discount: 10 },
  { name: "Gold",     min: 500,  discount: 8 },
  { name: "Silver",   min: 100,  discount: 5 },
  { name: "Bronze",   min: 0,    discount: 0 },
];

export const getTier = (points = 0) => TIERS.find((t) => points >= t.min);