/**
 * Renderer entry point. Bootstraps React, MUI theme, TanStack Query, and the
 * HashRouter. Discovers the in-process Fastify port via the preload bridge
 * before mounting the app.
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider, CssBaseline, createTheme } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HashRouter } from 'react-router-dom';
import { App } from './App';
import { ApiBaseProvider } from './api/contexto';
import { ClienteProvider } from './api/proveedor-cliente';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#9f0712',
      light: '#c52836',
      dark: '#7a050d',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#57534e',
      light: '#78716c',
      dark: '#3f3f3a',
      contrastText: '#ffffff',
    },
    error: { main: '#dc2626' },
    warning: { main: '#d97706' },
    success: { main: '#15803d' },
    info: { main: '#0369a1' },
    background: {
      default: '#fafaf9',
      paper: '#ffffff',
    },
    text: {
      primary: '#1c1917',
      secondary: '#57534e',
    },
    divider: '#e7e5e4',
  },
  typography: {
    fontFamily: 'Roboto, "Segoe UI", system-ui, sans-serif',
    h6: { fontWeight: 600 },
  },
  shape: { borderRadius: 8 },
  components: {
    MuiAppBar: {
      styleOverrides: {
        colorPrimary: {
          backgroundColor: '#9f0712',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: { textTransform: 'none', fontWeight: 500 },
      },
    },
  },
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
  },
});

async function bootstrap(): Promise<void> {
  const apiBase = await window.app.getApiBase();

  const root = ReactDOM.createRoot(document.getElementById('root')!);
  root.render(
    <React.StrictMode>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <QueryClientProvider client={queryClient}>
          <ApiBaseProvider value={apiBase}>
            <ClienteProvider>
              <HashRouter>
                <App />
              </HashRouter>
            </ClienteProvider>
          </ApiBaseProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </React.StrictMode>
  );
}

void bootstrap();
