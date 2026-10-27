import { Navigate, Route, Routes } from "react-router-dom";

import "./App.css";

import ProtectedRoute from "./components/ProtectedRoute";

import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import FinancePage from "./pages/FinancePage";
import HotelsPage from "./pages/HotelsPage";
import NewHotelPage from "./pages/NewHotelPage";
import HotelLocationPage from "./pages/HotelLocationPage";
import HotelRoomsPage from "./pages/HotelRoomsPage";
import HotelRatesPage from "./pages/HotelRatesPage";
import HotelReviewPage from "./pages/HotelReviewPage";
import HotelDetailPage from "./pages/HotelDetailPage";

import UsersPage from "./pages/UsersPage";
import ReservationsPage from "./pages/ReservationsPage";
import LaunchDashboardPage from "./pages/LaunchDashboardPage";
import ComplaintsPage from "./pages/ComplaintsPage";
import ReportsPage from "./pages/ReportsPage";
import SettingsPage from "./pages/SettingsPage";
import AccountActivationPage from "./pages/AccountActivationPage";
import "./pages/AdminControl.css";
import "./components/admin/AdminSidebar.css";

function App() {
  return (
    <Routes>
      <Route path="/analitica" element={<ProtectedRoute><LaunchDashboardPage /></ProtectedRoute>} />
      <Route path="/monitoreo" element={<ProtectedRoute><LaunchDashboardPage monitoring /></ProtectedRoute>} />
      <Route path="/reclamos" element={<ProtectedRoute><ComplaintsPage /></ProtectedRoute>} />
      <Route path="/activar-cuenta" element={<AccountActivationPage />} />
      <Route
        path="/usuarios"
        element={
          <ProtectedRoute>
            <UsersPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/reservas"
        element={
          <ProtectedRoute>
            <ReservationsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/reportes"
        element={
          <ProtectedRoute>
            <ReportsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/configuracion"
        element={
          <ProtectedRoute>
            <SettingsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/finanzas"
        element={
          <ProtectedRoute>
            <FinancePage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/hoteles/:hotelId/detalle"
        element={
          <ProtectedRoute>
            <HotelDetailPage />
          </ProtectedRoute>
        }
      />

      <Route path="/" element={<Navigate to="/login" replace />} />

      <Route path="/login" element={<LoginPage />} />

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

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default App;
