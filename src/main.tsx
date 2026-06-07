import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';
import { onCLS, onINP, onLCP, onFCP, onTTFB } from 'web-vitals';
import { inject } from '@vercel/analytics';

function reportVital({ name, value, id }: { name: string; value: number; id: string }) {
  if (process.env.NODE_ENV === 'development') {
    console.debug(`[Web Vitals] ${name}: ${Math.round(value)} (${id})`);
  }
}

onCLS(reportVital);
onINP(reportVital);
onLCP(reportVital);
onFCP(reportVital);
onTTFB(reportVital);

inject();

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
