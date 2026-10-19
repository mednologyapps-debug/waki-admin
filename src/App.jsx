import {
  Navigate,
  Route,
  Routes
} from 'react-router-dom'

import './App.css'

import ProtectedRoute from './components/ProtectedRoute'

import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import FinancePage from './pages/FinancePage'
import HotelsPage from './pages/HotelsPage'
import NewHotelPage from './pages/NewHotelPage'
import HotelLocationPage from './pages/HotelLocationPage'
import HotelRoomsPage from './pages/HotelRoomsPage'
import HotelRatesPage from './pages/HotelRatesPage'
import HotelReviewPage from './pages/HotelReviewPage'
import HotelDetailPage from './pages/HotelDetailPage'

function App() {
  return (
    <Routes>
      <Route path="/finanzas" element={<ProtectedRoute><FinancePage /></ProtectedRoute>} />

      <Route
        path="/hoteles/:hotelId/detalle"
        element={
          <ProtectedRoute>
            <HotelDetailPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/"
        element={
          <Navigate
            to="/login"
            replace
          />
        }
      />

      <Route
        path="/login"
        element={
          <LoginPage />
        }
      />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/hoteles"
        element={
          <ProtectedRoute>
            <HotelsPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/hoteles/nuevo"
        element={
          <ProtectedRoute>
            <NewHotelPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/hoteles/nuevo/:brandId/sede"
        element={
          <ProtectedRoute>
            <HotelLocationPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/hoteles/:hotelId/habitaciones"
        element={
          <ProtectedRoute>
            <HotelRoomsPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/hoteles/:hotelId/tarifas"
        element={
          <ProtectedRoute>
            <HotelRatesPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/hoteles/:hotelId/revision"
        element={
          <ProtectedRoute>
            <HotelReviewPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="*"
        element={
          <Navigate
            to="/login"
            replace
          />
        }
      />

    </Routes>
  )
}

export default App