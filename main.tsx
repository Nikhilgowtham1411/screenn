import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ServerProvider } from './lib/server';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ServerProvider>
      <App />
    </ServerProvider>
  </React.StrictMode>,
);
