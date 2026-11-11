import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@shared/ui/tokens.css';
import './sandbox.css';
import { App } from './App';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Missing #root element for POS sandbox.');
}

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>
);
