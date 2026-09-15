import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { setAuthTokenGetter, setBaseUrl } from '@workspace/api-client-react';
import './index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Elemento root não encontrado');
}

// O frontend Render está hospedado em um domínio diferente da API.
// As rotas geradas usam /api/... relativo, então precisamos apontá-las
// explicitamente para o backend Render.
setBaseUrl(import.meta.env.VITE_API_URL || null);

// O login grava o access token no localStorage. O client HTTP usa esse
// token automaticamente nas próximas chamadas para a API.
setAuthTokenGetter(() => localStorage.getItem('fsf_access_token'));

createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
