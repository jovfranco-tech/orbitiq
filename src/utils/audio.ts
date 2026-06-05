// ============================================================
// OrbitIQ v2.0 — UI Audio Engine (Web Audio API)
// Synthesizes lightweight sci-fi UI sounds without assets.
// ============================================================

let ctx: AudioContext | null = null;

function initAudio() {
  if (!ctx) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (ctx.state === 'suspended') {
    ctx.resume();
  }
  return ctx;
}

export function playClick() {
  try {
    const actx = initAudio();
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    
    osc.connect(gain);
    gain.connect(actx.destination);
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, actx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(600, actx.currentTime + 0.05);
    
    gain.gain.setValueAtTime(0.05, actx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.05);
    
    osc.start();
    osc.stop(actx.currentTime + 0.05);
  } catch (e) { /* ignore audio errors */ }
}

export function playHover() {
  try {
    const actx = initAudio();
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    
    osc.connect(gain);
    gain.connect(actx.destination);
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, actx.currentTime);
    
    gain.gain.setValueAtTime(0.01, actx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.03);
    
    osc.start();
    osc.stop(actx.currentTime + 0.03);
  } catch (e) { /* ignore audio errors */ }
}

export function playAgentSuccess() {
  try {
    const actx = initAudio();
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    
    osc.connect(gain);
    gain.connect(actx.destination);
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(600, actx.currentTime);
    osc.frequency.setValueAtTime(800, actx.currentTime + 0.1);
    osc.frequency.setValueAtTime(1200, actx.currentTime + 0.2);
    
    gain.gain.setValueAtTime(0, actx.currentTime);
    gain.gain.linearRampToValueAtTime(0.05, actx.currentTime + 0.05);
    gain.gain.linearRampToValueAtTime(0, actx.currentTime + 0.3);
    
    osc.start();
    osc.stop(actx.currentTime + 0.3);
  } catch (e) { /* ignore audio errors */ }
}
