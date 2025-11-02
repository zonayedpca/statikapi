import React from 'react';
import { createRoot } from 'react-dom/client';

import App from './App.jsx';
import { ThemeProvider } from './theme/ThemeProvider.jsx';

import './index.css';
import './styles/global.scss';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>
);
