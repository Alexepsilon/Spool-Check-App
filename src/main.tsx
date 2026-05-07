import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { requestPersistentStorage } from './lib/db';

// Ask the browser to mark our IndexedDB storage as persistent so it
// survives low-disk eviction. Best-effort — fires and forgets.
requestPersistentStorage().catch(() => {
  /* ignore — non-fatal */
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
