import { Outlet } from 'react-router-dom'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'

export default function AuthLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-surface-low">
      <Navbar />
      <main className="flex-1 pt-16">
        <div className="max-w-[1200px] mx-auto px-6 py-8 md:py-10 animate-fade-in">
          <Outlet />
        </div>
      </main>
      <Footer />
    </div>
  )
}
