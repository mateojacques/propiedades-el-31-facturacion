/**
 * Auto-updater wiring for the Electron main process.
 *
 * Responsibilities:
 *  - Register the four `update:*` IPC handlers exposed via the preload bridge.
 *  - Subscribe (exactly once) to all `electron-updater` lifecycle events and
 *    forward them to the renderer as `UpdateStatusPayload` objects on the
 *    `update:status` channel.
 *  - Stay safe in development (`!app.isPackaged`): the IPC contract is honored
 *    but `electron-updater` is never touched, since it throws when there is
 *    no installed app to update.
 *
 * Renderer↔main IPC contract (locked by subtask 05):
 *  - invoke: `update:check`, `update:download`, `update:install`, `update:get-version`
 *  - send  : `update:status` (main → renderer)
 *
 * The payload shape MUST match `UpdateStatusPayload` in `src/tipos/global.d.ts`.
 */
import { app, ipcMain, type BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';

// ─── Local payload type ─────────────────────────────────────────────────────
// Mirrors `UpdateStatusPayload` from src/tipos/global.d.ts. We deliberately
// duplicate it: renderer and main are compiled with separate tsconfigs and
// shouldn't import across that boundary.
type UpdateStatusPayload =
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

// IPC channel names are referenced as string literals at every `ipcMain.handle`
// and `webContents.send` site so they remain trivially greppable from build
// scripts and CI checks. Keep aligned with `electron/preload.ts`.

// ─── Pure helpers ───────────────────────────────────────────────────────────

/**
 * Map known auto-updater / network error codes to user-friendly Spanish copy.
 * Pure function; exported so tests can pin the mapping without booting Electron.
 */
export function friendlyMessage(err: unknown): string {
  const fallback = 'Error desconocido al actualizar.';
  if (!(err instanceof Error)) {
    return typeof err === 'string' && err.length > 0 ? err : fallback;
  }
  const code = extractErrorCode(err);
  switch (code) {
    case 'ERR_UPDATER_LATEST_VERSION_NOT_FOUND':
      return 'No hay actualizaciones disponibles.';
    case 'ERR_UPDATER_INVALID_UPDATE_INFO':
      return 'El servidor de actualizaciones devolvió datos inválidos.';
    case 'ENOTFOUND':
    case 'ECONNRESET':
    case 'ETIMEDOUT':
      return 'Sin conexión con el servidor de actualizaciones.';
    default:
      return err.message.length > 0 ? err.message : fallback;
  }
}

/** Best-effort extraction of an error code from a thrown Error. */
function extractErrorCode(err: Error): string | undefined {
  const maybeCode = (err as Error & { code?: unknown }).code;
  if (typeof maybeCode === 'string') return maybeCode;
  // electron-updater frequently embeds the code inside the message:
  // e.g. "Error: ERR_UPDATER_LATEST_VERSION_NOT_FOUND: ...".
  const match = err.message.match(/\b(ERR_UPDATER_[A-Z_]+|ENOTFOUND|ECONNRESET|ETIMEDOUT)\b/);
  return match?.[1];
}

/** Coerce electron-updater's `releaseNotes` (string | object[] | null) to string|undefined. */
function coerceReleaseNotes(notes: unknown): string | undefined {
  return typeof notes === 'string' ? notes : undefined;
}

// ─── Module-level guards ────────────────────────────────────────────────────
// Guarantee single-registration even if `initAutoUpdater` is called twice
// (e.g. after a renderer reload). Listeners are wired exactly once.
let initialized = false;

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Wire IPC handlers and (in production) the `electron-updater` event stream.
 * Must be called once after the main BrowserWindow is created.
 */
export function initAutoUpdater(mainWindow: BrowserWindow): void {
  if (initialized) return;
  initialized = true;

  // True when both the window and its webContents are still alive. Every
  // `webContents.send` site is gated by this to avoid "Object has been
  // destroyed" crashes during shutdown / reload.
  const isAlive = (): boolean =>
    !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed();

  // get-version is identical in dev and prod — always works.
  ipcMain.handle('update:get-version', () => app.getVersion());

  if (!app.isPackaged) {
    registerDevHandlers(mainWindow, isAlive);
    return;
  }

  registerProdHandlers(mainWindow, isAlive);
  registerCheckEvents(mainWindow, isAlive);
  registerDownloadEvents(mainWindow, isAlive);
}

/**
 * Fire-and-forget silent update check intended for app startup (~30s after
 * window is ready). No-op in dev (`!app.isPackaged`); errors are swallowed so
 * a missing network never bothers the user. Status events still flow to the
 * renderer through the listeners wired in `initAutoUpdater`, so the Layout
 * snackbar will surface 'available' / 'downloaded' transitions naturally.
 */
export function triggerSilentCheck(): void {
  if (!app.isPackaged) return;
  autoUpdater.checkForUpdates().catch(() => {
    /* silent: startup check must never disrupt UX */
  });
}

// ─── Dev-mode handlers ──────────────────────────────────────────────────────

function registerDevHandlers(mainWindow: BrowserWindow, isAlive: () => boolean): void {
  ipcMain.handle('update:check', () => {
    if (isAlive()) mainWindow.webContents.send('update:status', { kind: 'dev-mode' });
  });
  ipcMain.handle('update:download', () => {
    if (isAlive())
      mainWindow.webContents.send('update:status', {
        kind: 'error',
        message: 'Modo desarrollo: no se puede actualizar',
      } satisfies UpdateStatusPayload);
  });
  ipcMain.handle('update:install', () => {
    if (isAlive())
      mainWindow.webContents.send('update:status', {
        kind: 'error',
        message: 'Modo desarrollo: no se puede actualizar',
      } satisfies UpdateStatusPayload);
  });
}

// ─── Production handlers ────────────────────────────────────────────────────

function registerProdHandlers(mainWindow: BrowserWindow, isAlive: () => boolean): void {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;

  const sendError = (e: unknown): void => {
    if (!isAlive()) return;
    mainWindow.webContents.send('update:status', {
      kind: 'error',
      message: friendlyMessage(e),
    } satisfies UpdateStatusPayload);
  };

  ipcMain.handle('update:check', async () => {
    try {
      await autoUpdater.checkForUpdates();
    } catch (e) {
      sendError(e);
    }
  });

  ipcMain.handle('update:download', async () => {
    try {
      await autoUpdater.downloadUpdate();
    } catch (e) {
      sendError(e);
    }
  });

  ipcMain.handle('update:install', () => {
    // isSilent=false so the user sees the installer; isForceRunAfter=true
    // relaunches the app once installation completes.
    autoUpdater.quitAndInstall(false, true);
  });
}

// ─── Updater event subscriptions ────────────────────────────────────────────
// Split into two registration functions to keep each under the 50-line limit
// and to group events by lifecycle phase (check phase vs. download phase).

function registerCheckEvents(mainWindow: BrowserWindow, isAlive: () => boolean): void {
  autoUpdater.on('checking-for-update', () => {
    if (isAlive())
      mainWindow.webContents.send('update:status', {
        kind: 'checking',
      } satisfies UpdateStatusPayload);
  });

  autoUpdater.on('update-available', (info) => {
    if (isAlive())
      mainWindow.webContents.send('update:status', {
        kind: 'available',
        version: info.version,
        releaseNotes: coerceReleaseNotes(info.releaseNotes),
        releaseDate: info.releaseDate,
      } satisfies UpdateStatusPayload);
  });

  autoUpdater.on('update-not-available', () => {
    // `info.version` here echoes the latest seen version, not the installed
    // one. We surface the *current* version so the renderer can confidently
    // render "Estás en la última: vX.Y.Z".
    if (isAlive())
      mainWindow.webContents.send('update:status', {
        kind: 'not-available',
        checkedAt: new Date().toISOString(),
        version: app.getVersion(),
      } satisfies UpdateStatusPayload);
  });
}

function registerDownloadEvents(mainWindow: BrowserWindow, isAlive: () => boolean): void {
  autoUpdater.on('download-progress', (p) => {
    if (isAlive())
      mainWindow.webContents.send('update:status', {
        kind: 'downloading',
        percent: p.percent,
        transferred: p.transferred,
        total: p.total,
        bytesPerSecond: p.bytesPerSecond,
      } satisfies UpdateStatusPayload);
  });

  autoUpdater.on('update-downloaded', (info) => {
    if (isAlive())
      mainWindow.webContents.send('update:status', {
        kind: 'downloaded',
        version: info.version,
      } satisfies UpdateStatusPayload);
  });

  autoUpdater.on('error', (err) => {
    if (isAlive())
      mainWindow.webContents.send('update:status', {
        kind: 'error',
        message: friendlyMessage(err),
      } satisfies UpdateStatusPayload);
  });
}
