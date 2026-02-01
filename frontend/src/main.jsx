import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { ToastProvider } from './context/ToastContext';
import { SystemAlertProvider } from './context/SystemAlertContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <SystemAlertProvider>
          <App />
        </SystemAlertProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>
);
