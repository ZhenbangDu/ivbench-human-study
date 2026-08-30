import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles.css';
import './curation.css';
import { CuratorApp } from './CuratorApp';

createRoot(document.getElementById('curation-root')!).render(
  <StrictMode>
    <CuratorApp />
  </StrictMode>,
);
