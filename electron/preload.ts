/**
 * Preload script. Runs in an isolated context with access to Node and Electron
 * APIs, exposes a small, audited surface to the renderer via contextBridge.
 *
 * The renderer never touches Node directly. Everything funnels through this
 * file and ipcRenderer.invoke handlers in main.ts.
 */
import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';

/**
 * Discriminated union describing every state the auto-updater can broadcast
 * to the renderer via the `update:status` channel.
 *
 * Dates travel as ISO strings — Date instances don't survive the IPC bridge
 * cleanly. The renderer-side hook is responsible for parsing them.
 *
 * MUST stay in sync with `UpdateStatusPayload` in `src/tipos/global.d.ts`.
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

export type AppBridge = {
  /** Returns the http://127.0.0.1:<port> base URL of the in-process Fastify server. */
  getApiBase(): Promise<string>;
  /** Returns the absolute path of the userData directory. */
  getUserDataPath(): Promise<string>;
  /** Opens a path inside the userData directory in the OS file manager. */
  openPath(target: string): Promise<void>;
  /** Shows a native Save As dialog. Returns the chosen path or null if cancelled. */
  saveFileDialog(opts: {
    defaultPath?: string;
    filters?: { name: string; extensions: string[] }[];
  }): Promise<string | null>;
  /** Auto-updater bridge. All operations route through main via IPC. */
  update: {
    /** Triggers a check; resolves once the request is dispatched. Status arrives via onStatus. */
    check(): Promise<void>;
    /** Starts downloading the available update. Progress arrives via onStatus. */
    download(): Promise<void>;
    /** Quits and installs the previously downloaded update. */
    install(): Promise<void>;
    /** Returns the currently running app version (from package.json). */
    getCurrentVersion(): Promise<string>;
    /**
     * Subscribes to status updates. Returns an unsubscribe function that
     * removes the underlying ipcRenderer listener — call it on cleanup to
     * avoid leaks (e.g. inside a React useEffect cleanup).
     */
    onStatus(cb: (payload: UpdateStatusPayload) => void): () => void;
  };
};

const bridge: AppBridge = {
  getApiBase: () => ipcRenderer.invoke('app:get-api-base'),
  getUserDataPath: () => ipcRenderer.invoke('app:get-user-data-path'),
  openPath: (target) => ipcRenderer.invoke('app:open-path', target),
  saveFileDialog: (opts) => ipcRenderer.invoke('app:save-file-dialog', opts),
  update: {
    check: () => ipcRenderer.invoke('update:check'),
    download: () => ipcRenderer.invoke('update:download'),
    install: () => ipcRenderer.invoke('update:install'),
    getCurrentVersion: () => ipcRenderer.invoke('update:get-version'),
    onStatus: (cb) => {
      // Wrapper isolates the IpcRendererEvent so the renderer callback only
      // receives the payload — keeps the bridge surface free of Electron types.
      const listener = (_event: IpcRendererEvent, payload: UpdateStatusPayload) => cb(payload);
      ipcRenderer.on('update:status', listener);
      return () => {
        ipcRenderer.removeListener('update:status', listener);
      };
    },
  },
};

contextBridge.exposeInMainWorld('app', bridge);
