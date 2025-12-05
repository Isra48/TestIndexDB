import { FormEvent, useMemo, useState } from 'react';
import {
  clearDatabase,
  expandGifts,
  parseGiftsCsv,
  parseParticipantsCsv,
  presortWinners,
  saveWinners,
  winnersToCSV,
} from '../utils/indexedDb';
import { Participant, RawGift, Winner } from '../types';

const ADMIN_USER = 'Admin';
const ADMIN_PASS = 'Admin';

function AdminPage() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [gifts, setGifts] = useState<RawGift[]>([]);
  const [winners, setWinners] = useState<Winner[]>([]);

  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const canPresort = useMemo(() => participants.length > 0 && gifts.length > 0, [participants, gifts]);

  const handleLogin = (event: FormEvent) => {
    event.preventDefault();
    if (user === ADMIN_USER && password === ADMIN_PASS) {
      setIsLoggedIn(true);
      setError('');
    } else {
      setError('Usuario o contraseña incorrectos. Usa Admin / Admin');
    }
  };

  const readFile = (file: File, parser: (text: string) => Participant[] | RawGift[]) => {
    return new Promise<Participant[] | RawGift[]>((resolve, reject) => {
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
      const parsed = (await readFile(fileList[0], parseGiftsCsv)) as RawGift[];
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
      const expanded = expandGifts(gifts);
      const generated = presortWinners(participants, expanded);
      setWinners(generated);
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
    setStatus('Base de datos limpia. Puedes cargar nuevas listas.');
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
            <p>CSV con columnas: categoría, producto, uds.</p>
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
            <span className="badge">{winners.length}</span>
          </div>
          <div className="results-list compact">
            {winners.length === 0 && <p className="hint">Aún no se han generado ganadores.</p>}
            {winners.map((winner) => (
              <div className="winner-card" key={winner.id}>
                <div className="winner-info">
                  <span className="winner-name">{winner.participant.name}</span>
                  <span className="winner-gift">{winner.gift.prize}</span>
                </div>
                <div className="winner-category">{winner.gift.category}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

export default AdminPage;
