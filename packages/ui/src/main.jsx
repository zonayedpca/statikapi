import React from 'react';
import { createRoot } from 'react-dom/client';

import App from './App.jsx';

import './index.css';
import './styles/global.scss';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
