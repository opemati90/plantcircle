import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { loadBackend } from './data';
import './design/base.css';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');
const root = createRoot(container);

loadBackend().then(
  (backend) => {
    root.render(
      <StrictMode>
        <App backend={backend} />
      </StrictMode>,
    );
  },
  (error: unknown) => {
    console.error(error);
    root.render(
      <main style={{ padding: 24 }}>
        <h1>PlantCircle can’t start</h1>
        <p>The app is not configured correctly. Please try again later.</p>
      </main>,
    );
  },
);
