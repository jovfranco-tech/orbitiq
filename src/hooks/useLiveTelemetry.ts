import { useState, useEffect } from 'react';

const STATUS_EVENTS = [
  'Public TLE snapshot propagated with SGP4.',
  'Representative fallback catalog available for offline/demo mode.',
  'LEO density indicator refreshed from current propagated subpoints.',
  'GEO infrastructure portfolio indicator ready.',
  'Selected object nadir estimate uses public TLE propagation.',
  'Scenario mode is an SGP4 estimate, not an operational prediction.',
  'Regional overflight counts are approximate bounding-box matches.',
  'AI agent suggests validated UI actions only.'
];

export function useLiveTelemetry() {
  const [tickerMsg, setTickerMsg] = useState("Initializing Live Telemetry Stream...");

  useEffect(() => {
    const interval = setInterval(() => {
      const randomEvent = STATUS_EVENTS[Math.floor(Math.random() * STATUS_EVENTS.length)];
      setTickerMsg(randomEvent);
    }, 8500);
    
    return () => clearInterval(interval);
  }, []);

  return { tickerMsg };
}
