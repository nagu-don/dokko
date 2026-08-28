import './SearchSort.css'

// search input + sort dropdown/direction toggle, shared by all admin pages
const SearchSort = ({ placeholder, query, onQuery, sort, onSort, sortOptions }) => {
  return (
    <div className='controls-bar'>
      <div className='controls-search-wrap'>
        <input
          type='text'
          className='controls-search'
          placeholder={placeholder}
          value={query}
          onChange={(e) => onQuery(e.target.value)}
        />
        {query && (
          <button
            type='button'
            className='controls-search-clear'
            onClick={() => onQuery('')}
            aria-label='Clear search'
          >
            ×
          </button>
        )}
      </div>

      <div className='controls-sort'>
        <select
          className='controls-sort-select'
          value={sort.key}
          onChange={(e) => onSort({ ...sort, key: e.target.value })}
          aria-label='Sort by'
        >
          {sortOptions.map((opt) => (
            <option key={opt.key} value={opt.key}>
              Sort: {opt.label}
            </option>
          ))}
        </select>

        <button
          type='button'
          className='controls-sort-dir'
          onClick={() =>
            onSort({ ...sort, dir: sort.dir === 'asc' ? 'desc' : 'asc' })
          }
          title={sort.dir === 'asc' ? 'Ascending — click for descending' : 'Descending — click for ascending'}
        >
          {sort.dir === 'asc' ? '↑' : '↓'}
        </button>
      </div>
    </div>
  );
};

export default SearchSort;
