import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { clubName } from '../lib/club';
import { App } from './app';
import './styles.css';

// index.html carries the name when VITE_CLUB_NAME is set at build time; this also covers builds without it.
document.title = `${clubName} · Le club`;

const root = document.getElementById('root');
if (!root) throw new Error('The page has no #root element.');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
