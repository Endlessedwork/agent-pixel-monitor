import './index.css';

import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App.js';
import { I18nProvider } from './i18n.js';

const ActivitiesPage = lazy(() => import('./ActivitiesPage.js'));

const isActivitiesRoute = window.location.pathname === '/activities';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      {isActivitiesRoute ? (
        <Suspense fallback={null}>
          <ActivitiesPage />
        </Suspense>
      ) : (
        <App />
      )}
    </I18nProvider>
  </StrictMode>,
);
