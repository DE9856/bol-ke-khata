// Saves the ledger in the browser (localStorage). Everything still works if storage is blocked;
// the ledger then lasts only until the page reloads.

import { seedState } from "./seed.js";

const KEY = "bolkekhata.v1";

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.version === 1 && Array.isArray(s.entries)) return upgrade(s);
    }
  } catch { /* private mode or blocked storage */ }
  return seedState();
}

// Ledgers saved before the UPI and udhaar-age features: fill in the new fields from the seed.
function upgrade(s) {
  if (s.upi !== undefined && s.customers.every((c) => c.dueSince !== undefined)) return s;
  const seed = seedState();
  return {
    ...s,
    upi: s.upi ?? seed.upi,
    customers: s.customers.map((c) => {
      if (c.dueSince !== undefined) return c;
      const fromSeed = seed.customers.find((x) => x.id === c.id);
      return { ...c, dueSince: c.balance > 0 ? fromSeed?.dueSince ?? Date.now() : null };
    }),
  };
}

export function saveState(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

export function resetState() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  return seedState();
}
