import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AdminProvider } from './cms/AdminContext';
import { SiteContentProvider } from './cms/SiteContentContext';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SiteContentProvider>
      <AdminProvider>
        <App />
      </AdminProvider>
    </SiteContentProvider>
  </StrictMode>,
);
