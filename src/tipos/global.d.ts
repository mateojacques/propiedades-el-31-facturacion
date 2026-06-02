/**
 * Ambient typings for the renderer.
 *
 * The shape of `window.app` MUST stay in sync with electron/preload.ts.
 * It's duplicated here intentionally — renderer and main are compiled with
 * separate tsconfigs and shouldn't import across that boundary.
 */

/**
 * Discriminated union describing every state the auto-updater can broadcast
 * to the renderer via the `update:status` IPC channel.
 *
 * Dates travel as ISO strings (Date objects don't survive the IPC bridge
 * cleanly). The `useAutoUpdater` hook is responsible for parsing them into
 * Date instances before exposing them to components.
 *
 * MUST stay in sync with `UpdateStatusPayload` in `electron/preload.ts`.
 */
export type UpdateStatusPayload =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'not-available'; checkedAt: string; version: string }
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

export interface AppBridge {
  getApiBase(): Promise<string>;
  getUserDataPath(): Promise<string>;
  openPath(target: string): Promise<void>;
  saveFileDialog(opts: {
    defaultPath?: string;
    filters?: { name: string; extensions: string[] }[];
  }): Promise<string | null>;
  update: {
    check(): Promise<void>;
    download(): Promise<void>;
    install(): Promise<void>;
    getCurrentVersion(): Promise<string>;
    onStatus(cb: (payload: UpdateStatusPayload) => void): () => void;
  };
}

declare global {
  interface Window {
    app: AppBridge;
  }
}

export {};
