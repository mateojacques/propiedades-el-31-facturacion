/**
 * Preload script. Runs in an isolated context with access to Node and Electron
 * APIs, exposes a small, audited surface to the renderer via contextBridge.
 *
 * The renderer never touches Node directly. Everything funnels through this
 * file and ipcRenderer.invoke handlers in main.ts.
 */
import { contextBridge, ipcRenderer } from 'electron';

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
};

const bridge: AppBridge = {
  getApiBase: () => ipcRenderer.invoke('app:get-api-base'),
  getUserDataPath: () => ipcRenderer.invoke('app:get-user-data-path'),
  openPath: (target) => ipcRenderer.invoke('app:open-path', target),
  saveFileDialog: (opts) => ipcRenderer.invoke('app:save-file-dialog', opts),
};

contextBridge.exposeInMainWorld('app', bridge);
