import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AdminProvider } from './cms/AdminContext';
import { QuoteDialogProvider } from './cms/QuoteDialogContext';
import { ServiceAreaProvider } from './cms/ServiceAreaContext';
import { SiteContentProvider } from './cms/SiteContentContext';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SiteContentProvider>
      <ServiceAreaProvider>
        <QuoteDialogProvider>
          <AdminProvider>
            <App />
          </AdminProvider>
        </QuoteDialogProvider>
      </ServiceAreaProvider>
    </SiteContentProvider>
  </StrictMode>,
);
