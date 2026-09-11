import { useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import './App.css'
import Navbar from './components/navbar/Navbar'
import Add from './pages/Add/Add'
import Orders from './pages/Orders/Orders'
import Users from './pages/Users/Users'
import Vendors from './pages/Vendors/Vendors'
import Notices from './pages/Notices/Notices'
import Settlements from './pages/Settlements/Settlements'
import AdminRequests from './pages/AdminRequests/AdminRequests'
import ManageAdmins from './pages/ManageAdmins/ManageAdmins'
import CashTransactions from './pages/CashTransactions/CashTransactions'
import IssueReports from './pages/IssueReports/IssueReports'
import LoginGate from './pages/LoginGate/LoginGate'
import AuthPopup from './components/AuthPopup/AuthPopup'
import useAdminAuth from './hooks/useAdminAuth'
import { AdminProvider } from './context/AdminContext'

function App() {
  const url=import.meta.env.VITE_API_BASE_URL || "http://localhost:4000"
  const token = useAdminAuth()
  const [showAuth, setShowAuth] = useState(false)

  const logout = () => {
    localStorage.removeItem('adminToken')
    window.dispatchEvent(new Event('admin-auth'))
  }

  // not logged in: no navbar, just the login prompt page
  if (!token) {
    return (
      <div className='app'>
        <LoginGate onLoginClick={() => setShowAuth(true)} />
        {showAuth && <AuthPopup url={url} onClose={() => setShowAuth(false)} />}
        <ToastContainer position='top-center' autoClose={3000} newestOnTop closeOnClick pauseOnFocusLoss={false}/>
      </div>
    )
  }

  return (
    <AdminProvider>
      <div className='app'>
        <Navbar onLogout={logout} />
        <Routes>
          <Route path='/add' element={<Add url={url}/>}/>
          <Route path='/orders' element={<Orders url={url}/>}/>
          <Route path='/users' element={<Users url={url}/>}/>
          <Route path='/vendors' element={<Vendors url={url}/>}/>
          <Route path='/notices' element={<Notices url={url}/>}/>
          <Route path='/settlements' element={<Settlements url={url}/>}/>
          <Route path='/issue-reports' element={<IssueReports url={url}/>}/>
          <Route path='/admin-requests' element={<AdminRequests url={url}/>}/>
          <Route path='/manage-admins' element={<ManageAdmins url={url}/>}/>
          <Route path='/cash-transactions' element={<CashTransactions url={url}/>}/>
        </Routes>
        <ToastContainer position='top-center' autoClose={3000} newestOnTop closeOnClick pauseOnFocusLoss={false}/>
      </div>
    </AdminProvider>
  )
}

export default App