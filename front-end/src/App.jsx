import './App.css'
import Navbar from './components/Navbar/Navbar'
import Home from './pages/home/Home.jsx'
import {Routes,Route, Navigate} from 'react-router-dom'
import Cart from './pages/cart/Cart.jsx'
import AuthPopup from './components/AuthPopup/AuthPopup'
import Settings from './components/Settings/Settings'
import { useContext } from 'react'
import { Context } from './context/Context'
import GetApp from './pages/get-app/GetApp.jsx'
import ContactUs from './pages/contact-us/ContactUs.jsx'
import Footer from './components/Footer/Footer'

function App() {
  const { showAuth, toastMsg } = useContext(Context);

  return (
    <div className='app'>
      <Navbar/>
      <Settings/>
      <Routes>
        <Route path="/" element={<Home/>}/>
        <Route path="/home" element={<Navigate to="/" replace/>}/>
        <Route path="/get-app" element={<GetApp/>}/>
        <Route path="/contact-us" element={<ContactUs/>}/>
        <Route path="/cart" element={<Cart/>}/>
      </Routes>
      <Footer />
      {showAuth && <AuthPopup/>}
      {toastMsg && <div className='app-toast'>{toastMsg}</div>}
    </div>
  )
}

export default App
