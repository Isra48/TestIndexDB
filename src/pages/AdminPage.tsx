import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  clearDatabase,
  parseGiftsCsv,
  parseParticipantsCsv,
  presortWinners,
  saveWinners,
  winnersToCSV,
} from '../utils/indexedDb';
import { Gift, Participant, Winner } from '../types';

const ADMIN_USER = 'Admin';
const ADMIN_PASS = 'Admin';
const SESSION_STORAGE_KEY = 'adminSession';
const SESSION_DURATION_MS = 10 * 60 * 1000; // 10 minutos

type SessionData = {
  user: string;
  timestamp: number;
};
const PAGE_SIZE = 30;

function AdminPage() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [sessionStart, setSessionStart] = useState<number | null>(null);

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [winners, setWinners] = useState<Winner[]>([]);

  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [sessionMessage, setSessionMessage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);

  const canPresort = useMemo(() => participants.length > 0 && gifts.length > 0, [participants, gifts]);

  const persistSession = (data: SessionData) => {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(data));
  };

  const clearSession = () => {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  };

  const resetStateAfterSession = (message = '') => {
    setIsLoggedIn(false);
    setSessionStart(null);
    setUser('');
    setPassword('');
    setParticipants([]);
    setGifts([]);
    setWinners([]);
    setStatus('');
    setError('');
    setSessionMessage(message);
    setIsProcessing(false);
    setIsSaving(false);
  };

  const handleLogin = (event: FormEvent) => {
    event.preventDefault();
    if (user === ADMIN_USER && password === ADMIN_PASS) {
      setIsLoggedIn(true);
      const now = Date.now();
      setSessionStart(now);
      persistSession({ user, timestamp: now });
      setError('');
      setSessionMessage('');
    } else {
      setError('Usuario o contraseña incorrectos. Usa Admin / Admin');
    }
  };

  const handleLogout = (message = '') => {
    clearSession();
    resetStateAfterSession(message);
  };

  useEffect(() => {
    const stored = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!stored) return;

    try {
      const parsed: SessionData = JSON.parse(stored);
      const isExpired = Date.now() - parsed.timestamp >= SESSION_DURATION_MS;
      if (isExpired) {
        handleLogout('Sesión expirada');
        return;
      }

      setIsLoggedIn(true);
      setSessionStart(parsed.timestamp);
      setUser(parsed.user);
      setSessionMessage('');
    } catch (err) {
      handleLogout();
    }
  }, []);

  useEffect(() => {
    if (!isLoggedIn || !sessionStart) return;

    const interval = setInterval(() => {
      const isExpired = Date.now() - sessionStart >= SESSION_DURATION_MS;
      if (isExpired) {
        handleLogout('Sesión expirada');
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isLoggedIn, sessionStart]);

  const readFile = (file: File, parser: (text: string) => Participant[] | Gift[]) => {
    return new Promise<Participant[] | Gift[]>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const text = reader.result?.toString() ?? '';
        resolve(parser(text));
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  };

  const handleParticipantsUpload = async (fileList: FileList | null) => {
    if (!fileList?.length) return;
    setStatus('Cargando participantes...');
    setError('');
    try {
      const parsed = (await readFile(fileList[0], parseParticipantsCsv)) as Participant[];
      setParticipants(parsed);
      setStatus(`Participantes cargados: ${parsed.length}`);
    } catch (err) {
      setError('No se pudieron leer los participantes.');
    }
  };

  const handleGiftsUpload = async (fileList: FileList | null) => {
    if (!fileList?.length) return;
    setStatus('Cargando premios...');
    setError('');
    try {
      const parsed = (await readFile(fileList[0], parseGiftsCsv)) as Gift[];
      setGifts(parsed);
      setStatus(`Premios cargados: ${parsed.length}`);
    } catch (err) {
      setError('No se pudieron leer los premios.');
    }
  };

  const downloadCsv = (csvContent: string) => {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'ganadores.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handlePresort = async () => {
    if (!canPresort) {
      setError('Carga participantes y premios para continuar.');
      return;
    }
    setIsProcessing(true);
    setError('');
    setStatus('Generando ganadores...');
    try {
      const generated = presortWinners(participants, gifts);
      setWinners(generated);
      setCurrentPage(1);
      setStatus('Ganadores listos. Guarda para exportar y persistir.');
    } catch (err) {
      setError('Ocurrió un problema al generar los ganadores.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSave = async () => {
    if (winners.length === 0) {
      setError('No hay ganadores para guardar.');
      return;
    }
    setIsSaving(true);
    setError('');
    setStatus('Guardando en IndexedDB y exportando CSV...');
    try {
      await saveWinners(winners);
      downloadCsv(winnersToCSV(winners));
      setStatus('Ganadores guardados en IndexedDB y exportados como CSV.');
    } catch (err) {
      setError('No se pudieron guardar los ganadores.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    setStatus('Limpiando datos previos...');
    setError('');
    await clearDatabase();
    setParticipants([]);
    setGifts([]);
    setWinners([]);
    setCurrentPage(1);
    setSearchTerm('');
    setSelectedCategory('all');
    setStatus('Base de datos limpia. Puedes cargar nuevas listas.');
  };

  const categories = useMemo(() => {
    const set = new Set<string>();
    winners.forEach((winner) => {
      if (winner.gift.category) {
        set.add(winner.gift.category);
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [winners]);

  const filteredWinners = useMemo(() => {
    const normalizedSearch = searchTerm.toLowerCase();

    const filtered = winners
      .filter((winner) =>
        selectedCategory === 'all' ? true : winner.gift.category === selectedCategory
      )
      .filter((winner) =>
        normalizedSearch
          ? winner.participant.name.toLowerCase().includes(normalizedSearch)
          : true
      )
      .sort((a, b) => {
        const comparison = a.participant.name.localeCompare(b.participant.name);
        return sortOrder === 'asc' ? comparison : -comparison;
      });

    return filtered;
  }, [winners, searchTerm, selectedCategory, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(filteredWinners.length / PAGE_SIZE));
  const paginatedWinners = filteredWinners.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  const handleCategoryChange = (value: string) => {
    setSelectedCategory(value);
    setCurrentPage(1);
  };

  const handleSortChange = (value: 'asc' | 'desc') => {
    setSortOrder(value);
    setCurrentPage(1);
  };

  const goToPreviousPage = () => {
    setCurrentPage((prev) => Math.max(1, prev - 1));
  };

  const goToNextPage = () => {
    setCurrentPage((prev) => Math.min(totalPages, prev + 1));
  };

  if (!isLoggedIn) {
    return (
      <div className="admin-page">
        <section className="card login-card">
          <h2>Login administrativo</h2>
          <p>Usa Admin / Admin para acceder.</p>
          <form onSubmit={handleLogin} className="form-grid">
            <label className="form-field">
              <span>Usuario</span>
              <input value={user} onChange={(e) => setUser(e.target.value)} placeholder="Admin" />
            </label>
            <label className="form-field">
              <span>Contraseña</span>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Admin" />
            </label>
            <button className="primary-button" type="submit">
              Entrar
            </button>
          </form>
          {sessionMessage && <p className="alert">{sessionMessage}</p>}
          {error && <p className="alert">{error}</p>}
        </section>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <section className="card upload-card">
        <div className="card-header">
          <div>
            <h2>Administración de la rifa</h2>
            <p>Sube participantes y premios en CSV para generar el presorteo.</p>
          </div>
          <div className="actions-inline">
            <div className="session-indicator" role="status">
              {user ? `Sesión activa: ${user}` : 'Sesión activa'}
            </div>
            <button className="ghost-button" onClick={() => handleLogout()}>
              Cerrar sesión
            </button>
            <button className="ghost-button" onClick={handleReset}>
              Resetear base local
            </button>
          </div>
        </div>

        <div className="upload-grid">
          <div className="dropzone">
            <h3>Participantes</h3>
            <p>Archivo CSV con los nombres en la primera columna.</p>
            <input type="file" accept=".csv,text/csv" onChange={(e) => handleParticipantsUpload(e.target.files)} />
            <p className="hint">Cargados: {participants.length}</p>
          </div>
          <div className="dropzone">
            <h3>Premios</h3>
            <p>CSV con columnas: categoría, premio.</p>
            <input type="file" accept=".csv,text/csv" onChange={(e) => handleGiftsUpload(e.target.files)} />
            <p className="hint">Cargados: {gifts.length}</p>
          </div>
        </div>

        <div className="action-row">
          <button className="primary-button" onClick={handlePresort} disabled={!canPresort || isProcessing}>
            {isProcessing ? 'Procesando...' : 'Generar ganadores'}
          </button>
          <button className="secondary-button" onClick={handleSave} disabled={winners.length === 0 || isSaving}>
            {isSaving ? 'Guardando...' : 'Exportar CSV y guardar'}
          </button>
        </div>

        {status && <p className="hint">{status}</p>}
        {error && <p className="alert">{error}</p>}
        {isProcessing && <div className="loader" role="status" aria-label="procesando"></div>}

        <div className="winners-preview">
          <div className="results-header">
            <h3>Ganadores generados</h3>
            <span className="badge">{filteredWinners.length}</span>
          </div>
          <div className="filters-row">
            <label className="filter-control">
              <span className="hint">Buscar por nombre</span>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Nombre del participante"
              />
            </label>
            <label className="filter-control">
              <span className="hint">Categoría</span>
              <select
                value={selectedCategory}
                onChange={(e) => handleCategoryChange(e.target.value)}
              >
                <option value="all">Todas</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-control">
              <span className="hint">Orden alfabético</span>
              <select
                value={sortOrder}
                onChange={(e) => handleSortChange(e.target.value as 'asc' | 'desc')}
              >
                <option value="asc">A → Z</option>
                <option value="desc">Z → A</option>
              </select>
            </label>
          </div>

          <div className="table-wrapper">
            {paginatedWinners.length === 0 && !isProcessing && (
              <p className="hint">Aún no se han generado ganadores.</p>
            )}
            {paginatedWinners.length > 0 && (
              <div className="results-list compact">
                <table className="winners-table">
                  <thead>
                    <tr>
                      <th>Participante</th>
                      <th>Número de empleado</th>
                      <th>Email</th>
                      <th>Premio</th>
                      <th>Categoría</th>
                      <th>Costo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedWinners.map((winner) => (
                      <tr key={winner.id}>
                        <td className="winner-name">{winner.participant.name}</td>
                        <td>{winner.participant.employeeNumber || '—'}</td>
                        <td>{winner.participant.email || '—'}</td>
                        <td className="winner-gift">{winner.gift.prize}</td>
                        <td>{winner.gift.category}</td>
                        <td>{winner.gift.cost || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {isProcessing && (
              <div className="table-overlay" role="status" aria-label="procesando sorteo">
                <div className="loader" />
                <span className="hint">Generando ganadores...</span>
              </div>
            )}
          </div>

          {paginatedWinners.length > 0 && (
            <div className="pagination-row">
              <button
                className="secondary-button"
                onClick={goToPreviousPage}
                disabled={currentPage === 1}
              >
                Anterior
              </button>
              <span className="hint">
                Página {currentPage} de {totalPages} ({filteredWinners.length} resultados)
              </span>
              <button
                className="secondary-button"
                onClick={goToNextPage}
                disabled={currentPage === totalPages || filteredWinners.length === 0}
              >
                Siguiente
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export default AdminPage;
