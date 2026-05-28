/**
 * Electron main process entry point.
 *
 * Responsibilities:
 *  - Set userData path to PropiedadesEl31Facturacion (must run BEFORE app.whenReady).
 *  - Acquire single-instance lock so only one window opens.
 *  - Boot the in-process Fastify server, capture its random port.
 *  - Create the BrowserWindow and load the built renderer.
 *  - Wire IPC so the renderer can ask for the API base URL.
 */
import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { startServer, type RunningServer } from '../server/index';

// ─── Configure userData path BEFORE app is ready ───────────────────────────
// productName has spaces and an accent; force a safe folder name for AppData.
app.setName('PropiedadesEl31Facturacion');
const userDataPath = path.join(app.getPath('appData'), 'PropiedadesEl31Facturacion');
fs.mkdirSync(userDataPath, { recursive: true });
app.setPath('userData', userDataPath);

// Pre-create the sibling data directories (Spanish names per spec).
for (const sub of ['datos', 'copias-de-seguridad', 'exportaciones', 'registros']) {
  fs.mkdirSync(path.join(userDataPath, sub), { recursive: true });
}

// ─── Single-instance lock ──────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

let mainWindow: BrowserWindow | null = null;
let running: RunningServer | null = null;

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// ─── Window creation ───────────────────────────────────────────────────────
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    backgroundColor: '#fafafa',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => { mainWindow = null; });

  // External links open in the user's browser, never inside the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  // Dev: load Vite dev server. Prod: load the built file.
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    void mainWindow.loadURL(devUrl);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    const indexHtml = path.join(__dirname, '..', '..', 'dist-renderer', 'index.html');
    void mainWindow.loadFile(indexHtml);
  }
}

// ─── IPC handlers ──────────────────────────────────────────────────────────
ipcMain.handle('app:get-api-base', () => running?.apiBase ?? '');

ipcMain.handle('app:open-path', async (_evt, target: string) => {
  // Whitelist: only allow opening paths inside userData.
  const resolved = path.resolve(target);
  if (!resolved.startsWith(userDataPath)) {
    throw new Error('Ruta no permitida');
  }
  await shell.openPath(resolved);
});

ipcMain.handle('app:get-user-data-path', () => userDataPath);

ipcMain.handle(
  'app:save-file-dialog',
  async (_evt, opts: { defaultPath?: string; filters?: Electron.FileFilter[] }) => {
    if (!mainWindow) return null;
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: opts.defaultPath,
      filters: opts.filters,
    });
    return result.canceled ? null : result.filePath;
  }
);

// ─── App lifecycle ─────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  try {
    running = await startServer({ userDataPath });
    createWindow();
  } catch (err) {
    dialog.showErrorBox(
      'Error al iniciar',
      `No se pudo iniciar el servidor interno:\n\n${(err as Error).message}`
    );
    app.quit();
  }
});

app.on('window-all-closed', () => {
  // Standard Windows behavior: quit when all windows close.
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', async (event) => {
  if (!running) return;
  event.preventDefault();
  try {
    await running.close();
  } finally {
    running = null;
    app.exit(0);
  }
});
