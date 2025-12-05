import { useEffect, useMemo, useState } from 'react';
import { Gift, Winner } from '../types';
import { readLastSavedAt, readWinners } from '../utils/indexedDb';

function HomePage() {
  const [winners, setWinners] = useState<Winner[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedPrize, setSelectedPrize] = useState('');
  const [filterApplied, setFilterApplied] = useState({ category: '', prize: '' });
  const [loading, setLoading] = useState(true);
  const [lastSavedAt, setLastSavedAt] = useState<string | undefined>();

  useEffect(() => {
    const fetchData = async () => {
      const [storedWinners, storedDate] = await Promise.all([readWinners(), readLastSavedAt()]);
      setWinners(storedWinners);
      setLastSavedAt(storedDate);
      setLoading(false);
    };
    fetchData();
  }, []);

  const categories = useMemo(() => Array.from(new Set(winners.map((winner) => winner.gift.category))), [winners]);

  const prizesForCategory = useMemo(() => {
    if (!selectedCategory) return [] as Gift[];
    return winners
      .filter((winner) => winner.gift.category === selectedCategory)
      .map((winner) => winner.gift)
      .filter((gift, index, arr) => arr.findIndex((item) => item.prize === gift.prize) === index);
  }, [selectedCategory, winners]);

  const filteredWinners = useMemo(() => {
    return winners.filter((winner) => {
      const matchCategory = filterApplied.category ? winner.gift.category === filterApplied.category : true;
      const matchPrize = filterApplied.prize ? winner.gift.prize === filterApplied.prize : true;
      return matchCategory && matchPrize;
    });
  }, [filterApplied, winners]);

  const applyFilters = () => {
    setFilterApplied({ category: selectedCategory, prize: selectedPrize });
  };

  return (
    <div className="home-page">
      <section className="hero-card">
        <div className="filter-panel">
          <h2 className="panel-title">Filtra y encuentra los ganadores</h2>
          <label className="form-field">
            <span>Categoría</span>
            <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
              <option value="">Todas</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>

          <label className="form-field">
            <span>Premio</span>
            <select value={selectedPrize} onChange={(e) => setSelectedPrize(e.target.value)} disabled={!selectedCategory}>
              <option value="">Todos</option>
              {prizesForCategory.map((gift) => (
                <option key={gift.id} value={gift.prize}>
                  {gift.prize}
                </option>
              ))}
            </select>
          </label>

          <button className="primary-button" onClick={applyFilters} disabled={loading || winners.length === 0}>
            Buscar ganadores
          </button>
          {lastSavedAt && <p className="hint">Datos actualizados: {new Date(lastSavedAt).toLocaleString()}</p>}
          {loading && <p className="hint">Cargando datos guardados...</p>}
          {!loading && winners.length === 0 && <p className="alert">No hay ganadores guardados. Cárgalos desde la administración.</p>}
        </div>

        <div className="results-panel">
          <div className="results-header">
            <h3>Ganadores</h3>
            <span className="badge">{filteredWinners.length}</span>
          </div>
          <div className="results-list">
            {filteredWinners.length === 0 ? (
              <p className="hint">No hay resultados para los filtros seleccionados.</p>
            ) : (
              filteredWinners.map((winner) => (
                <div className="winner-card" key={winner.id}>
                  <div className="winner-info">
                    <span className="winner-name">{winner.participant.name}</span>
                    <span className="winner-gift">{winner.gift.prize}</span>
                  </div>
                  <div className="winner-category">{winner.gift.category}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

export default HomePage;
