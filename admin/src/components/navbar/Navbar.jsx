import React from 'react'
import './Navbar.css'
import { NavLink } from 'react-router-dom'
import { useAdminContext } from '../../context/AdminContext'

const Navbar = ({ onLogout }) => {
  const { lang, setLang, t } = useAdminContext()

  return (
    <div className='navbar'>
      <div className='navbar-links'>
        <NavLink to='/add' className={({isActive})=>(isActive ? "active" : "")}>
          <p>{t('navItems')}</p>
        </NavLink>
        <NavLink to='/orders' className={({isActive})=>(isActive ? "active" : "")}>
          <p>{t('navOrders')}</p>
        </NavLink>
        <NavLink to='/users' className={({isActive})=>(isActive ? "active" : "")}>
          <p>{t('navUsers')}</p>
        </NavLink>
        <NavLink to='/vendors' className={({isActive})=>(isActive ? "active" : "")}>
          <p>{t('navVendors')}</p>
        </NavLink>
        <NavLink to='/notices' className={({isActive})=>(isActive ? "active" : "")}>
          <p>{t('navNotices')}</p>
        </NavLink>
        <NavLink to='/settlements' className={({isActive})=>(isActive ? "active" : "")}>
          <p>{t('navSettlements')}</p>
        </NavLink>
        <NavLink to='/admin-requests' className={({isActive})=>(isActive ? "active" : "")}>
          <p>{t('navAdminRequests')}</p>
        </NavLink>
        <NavLink to='/manage-admins' className={({isActive})=>(isActive ? "active" : "")}>
          <p>{t('navManageAdmins')}</p>
        </NavLink>
        <NavLink to='/cash-transactions' className={({isActive})=>(isActive ? "active" : "")}>
          <p>{t('navCashTransactions')}</p>
        </NavLink>
      </div>

      <div className='navbar-right'>
        <button
          className='navbar-lang-toggle'
          onClick={() => setLang(lang === 'en' ? 'np' : 'en')}
          title={t('languageLabel')}
        >
          {lang === 'en' ? 'नेप' : 'EN'}
        </button>
        <button className='navbar-logout' onClick={onLogout}>{t('logOut')}</button>
      </div>
    </div>
  )
}

export default Navbar
