/**
 * Ambient typings for the renderer.
 *
 * The shape of `window.app` MUST stay in sync with electron/preload.ts.
 * It's duplicated here intentionally — renderer and main are compiled with
 * separate tsconfigs and shouldn't import across that boundary.
 */
export interface AppBridge {
  getApiBase(): Promise<string>;
  getUserDataPath(): Promise<string>;
  openPath(target: string): Promise<void>;
  saveFileDialog(opts: {
    defaultPath?: string;
    filters?: { name: string; extensions: string[] }[];
  }): Promise<string | null>;
}

declare global {
  interface Window {
    app: AppBridge;
  }
}

export {};
