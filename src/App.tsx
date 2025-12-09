import { Route, Routes } from 'react-router-dom';
import AdminPage from './pages/AdminPage';
import HomePage from './pages/HomePage';

function App() {
  return (
    <div className="app-shell">
      <main className="app-main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/Admin" element={<AdminPage />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
