/**
 * Provider that exposes the ApiClient instance to the tree.
 * Built once per apiBase change.
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { makeClient, type ApiClient } from './cliente';
import { useApiBase } from './contexto';

const ClienteContext = createContext<ApiClient | null>(null);

export function ClienteProvider({ children }: { children: ReactNode }): JSX.Element {
  const apiBase = useApiBase();
  const cliente = useMemo(() => makeClient(apiBase), [apiBase]);
  return <ClienteContext.Provider value={cliente}>{children}</ClienteContext.Provider>;
}

export function useCliente(): ApiClient {
  const ctx = useContext(ClienteContext);
  if (!ctx) throw new Error('useCliente debe usarse dentro de ClienteProvider');
  return ctx;
}
