import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1300,
    height: 850,
    minWidth: 900,
    minHeight: 600,
    title: 'BennuIDE - BennuGD2 Game Development Studio',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  setupMenu();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function setupMenu(): void {
  const isMac = process.platform === 'darwin';
  const template: any[] = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }] : []),
    {
      label: 'Archivo',
      submenu: [
        {
          label: 'Nuevo Archivo .prg',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow?.webContents.send('menu-new-file')
        },
        {
          label: 'Abrir Archivo...',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            if (!mainWindow) return;
            const res = await dialog.showOpenDialog(mainWindow, {
              properties: ['openFile'],
              filters: [
                { name: 'BennuGD Scripts & Assets', extensions: ['prg', 'inc', 'fpg', 'fnx', 'fnt', 'txt'] },
                { name: 'Todos los Archivos', extensions: ['*'] }
              ]
            });
            if (!res.canceled && res.filePaths.length > 0) {
              const filePath = res.filePaths[0];
              const ext = path.extname(filePath).toLowerCase();
              if (ext === '.fpg' || ext === '.fnx' || ext === '.fnt') {
                const buffer = fs.readFileSync(filePath);
                mainWindow.webContents.send('open-binary-file', { filePath, data: Array.from(buffer), ext });
              } else {
                const content = fs.readFileSync(filePath, 'utf-8');
                mainWindow.webContents.send('open-text-file', { filePath, content });
              }
            }
          }
        },
        {
          label: 'Guardar',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow?.webContents.send('menu-save-file')
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: 'Editar',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'BennuGD2',
      submenu: [
        {
          label: 'Compilar y Ejecutar',
          accelerator: 'F5',
          click: () => mainWindow?.webContents.send('menu-compile-run')
        },
        {
          label: 'Solo Compilar (bgdc)',
          accelerator: 'CmdOrCtrl+B',
          click: () => mainWindow?.webContents.send('menu-compile')
        }
      ]
    },
    {
      label: 'Ver',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// IPC Handlers
ipcMain.handle('save-file', async (_event, { filePath, content }) => {
  try {
    let target = filePath;
    if (!target) {
      if (!mainWindow) return null;
      const res = await dialog.showSaveDialog(mainWindow, {
        filters: [{ name: 'BennuGD Source', extensions: ['prg', 'inc'] }]
      });
      if (res.canceled || !res.filePath) return null;
      target = res.filePath;
    }
    fs.writeFileSync(target, content, 'utf-8');
    return { success: true, filePath: target };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('save-binary-file', async (_event, { filePath, data }) => {
  try {
    const buffer = Buffer.from(data);
    fs.writeFileSync(filePath, buffer);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('run-compiler', async (_event, { filePath, debug }) => {
  return new Promise((resolve) => {
    const workDir = path.dirname(filePath);
    const args = debug ? ['-g', filePath] : [filePath];
    const proc = spawn('bgdc', args, { cwd: workDir, shell: true });

    let output = '';
    proc.stdout?.on('data', (d) => output += d.toString());
    proc.stderr?.on('data', (d) => output += d.toString());

    proc.on('close', (code) => {
      resolve({ code, output });
    });

    proc.on('error', (err) => {
      resolve({ code: -1, output: `Error al ejecutar bgdc: ${err.message}` });
    });
  });
});

ipcMain.handle('run-interpreter', async (_event, { dcbPath }) => {
  const workDir = path.dirname(dcbPath);
  const proc = spawn('bgdi', [dcbPath], { cwd: workDir, shell: true });
  proc.stdout?.on('data', (d) => mainWindow?.webContents.send('console-log', d.toString()));
  proc.stderr?.on('data', (d) => mainWindow?.webContents.send('console-err', d.toString()));
  return { started: true };
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
