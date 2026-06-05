import { useState, useEffect } from 'react';

const SSE_EVENTS = [
  "Telemetry stream established via WebSocket...",
  "Recalibrating LEO perturbations...",
  "High collision probability detected near Starlink-1422",
  "Solar flare anomaly affecting GEO communications",
  "Updating nadir trajectory for ISS",
  "Live telemetry: Nominal operations across MEO band",
  "Warning: Congestion spike detected in Region 4",
  "Receiving real-time space weather updates..."
];

export function useLiveTelemetry() {
  const [tickerMsg, setTickerMsg] = useState("Initializing Live Telemetry Stream...");

  useEffect(() => {
    const interval = setInterval(() => {
      const randomEvent = SSE_EVENTS[Math.floor(Math.random() * SSE_EVENTS.length)];
      setTickerMsg(randomEvent);
    }, 8500);
    
    return () => clearInterval(interval);
  }, []);

  return { tickerMsg };
}
