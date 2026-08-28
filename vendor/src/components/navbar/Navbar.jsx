import { NavLink, useLocation } from 'react-router-dom';
import { useUi } from '../../context/UiContext';
import './Navbar.css';

const LINKS = [
  { to: '/new', labelKey: 'navNew' },
  { to: '/accepted', labelKey: 'navAccepted' },
  { to: '/items', labelKey: 'navItems' },
];

// thematic accent follows the selected page: green / blue / yellow
const THEME_BY_PATH = {
  '/new': 'theme-green',
  '/accepted': 'theme-blue',
  '/items': 'theme-yellow',
};

const Navbar = ({ vendorName, onLogout }) => {
  const { t } = useUi();
  const theme = THEME_BY_PATH[useLocation().pathname] ?? 'theme-green';

  return (
    <nav className={`vendor-navbar ${theme}`}>
      <div className='brand'>
        Dokko <span>Vendor</span>
        <small>{vendorName}</small>
      </div>

      <div className='links'>
        {LINKS.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) => (isActive ? 'active' : '')}
          >
            {t(link.labelKey)}
          </NavLink>
        ))}
      </div>

      <div className='actions'>
        <button className='util-btn solid' onClick={onLogout}>{t('logout')}</button>
      </div>
    </nav>
  );
};

export default Navbar;
