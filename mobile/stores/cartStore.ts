import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ASYNC_CART_KEY } from '@/constants';
import { round1 } from '@/utils/format';
import type { CartAddInput, CartItem } from '@/types';

/**
 * Customer cart — LOCAL ONLY. Persists to AsyncStorage via zustand/persist
 * (`dokko:cart`), NOT SecureStore and NOT the backend. There is deliberately
 * no cart API anywhere in phase 5; the backend is only touched at order
 * placement (later phase), where it re-validates every item and re-snapshots
 * `priceAtOrder = maxPrice` server-side.
 *
 * Semantics mirror front-end/src/context/Context.jsx EXACTLY:
 *  - addToCart:         round1(existing + amount); adds the line if absent
 *  - decreaseQuantity:  round1(qty - amount); reaches 0 -> line removed
 *  - setQuantity:       invalid/<=0 removes the line; clamps at 999 kg
 *  - removeItem:        full line removal regardless of quantity
 *  - clearCart:         empty the cart (future "after checkout")
 *  - total kg badge:    round1(sum of ALL line quantities), i.e. the web's
 *                       `getCartTotalQuantity()` metric — NOT unique-line count
 *
 * Hydration: a `hydrated` flag flips only after AsyncStorage has been read
 * (onRehydrateStorage). The badge/UI gates rendering on it so a restored
 * non-empty cart never flashes as empty.
 */
interface PersistedCart {
  lines: CartItem[];
}

export interface CartState {
  lines: CartItem[];
  /** True once the persisted cart has been read from storage. */
  hydrated: boolean;

  addToCart: (item: CartAddInput, amountKg?: number) => void;
  increaseQuantity: (itemId: string, amountKg?: number) => void;
  decreaseQuantity: (itemId: string, amountKg?: number) => void;
  setQuantity: (itemId: string, value: number | string) => void;
  removeItem: (itemId: string) => void;
  clearCart: () => void;
}

/**
 * Defensive read: drop malformed/negative lines, clamp to 1dp and 999kg,
 * and normalize field types so corrupted storage can never crash a screen.
 */
function sanitizeLines(value: unknown): CartItem[] {
  if (!Array.isArray(value)) return [];
  const out: CartItem[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const line = raw as Partial<CartItem>;
    if (typeof line.itemId !== 'string' || line.itemId.length === 0) continue;
    const qty = round1(Number(line.quantityKg));
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const price = Number(line.price);
    out.push({
      itemId: line.itemId,
      nameEng: typeof line.nameEng === 'string' ? line.nameEng : '',
      nameNep: typeof line.nameNep === 'string' ? line.nameNep : '',
      unitEng: typeof line.unitEng === 'string' ? line.unitEng : '',
      unitNep: typeof line.unitNep === 'string' ? line.unitNep : '',
      price: Number.isFinite(price) && price > 0 ? price : 0,
      quantityKg: Math.min(qty, 999),
      image: typeof line.image === 'string' && line.image ? line.image : undefined,
    });
  }
  return out;
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      hydrated: false,

      addToCart(item, amountKg = 0.1) {
        const qty = round1(Number(amountKg));
        set((state) => {
          const existing = state.lines.find((l) => l.itemId === item.itemId);
          if (existing) {
            return {
              lines: state.lines.map((l) =>
                l.itemId === item.itemId
                  ? {
                      ...l,
                      quantityKg: round1(l.quantityKg + qty),
                      // Refresh display fields from the live catalog item.
                      nameEng: item.nameEng || l.nameEng,
                      nameNep: item.nameNep || l.nameNep,
                      unitEng: item.unitEng || l.unitEng,
                      unitNep: item.unitNep || l.unitNep,
                      price: Number(item.price) || l.price,
                      image: item.image ?? l.image,
                    }
                  : l
              ),
            };
          }
          const line: CartItem = {
            itemId: item.itemId,
            nameEng: item.nameEng ?? '',
            nameNep: item.nameNep ?? '',
            unitEng: item.unitEng ?? '',
            unitNep: item.unitNep ?? '',
            price: Number(item.price) || 0,
            quantityKg: qty,
            image: item.image,
          };
          return { lines: [...state.lines, line] };
        });
      },

      increaseQuantity(itemId, amountKg = 0.1) {
        const qty = round1(Number(amountKg));
        set((state) => {
          if (!state.lines.some((l) => l.itemId === itemId)) return state;
          return {
            lines: state.lines.map((l) =>
              l.itemId === itemId ? { ...l, quantityKg: round1(l.quantityKg + qty) } : l
            ),
          };
        });
      },

      decreaseQuantity(itemId, amountKg = 0.1) {
        const qty = round1(Number(amountKg));
        set((state) => {
          const line = state.lines.find((l) => l.itemId === itemId);
          if (!line) return state;
          const next = round1(line.quantityKg - qty);
          if (next <= 0) {
            return { lines: state.lines.filter((l) => l.itemId !== itemId) };
          }
          return { lines: state.lines.map((l) => (l.itemId === itemId ? { ...l, quantityKg: next } : l)) };
        });
      },

      setQuantity(itemId, value) {
        const num = round1(Number(value));
        set((state) => {
          // Empty / invalid / zero removes the line, exactly like the web.
          if (!Number.isFinite(num) || num <= 0) {
            return { lines: state.lines.filter((l) => l.itemId !== itemId) };
          }
          return {
            lines: state.lines.map((l) =>
              l.itemId === itemId ? { ...l, quantityKg: Math.min(num, 999) } : l
            ),
          };
        });
      },

      removeItem(itemId) {
        set((state) => ({ lines: state.lines.filter((l) => l.itemId !== itemId) }));
      },

      clearCart() {
        set({ lines: [] });
      },
    }),
    {
      name: ASYNC_CART_KEY,
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      partialize: (state) => ({ lines: state.lines } satisfies Partial<CartState>),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<PersistedCart>;
        return { ...current, lines: sanitizeLines(p.lines) };
      },
      onRehydrateStorage: () => () => {
        // Even a failed read counts as hydrated — merge() already produced the
        // safe sanitized/empty in-memory cart, so the UI just enables renders.
        useCartStore.setState({ hydrated: true });
      },
    }
  )
);