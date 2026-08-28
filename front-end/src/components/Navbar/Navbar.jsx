import React, { useContext, useEffect, useMemo, useRef, useState } from 'react'
import './Navbar.css'
import logo from "../../assets/logo.png"
import cartIcon from "../../assets/cart-icon.png"
import searchIcon from "../../assets/search-icon.png"
import { Link, useNavigate } from 'react-router-dom'
import { Context } from '../../context/Context'
import { buildGroups, searchGroups, SUGGEST_THRESHOLD } from '../../utils/search'

const Navbar = () => {
  const {
    items, searchQuery, setSearchQuery, submitSearch, clearSearch, getCartTotalQuantity,
    token, setAuthToken, setShowAuth, t, num, lang,
  } = useContext(Context);

  const navigate = useNavigate();

  const [searchOpen, setSearchOpen] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlight, setHighlight] = useState(-1);

  const inputRef = useRef(null);
  const boxRef = useRef(null);

  const groups = useMemo(() => buildGroups(items), [items]);

  // top 6 loose matches for the dropdown
  const suggestions = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return searchGroups(searchQuery, groups, SUGGEST_THRESHOLD).slice(0, 6);
  }, [searchQuery, groups]);

  // focus the field the moment it opens
  useEffect(() => {
    if (searchOpen) inputRef.current?.focus();
  }, [searchOpen]);

  // close the dropdown when clicking anywhere else
  useEffect(() => {
    const onClickOutside = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) {
        setShowSuggestions(false);
        setHighlight(-1);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const runSearch = (query) => {
    submitSearch(query);
    setShowSuggestions(false);
    setHighlight(-1);
    inputRef.current?.blur();
    navigate('/');                 // make sure Explore is on screen
  };

  const handleIconClick = () => {
    if (!searchOpen) { setSearchOpen(true); return; }
    if (searchQuery.trim()) runSearch(searchQuery);
    else { setSearchOpen(false); clearSearch(); }   // empty box -> close & reset
  };

  const handleChange = (e) => {
    setSearchQuery(e.target.value);
    setShowSuggestions(true);
    setHighlight(-1);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown' && suggestions.length) {
      e.preventDefault();
      setShowSuggestions(true);
      setHighlight((h) => (h + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp' && suggestions.length) {
      e.preventDefault();
      setHighlight((h) => (h <= 0 ? suggestions.length - 1 : h - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      // Enter on a highlighted suggestion searches that exact name
      runSearch(highlight >= 0 ? suggestions[highlight].name : searchQuery);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      setHighlight(-1);
    }
  };

  const handleClear = () => {
    clearSearch();
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  const totalKg = getCartTotalQuantity();

  const scrollToTop = () => {
    window.scrollTo(0, 0);
  };

  const handleNavClick = (path) => {
    navigate(path);
    scrollToTop();
  };

  return (
    <div className='navbar'>
      <Link to="/" onClick={scrollToTop}>
        <img src={logo} className='logo' alt="Logo" />
      </Link>

      <div className='navbar-menu'>
        <span onClick={() => handleNavClick('/')}>{t('navHome')}</span>
        <span onClick={() => handleNavClick('/get-app')}>{t('navGetApp')}</span>
        <span onClick={() => handleNavClick('/contact-us')}>{t('navContactUs')}</span>
      </div>

      <div className='navbar-right'>
        <div className={`search-box ${searchOpen ? 'open' : ''}`} ref={boxRef}>

          <input
              ref={inputRef}
              type='text'
              className='search-input'
              placeholder={t('searchItemsPlaceholder')}
              value={searchQuery}
              onChange={handleChange}
              onFocus={() => searchQuery && setShowSuggestions(true)}
              onKeyDown={handleKeyDown}
              tabIndex={searchOpen ? 0 : -1}
          />

          {searchOpen && searchQuery && (
              <button
                  className='search-clear'
                  onClick={handleClear}
                  aria-label={t('clearSearchAria')}
              >
                  ×
              </button>
          )}

          {searchOpen && showSuggestions && searchQuery.trim() && (
              <ul className='search-suggestions'>

                  {suggestions.length === 0 && (
                      <li className='suggestion-empty'>
                          {t('noMatchesFor', { query: searchQuery })}
                      </li>
                  )}

                  {suggestions.map((g, i) => (
                      <li
                          key={g.key}
                          className={`suggestion ${
                              i === highlight ? 'active' : ''
                          }`}
                          onMouseEnter={() => setHighlight(i)}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => runSearch(g.name)}
                      >
                          <span className='suggestion-name'>
                              {lang === 'np' && g.nepName ? g.nepName : g.name}
                          </span>

                          <span className='suggestion-meta'>
                              {num(g.variants.length)}{" "}
                              {t(g.variants.length === 1 ? 'optionOne' : 'optionsMany')}
                          </span>
                      </li>
                  ))}

              </ul>
          )}

          <img
              src={searchIcon}
              className='search-icon'
              onClick={handleIconClick}
              alt='Search'
          />

        </div>

        <Link to="/cart" className='cart-link'>
          <img src={cartIcon} className='cart-icon' alt='Cart' />
          {totalKg > 0 && <span className='nav-cart-badge'>{num(totalKg.toFixed(1))}</span>}
        </Link>

        <button className='log-in-button' onClick={() => token ? setAuthToken("") : setShowAuth(true)}>
          {token ? t('logOut') : t('logIn')}
        </button>
      </div>
    </div>
  )
}

export default Navbar