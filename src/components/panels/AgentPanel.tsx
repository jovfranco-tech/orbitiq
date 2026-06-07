// ============================================================
// OrbitIQ v0.3.0 — AI Command Agent panel
// ============================================================
import { useState, useCallback, useEffect } from 'react';
import { t } from '../../i18n/i18n';
import type { AiAgentResponse } from '../../types';
import { playClick, playAgentSuccess } from '../../utils/audio';
import { ResponsiveContainer, BarChart, XAxis, Tooltip, Bar } from 'recharts';
import { useStore } from '../../state/store';

const EXAMPLES_EN = [
  'Show me all Starlink satellites',
  'Which satellites are over Japan right now?',
  'Highlight satellites over LATAM',
  'Show only GEO satellites',
  'Show satellites below 600 km',
  'Find the ISS',
  'Give me an executive brief',
  'Which orbit band is most crowded right now?',
  'Show congestion score',
  'Compare LEO vs GEO',
  'Summarize GNSS coverage',
  'Which region has highest concentration?',
];

const EXAMPLES_ES = [
  'Mostrar todos los satélites Starlink',
  '¿Qué satélites están sobre Japón ahora?',
  'Destacar satélites sobre LATAM',
  'Mostrar solo satélites GEO',
  'Mostrar satélites por debajo de 600 km',
  'Buscar la ISS',
  'Dame un informe ejecutivo',
  '¿Qué banda orbital está más congestionada ahora?',
  'Mostrar puntuación de congestión',
  'Comparar LEO vs GEO',
  'Resumir cobertura GNSS',
  '¿Qué región tiene la mayor concentración?',
];

interface Props {
  onRun: (query: string) => void;
  lastResult: AiAgentResponse | null;
  isThinking: boolean;
}

export function AgentPanel({ onRun, lastResult, isThinking }: Props) {
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const lang = useStore((s) => s.lang);
  const chips = lang === 'es' ? EXAMPLES_ES : EXAMPLES_EN;

  const run = useCallback((q: string) => {
    if (!q.trim()) return;
    playClick();
    onRun(q.trim());
    setTimeout(playAgentSuccess, 100);
  }, [onRun]);

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') run(input);
  };

  const toggleListen = () => {
    if (isListening) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return alert('Speech recognition not supported in this browser.');
    playClick();
    const rec = new SpeechRecognition();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.onstart = () => setIsListening(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript;
      setInput(transcript);
      run(transcript);
    };
    rec.onend = () => setIsListening(false);
    rec.onerror = () => setIsListening(false);
    rec.start();
  };

  return (
    <section className="card glass" id="agentCard">
      <div className="card-head">
        <div className="card-title">
          <span className="ai-orb" />
          <div>
            <div>{t('agent_title')}</div>
            <div className="card-sub">{t('agent_sub')}</div>
          </div>
        </div>
        <span className={`agent-status${isThinking ? ' busy' : ''}`}>
          {isThinking ? t('ai_thinking') : t('ai_ready')}
        </span>
      </div>

      <div className="agent-input">
        <input
          id="agentInput"
          type="text"
          autoComplete="off"
          placeholder={t('agent_placeholder')}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
        />
        <button 
          onClick={toggleListen} 
        className={`mic-btn ${isListening ? 'listening' : ''}`}
        title={lang === 'es' ? 'Comando de voz' : 'Voice Command'}
        style={{ background: isListening ? 'var(--danger)' : 'transparent', color: isListening ? '#fff' : 'var(--muted)', padding: '0 8px', border: 0, borderRight: '1px solid var(--border)' }}
      >
        🎤
      </button>
      <button onClick={() => run(input)}>{t('agent_run')}</button>
    </div>

    <div className="agent-chips">
      {chips.map((q) => (
        <button key={q} onClick={() => { setInput(q); run(q); }}>{q}</button>
      ))}
    </div>

      {lastResult && !isThinking && (
        <AgentOutput result={lastResult} />
      )}
    </section>
  );
}

