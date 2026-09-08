import './App.css'
import './styles/shared.css'
import { Navigate, Route, Routes } from 'react-router-dom'
import useVendorAuth from './hooks/useVendorAuth'
import Settings from './components/settings/Settings'
import Auth from './pages/Auth/Auth'
import Navbar from './components/navbar/Navbar'
import NewRequests from './pages/NewRequests/NewRequests'
import Accepted from './pages/Accepted/Accepted'
import ItemsNeeded from './pages/ItemsNeeded/ItemsNeeded'
import Notices from './pages/Notices/Notices'

const url = 'http://localhost:4000'

function App() {
  const { token, vendorName, signIn, signOut } = useVendorAuth()

  return (
    <div className='app'>
      {/* floating gear — available on the auth screen and inside the portal */}
      <Settings url={url} />

      {!token ? (
        <Auth url={url} onSignIn={signIn} />
      ) : (
        <>
          <Navbar vendorName={vendorName} onLogout={signOut} />

          <Routes>
            {/* the app starts on new requests */}
            <Route path='/' element={<Navigate to='/new' replace />} />
            <Route path='/new' element={<NewRequests url={url} onLogout={signOut} />} />
            <Route path='/accepted' element={<Accepted url={url} onLogout={signOut} />} />
            <Route path='/items' element={<ItemsNeeded url={url} onLogout={signOut} />} />
            <Route path='/notices' element={<Notices url={url} onLogout={signOut} />} />
          </Routes>
        </>
      )}
    </div>
  )
}

export default App
