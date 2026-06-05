import { useUserStore } from '../../state/userStore';
import { useStore } from '../../state/store';
import { playClick } from '../../utils/audio';

export function TourModal() {
  const { hasSeenTour, setHasSeenTour } = useUserStore();
  const { lang } = useStore();

  if (hasSeenTour) return null;

  const content = {
    en: {
      title: 'Welcome to OrbitIQ Command Center',
      desc: 'OrbitIQ is your AI-native orbital intelligence platform.',
      features: [
        '✨ Ask the AI Agent for congestion predictions.',
        '🌍 Drag the globe, click satellites, or filter by band.',
        '⏳ Use Time Controls to simulate past or future scenarios.',
      ],
      btn: 'Start Mission'
    },
    es: {
      title: 'Bienvenido al Centro de Comando OrbitIQ',
      desc: 'OrbitIQ es tu plataforma de inteligencia orbital nativa de IA.',
      features: [
        '✨ Pide a la IA predicciones de congestión.',
        '🌍 Gira el globo, selecciona satélites o filtra por banda.',
        '⏳ Usa los controles de tiempo para simular escenarios.',
      ],
      btn: 'Iniciar Misión'
    }
  };

  const texts = content[lang] || content['en'];

  const handleStart = () => {
    playClick();
    setHasSeenTour(true);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(5, 7, 13, 0.8)', backdropFilter: 'blur(10px)',
      display: 'grid', placeItems: 'center', padding: '20px'
    }}>
      <div className="glass" style={{
        padding: '30px', maxWidth: '440px', width: '100%',
        display: 'flex', flexDirection: 'column', gap: '20px'
      }}>
        <h2 style={{ margin: 0, fontSize: '24px', color: 'var(--cyan-bright)' }}>{texts.title}</h2>
        <p style={{ margin: 0, fontSize: '15px', color: 'var(--text)' }}>{texts.desc}</p>
        <ul style={{ margin: 0, paddingLeft: '20px', color: 'var(--text)', fontSize: '14px', lineHeight: '1.6' }}>
          {texts.features.map((f, i) => <li key={i}>{f}</li>)}
        </ul>
        <button className="ctl active" onClick={handleStart} style={{ padding: '12px', fontSize: '16px', marginTop: '10px' }}>
          {texts.btn}
        </button>
      </div>
    </div>
  );
}
