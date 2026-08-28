// generic filtering + sorting helpers shared by the admin pages

// case-insensitive, multi-token matcher:
// every whitespace-separated token must appear in at least one of the values
export const matchesQuery = (query, values = []) => {
  const q = (query || '').trim().toLowerCase();

  if (!q) return true;

  const hay = values
    .filter((v) => v !== undefined && v !== null && v !== '')
    .map((v) => String(v).toLowerCase())
    .join(' | ');

  return q.split(/\s+/).every((token) => hay.includes(token));
};

// stable sorter driven by a field-definition map:
//   fields = { key: { label, get(row), type: 'string'|'number'|'date' } }
export const sortRows = (rows, key, dir, fields) => {
  const field = fields[key];

  if (!field) return rows;

  const mult = dir === 'desc' ? -1 : 1;

  return [...rows].sort((a, b) => {
    const va = field.get(a);
    const vb = field.get(b);

    let cmp;

    if (field.type === 'number') {
      cmp = (Number(va) || 0) - (Number(vb) || 0);
    } else if (field.type === 'date') {
      cmp = new Date(va).getTime() - new Date(vb).getTime();
    } else {
      cmp = String(va ?? '').localeCompare(String(vb ?? ''), undefined, {
        sensitivity: 'base',
        numeric: true,
      });
    }

    if (cmp === 0) {
      // tie-breaker keeps relative order stable regardless of direction
      return 0;
    }

    return cmp * mult;
  });
};
