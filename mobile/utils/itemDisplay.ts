import { t } from '@/i18n';
import type { AppLang } from '@/stores/settingsStore';
import type { Item, ItemGroup, SelectedItem } from '@/types';

/**
 * Shared catalog-item display helpers, extracted from ItemCard so the item
 * details screen and the future cart use exactly the same rules (unit
 * fallback, variant labels, group resolution, selected-item mapping).
 */

/** Bilingual unit: prefer the API's unit fields, fall back to "kg". */
export function unitOf(
  lang: AppLang,
  item: { unitEng?: string; unitNep?: string } | undefined
): string {
  const fallback = t(lang, 'unitKg');
  if (!item) return fallback;
  return lang === 'np' ? item.unitNep || fallback : item.unitEng || fallback;
}

/**
 * Short variant label: "Tomato Large (Indian)" -> "Indian"; no parenthesis
 * -> "Standard". Nepali uses the full Nepali name.
 */
export function variantLabel(lang: AppLang, item: Item): string {
  if (lang === 'np' && item.nameNep) return item.nameNep;
  const match = item.nameEng.match(/\(([^)]*)\)/);
  return match?.[1]?.trim() ? match[1].trim() : t(lang, 'variantStandard');
}

/** The group owning `itemId` (undefined when the id is unknown/stale). */
export function groupForItem(
  groups: ItemGroup[],
  itemId: string | undefined
): ItemGroup | undefined {
  if (!itemId) return undefined;
  return groups.find((g) => g.variants.some((v) => v._id === itemId));
}

/**
 * Map a backend Item into the canonical SelectedItem shape. `itemId` is the
 * exact backend `_id` and `price` is `maxPrice` — both must match what the
 * order API expects (see SelectedItem in types/item.ts).
 */
export function toSelectedItem(item: Item): SelectedItem {
  return {
    itemId: item._id,
    nameEng: item.nameEng,
    nameNep: item.nameNep,
    unitEng: item.unitEng,
    unitNep: item.unitNep,
    price: Number(item.maxPrice) || 0,
  };
}