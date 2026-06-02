/**
 * useAutoUpdater — renderer-side hook for the Electron auto-updater bridge.
 *
 * Subscribes to `window.app.update.onStatus` and exposes a typed state
 * machine plus action wrappers. The main process is the source of truth
 * for transitions; this hook only mirrors what comes through IPC.
 *
 * The single material conversion done here is `checkedAt: string -> Date`,
 * since `Date` instances don't survive the IPC bridge intact.
 */

import { useCallback, useEffect, useState } from 'react';
import type { UpdateStatusPayload } from '../tipos/global';

/**
 * Renderer-facing state machine. Mirrors `UpdateStatusPayload` but with
 * `checkedAt` parsed into a `Date` for direct UI consumption.
 */
export type UpdateStatus =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'not-available'; checkedAt: Date; version: string }
  | { kind: 'available'; version: string; releaseNotes?: string; releaseDate?: string }
  | {
      kind: 'downloading';
      percent: number;
      transferred: number;
      total: number;
      bytesPerSecond: number;
    }
  | { kind: 'downloaded'; version: string }
  | { kind: 'error'; message: string }
  | { kind: 'dev-mode' };

export interface UseAutoUpdaterReturn {
  status: UpdateStatus;
  currentVersion: string;
  isPackaged: boolean;
  check(): Promise<void>;
  download(): Promise<void>;
  install(): Promise<void>;
}

/**
 * Pure converter: IPC payload -> renderer state. Exported-shaped (kept
 * module-private) so it stays trivially unit-testable from the hook tests.
 */
export function payloadToStatus(payload: UpdateStatusPayload): UpdateStatus {
  if (payload.kind === 'not-available') {
    return {
      kind: 'not-available',
      version: payload.version,
      checkedAt: new Date(payload.checkedAt),
    };
  }
  return payload;
}

/**
 * Swallow-and-forget wrapper. Errors flow back through `update:status`
 * (the main process emits a `{ kind: 'error' }` payload), so renderer
 * action calls must never throw at the call site.
 */
async function safeInvoke(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch {
    /* surfaced via update:status */
  }
}

export function useAutoUpdater(): UseAutoUpdaterReturn {
  const [status, setStatus] = useState<UpdateStatus>({ kind: 'idle' });
  const [currentVersion, setCurrentVersion] = useState<string>('');
  const [isPackaged, setIsPackaged] = useState<boolean>(true);

  // Subscribe to status broadcasts.
  useEffect(() => {
    const unsubscribe = window.app.update.onStatus((payload) => {
      if (payload.kind === 'dev-mode') setIsPackaged(false);
      setStatus(payloadToStatus(payload));
    });
    return unsubscribe;
  }, []);

  // Load current version once.
  useEffect(() => {
    let cancelled = false;
    window.app.update
      .getCurrentVersion()
      .then((v) => {
        if (!cancelled) setCurrentVersion(v);
      })
      .catch(() => {
        /* non-fatal: keep empty string */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const check = useCallback(() => safeInvoke(() => window.app.update.check()), []);
  const download = useCallback(() => safeInvoke(() => window.app.update.download()), []);
  const install = useCallback(() => safeInvoke(() => window.app.update.install()), []);

  return { status, currentVersion, isPackaged, check, download, install };
}
