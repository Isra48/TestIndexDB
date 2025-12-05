import { Link, Route, Routes } from 'react-router-dom';
import AdminPage from './pages/AdminPage';
import HomePage from './pages/HomePage';

function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="logo-text">Rifa corporativa</div>
        <nav className="nav-bar">
          <Link to="/">Inicio</Link>
          <Link to="/admin">Administración</Link>
        </nav>
      </header>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
