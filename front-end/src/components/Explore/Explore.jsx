import React, { useContext, useEffect, useMemo, useState } from 'react'
import { Context, isKgUnit, qtySteps } from '../../context/Context'
import HoldButton from '../../components/HoldButton/HoldButton'
import Pagination from '../../components/Pagination/Pagination'
import { buildGroups, searchGroups, MATCH_THRESHOLD } from '../../utils/search'
import './Explore.css'

// 20 group cards per page = 5 rows of 4 items
const PAGE_SIZE = 20;

// "Tomato Large (Indian)" -> "Indian";  no parenthesis -> "Standard"
const variantLabel = (name = '') => {
  const match = name.match(/\(([^)]*)\)/);
  return match && match[1].trim() ? match[1].trim() : 'Standard';
};

const round1 = (n) => Math.round(n * 10) / 10;
const fmt = (n) => n.toFixed(1);

const Explore = () => {
  const {
    items, url, cartItems,
    addToCart, decreaseQuantity, setQuantity, removeItemCompletely,
    activeSearch, clearSearch,
    t, money, num, lang, iunit,
  } = useContext(Context);

  // the item/group name shown follows the selected language
  const groupName = (group) =>
    lang === 'np' && group.nepName ? group.nepName : group.name;

  // Nepali names don't carry the "(variant)" suffix pattern — show as-is
  const variantName = (item) => {
    if (lang === 'np' && item.nameNep) return item.nameNep;
    return variantLabel(item.nameEng);
  };

  // which group cards are expanded
  const [openGroups, setOpenGroups] = useState(() => new Set());

  // raw text being typed, per item, so "1." survives mid-edit re-renders
  const [drafts, setDrafts] = useState({});

  // group items by their name before the parenthesis
  const groups = useMemo(() => buildGroups(items), [items]);

  // only groups scoring >= 80% against the submitted query
  const visibleGroups = useMemo(
    () => searchGroups(activeSearch, groups, MATCH_THRESHOLD),
    [activeSearch, groups]
  );

  // sort mode for normal browsing — alphabetical by default.
  // while a search is active, relevance order wins instead.
  const [sortMode, setSortMode] = useState('az');

  const [page, setPage] = useState(1);

  // new search or sort order -> back to the first page
  useEffect(() => {
    setPage(1);
  }, [activeSearch, sortMode]);

  const groupBestPrice = (variants) =>
    Math.min(...variants.map((v) => Number(v.maxPrice) || 0));

  const orderedGroups = useMemo(() => {
    if (activeSearch) return visibleGroups;

    const sorted = [...visibleGroups];

    // sort on the displayed name so Nepali alphabetical order works too
    const displayName = (g) => groupName(g).toLowerCase();

    if (sortMode === 'az') sorted.sort((a, b) => displayName(a).localeCompare(displayName(b), lang === 'np' ? 'ne' : 'en'));
    else if (sortMode === 'za') sorted.sort((a, b) => displayName(b).localeCompare(displayName(a), lang === 'np' ? 'ne' : 'en'));
    else if (sortMode === 'priceLow') sorted.sort((a, b) => groupBestPrice(a.variants) - groupBestPrice(b.variants));
    else if (sortMode === 'priceHigh') sorted.sort((a, b) => groupBestPrice(b.variants) - groupBestPrice(a.variants));

    return sorted;
  }, [visibleGroups, sortMode, activeSearch]);

  const totalPages = Math.max(1, Math.ceil(orderedGroups.length / PAGE_SIZE));

  // clamp instead of state-juggling if the list shrinks below the current page
  const currentPage = Math.min(page, totalPages);

  const goToPage = (p) => {
    setPage(p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const pageGroups = useMemo(
    () => orderedGroups.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [orderedGroups, currentPage]
  );

  // auto-expand matches so results are immediately actionable
  useEffect(() => {
    if (!activeSearch) return;
    setOpenGroups(new Set(searchGroups(activeSearch, groups, MATCH_THRESHOLD).map((g) => g.key)));
  }, [activeSearch, groups]);

  const toggleGroup = (key) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const groupTotal = (variants) =>
    round1(variants.reduce((sum, v) => sum + (cartItems[v._id] || 0), 0));

  // kg items allow one decimal place while typing; count-based items are whole
  const handleDraftChange = (id, raw) => {
    const pattern = isKgUnit(items.find((i) => i._id === id)) ? /^\d*\.?\d?$/ : /^\d*$/;
    if (raw === '' || pattern.test(raw)) {
      setDrafts((prev) => ({ ...prev, [id]: raw }));
    }
  };

  // push the typed value into the cart, then drop the draft
  const commitDraft = (id) => {
    const raw = drafts[id];
    if (raw !== undefined) setQuantity(id, raw === '' ? 0 : raw);
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  return (
    <div className='explore-wrapper'>

      <div className='explore-top-bar'>
        {!activeSearch && (
          <div className='explore-toolbar'>
            <label htmlFor='explore-sort'>{t('sortBy')}</label>
            <select
              id='explore-sort'
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value)}
            >
              <option value='az'>{t('sortAz')}</option>
              <option value='za'>{t('sortZa')}</option>
              <option value='priceLow'>{t('sortPriceLow')}</option>
              <option value='priceHigh'>{t('sortPriceHigh')}</option>
            </select>
          </div>
        )}
        <Pagination page={currentPage} totalPages={totalPages} onPage={goToPage} />
      </div>

      {/* ---- empty state replaces the grid when a search matches nothing ---- */}
      {activeSearch && visibleGroups.length === 0 ? (
        <div className='no-results'>
          <h3>{t('noItemsMatched', { query: activeSearch })}</h3>
          <p>{t('tryShorterSearch')}</p>
          <button onClick={clearSearch}>{t('showAllItems')}</button>
        </div>
      ) : (
        <>
          <div className='explore-container'>
            {pageGroups.map((group) => {          /* sorted groups */
            const total = groupTotal(group.variants);
            const isOpen = openGroups.has(group.key);
            const cover = group.variants[0];
            const coverIsKg = isKgUnit(cover);

            return (
              <div className={`item-container ${isOpen ? 'open' : ''}`} key={group.key}>

                <button
                  className='group-header'
                  onClick={() => toggleGroup(group.key)}
                  aria-expanded={isOpen}
                >
                  <img
                    src={`${url}/images/` + cover.image}
                    className='item-image'
                    alt={groupName(group)}
                  />
                  {total > 0 && (
                    <span className='cart-badge'>
                      {num(coverIsKg ? fmt(total) : total)} {iunit(cover)}
                    </span>
                  )}

                  <div className='item-text'>
                    <h2>{groupName(group)}</h2>
                    <p className='group-price'>
                      {t('fromPriceKg', { price: money(groupBestPrice(group.variants)), unit: iunit(cover) })}
                    </p>
                    <p className='variant-count'>
                      {num(group.variants.length)}{' '}
                      {t(group.variants.length === 1 ? 'optionOne' : 'optionsMany')}
                      <span className={`chevron ${isOpen ? 'up' : ''}`}>▾</span>
                    </p>
                  </div>
                </button>

                {isOpen && (
                  <div className='variant-list'>
                    {group.variants.map((item) => {
                      const quantity = cartItems[item._id] || 0;
                      const inCart = quantity > 0;
                      const value = drafts[item._id] ?? (inCart ? String(quantity) : '');

                      return (
                        <div className='variant-row' key={item._id}>
                          <div className='variant-top'>
                            <span className='variant-name'>{variantName(item)}</span>
                            <span className='variant-price'>
                              {money(item.maxPrice)}/{iunit(item)}
                            </span>
                          </div>

                          <div className='quantity'>
                            <HoldButton
                              className='remove-button'
                              onStep={(amount) => decreaseQuantity(item._id, amount)}
                              step={qtySteps(item).fine}
                              bulkStep={qtySteps(item).bulk}
                              disabled={!inCart}
                              aria-label={t('decreaseAria', { name: variantName(item) })}
                            >
                              -
                            </HoldButton>

                            <div className='qty-input-wrap'>
                              <input
                                type='text'
                                inputMode={isKgUnit(item) ? 'decimal' : 'numeric'}
                                className='qty-input'
                                value={value}
                                placeholder={isKgUnit(item) ? '0.0' : '0'}
                                onChange={(e) => handleDraftChange(item._id, e.target.value)}
                                onBlur={() => commitDraft(item._id)}
                                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                              />
                              <span className='qty-unit'>{iunit(item)}</span>
                            </div>

                            <HoldButton
                              className='add-button'
                              onStep={(amount) => addToCart(item._id, amount)}
                              step={qtySteps(item).fine}
                              bulkStep={qtySteps(item).bulk}
                              aria-label={t('increaseAria', { name: variantName(item) })}
                            >
                              +
                            </HoldButton>
                          </div>

                          <div className='variant-actions'>
                            <button
                              className='add-to-cart'
                              onClick={() => addToCart(item._id, qtySteps(item).bulk)}
                              disabled={inCart}
                            >
                              {inCart ? t('inCart') : t('addToCart')}
                            </button>
                            <button
                              className='remove-from-cart'
                              onClick={() => removeItemCompletely(item._id)}
                              disabled={!inCart}
                            >
                              {t('remove')}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
            })}
          </div>

          <Pagination page={currentPage} totalPages={totalPages} onPage={goToPage} />
        </>
      )}
    </div>
  );
};

export default Explore