import './Pagination.css';

// window of page numbers around the current one, always including 1 and last,
// with "…" where numbers are skipped
const buildPages = (current, total) => {
  const wanted = new Set([1, current - 1, current, current + 1, total]);
  const nums = [...wanted]
    .filter((p) => p >= 1 && p <= total)
    .sort((a, b) => a - b);

  const out = [];
  let prev = 0;
  for (const p of nums) {
    if (p - prev > 1) out.push('…');
    out.push(p);
    prev = p;
  }
  return out;
};

const Pagination = ({ page, totalPages, onPage }) => {
  if (totalPages <= 1) return null;

  return (
    <div className='pagination' role='navigation' aria-label='Pagination'>
      <button
        className='page-btn nav'
        disabled={page === 1}
        onClick={() => onPage(page - 1)}
        aria-label='Previous page'
      >
        ‹
      </button>

      {buildPages(page, totalPages).map((p, i) =>
        p === '…' ? (
          <span key={`gap-${i}`} className='page-gap'>
            …
          </span>
        ) : (
          <button
            key={p}
            className={`page-btn${p === page ? ' active' : ''}`}
            onClick={() => onPage(p)}
            aria-current={p === page ? 'page' : undefined}
          >
            {p}
          </button>
        )
      )}

      <button
        className='page-btn nav'
        disabled={page === totalPages}
        onClick={() => onPage(page + 1)}
        aria-label='Next page'
      >
        ›
      </button>
    </div>
  );
};

export default Pagination;
