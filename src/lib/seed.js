// Demo shop data. The acceptance test in test/acceptance.test.js depends on these exact values.

export const SHOP_NAME = "Laxmi Kirana";
export const LOW_STOCK = 5; // below this, a product gets a red LOW badge

export function seedState() {
  return {
    version: 1,
    shop: SHOP_NAME,
    customers: [
      { id: "c1", name: "Sharma ji", aliases: ["sharma", "sharma ji"], tags: [], balance: 500, phone: "919800000001" },
      { id: "c2", name: "Gupta aunty", aliases: ["gupta", "gupta aunty", "gupta ji"], tags: [], balance: 200, phone: "919800000002" },
      {
        id: "c3", name: "Ravi doodhwala", ask: "doodhwale Ravi", aliases: ["ravi", "ravi doodhwala"], balance: 150, phone: "919800000003",
        tags: ["doodhwala", "doodhwale", "doodh wala", "doodh wale", "dudhwala", "dudhwale", "milkman", "doodh"],
      },
      {
        id: "c4", name: "Ravi school wale", ask: "school wale Ravi", aliases: ["ravi", "ravi school wale"], balance: 0, phone: "919800000004",
        tags: ["school", "school wale", "school wala", "schoolwale", "iskool", "teacher", "master"],
      },
    ],
    products: [
      { id: "p1", name: "Atta", label: "Atta 1kg", unit: "kg", price: 45, stock: 20, aliases: ["atta", "aata", "aataa", "flour", "gehun ka atta"] },
      { id: "p2", name: "Surf", label: "Surf Excel 500g", unit: "packet", price: 70, stock: 10, aliases: ["surf", "surf excel", "sarf", "excel"] },
      { id: "p3", name: "Maggi", label: "Maggi", unit: "packet", price: 14, stock: 40, aliases: ["maggi", "meggi", "megi", "maggie", "noodles"] },
      { id: "p4", name: "Amul Doodh", label: "Amul Doodh 500ml", unit: "packet", price: 28, stock: 30, aliases: ["amul doodh", "doodh", "dudh", "milk", "amul"] },
      { id: "p5", name: "Parle-G", label: "Parle-G", unit: "packet", price: 10, stock: 6, aliases: ["parle g", "parle", "parleg", "parle ji", "biscuit", "biskut"] },
    ],
    entries: [],
    nextId: 1,
  };
}
