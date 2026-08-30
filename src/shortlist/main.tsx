import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles.css';
import '../curation/curation.css';
import './shortlist.css';
import { ShortlistApp } from './ShortlistApp';

createRoot(document.getElementById('shortlist-root')!).render(
  <StrictMode>
    <ShortlistApp />
  </StrictMode>,
);
