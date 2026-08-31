import type { AppLang } from '@/stores/settingsStore';

/** Minimal localized date formatting for a server ISO timestamp. */
export function formatOrderDate(lang: AppLang, iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const date = d.toLocaleDateString(lang === 'np' ? 'ne' : 'en', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const time = d.toLocaleTimeString(lang === 'np' ? 'ne' : 'en', {
    hour: '2-digit',
    minute: '2-digit',
  });
  // Reuse a neutral placeholder so the string stays translatable.
  return `${date} · ${time}`;
}
