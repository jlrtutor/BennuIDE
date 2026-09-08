import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('bennuAPI', {
  saveFile: (args: { filePath: string; content: string }) => ipcRenderer.invoke('save-file', args),
  saveBinaryFile: (args: { filePath: string; data: number[] }) => ipcRenderer.invoke('save-binary-file', args),
  runCompiler: (args: { filePath: string; debug?: boolean }) => ipcRenderer.invoke('run-compiler', args),
  runInterpreter: (args: { dcbPath: string }) => ipcRenderer.invoke('run-interpreter', args),
  onOpenTextFile: (callback: (data: { filePath: string; content: string }) => void) => {
    ipcRenderer.on('open-text-file', (_event, value) => callback(value));
  },
  onOpenBinaryFile: (callback: (data: { filePath: string; data: number[]; ext: string }) => void) => {
    ipcRenderer.on('open-binary-file', (_event, value) => callback(value));
  },
  onMenuAction: (channel: string, callback: () => void) => {
    ipcRenderer.on(channel, () => callback());
  },
  onConsoleLog: (callback: (msg: string) => void) => {
    ipcRenderer.on('console-log', (_event, val) => callback(val));
  },
  onConsoleErr: (callback: (msg: string) => void) => {
    ipcRenderer.on('console-err', (_event, val) => callback(val));
  }
});
