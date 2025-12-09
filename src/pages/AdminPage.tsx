import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  clearDatabase,
  ParsedGiftsResult,
  parseGiftsCsv,
  parseParticipantsCsv,
  presortWinners,
  readWinners,
  saveWinners,
  winnersToCSV,
} from '../utils/indexedDb';
import { Gift, Participant, Winner } from '../types';

const ADMIN_USER = 'Admin';
const ADMIN_PASS = 'Admin';
const SESSION_STORAGE_KEY = 'adminSession';
const SESSION_DURATION_MS = 10 * 60 * 1000; // 10 minutos
const PAGE_SIZE = 30;
const GIFTS_TEMPLATE_HEADER = 'categoria,producto,uds,costo';

// Formateador de costos para la tabla del Admin.
const formatCurrency = (value?: number | string) => {
  if (value === undefined || value === null || value === '') return '—';

  const numericValue =
    typeof value === 'number'
      ? value
      : Number(value.toString().replace(/[^0-9.-]+/g, ''));

  if (!Number.isFinite(numericValue)) return '—';

  return numericValue.toLocaleString('es-MX', {
    style: 'currency',
    currency: 'MXN',
  });
};

type SessionData = {
  user: string;
  timestamp: number;
};

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
  const [warning, setWarning] = useState('');
  const [sessionMessage, setSessionMessage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);

  const canPresort = useMemo(() => participants.length > 0 && gifts.length > 0, [participants, gifts]);

  // ------------------------------
  //  SESSION PERSISTENCE HELPERS
  // ------------------------------

  const persistSession = (data: SessionData) => {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(data));
  };

  const clearSession = () => {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  };

  // Limpieza total (logout manual)
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

  // Logout configurable (manual o expiración)
  const handleLogout = (
    message = '',
    options: { preserveData?: boolean } = { preserveData: false }
  ) => {
    clearSession();

    if (!options.preserveData) {
      // logout manual
      resetStateAfterSession(message);
      return;
    }

    // expiración → NO borrar data previa
    setIsLoggedIn(false);
    setSessionStart(null);
    setUser('');
    setPassword('');
    setSessionMessage(message);
  };

  // ------------------------------
  // LOGIN HANDLING
  // ------------------------------

  const handleLogin = (event: FormEvent) => {
    event.preventDefault();
    if (user === ADMIN_USER && password === ADMIN_PASS) {
      const now = Date.now();
      setIsLoggedIn(true);
      setSessionStart(now);
      persistSession({ user, timestamp: now });
      setError('');
      setSessionMessage('');
    } else {
      setError('Usuario o contraseña incorrectos. Usa Admin / Admin');
    }
  };

  // ------------------------------
  // RESTAURAR SESIÓN DESDE LOCALSTORAGE
  // ------------------------------

  useEffect(() => {
    const stored = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!stored) return;

    try {
      const parsed: SessionData = JSON.parse(stored);
      const isExpired = Date.now() - parsed.timestamp >= SESSION_DURATION_MS;

      if (isExpired) {
        handleLogout('Sesión expirada', { preserveData: true });
        return;
      }

      // Restaurar sesión activa SIN llenar inputs
      const now = Date.now();
      setIsLoggedIn(true);
      setSessionStart(now);

      // renovar timestamp
      persistSession({ user: parsed.user, timestamp: now });

      setSessionMessage('');

    } catch (err) {
      handleLogout();
    }
  }, []);

  // ------------------------------
  // EXPIRACIÓN AUTOMÁTICA EN VIVO
  // ------------------------------

  useEffect(() => {
    if (!isLoggedIn || !sessionStart) return;

    const interval = setInterval(() => {
      const isExpired = Date.now() - sessionStart >= SESSION_DURATION_MS;
      if (isExpired) {
        handleLogout('Sesión expirada', { preserveData: true });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isLoggedIn, sessionStart]);

  // Recupera la última tabla de ganadores guardada en IndexedDB al entrar al Admin.
  useEffect(() => {
    if (!isLoggedIn) return;

    const hydrateWinnersFromIndexedDb = async () => {
      try {
        const storedWinners = await readWinners();
        if (storedWinners.length > 0) {
          setWinners(storedWinners);
          setCurrentPage(1);
          setStatus('Ganadores restaurados desde IndexedDB.');
        }
      } catch {
        setError('No se pudieron recuperar los ganadores guardados.');
      }
    };

    hydrateWinnersFromIndexedDb();
  }, [isLoggedIn]);

  // Cada actualización de la tabla de ganadores se persiste automáticamente en IndexedDB.
  useEffect(() => {
    if (!isLoggedIn || winners.length === 0) return;

    const persistWinnersInIndexedDb = async () => {
      try {
        await saveWinners(winners);
      } catch {
        setError('No se pudieron persistir los ganadores en IndexedDB.');
      }
    };

    persistWinnersInIndexedDb();
  }, [isLoggedIn, winners]);

  // ------------------------------
  // FILE PARSING / LOADERS
  // ------------------------------

  const readFile = <T,>(file: File, parser: (text: string) => T) => {
    return new Promise<T>((resolve, reject) => {
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
    setWarning('');
    try {
      const parsed = (await readFile(fileList[0], parseParticipantsCsv)) as Participant[];
      setParticipants(parsed);
      setStatus(`Participantes cargados: ${parsed.length}`);
    } catch {
      setError('No se pudieron leer los participantes.');
    }
  };

  // Validaciones reforzadas del CSV de premios antes de hidratar la UI.
  const handleGiftsUpload = async (fileList: FileList | null) => {
    if (!fileList?.length) return;
    setStatus('Cargando premios...');
    setError('');
    setWarning('');
    try {
      const parsed = (await readFile(fileList[0], parseGiftsCsv)) as ParsedGiftsResult;

      if (parsed.gifts.length === 0) {
        setError('CSV inválido: no tiene premios válidos.');
        setStatus('');
        return;
      }

      setGifts(parsed.gifts);

      if (parsed.discardedRows > 0) {
        setWarning(`Se descartaron ${parsed.discardedRows} filas por campos vacíos.`);
      }

      setStatus(`Premios cargados: ${parsed.gifts.length}`);
    } catch (uploadError) {
      const message =
        uploadError instanceof Error && uploadError.message
          ? uploadError.message
          : 'No se pudo procesar el archivo de premios.';
      setError(message);
      setStatus('');
    }
  };

  // ------------------------------
  // EXPORT
  // ------------------------------

  // Generación del template oficial de premios (solo encabezados).
  const downloadGiftsTemplate = () => {
    const blob = new Blob([`${GIFTS_TEMPLATE_HEADER}\n`], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'template_sorteo.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  // Exportación del CSV de ganadores generado en el presorteo.
  const downloadCsv = (csvContent: string) => {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'ganadores.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  // ------------------------------
  // PRESORTEO
  // ------------------------------

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
    } catch {
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
    } catch {
      setError('No se pudieron guardar los ganadores.');
    } finally {
      setIsSaving(false);
    }
  };

  // ------------------------------
  // RESET LOCAL DB
  // ------------------------------

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

  // ------------------------------
  // FILTERS
  // ------------------------------

  const categories = useMemo(() => {
    const set = new Set<string>();
    winners.forEach((winner) => {
      if (winner.gift.category) set.add(winner.gift.category);
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

  // ------------------------------
  // LOGIN VIEW
  // ------------------------------

  return (
    <div className="admin-page">
      <section className="card upload-card">

        {/* HEADER */}
        <div className="card-header">
          <div>
            <h2>Administración de la rifa</h2>
            <p>Sube participantes y premios en CSV para generar el presorteo.</p>
          </div>

          <div className="actions-inline">
            <div className="session-indicator" role="status">
              {user ? `Sesión activa: ${user}` : 'Sesión activa'}
            </div>

            {/* Botón para descargar el template CSV de premios. */}
            <button className="secondary-button" onClick={downloadGiftsTemplate}>
              Descargar template CSV
            </button>

            <button className="ghost-button" onClick={() => handleLogout()}>
              Cerrar sesión
            </button>

            <button className="ghost-button" onClick={handleReset}>
              Resetear base local
            </button>
          </div>
        </div>

        {/* UPLOADS */}
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

            {sessionMessage && <p className="alert">{sessionMessage}</p>}
            {error && <p className="alert">{error}</p>}
          </section>
        </div>
      )}

          {isLoggedIn && (
            <div className="admin-page">
              <section className="card upload-card">

              {/* HEADER */}
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

        {status && <p className="hint">{status}</p>}
        {warning && <p className="alert">{warning}</p>}
        {error && <p className="alert">{error}</p>}
        {isProcessing && <div className="loader" role="status" aria-label="procesando"></div>}

        {/* WINNERS TABLE */}
        <div className="winners-preview">

          <div className="results-header">
            <h3>Ganadores generados</h3>
            <span className="badge">{filteredWinners.length}</span>
          </div>

          {/* FILTERS */}
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
                  <option key={category} value={category}>{category}</option>
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

              {/* ACTIONS */}
              <div className="action-row">
                <button
                  className="primary-button"
                  onClick={handlePresort}
                  disabled={!canPresort || isProcessing}
                >
                  {isProcessing ? 'Procesando...' : 'Generar ganadores'}
                </button>

                <button
                  className="secondary-button"
                  onClick={handleSave}
                  disabled={winners.length === 0 || isSaving}
                >
                  {isSaving ? 'Guardando...' : 'Exportar CSV y guardar'}
                </button>
              </div>

              {status && <p className="hint">{status}</p>}
              {error && <p className="alert">{error}</p>}
              {isProcessing && <div className="loader" role="status" aria-label="procesando"></div>}

              {/* WINNERS TABLE */}
              <div className="winners-preview">

                <div className="results-header">
                  <h3>Ganadores generados</h3>
                  <span className="badge">{filteredWinners.length}</span>
                </div>

                {/* FILTERS */}
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
                        <option key={category} value={category}>{category}</option>
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

                {/* TABLE */}
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
                            <th className="winner-cost">Costo</th>
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
                              <td className="winner-cost">{formatCurrency(winner.gift.cost)}</td>
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

                {/* PAGINATION */}
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
        )}
      </div>
    );
  }

export default AdminPage;
