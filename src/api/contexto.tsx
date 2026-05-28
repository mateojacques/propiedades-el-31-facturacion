/**
 * React context that exposes the Fastify base URL (discovered at boot via
 * window.app.getApiBase()) to every component, so they don't each have to
 * call the preload bridge.
 */
import { createContext, useContext, type ReactNode } from 'react';

const ApiBaseContext = createContext<string | null>(null);

export function ApiBaseProvider({
  value,
  children,
}: {
  value: string;
  children: ReactNode;
}): JSX.Element {
  return <ApiBaseContext.Provider value={value}>{children}</ApiBaseContext.Provider>;
}

export function useApiBase(): string {
  const ctx = useContext(ApiBaseContext);
  if (!ctx) throw new Error('useApiBase debe usarse dentro de ApiBaseProvider');
  return ctx;
}
