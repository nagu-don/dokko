// ---- Fuzzy matching for item search -------------------------------------
// Every score is 0..1. Anything >= MATCH_THRESHOLD is treated as a match.

export const MATCH_THRESHOLD = 0.8;   // your "80% or more" filter rule
export const SUGGEST_THRESHOLD = 0.45; // dropdown is deliberately more forgiving

// lowercase, strip punctuation, collapse whitespace.
// keeps unicode letters/numbers so Nepali (Devanagari) queries work too
const norm = (s = '') =>
  s
    .toLowerCase()
    .replace(/[()]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

// "Tomato Large (Indian)" -> "Tomato Large"
export const baseName = (name = '') => name.split('(')[0].trim() || name.trim();

// classic two-row Levenshtein distance
const levenshtein = (a, b) => {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
};

// similarity as a 0..1 ratio
const ratio = (a, b) => {
  const longest = Math.max(a.length, b.length);
  return longest === 0 ? 1 : 1 - levenshtein(a, b) / longest;
};

// score ONE query word against a whole name
const scoreWord = (word, name) => {
  if (!word) return 1;
  if (name === word) return 1;
  if (name.startsWith(word)) return 0.97;          // "tom" -> "tomato large"

  const tokens = name.split(' ');
  if (tokens.some((t) => t === word)) return 1;
  if (tokens.some((t) => t.startsWith(word))) return 0.95;  // "lar" -> "...large"
  if (name.includes(word)) return 0.9;             // mid-word hit

  // typo tolerance: best edit-distance ratio against the full name or any token
  const best = tokens.reduce((max, t) => Math.max(max, ratio(word, t)), 0);
  return Math.max(best, ratio(word, name));
};

/**
 * Score a full query string against a name.
 * Multi-word queries average their per-word scores, so "tomato indian"
 * scores well only if BOTH words find a home in the name.
 */
export const scoreName = (query, name) => {
  const q = norm(query);
  const n = norm(name);
  if (!q) return 1;
  if (!n) return 0;

  const words = q.split(' ');
  const total = words.reduce((sum, w) => sum + scoreWord(w, n), 0);
  return total / words.length;
};

// A group matches on its base name OR on any of its variant names.
// English and Nepali names are both searchable.
export const scoreGroup = (query, group) => {
  let best = Math.max(
    scoreName(query, group.name),
    scoreName(query, group.nepName || '')
  );
  for (const v of group.variants) {
    best = Math.max(best, scoreName(query, v.nameEng || ''));
    best = Math.max(best, scoreName(query, v.nameNep || ''));
    if (best === 1) break;
  }
  return best;
};

// Filter + rank groups. Pass SUGGEST_THRESHOLD for the dropdown.
export const searchGroups = (query, groups, threshold = MATCH_THRESHOLD) => {
  if (!norm(query)) return groups;
  return groups
    .map((g) => ({ ...g, score: scoreGroup(query, g) }))
    .filter((g) => g.score >= threshold)
    .sort((a, b) => b.score - a.score);
};

// Build the grouped list (shared by Navbar suggestions and Explore)
export const buildGroups = (items = []) => {
  const map = new Map();
  items.forEach((item) => {
    const name = baseName(item.nameEng);
    const key = name.toLowerCase();
    if (!map.has(key)) {
      map.set(key, {
        key,
        name,
        nepName: baseName(item.nameNep || ''),
        variants: [],
      });
    }
    map.get(key).variants.push(item);
  });
  return Array.from(map.values());
};