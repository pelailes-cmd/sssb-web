import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AdminProvider } from './cms/AdminContext';
import { ServiceAreaProvider } from './cms/ServiceAreaContext';
import { SiteContentProvider } from './cms/SiteContentContext';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SiteContentProvider>
      <ServiceAreaProvider>
        <AdminProvider>
          <App />
        </AdminProvider>
      </ServiceAreaProvider>
    </SiteContentProvider>
  </StrictMode>,
);
