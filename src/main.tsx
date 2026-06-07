import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { App } from './app/App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

const enableWebAnalytics = import.meta.env.VITE_ENABLE_VERCEL_ANALYTICS === 'true';

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
      {enableWebAnalytics && <Analytics />}
      <SpeedInsights />
    </ErrorBoundary>
  </StrictMode>
);
