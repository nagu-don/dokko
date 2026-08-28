import React from 'react'
import './LoginGate.css'
import editIconImg from '../../assets/edit-icon.png'

const LoginGate = ({ onLoginClick }) => {
  return (
    <div className='login-gate'>
      <div className='login-gate-card'>
        <div className='login-gate-icon'>
          <img src={editIconImg} alt='' />
        </div>
        <h1>Admin access only</h1>
        <p>Please log in with your admin account to manage items, track orders and view users.</p>
        <button onClick={onLoginClick}>Log In</button>
      </div>
    </div>
  )
}

export default LoginGate
