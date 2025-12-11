import { Link, Route, Routes } from 'react-router-dom';
import ScreenSizeOverlay from './ScreenSizeOverlay';
import AdminPage from './pages/AdminPage';
import HomePage from './pages/HomePage';

function AdminLayout() {
  return (
    <>
      <header className="app-header">
        <div className="logo-text">Tombola Digital 2025</div>
        <nav className="nav-bar">
          <Link to="/">Inicio</Link>
          <Link to="/Admin">Administración</Link>
        </nav>
      </header>
      <main className="app-main admin-main-background">
        <AdminPage />
      </main>
    </>
  );
}

function App() {
  return (
    <div className="app-shell">
      {/* Overlay global montado al nivel raíz para cubrir toda la app en pantallas pequeñas. */}
      <ScreenSizeOverlay />
      <Routes>
        <Route
          path="/"
          element={
            <main className="app-main">
              <HomePage />
            </main>
          }
        />
        <Route path="/Admin" element={<AdminLayout />} />
      </Routes>
    </div>
  );
}

export default App;
