import { useEffect, useMemo, useRef, useState } from 'react';
import { Gift, Winner } from '../types';
import { readLastSavedAt, readWinners } from '../utils/indexedDb';

function HomePage() {
  const [winners, setWinners] = useState<Winner[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedPrize, setSelectedPrize] = useState('');
  const [filterApplied, setFilterApplied] = useState({ category: '', prize: '' });
  const [loading, setLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | undefined>();
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const backgroundAudioRef = useRef<HTMLAudioElement | null>(null);
  const winnerAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      const [storedWinners, storedDate] = await Promise.all([readWinners(), readLastSavedAt()]);
      setWinners(storedWinners);
      setLastSavedAt(storedDate);
      setLoading(false);
    };
    fetchData();
  }, []);

  useEffect(() => {
    const backgroundAudio = new Audio('/audio/background.mp3');
    backgroundAudio.loop = true;
    backgroundAudio.preload = 'auto';
    backgroundAudioRef.current = backgroundAudio;

    const winnerAudio = new Audio('/audio/winner.mp3');
    winnerAudio.preload = 'auto';
    winnerAudioRef.current = winnerAudio;

    const tryPlayOnInteraction = async () => {
      if (backgroundAudioRef.current && !isMusicPlaying) {
        try {
          await backgroundAudioRef.current.play();
          setIsMusicPlaying(true);
        } catch (error) {
          setIsMusicPlaying(false);
        }
      }
    };

    document.addEventListener('pointerdown', tryPlayOnInteraction, { once: true });
    document.addEventListener('keydown', tryPlayOnInteraction, { once: true });

    return () => {
      backgroundAudioRef.current?.pause();
      backgroundAudioRef.current = null;
      winnerAudioRef.current = null;
      document.removeEventListener('pointerdown', tryPlayOnInteraction);
      document.removeEventListener('keydown', tryPlayOnInteraction);
    };
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
    if (!hasSearched) return [] as Winner[];

    return winners.filter((winner) => {
      const matchCategory = filterApplied.category ? winner.gift.category === filterApplied.category : true;
      const matchPrize = filterApplied.prize ? winner.gift.prize === filterApplied.prize : true;
      return matchCategory && matchPrize;
    });
  }, [filterApplied, hasSearched, winners]);

  const applyFilters = () => {
    if (!selectedCategory || !selectedPrize) return;

    setIsSearching(true);
    setHasSearched(false);

    if (winnerAudioRef.current) {
      winnerAudioRef.current.currentTime = 0;
      winnerAudioRef.current.play().catch(() => undefined);
    }

    const delay = Math.random() * (2500 - 1000) + 1000;

    setTimeout(() => {
      setFilterApplied({ category: selectedCategory, prize: selectedPrize });
      setIsSearching(false);
      setHasSearched(true);
    }, delay);
  };

  const handleCategoryChange = (value: string) => {
    setSelectedCategory(value);
    setSelectedPrize('');
  };

  const toggleMusic = async () => {
    const backgroundAudio = backgroundAudioRef.current;
    if (!backgroundAudio) return;

    if (isMusicPlaying) {
      backgroundAudio.pause();
      setIsMusicPlaying(false);
    } else {
      try {
        await backgroundAudio.play();
        setIsMusicPlaying(true);
      } catch (error) {
        setIsMusicPlaying(false);
      }
    }
  };

  return (
    <div className="home-page">
      <section className="hero-card">
        <div className="filter-panel">
            <img
            src="/title.png"
            alt="Esfera"
            className="esfera-image"
          />
          {/*<h2 className="panel-title">Filtra y encuentra los ganadores</h2> */}
          <label className="form-field">
            <span>Categoría</span>
            <select value={selectedCategory} onChange={(e) => handleCategoryChange(e.target.value)}>
              <option value="" disabled>
                Selecciona una categoría
              </option>
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
              <option value="" disabled>
                Selecciona un premio
              </option>
              {prizesForCategory.map((gift) => (
                <option key={gift.id} value={gift.prize}>
                  {gift.prize}
                </option>
              ))}
            </select>
          </label>

          <button
            className="primary-button"
            onClick={applyFilters}
            disabled={loading || winners.length === 0 || !selectedCategory || !selectedPrize || isSearching}
          >
            Sortear
          </button>
          {/*  {lastSavedAt && <p className="hint">Datos actualizados: {new Date(lastSavedAt).toLocaleString()}</p>} */}
          {/*} {loading && <p className="hint">Cargando datos guardados...</p>} */}
          {/* {!loading && winners.length === 0 && <p className="alert">No hay ganadores guardados. Cárgalos desde la administración.</p>} */}

          {/*  <img
            src="/esfera.png"
            alt="Esfera"
            className="esfera-image"
          />
          */}
        </div>

        <div className="results-panel">
          <div className="results-header">
        
            <div className="results-title-row">
              <h1>Ganadores:</h1>
              <span className="badge">{filteredWinners.length}</span>
            </div>

          </div>
          <div className="results-list">
            {isSearching && (
              <div className="table-overlay">
                <div className="loader" />
                <p className="hint">Simulando sorteo...</p>
              </div>
            )}

            {!isSearching && hasSearched && filteredWinners.length === 0 && (
              <p className="hint">No se encontraron ganadores para esta categoría y premio.</p>
            )}

            {!isSearching &&
              filteredWinners.map((winner) => (
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
       <img
              src="/logos.png"
              alt="logo sponsors"
              className="logo-sponsors-image"
            />

      <button
        type="button"
        className="music-toggle"
        onClick={toggleMusic}
        aria-label={isMusicPlaying ? 'Pausar música de fondo' : 'Reproducir música de fondo'}
        style={{
          position: 'fixed',
          bottom: '1.5rem',
          right: '1.5rem',
          width: '3.5rem',
          height: '3.5rem',
          borderRadius: '50%',
          border: 'none',
          backgroundColor: '#1f8aee',
          color: '#fff',
          fontSize: '1.4rem',
          boxShadow: '0 8px 16px rgba(0, 0, 0, 0.15)',
          cursor: 'pointer',
        }}
      >
        {isMusicPlaying ? '❚❚' : '▶'}
      </button>
    </div>
  );
}

export default HomePage;