function AgentOutput({ result }: { result: AiAgentResponse }) {
  const [displayedText, setDisplayedText] = useState('');

  useEffect(() => {
    // Speak
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel(); // stop previous
      const utterance = new SpeechSynthesisUtterance(result.answer);
      utterance.rate = 1.1;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    }

    // Typing effect
    let i = 0;
    setDisplayedText('');
    const timer = setInterval(() => {
      setDisplayedText(result.answer.substring(0, i + 1));
      i++;
      if (i >= result.answer.length) clearInterval(timer);
    }, 20);

    return () => clearInterval(timer);
  }, [result.answer]);

  const conf = result.confidence;
  const actions = result.actions;
  const chips: string[] = [];
  if (actions.groups) chips.push('groups: ' + actions.groups.join(','));
  if (actions.band)   chips.push('band: ' + actions.band);
  if (actions.region) chips.push('region: ' + actions.region);
  if (actions.altMax != null) chips.push('alt ≤ ' + actions.altMax + 'km');
  if (actions.altMin != null) chips.push('alt ≥ ' + actions.altMin + 'km');
  if (actions.focusSatnum != null) chips.push('focus: ' + actions.focusSatnum);
  if (actions.brief) chips.push('open brief');
  if (actions.snapshotAction) chips.push('snapshot: ' + actions.snapshotAction);
  if (actions.savedViewAction) chips.push('view: ' + actions.savedViewAction.type);
  if (actions.watchlistAction) chips.push('watchlist: ' + actions.watchlistAction);
  if (result.intent === 'reset') chips.push('reset all');
  const primaryAction = chips[0] ?? 'view query';

  const intel = result.intelligence;

  return (
    <div className="agent-output">
      <div className="agent-mode">
        <span className={`mode-badge ${result.responseMode === 'llm' ? 'llm' : 'deterministic'}`}>
          <i />{result.responseMode === 'llm' ? t('agent_mode_llm') : t('agent_mode_fallback')}
        </span>
      </div>
      <p className="agent-answer">{displayedText}<span style={{ animation: 'blink 1s step-start infinite', borderRight: '2px solid var(--cyan)' }} /></p>
      <div className="agent-stats">
        <div className="astat">
          <span className="astat-k">{t('agent_confidence')}</span>
          <div className="conf">
            <div className={`conf-bar${conf < 0.5 ? ' low' : ''}`} style={{ width: Math.round(conf * 100) + '%' }} />
          </div>
          <span className="astat-v">{Math.round(conf * 100)}%</span>
        </div>
        {result.visibleCount > 0 && (
          <div className="astat astat-scope">
            <span className="astat-k">{t('agent_scope')}</span>
            <span className="astat-v accent">{result.visibleCount.toLocaleString()} {t('sats_unit')}</span>
          </div>
        )}
      </div>

      <div className="agent-action-trace" aria-label={t('agent_actions')}>
        <div className="trace-step done">
          <span>{t('agent_trace_intent')}</span>
          <b>{result.intent}</b>
        </div>
        <div className="trace-line" />
        <div className="trace-step done">
          <span>{t('agent_trace_validate')}</span>
          <b>{primaryAction}</b>
        </div>
        <div className="trace-line active" />
        <div className="trace-step active">
          <span>{t('agent_trace_apply')}</span>
          <b>{t('agent_trace_done')}</b>
        </div>
      </div>

      {/* Intelligence attachment */}
      {intel && (
        <div className="agent-intel">
          {intel.mostCrowdedBand && (
            <div className="agent-intel-row">
              <span className="meta-k">{t('intel_most_crowded')}</span>
              <span className="astat-v accent">{intel.mostCrowdedBand}</span>
            </div>
          )}
          {intel.congestionScore != null && (
            <div className="agent-intel-row">
              <span className="meta-k">{t('cong_title')}</span>
              <span className="astat-v">
                {intel.congestionScore}/100
                {intel.congestionLevel && (
                  <span className={`cong-level ${intel.congestionLevel}`}
                    style={{ marginLeft: '6px', fontSize: '8px', padding: '1px 5px' }}>
                    <i />{intel.congestionLevel}
                  </span>
                )}
              </span>
            </div>
          )}
          {intel.highestConcentrationRegion && (
            <div className="agent-intel-row">
              <span className="meta-k">{t('intel_region_hot')}</span>
              <span className="astat-v accent">{intel.highestConcentrationRegion}</span>
            </div>
          )}
          {intel.dominantGroup && (
            <div className="agent-intel-row">
              <span className="meta-k">{t('intel_dominant_band')}</span>
              <span className="astat-v">{intel.dominantGroup}</span>
            </div>
          )}
        </div>
      )}

      {/* Chart attachment */}
      {result.actions.chartAction && result.actions.chartAction.type === 'bar' && (
        <div className="agent-chart" style={{ width: '100%', height: 200, marginTop: 16 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={result.actions.chartAction.data as Record<string, string | number>[]}>
              <XAxis dataKey="name" stroke="#60708c" fontSize={10} tickLine={false} axisLine={false} />
              <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '4px', fontSize: '12px' }} />
              <Bar dataKey={result.actions.chartAction.dataKey} fill="#3a8fe6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="agent-meta">
        <div>
          <span className="meta-k">{t('agent_intent')}</span>
          <code>{result.intent}</code>
        </div>
        <div>
          <span className="meta-k">{t('agent_actions')}</span>
          <span className="chips-inline">
            {chips.length ? chips.map((x) => <span key={x}>{x}</span>) : <span>view query</span>}
          </span>
        </div>
        {result.assumptions.length > 0 && (
          <div className="agent-assume">
            <span className="meta-k">{t('agent_assumptions')}</span>
            <span>{result.assumptions.join(' ')}</span>
          </div>
        )}
        {result.safetyCaveat && (
          <div className="agent-assume" style={{ marginTop: '4px', borderLeftColor: '#f72585' }}>
            <span className="meta-k" style={{ color: '#f72585' }}>{t('agent_safety_notice')}</span>
            <span>{result.safetyCaveat}</span>
          </div>
        )}
      </div>
    </div>
  );
}
