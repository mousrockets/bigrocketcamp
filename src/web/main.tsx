import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { EdgeTint } from './components/edge-tint';
import { Toaster } from './components/ui/sonner';
import { TooltipProvider } from './components/ui/tooltip';
import { registerServiceWorker } from './offline';
import { persistOptions } from './persistence';
import { createQueryClient } from './query-client';
import { createAppRouter } from './router';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('The page has no #root element.');

const queryClient = createQueryClient();
const router = createAppRouter();

createRoot(root).render(
  <StrictMode>
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      <TooltipProvider>
        <RouterProvider router={router} />
        <Toaster />
        <EdgeTint />
      </TooltipProvider>
    </PersistQueryClientProvider>
  </StrictMode>,
);

registerServiceWorker();
