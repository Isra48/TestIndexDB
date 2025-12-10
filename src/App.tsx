import { Link, Route, Routes } from 'react-router-dom';
import AdminPage from './pages/AdminPage';
import HomePage from './pages/HomePage';

function AdminLayout() {
  return (
    <>
      <header className="app-header">
        <div className="logo-text">Rifa corporativa</div>
        <nav className="nav-bar">
          <Link to="/">Inicio</Link>
          <Link to="/Admin">Administración</Link>
        </nav>
      </header>
      {/* Fondo fijo exclusivo del Admin para evitar que el background crezca con la tabla */}
      <main className="app-main admin-main-background">
        <AdminPage />
      </main>
    </>
  );
}

function App() {
  return (
    <div className="app-shell">
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
