import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './marketplace.css';
import { MarketplaceApp } from './MarketplaceApp';

const mountEl = document.getElementById('marketplace-root');
if (mountEl) {
  createRoot(mountEl).render(
    <StrictMode>
      <MarketplaceApp />
    </StrictMode>
  );
}
