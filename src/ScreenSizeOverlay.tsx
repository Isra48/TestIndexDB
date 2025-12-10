import { useEffect, useState } from 'react';

// Se usa 1024px para cubrir tablets/móviles y asegurar una experiencia de escritorio.
const OVERLAY_BREAKPOINT = 1024;

function ScreenSizeOverlay() {
  const [isSmallScreen, setIsSmallScreen] = useState(
    typeof window !== 'undefined' ? window.innerWidth < OVERLAY_BREAKPOINT : false,
  );

  useEffect(() => {
    // Solo escucha el resize para mostrar/ocultar la capa sin alterar ninguna lógica.
    const handleResize = () => setIsSmallScreen(window.innerWidth < OVERLAY_BREAKPOINT);

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (!isSmallScreen) {
    return null;
  }

  return (
    // Capa puramente visual para bloquear interacción en pantallas pequeñas sin tocar la lógica de la app.
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#ffffff',
        textAlign: 'center',
        padding: '24px',
        zIndex: 9999,
      }}
    >
      <div>
        <p style={{ fontSize: '20px', fontWeight: 600, marginBottom: '12px' }}>
          Esta aplicación está optimizada exclusivamente para pantallas de escritorio.
        </p>
        <p style={{ fontSize: '16px', fontWeight: 400 }}>
          Amplía la ventana o accede desde un monitor para continuar.
        </p>
      </div>
    </div>
  );
}

export default ScreenSizeOverlay;
