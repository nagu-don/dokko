import React, { useContext } from 'react'
import './Footer.css'
import logo from '../../assets/logo.png'
import { Link } from 'react-router-dom'
import { Context } from '../../context/Context'

const Footer = () => {
  const { t } = useContext(Context)

  return (
    <footer className='footer'>
      <div className='footer-top'>
        <Link to='/' className='footer-logo-link'>
          <img src={logo} className='footer-logo' alt='Logo' />
        </Link>

        <p className='footer-tagline'>{t('footerTagline')}</p>

        <nav className='footer-links'>
          <Link to='/'>{t('navHome')}</Link>
          <Link to='/get-app'>{t('navGetApp')}</Link>
          <Link to='/contact-us'>{t('navContactUs')}</Link>
        </nav>
      </div>

      <div className='footer-bottom'>
        {t('footerVendorPrompt')}{' '}
        {/* real anchor, not a router Link — /vendor is a separate SPA build
            served at that path and must trigger a full page navigation */}
        <a href='/vendor' className='footer-vendor-link'>
          {t('footerVendorLink')}
        </a>
      </div>
    </footer>
  )
}

export default Footer