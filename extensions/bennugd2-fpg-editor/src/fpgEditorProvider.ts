import * as vscode from 'vscode';
import * as path from 'path';
import { FpgParser, FpgFile, FpgSprite } from './fpgParser';

class FpgDocument implements vscode.CustomDocument {
  public readonly uri: vscode.Uri;
  public fpg: FpgFile;

  constructor(uri: vscode.Uri, initialData: Uint8Array) {
    this.uri = uri;
    if (initialData.length > 0) {
      this.fpg = FpgParser.parse(initialData);
    } else {
      this.fpg = {
        bpp: 32,
        sprites: []
      };
    }
  }

  dispose(): void {}
}

export class FpgEditorProvider implements vscode.CustomEditorProvider<FpgDocument> {
  public static readonly viewType = 'bennugd2.fpgEditor';

  private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<vscode.CustomDocumentEditEvent<FpgDocument>>();
  public readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

  private _lastImageFolderUri?: vscode.Uri;
  private _lastFpgFolderUri?: vscode.Uri;

  constructor(private readonly context: vscode.ExtensionContext) {
    const savedImg = this.context.globalState.get<string>('fpgLastImageFolder');
    if (savedImg) {
      this._lastImageFolderUri = vscode.Uri.file(savedImg);
    }
    const savedFpg = this.context.globalState.get<string>('fpgLastFpgFolder');
    if (savedFpg) {
      this._lastFpgFolderUri = vscode.Uri.file(savedFpg);
    }
  }

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new FpgEditorProvider(context);
    return vscode.window.registerCustomEditorProvider(FpgEditorProvider.viewType, provider, {
      webviewOptions: {
        retainContextWhenHidden: true
      },
      supportsMultipleEditorsPerDocument: false
    });
  }

  async openCustomDocument(
    uri: vscode.Uri,
    _openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken
  ): Promise<FpgDocument> {
    try {
      const data = await vscode.workspace.fs.readFile(uri);
      return new FpgDocument(uri, data);
    } catch (err: any) {
      vscode.window.showErrorMessage(`Error al leer archivo FPG (${path.basename(uri.fsPath)}): ${err?.message || err}`);
      return new FpgDocument(uri, new Uint8Array(0));
    }
  }

  async resolveCustomEditor(
    document: FpgDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.file(path.join(this.context.extensionPath, 'media'))
      ]
    };

    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview, path.basename(document.uri.fsPath));

    const sendFpgData = () => {
      const payload = {
        type: 'init',
        filename: path.basename(document.uri.fsPath),
        bpp: document.fpg.bpp,
        sprites: document.fpg.sprites.map(s => ({
          code: s.code,
          description: s.description,
          filename: s.filename,
          width: s.width,
          height: s.height,
          controlPoints: s.controlPoints,
          rgbaData: Array.from(s.rgbaData)
        }))
      };
      webviewPanel.webview.postMessage(payload);
    };

    webviewPanel.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'ready':
          sendFpgData();
          break;

        case 'save':
          await this.saveCustomDocument(document, new vscode.CancellationTokenSource().token);
          vscode.window.showInformationMessage(`Guardado: ${path.basename(document.uri.fsPath)}`);
          break;

        case 'saveAs': {
          const target = await vscode.window.showSaveDialog({
            filters: { 'BennuGD FPG': ['fpg', 'FPG'] },
            defaultUri: document.uri
          });
          if (target) {
            await this.saveCustomDocumentAs(document, target, new vscode.CancellationTokenSource().token);
            vscode.window.showInformationMessage(`Guardado como: ${path.basename(target.fsPath)}`);
          }
          break;
        }

        case 'openFile': {
          let defaultUri = this._lastFpgFolderUri;
          if (!defaultUri && document.uri.scheme === 'file') {
            defaultUri = vscode.Uri.file(path.dirname(document.uri.fsPath));
          }
          const selected = await vscode.window.showOpenDialog({
            filters: { 'BennuGD FPG': ['fpg', 'map', 'FPG', 'MAP'] },
            canSelectMany: false,
            defaultUri
          });
          if (selected && selected[0]) {
            this._lastFpgFolderUri = vscode.Uri.file(path.dirname(selected[0].fsPath));
            await this.context.globalState.update('fpgLastFpgFolder', this._lastFpgFolderUri.fsPath);
            await vscode.commands.executeCommand('vscode.openWith', selected[0], FpgEditorProvider.viewType);
          }
          break;
        }

        case 'selectImages': {
          let defaultUri = this._lastImageFolderUri;
          if (!defaultUri && document.uri.scheme === 'file') {
            defaultUri = vscode.Uri.file(path.dirname(document.uri.fsPath));
          }
          const selectedUris = await vscode.window.showOpenDialog({
            canSelectMany: true,
            canSelectFiles: true,
            canSelectFolders: false,
            openLabel: 'Seleccionar Gráficos',
            filters: {
              'Imágenes soportadas (*.png, *.bmp, *.jpg)': ['png', 'bmp', 'jpg', 'jpeg', 'PNG', 'BMP', 'JPG', 'JPEG']
            },
            defaultUri
          });

          if (selectedUris && selectedUris.length > 0) {
            this._lastImageFolderUri = vscode.Uri.file(path.dirname(selectedUris[0].fsPath));
            await this.context.globalState.update('fpgLastImageFolder', this._lastImageFolderUri.fsPath);

            const filesData: { filename: string; dataUrl: string }[] = [];
            for (const uri of selectedUris) {
              try {
                const fileBytes = await vscode.workspace.fs.readFile(uri);
                const base64 = Buffer.from(fileBytes).toString('base64');
                const ext = path.extname(uri.fsPath).toLowerCase();
                let mime = 'image/png';
                if (ext === '.bmp') mime = 'image/bmp';
                else if (ext === '.jpg' || ext === '.jpeg') mime = 'image/jpeg';

                filesData.push({
                  filename: path.basename(uri.fsPath),
                  dataUrl: `data:${mime};base64,${base64}`
                });
              } catch (e) {
                console.error('Error al leer imagen:', uri.fsPath, e);
              }
            }

            webviewPanel.webview.postMessage({
              type: 'imagesLoadedFromDisk',
              files: filesData
            });
          }
          break;
        }

        case 'newFile': {
          const confirm = await vscode.window.showWarningMessage(
            '¿Crear un nuevo archivo FPG vacío? Se perderán los cambios no guardados en el archivo actual.',
            'Crear Nuevo',
            'Cancelar'
          );
          if (confirm === 'Crear Nuevo') {
            document.fpg = {
              bpp: message.bpp || 32,
              sprites: []
            };
            this._onDidChangeCustomDocument.fire({
              document,
              undo: () => {},
              redo: () => {}
            });
            sendFpgData();
          }
          break;
        }

        case 'updateSprite': {
          const spriteIndex = message.index;
          if (document.fpg.sprites[spriteIndex]) {
            const target = document.fpg.sprites[spriteIndex];
            if (message.code !== undefined) target.code = message.code;
            if (message.description !== undefined) target.description = message.description;
            if (message.controlPoints !== undefined) target.controlPoints = message.controlPoints;
            this._onDidChangeCustomDocument.fire({
              document,
              undo: () => {},
              redo: () => {}
            });
          }
          break;
        }

        case 'deleteSprite': {
          let deleteIndex = -1;
          if (message.code !== undefined) {
            deleteIndex = document.fpg.sprites.findIndex(s => s.code === message.code);
          } else if (message.index !== undefined) {
            deleteIndex = message.index;
          }

          if (deleteIndex >= 0 && document.fpg.sprites[deleteIndex]) {
            const deletedCode = document.fpg.sprites[deleteIndex].code;
            document.fpg.sprites.splice(deleteIndex, 1);
            this._onDidChangeCustomDocument.fire({
              document,
              undo: () => {},
              redo: () => {}
            });
            sendFpgData();
            vscode.window.showInformationMessage(`Gráfico ID #${deletedCode} eliminado.`);
          } else {
            vscode.window.showErrorMessage(`No se encontró ningún gráfico con el ID solicitado.`);
          }
          break;
        }

        case 'addSprites':
        case 'addSprite': {
          const rawSprites = message.sprites || (message.code !== undefined ? [{
            code: message.code,
            description: message.description,
            filename: message.filename,
            width: message.width,
            height: message.height,
            rgbaData: message.rgbaData
          }] : []);

          let addedCount = 0;
          let overwrittenCount = 0;

          for (const item of rawSprites) {
            const targetCode = parseInt(item.code, 10);
            const existingIndex = document.fpg.sprites.findIndex(s => s.code === targetCode);

            const newSprite: FpgSprite = {
              code: targetCode,
              description: item.description || `Sprite ${targetCode}`,
              filename: item.filename || `sprite_${targetCode}.png`,
              width: item.width,
              height: item.height,
              controlPoints: item.controlPoints || [],
              rgbaData: new Uint8Array(item.rgbaData)
            };

            if (existingIndex >= 0) {
              document.fpg.sprites[existingIndex] = newSprite;
              overwrittenCount++;
            } else {
              document.fpg.sprites.push(newSprite);
              addedCount++;
            }
          }

          document.fpg.sprites.sort((a, b) => a.code - b.code);

          this._onDidChangeCustomDocument.fire({
            document,
            undo: () => {},
            redo: () => {}
          });
          sendFpgData();

          if (rawSprites.length === 1) {
            if (overwrittenCount > 0) {
              vscode.window.showInformationMessage(`Gráfico ID #${rawSprites[0].code} sobrescrito.`);
            } else {
              vscode.window.showInformationMessage(`Nuevo gráfico ID #${rawSprites[0].code} añadido.`);
            }
          } else if (rawSprites.length > 1) {
            vscode.window.showInformationMessage(`Se han procesado ${rawSprites.length} gráficos (${addedCount} nuevos, ${overwrittenCount} sobrescritos).`);
          }
          break;
        }
      }
    });
  }

  async saveCustomDocument(document: FpgDocument, _cancellation: vscode.CancellationToken): Promise<void> {
    const serialized = FpgParser.serialize(document.fpg);
    await vscode.workspace.fs.writeFile(document.uri, serialized);
  }

  async saveCustomDocumentAs(document: FpgDocument, targetResource: vscode.Uri, _cancellation: vscode.CancellationToken): Promise<void> {
    const serialized = FpgParser.serialize(document.fpg);
    await vscode.workspace.fs.writeFile(targetResource, serialized);
  }

  async revertCustomDocument(document: FpgDocument, _cancellation: vscode.CancellationToken): Promise<void> {
    const data = await vscode.workspace.fs.readFile(document.uri);
    document.fpg = FpgParser.parse(data);
  }

  async backupCustomDocument(document: FpgDocument, context: vscode.CustomDocumentBackupContext, _cancellation: vscode.CancellationToken): Promise<vscode.CustomDocumentBackup> {
    const serialized = FpgParser.serialize(document.fpg);
    await vscode.workspace.fs.writeFile(context.destination, serialized);
    return {
      id: context.destination.toString(),
      delete: () => vscode.workspace.fs.delete(context.destination)
    };
  }

  private getHtmlForWebview(_webview: vscode.Webview, currentFileName: string): string {
    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BennuGD FPG Editor</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background, #1e1e1e);
      --fg: var(--vscode-editor-foreground, #d4d4d4);
      --card-bg: var(--vscode-editorWidget-background, #252526);
      --card-border: var(--vscode-widget-border, #3c3c3c);
      --toolbar-bg: var(--vscode-editorGroupHeader-tabsBackground, #2d2d2d);
      --accent: var(--vscode-button-background, #007acc);
      --accent-hover: var(--vscode-button-hoverBackground, #0062a3);
      --selection: var(--vscode-list-activeSelectionBackground, #094771);
      --hover-bg: var(--vscode-list-hoverBackground, #2a2d2e);
      --danger: #e05252;
      --danger-hover: #c93b3b;
      --warning: #f1c40f;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    body { background: var(--bg); color: var(--fg); height: 100vh; display: flex; flex-direction: column; overflow: hidden; user-select: none; }

    /* Top Toolbar */
    .top-toolbar {
      height: 48px;
      background: var(--toolbar-bg);
      border-bottom: 1px solid var(--card-border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 12px;
      gap: 12px;
      flex-shrink: 0;
    }
    .toolbar-left, .toolbar-right, .toolbar-group {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .file-badge {
      font-size: 13px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 6px;
      padding-right: 10px;
      border-right: 1px solid var(--card-border);
    }
    .bpp-pill {
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 10px;
      background: #007acc;
      color: #fff;
      font-weight: bold;
    }
    .tool-btn {
      background: transparent;
      border: 1px solid transparent;
      color: var(--fg);
      padding: 6px 8px;
      border-radius: 4px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      transition: 0.15s;
    }
    .tool-btn:hover {
      background: var(--hover-bg);
      border-color: var(--card-border);
    }
    .tool-btn.active {
      background: var(--accent);
      color: #fff;
      border-color: var(--accent);
    }
    .tool-btn.danger:hover {
      background: var(--danger);
      color: #fff;
    }
    .tool-btn svg {
      width: 16px;
      height: 16px;
      fill: currentColor;
    }
    .divider {
      width: 1px;
      height: 24px;
      background: var(--card-border);
      margin: 0 4px;
    }

    /* Main Container (Split 60% / 40%) */
    .main-layout {
      flex: 1;
      display: flex;
      overflow: hidden;
    }
    .left-pane {
      width: 60%;
      min-width: 320px;
      border-right: 1px solid var(--card-border);
      display: flex;
      flex-direction: column;
      background: var(--bg);
    }
    .right-pane {
      width: 40%;
      min-width: 280px;
      display: flex;
      flex-direction: column;
      background: var(--card-bg);
      overflow-y: auto;
    }

    /* Left Pane: List Header & Views */
    .list-header {
      padding: 8px 12px;
      background: var(--card-bg);
      border-bottom: 1px solid var(--card-border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .search-input {
      background: var(--bg);
      border: 1px solid var(--card-border);
      color: var(--fg);
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      width: 180px;
      outline: none;
    }
    .search-input:focus {
      border-color: var(--accent);
    }

    .list-container {
      flex: 1;
      overflow-y: auto;
      padding: 10px;
    }

    /* Grid View: 8 Thumbs per row default */
    .thumbs-grid {
      display: grid;
      grid-template-columns: repeat(8, 1fr);
      gap: 8px;
      align-content: start;
    }
    @media (max-width: 1100px) {
      .thumbs-grid { grid-template-columns: repeat(6, 1fr); }
    }
    @media (max-width: 800px) {
      .thumbs-grid { grid-template-columns: repeat(4, 1fr); }
    }
    .grid-card {
      background: var(--card-bg);
      border: 2px solid transparent;
      border-radius: 6px;
      padding: 4px;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      align-items: center;
      transition: all 0.15s;
    }
    .grid-card:hover {
      background: var(--hover-bg);
      border-color: var(--card-border);
    }
    .grid-card.selected {
      border-color: var(--accent);
      background: var(--selection);
    }
    .grid-card canvas {
      width: 100%;
      aspect-ratio: 1;
      object-fit: contain;
      image-rendering: pixelated;
      background: repeating-conic-gradient(#333 0% 25%, #222 0% 50%) 50% / 12px 12px;
      border-radius: 4px;
    }
    .grid-card .id-label {
      font-size: 11px;
      font-weight: bold;
      margin-top: 4px;
      color: var(--fg);
    }

    /* Table / List View */
    .list-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    .list-table th {
      text-align: left;
      padding: 6px 10px;
      background: var(--toolbar-bg);
      border-bottom: 1px solid var(--card-border);
      color: #999;
      font-size: 11px;
      text-transform: uppercase;
    }
    .list-table td {
      padding: 6px 10px;
      border-bottom: 1px solid var(--card-border);
      vertical-align: middle;
    }
    .list-table tr {
      cursor: pointer;
      transition: 0.1s;
    }
    .list-table tr:hover {
      background: var(--hover-bg);
    }
    .list-table tr.selected {
      background: var(--selection);
      font-weight: 600;
    }
    .list-table canvas {
      width: 36px;
      height: 36px;
      object-fit: contain;
      image-rendering: pixelated;
      background: repeating-conic-gradient(#333 0% 25%, #222 0% 50%) 50% / 8px 8px;
      border-radius: 4px;
      display: block;
    }

    /* Right Pane: Detail & Zoom View */
    .detail-header {
      padding: 10px 14px;
      border-bottom: 1px solid var(--card-border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: var(--toolbar-bg);
    }
    .zoom-controls {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .zoom-select {
      background: var(--bg);
      border: 1px solid var(--card-border);
      color: var(--fg);
      padding: 3px 6px;
      border-radius: 4px;
      font-size: 11px;
      outline: none;
    }

    .preview-stage {
      height: 200px;
      min-height: 80px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      overflow: auto;
      background: #181818;
      padding: 10px;
    }
    .preview-resizer {
      height: 6px;
      background: var(--toolbar-bg);
      border-top: 1px solid var(--card-border);
      border-bottom: 1px solid var(--card-border);
      cursor: row-resize;
      user-select: none;
      flex-shrink: 0;
      transition: background 0.15s;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .preview-resizer::after {
      content: '';
      width: 32px;
      height: 2px;
      background: #555;
      border-radius: 1px;
    }
    .preview-resizer:hover, .preview-resizer.dragging {
      background: var(--accent);
    }
    .preview-resizer:hover::after, .preview-resizer.dragging::after {
      background: #fff;
    }
    .preview-canvas-wrapper {
      position: relative;
      box-shadow: 0 4px 16px rgba(0,0,0,0.6);
      background: repeating-conic-gradient(#2c2c2c 0% 25%, #1e1e1e 0% 50%) 50% / 16px 16px;
      border: 1px solid #444;
      display: inline-block;
      cursor: crosshair;
    }
    .preview-canvas {
      display: block;
      image-rendering: pixelated;
    }
    .coords-badge {
      position: absolute;
      bottom: 8px;
      right: 8px;
      background: rgba(0,0,0,0.75);
      border: 1px solid #444;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-family: monospace;
      color: #00ffcc;
      pointer-events: none;
    }

    .props-panel {
      padding: 10px 14px;
      border-top: 1px solid var(--card-border);
      display: flex;
      flex-direction: column;
      gap: 8px;
      background: var(--card-bg);
      flex: 1;
      overflow-y: auto;
    }
    .props-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
    }
    .prop-field {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .prop-field label {
      font-size: 10px;
      text-transform: uppercase;
      color: #888;
      font-weight: bold;
    }
    .prop-field input {
      background: var(--bg);
      border: 1px solid var(--card-border);
      color: var(--fg);
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 11px;
    }
    .prop-field input:focus {
      border-color: var(--accent);
      outline: none;
    }

    /* Control Points Manager */
    .cp-manager-container {
      display: flex;
      gap: 10px;
      background: var(--bg);
      border: 1px solid var(--card-border);
      border-radius: 6px;
      padding: 8px;
      align-items: stretch;
    }
    .cp-table-col {
      flex: 1.1;
      min-width: 140px;
      height: 125px;
      display: flex;
      flex-direction: column;
      border: 1px solid var(--card-border);
      border-radius: 4px;
      background: var(--card-bg);
      overflow: hidden;
    }
    .cp-table-header {
      display: flex;
      background: var(--toolbar-bg);
      padding: 3px 6px;
      font-size: 10px;
      font-weight: bold;
      text-transform: uppercase;
      color: #888;
      border-bottom: 1px solid var(--card-border);
    }
    .cp-table-body {
      flex: 1;
      overflow-y: auto;
    }
    .cp-table-row {
      display: flex;
      align-items: center;
      padding: 2px 6px;
      font-size: 11px;
      font-family: monospace;
      cursor: pointer;
      border-bottom: 1px solid rgba(255,255,255,0.04);
      transition: 0.1s;
    }
    .cp-table-row:hover {
      background: var(--hover-bg);
    }
    .cp-table-row.selected {
      background: var(--selection);
      color: #fff;
      font-weight: bold;
    }
    .cp-table-row.cp0 {
      border-left: 3px solid #ff3333;
    }
    .cp-controls-col {
      flex: 1.3;
      display: flex;
      flex-direction: column;
      gap: 6px;
      justify-content: space-between;
    }
    .cp-inputs-row {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .cp-input-group {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .cp-input-group label {
      font-size: 10px;
      font-weight: bold;
      color: #aaa;
    }
    .cp-input-group input {
      width: 52px;
      background: var(--bg);
      border: 1px solid var(--card-border);
      color: var(--fg);
      padding: 2px 5px;
      border-radius: 4px;
      font-size: 11px;
      font-family: monospace;
    }
    .cp-input-group input:focus {
      border-color: var(--accent);
      outline: none;
    }
    .cp-actions-row {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .cp-preset-grid {
      display: grid;
      grid-template-columns: repeat(3, 20px);
      grid-template-rows: repeat(3, 20px);
      gap: 3px;
      padding: 4px;
      background: #181818;
      border: 1px solid var(--card-border);
      border-radius: 6px;
      align-self: flex-start;
    }
    .cp-preset-btn {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      border: 1px solid #555;
      background: #2a2a2a;
      cursor: pointer;
      transition: all 0.15s;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
    }
    .cp-preset-btn:hover {
      border-color: #00ffcc;
      background: #007acc;
      transform: scale(1.15);
    }
    .cp-preset-btn.active {
      border-color: #00ffcc;
      background: #00ffcc;
      box-shadow: 0 0 6px #00ffcc;
    }
    .cp-preset-btn.center::after {
      content: '';
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: #aaa;
    }
    .cp-preset-btn.center:hover::after, .cp-preset-btn.center.active::after {
      background: #000;
    }
    .cp-btn-stack {
      display: flex;
      flex-direction: column;
      gap: 3px;
      flex: 1;
    }

    /* Animation Player Panel */
    .anim-panel {
      padding: 12px 14px;
      border-top: 1px solid var(--card-border);
      display: flex;
      flex-direction: column;
      gap: 10px;
      background: var(--card-bg);
    }
    .anim-header-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .anim-controls-row {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    .anim-thumb-strip {
      display: flex;
      gap: 6px;
      overflow-x: auto;
      padding: 6px 4px;
      background: var(--bg);
      border: 1px solid var(--card-border);
      border-radius: 6px;
      min-height: 52px;
      align-items: center;
    }
    .anim-thumb-item {
      flex-shrink: 0;
      width: 44px;
      height: 44px;
      background: var(--card-bg);
      border: 2px solid transparent;
      border-radius: 4px;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      position: relative;
      padding: 2px;
      transition: 0.1s;
    }
    .anim-thumb-item:hover {
      border-color: var(--card-border);
    }
    .anim-thumb-item.active {
      border-color: #00ffcc;
      background: var(--selection);
      box-shadow: 0 0 6px rgba(0, 255, 204, 0.4);
    }
    .anim-thumb-item canvas {
      width: 32px;
      height: 32px;
      object-fit: contain;
      image-rendering: pixelated;
    }
    .anim-thumb-item .thumb-num {
      font-size: 8px;
      position: absolute;
      bottom: 1px;
      right: 2px;
      color: #aaa;
      font-weight: bold;
    }

    /* Modal dialogs */
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.65);
      backdrop-filter: blur(2px);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 999;
    }
    .modal-backdrop.active {
      display: flex;
    }
    .modal-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      width: 440px;
      max-width: 90vw;
      max-height: 85vh;
      box-shadow: 0 10px 30px rgba(0,0,0,0.7);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      animation: modalIn 0.15s ease-out;
    }
    @keyframes modalIn {
      from { transform: scale(0.95); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }
    .modal-header {
      padding: 12px 16px;
      background: var(--toolbar-bg);
      border-bottom: 1px solid var(--card-border);
      font-weight: 600;
      font-size: 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .modal-body {
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      overflow-y: auto;
    }
    .modal-footer {
      padding: 10px 16px;
      background: var(--toolbar-bg);
      border-top: 1px solid var(--card-border);
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
    .btn {
      background: var(--accent);
      color: #fff;
      border: none;
      padding: 6px 14px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
    }
    .btn:hover { background: var(--accent-hover); }
    .btn:disabled, .btn.disabled {
      opacity: 0.4;
      cursor: not-allowed;
      pointer-events: none;
    }
    .btn-secondary { background: #444; }
    .btn-secondary:hover { background: #555; }
    .btn-danger { background: var(--danger); }
    .btn-danger:hover { background: var(--danger-hover); }

    .warning-box {
      background: rgba(241, 196, 15, 0.15);
      border: 1px solid var(--warning);
      color: #fce38a;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 12px;
      display: none;
    }

    /* Multi Thumbnail Preview Grid in Add Modal */
    .multi-thumb-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(68px, 1fr));
      gap: 8px;
      max-height: 180px;
      overflow-y: auto;
      padding: 8px;
      background: var(--bg);
      border: 1px solid var(--card-border);
      border-radius: 6px;
    }
    .multi-thumb-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 4px;
      padding: 4px;
      position: relative;
    }
    .multi-thumb-card.collision {
      border-color: var(--warning);
      background: rgba(241, 196, 15, 0.08);
    }
    .multi-thumb-card canvas {
      width: 50px;
      height: 50px;
      object-fit: contain;
      image-rendering: pixelated;
      background: repeating-conic-gradient(#333 0% 25%, #222 0% 50%) 50% / 8px 8px;
      border-radius: 3px;
    }
    .multi-thumb-card .thumb-id-tag {
      font-size: 10px;
      font-weight: bold;
      margin-top: 3px;
      color: #00ffcc;
    }
    .multi-thumb-card.collision .thumb-id-tag {
      color: #f1c40f;
    }

    .thumb-preview-box {
      border: 1px solid var(--card-border);
      border-radius: 6px;
      padding: 8px;
      display: flex;
      align-items: center;
      gap: 12px;
      background: var(--bg);
      margin-top: 4px;
    }
    .thumb-preview-box canvas {
      width: 48px;
      height: 48px;
      object-fit: contain;
      image-rendering: pixelated;
      background: repeating-conic-gradient(#333 0% 25%, #222 0% 50%) 50% / 8px 8px;
      border-radius: 4px;
    }
  </style>
</head>
<body>

  <!-- Top Toolbar -->
  <div class="top-toolbar">
    <div class="toolbar-left">
      <div class="file-badge">
        <span>🎨 ${currentFileName}</span>
        <span class="bpp-pill" id="bppBadge">32 BPP</span>
      </div>

      <div class="toolbar-group">
        <button class="tool-btn" onclick="openNewModal()" title="Nuevo archivo FPG">
          <svg viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zM6 20V4h7v5h5v11H6z"/></svg>
        </button>

        <button class="tool-btn" onclick="triggerOpenFile()" title="Abrir archivo .fpg">
          <svg viewBox="0 0 24 24"><path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z"/></svg>
        </button>

        <button class="tool-btn" onclick="triggerSave()" title="Guardar cambios">
          <svg viewBox="0 0 24 24"><path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/></svg>
        </button>

        <button class="tool-btn" onclick="triggerSaveAs()" title="Guardar como...">
          <svg viewBox="0 0 24 24"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM19 18H6c-2.21 0-4-1.79-4-4 0-2.05 1.53-3.76 3.56-3.97l1.07-.11.5-.95C8.08 7.14 9.94 6 12 6c2.62 0 4.88 1.86 5.39 4.43l.3 1.5 1.53.11c1.56.1 2.78 1.41 2.78 2.96 0 1.65-1.35 3-3 3zm-5.5-5.5V9h-3v3.5H8l4 4 4-4h-2.5z"/></svg>
        </button>
      </div>

      <div class="divider"></div>

      <!-- View Switchers & Tools -->
      <div class="toolbar-group">
        <button class="tool-btn active" id="btnViewGrid" onclick="setViewMode('grid')" title="Vista en cuadrícula">
          <svg viewBox="0 0 24 24"><path d="M4 11h5V5H4v6zm0 7h5v-6H4v6zm6 0h5v-6h-5v6zm6 0h5v-6h-5v6zm-6-7h5V5h-5v6zm6-6v6h5V5h-5z"/></svg>
        </button>

        <button class="tool-btn" id="btnViewList" onclick="setViewMode('list')" title="Vista en lista detallada">
          <svg viewBox="0 0 24 24"><path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/></svg>
        </button>

        <button class="tool-btn" id="btnAnimateToolbar" onclick="toggleAnimation()" title="Animar gráficos seleccionados">
          <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        </button>
      </div>
    </div>

    <!-- Right action icons -->
    <div class="toolbar-right">
      <button class="tool-btn" style="background:#007acc; color:#fff;" onclick="openAddModal()" title="Añadir gráfico(s)">
        <svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
      </button>

      <button class="tool-btn danger" onclick="openDeleteModal()" title="Eliminar gráfico seleccionado o por ID">
        <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
      </button>
    </div>
  </div>

  <!-- Main 60% / 40% Split -->
  <div class="main-layout">
    <!-- Left Pane: 60% -->
    <div class="left-pane">
      <div class="list-header">
        <div style="display:flex; align-items:center; gap:8px;">
          <div style="font-size:12px; font-weight:bold;">
            GRÁFICOS (<span id="countBadge">0</span>)
          </div>
          <span id="selectedCountBadgeHeader" style="font-size:11px; color:#00ffcc; font-weight:600; display:none;">0 sel.</span>
        </div>
        <div style="display:flex; align-items:center; gap:6px;">
          <button class="btn btn-secondary" id="btnAnimHeader" onclick="toggleAnimation()" style="font-size:11px; padding:3px 8px; display:none;" title="Animar gráficos seleccionados">
            ▶ Animar
          </button>
          <input type="text" id="searchInput" class="search-input" placeholder="🔍 Filtrar ID o nombre..." oninput="renderList()" />
        </div>
      </div>

      <div class="list-container" id="listContainer">
        <!-- Rendered by JS: Grid or List -->
      </div>
    </div>

    <!-- Right Pane: 40% (Detail & Preview) -->
    <div class="right-pane">
      <div class="detail-header">
        <div style="font-size:12px; font-weight:bold;" id="detailTitle">DETALLE DEL GRÁFICO</div>
        <div style="display:flex; align-items:center; gap:10px;">
          <label style="font-size:11px; color:#ddd; display:flex; align-items:center; gap:4px; cursor:pointer; user-select:none;">
            <input type="checkbox" id="chkShowCps" checked onchange="toggleShowCps(this.checked)" style="cursor:pointer;" />
            <span>Ver CPs (+)</span>
          </label>
          <div class="zoom-controls">
            <span style="font-size:11px; color:#888;">Zoom:</span>
            <select id="zoomSelect" class="zoom-select" onchange="setZoom(this.value)">
              <option value="0.5">50%</option>
              <option value="1" selected>100%</option>
              <option value="2">200%</option>
              <option value="3">300%</option>
              <option value="4">400%</option>
              <option value="6">600%</option>
              <option value="8">800%</option>
            </select>
          </div>
        </div>
      </div>

      <div class="preview-stage" id="previewStage">
        <div class="preview-canvas-wrapper" id="canvasWrapper">
          <canvas id="previewCanvas" class="preview-canvas"></canvas>
        </div>
        <div class="coords-badge" id="coordsBadge">X: 0 | Y: 0</div>
      </div>

      <!-- Marco divisorio regulable -->
      <div class="preview-resizer" id="rightPaneResizer" title="Arrastrar para ajustar tamaño del preview"></div>

      <div class="props-panel" id="propsPanel">
        <div class="props-grid">
          <div class="prop-field">
            <label>Código (Graph ID)</label>
            <input type="number" id="propCode" onchange="updateSelectedProp('code', parseInt(this.value, 10))" />
          </div>
          <div class="prop-field">
            <label>Dimensiones</label>
            <input type="text" id="propDims" readonly disabled />
          </div>
        </div>

        <div class="prop-field">
          <label>Nombre / Descripción</label>
          <input type="text" id="propDesc" onchange="updateSelectedProp('description', this.value)" />
        </div>

        <div class="prop-field">
          <label style="margin-bottom:2px;">Puntos de Control</label>
          <div class="cp-manager-container">
            <!-- Left Side: Table List of CPs -->
            <div class="cp-table-col">
              <div class="cp-table-header">
                <span style="width:52px;">Número</span>
                <span style="width:38px;">X</span>
                <span style="width:38px;">Y</span>
              </div>
              <div class="cp-table-body" id="cpTableBody"></div>
            </div>

            <!-- Right Side: Edit X,Y + 9-Preset Anchor Grid + Action Buttons -->
            <div class="cp-controls-col">
              <div class="cp-inputs-row">
                <div class="cp-input-group">
                  <label>X</label>
                  <input type="number" id="cpInputX" min="0" oninput="onCpCoordsInput()" />
                </div>
                <div class="cp-input-group">
                  <label>Y</label>
                  <input type="number" id="cpInputY" min="0" oninput="onCpCoordsInput()" />
                </div>
              </div>

              <div class="cp-actions-row">
                <!-- 3x3 Preset Grid -->
                <div class="cp-preset-grid" id="cpPresetGrid" title="Posiciones prestablecidas: 4 esquinas, 4 laterales y centro">
                  <button type="button" class="cp-preset-btn" onclick="applyPresetPosition(0, 0, this)" title="Superior Izquierda (0, 0)"></button>
                  <button type="button" class="cp-preset-btn" onclick="applyPresetPosition(0.5, 0, this)" title="Superior Centro"></button>
                  <button type="button" class="cp-preset-btn" onclick="applyPresetPosition(1, 0, this)" title="Superior Derecha"></button>

                  <button type="button" class="cp-preset-btn" onclick="applyPresetPosition(0, 0.5, this)" title="Centro Izquierda"></button>
                  <button type="button" class="cp-preset-btn center" onclick="applyPresetPosition(0.5, 0.5, this)" title="Centro (W/2, H/2)"></button>
                  <button type="button" class="cp-preset-btn" onclick="applyPresetPosition(1, 0.5, this)" title="Centro Derecha"></button>

                  <button type="button" class="cp-preset-btn" onclick="applyPresetPosition(0, 1, this)" title="Inferior Izquierda"></button>
                  <button type="button" class="cp-preset-btn" onclick="applyPresetPosition(0.5, 1, this)" title="Inferior Centro"></button>
                  <button type="button" class="cp-preset-btn" onclick="applyPresetPosition(1, 1, this)" title="Inferior Derecha"></button>
                </div>

                <!-- Action Button Stack -->
                <div class="cp-btn-stack">
                  <button type="button" class="btn disabled" id="btnAddCp" disabled onclick="addControlPointFromInputs()" style="padding:3px 8px; font-size:11px;" title="Selecciona una posición en la cuadrícula 3x3 para añadir un punto">
                    ➕ Añadir punto
                  </button>
                  <button type="button" class="btn btn-secondary" onclick="setRealCenterPoint()" style="padding:3px 8px; font-size:11px;" title="Centrar punto 0 (CP0)">
                    🎯 Poner Centro
                  </button>
                  <button type="button" class="btn btn-secondary" onclick="deleteSelectedControlPoint()" style="padding:3px 8px; font-size:11px; color:#ff7777;" title="Eliminar punto seleccionado">
                    🗑️ Eliminar punto
                  </button>
                  <button type="button" class="btn btn-secondary" onclick="resetAllControlPoints()" style="padding:2px 6px; font-size:10px; color:#aaa;" title="Borrar todos los puntos de control">
                    🧹 Borrar todos
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:6px;">
          <button class="btn btn-secondary" onclick="exportSelectedPng()">📥 Exportar PNG</button>
        </div>
      </div>

      <!-- Panel de Animación -->
      <div class="anim-panel" id="animPanel" style="display:none;">
        <div class="anim-header-bar">
          <span style="font-size:12px; font-weight:bold; color:#00ffcc;" id="animStatusTitle">ANIMACIÓN EN CURSO</span>
          <span style="font-size:11px; color:#aaa;" id="animFrameText">1 / 1</span>
        </div>

        <div class="anim-controls-row">
          <button class="btn" id="btnAnimPlayPause" onclick="toggleAnimPlayPause()" style="padding:4px 10px; font-size:11px;">⏸ Pausar</button>
          <button class="btn btn-secondary" onclick="stepAnimPrev()" style="padding:4px 8px; font-size:11px;" title="Fotograma anterior">⏮</button>
          <button class="btn btn-secondary" onclick="stepAnimNext()" style="padding:4px 8px; font-size:11px;" title="Fotograma siguiente">⏭</button>
          <button class="btn btn-secondary" onclick="stopAnimation()" style="padding:4px 10px; font-size:11px; color:#ff7777;" title="Salir de animación">⏹ Detener</button>

          <div style="display:flex; align-items:center; gap:4px; margin-left:auto;">
            <label style="font-size:11px; color:#aaa;">Velocidad:</label>
            <select id="animFpsSelect" class="zoom-select" onchange="setAnimFps(this.value)">
              <option value="1">1 FPS</option>
              <option value="2">2 FPS</option>
              <option value="4">4 FPS</option>
              <option value="6">6 FPS</option>
              <option value="8">8 FPS</option>
              <option value="10" selected>10 FPS</option>
              <option value="12">12 FPS</option>
              <option value="15">15 FPS</option>
              <option value="20">20 FPS</option>
              <option value="24">24 FPS</option>
              <option value="30">30 FPS</option>
              <option value="60">60 FPS</option>
            </select>
          </div>
        </div>

        <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
          <div style="display:flex; align-items:center; gap:6px;">
            <label style="font-size:11px; color:#aaa;">Modo:</label>
            <select id="animModeSelect" class="zoom-select" onchange="setAnimMode(this.value)">
              <option value="loop">🔁 Bucle Continuo</option>
              <option value="pingpong">🔀 Ida y Vuelta</option>
            </select>
          </div>
          <span style="font-size:10px; color:#888;">Haz clic en un fotograma para saltar a él</span>
        </div>

        <div class="anim-thumb-strip" id="animThumbStrip"></div>
      </div>
    </div>
  </div>

  <!-- Modal: Añadir Gráfico(s) con soporte múltiple e IDs sucesivos -->
  <div class="modal-backdrop" id="addModal">
    <div class="modal-card" style="width: 500px;">
      <div class="modal-header">
        <span>➕ Añadir Gráfico(s) al FPG</span>
        <button class="tool-btn" onclick="closeAddModal()">✕</button>
      </div>
      <div class="modal-body">
        <div class="prop-field">
          <label>Seleccionar Imagen(es) (PNG, BMP, JPG) - Permite selección múltiple</label>
          <div style="display:flex; gap:8px; align-items:center;">
            <button type="button" class="btn btn-secondary" onclick="triggerSelectImages()" style="flex:1; display:flex; align-items:center; justify-content:center; gap:6px; padding:7px 10px; font-weight:600;">
              📁 Examinar imágenes en disco...
            </button>
            <input type="file" id="addFileInput" accept="image/png,image/bmp,image/jpeg" multiple onchange="handleImagesSelected(this)" style="display:none;" />
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('addFileInput').click()" style="padding:7px 10px;" title="Seleccionar archivos mediante diálogo alternativo">
              🌐
            </button>
          </div>
        </div>

        <div class="props-grid">
          <div class="prop-field">
            <label>ID Inicial (Primer Gráfico)</label>
            <input type="number" id="addCodeInput" min="1" max="9999" oninput="updateAddIds()" />
          </div>
          <div class="prop-field">
            <label>Rango de IDs asignados</label>
            <input type="text" id="addRangeBadge" readonly disabled style="font-weight:bold; color:#00ffcc;" value="-" />
          </div>
        </div>

        <div class="prop-field" id="singleDescField">
          <label>Nombre / Descripción</label>
          <input type="text" id="addDescInput" placeholder="Descripción del sprite" />
        </div>

        <div class="warning-box" id="addWarningBox"></div>

        <div id="addPreviewSection" style="display:none;">
          <label style="font-size:10px; text-transform:uppercase; color:#888; font-weight:bold; margin-bottom:4px; display:block;">
            Previsualización y asignación de IDs (<span id="selectedCountBadge">0</span> imágenes)
          </label>
          <div class="multi-thumb-grid" id="addMultiGrid"></div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeAddModal()">Cancelar</button>
        <button class="btn" id="btnAddConfirm" onclick="confirmAddSprites()">Añadir Gráficos</button>
      </div>
    </div>
  </div>

  <!-- Modal: Eliminar Gráfico -->
  <div class="modal-backdrop" id="deleteModal">
    <div class="modal-card">
      <div class="modal-header">
        <span>🗑️ Eliminar Gráfico</span>
        <button class="tool-btn" onclick="closeDeleteModal()">✕</button>
      </div>
      <div class="modal-body">
        <p style="font-size:12px; color:#ccc;">Introduce el ID del gráfico que deseas eliminar:</p>
        <div class="prop-field">
          <label>Código / Graph ID a eliminar</label>
          <input type="number" id="deleteCodeInput" placeholder="Ej: 100" oninput="checkDeletePreview(this.value)" />
        </div>

        <!-- Dynamic thumbnail preview when typing ID -->
        <div class="thumb-preview-box" id="deletePreviewBox" style="display:none;">
          <canvas id="deletePreviewCanvas"></canvas>
          <div>
            <div style="font-weight:bold; font-size:12px;" id="deletePreviewTitle"></div>
            <div style="font-size:11px; color:#888;" id="deletePreviewMeta"></div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeDeleteModal()">Cancelar</button>
        <button class="btn btn-danger" id="btnDeleteConfirm" onclick="confirmDeleteSprite()">Eliminar</button>
      </div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    let fpgData = { bpp: 32, sprites: [] };
    let selectedIndex = 0;
    let selectedIndices = new Set([0]);
    let lastClickedIndex = 0;
    let viewMode = 'grid'; // 'grid' (8 por fila) o 'list'
    let currentZoom = 1;
    let selectedNewSprites = [];
    let showControlPoints = true;
    let selectedCpIndex = -1;
    let selectedPreset = null;

    // Estado de animación
    let isAnimating = false;
    let animTimer = null;
    let animFps = 10;
    let animMode = 'loop'; // 'loop' o 'pingpong'
    let animDirection = 1;
    let animCurrentStep = 0;
    let animFrames = [];
    let animIsPaused = false;

    // Listener de mensajes de VSCode
    window.addEventListener('message', event => {
      const msg = event.data;
      if (msg.type === 'init') {
        fpgData = msg;
        document.getElementById('bppBadge').innerText = fpgData.bpp + ' BPP';
        document.getElementById('countBadge').innerText = fpgData.sprites.length;
        selectedIndices = new Set(fpgData.sprites.length > 0 ? [Math.min(selectedIndex, fpgData.sprites.length - 1)] : []);
        renderList();
        if (fpgData.sprites.length > 0) {
          selectSprite(Math.min(selectedIndex, fpgData.sprites.length - 1));
        } else {
          clearDetail();
        }
      } else if (msg.type === 'imagesLoadedFromDisk') {
        loadImagesFromDataUrls(msg.files);
      }
    });

    vscode.postMessage({ type: 'ready' });

    function setViewMode(mode) {
      viewMode = mode;
      document.getElementById('btnViewGrid').classList.toggle('active', mode === 'grid');
      document.getElementById('btnViewList').classList.toggle('active', mode === 'list');
      renderList();
    }

    function renderList() {
      const container = document.getElementById('listContainer');
      const search = (document.getElementById('searchInput').value || '').trim().toLowerCase();

      const filtered = fpgData.sprites.map((s, idx) => ({ s, idx })).filter(({ s }) => {
        if (!search) return true;
        return s.code.toString().includes(search) || (s.description && s.description.toLowerCase().includes(search));
      });

      container.innerHTML = '';

      if (viewMode === 'grid') {
        const grid = document.createElement('div');
        grid.className = 'thumbs-grid';

        filtered.forEach(({ s, idx }) => {
          const card = document.createElement('div');
          card.className = 'grid-card ' + (selectedIndices.has(idx) ? 'selected' : '');
          card.dataset.index = idx;
          card.onclick = (e) => handleItemClick(idx, e);

          const canvas = document.createElement('canvas');
          canvas.width = s.width;
          canvas.height = s.height;
          const ctx = canvas.getContext('2d');
          const imgData = new ImageData(new Uint8ClampedArray(s.rgbaData), s.width, s.height);
          ctx.putImageData(imgData, 0, 0);

          const idLbl = document.createElement('div');
          idLbl.className = 'id-label';
          idLbl.innerText = s.code; // Sin '#'

          card.appendChild(canvas);
          card.appendChild(idLbl);
          grid.appendChild(card);
        });

        container.appendChild(grid);
      } else {
        const table = document.createElement('table');
        table.className = 'list-table';
        table.innerHTML = \`
          <thead>
            <tr>
              <th style="width:48px;">Thumb</th>
              <th style="width:70px;">ID</th>
              <th>Descripción</th>
              <th style="width:100px;">Dimensiones</th>
              <th style="width:60px;">CPs</th>
            </tr>
          </thead>
          <tbody></tbody>
        \`;
        const tbody = table.querySelector('tbody');

        filtered.forEach(({ s, idx }) => {
          const row = document.createElement('tr');
          row.className = (selectedIndices.has(idx) ? 'selected' : '');
          row.dataset.index = idx;
          row.onclick = (e) => handleItemClick(idx, e);

          const tdThumb = document.createElement('td');
          const canvas = document.createElement('canvas');
          canvas.width = s.width;
          canvas.height = s.height;
          const ctx = canvas.getContext('2d');
          const imgData = new ImageData(new Uint8ClampedArray(s.rgbaData), s.width, s.height);
          ctx.putImageData(imgData, 0, 0);
          tdThumb.appendChild(canvas);

          const tdId = document.createElement('td');
          tdId.innerText = s.code; // Sin '#'
          tdId.style.fontWeight = 'bold';

          const tdDesc = document.createElement('td');
          tdDesc.innerText = s.description || '-';

          const tdDims = document.createElement('td');
          tdDims.innerText = s.width + ' × ' + s.height;

          const tdCps = document.createElement('td');
          tdCps.innerText = s.controlPoints ? s.controlPoints.length : 0;

          row.appendChild(tdThumb);
          row.appendChild(tdId);
          row.appendChild(tdDesc);
          row.appendChild(tdDims);
          row.appendChild(tdCps);
          tbody.appendChild(row);
        });

        container.appendChild(table);
      }

      updateSelectionUI();
    }

    function handleItemClick(idx, event) {
      if (event && event.shiftKey) {
        // Selección por rango
        const start = Math.min(lastClickedIndex, idx);
        const end = Math.max(lastClickedIndex, idx);
        if (!event.ctrlKey && !event.metaKey) {
          selectedIndices.clear();
        }
        for (let i = start; i <= end; i++) {
          selectedIndices.add(i);
        }
      } else if (event && (event.ctrlKey || event.metaKey)) {
        // Alternar selección múltiple
        if (selectedIndices.has(idx)) {
          if (selectedIndices.size > 1) {
            selectedIndices.delete(idx);
          }
        } else {
          selectedIndices.add(idx);
        }
        lastClickedIndex = idx;
      } else {
        // Selección simple
        selectedIndices.clear();
        selectedIndices.add(idx);
        lastClickedIndex = idx;
      }

      selectedIndex = idx;
      updateSelectionUI();

      if (isAnimating) {
        updateAnimationFrames();
      } else {
        selectSprite(idx);
      }
    }

    function updateSelectionUI() {
      document.querySelectorAll('.grid-card').forEach((c) => {
        const i = parseInt(c.dataset.index, 10);
        c.classList.toggle('selected', selectedIndices.has(i));
      });
      document.querySelectorAll('.list-table tbody tr').forEach((r) => {
        const i = parseInt(r.dataset.index, 10);
        r.classList.toggle('selected', selectedIndices.has(i));
      });

      const count = selectedIndices.size;
      const headerBadge = document.getElementById('selectedCountBadgeHeader');
      const animHeaderBtn = document.getElementById('btnAnimHeader');
      const animToolbarBtn = document.getElementById('btnAnimateToolbar');

      if (count > 1) {
        headerBadge.innerText = count + ' sel.';
        headerBadge.style.display = 'inline-block';
        animHeaderBtn.innerText = '▶ Animar (' + count + ')';
        animHeaderBtn.style.display = 'inline-block';
        animToolbarBtn.title = 'Animar los ' + count + ' gráficos seleccionados';
      } else {
        headerBadge.style.display = 'none';
        animHeaderBtn.style.display = 'none';
        animToolbarBtn.title = 'Animar gráficos';
      }
    }

    function selectSprite(idx) {
      selectedIndex = idx;
      const s = fpgData.sprites[idx];
      if (!s) return;

      document.getElementById('detailTitle').innerText = 'GRÁFICO ' + s.code + ' (' + (s.description || 'Sin título') + ')';
      document.getElementById('propCode').value = s.code;
      document.getElementById('propDesc').value = s.description || '';
      document.getElementById('propDims').value = s.width + ' × ' + s.height + ' px';

      clearPresetSelection();
      selectedCpIndex = (s.controlPoints && s.controlPoints.length > 0) ? 0 : -1;

      renderPreview(s);
      renderPointsList(s);
    }

    // --- ANIMACIÓN ---
    function getSelectedSpritesForAnimation() {
      if (selectedIndices.size >= 2) {
        const sorted = Array.from(selectedIndices).sort((a, b) => {
          const sa = fpgData.sprites[a];
          const sb = fpgData.sprites[b];
          if (!sa || !sb) return a - b;
          return sa.code - sb.code;
        });
        return sorted.map(i => fpgData.sprites[i]).filter(Boolean);
      } else if (fpgData.sprites.length > 0) {
        const search = (document.getElementById('searchInput').value || '').trim().toLowerCase();
        return fpgData.sprites.filter(s => {
          if (!search) return true;
          return s.code.toString().includes(search) || (s.description && s.description.toLowerCase().includes(search));
        });
      }
      return [];
    }

    function startAnimation() {
      const frames = getSelectedSpritesForAnimation();
      if (frames.length === 0) {
        alert('No hay gráficos para animar.');
        return;
      }
      isAnimating = true;
      animIsPaused = false;
      animFrames = frames;
      animCurrentStep = 0;
      animDirection = 1;

      document.getElementById('propsPanel').style.display = 'none';
      document.getElementById('animPanel').style.display = 'flex';
      document.getElementById('btnAnimateToolbar').classList.add('active');
      const animHeaderBtn = document.getElementById('btnAnimHeader');
      if (animHeaderBtn) animHeaderBtn.classList.add('active');
      document.getElementById('btnAnimPlayPause').innerText = '⏸ Pausar';
      document.getElementById('detailTitle').innerText = 'ANIMACIÓN (' + animFrames.length + ' FOTOGRAMAS)';
      document.getElementById('animStatusTitle').innerText = 'ANIMANDO ' + animFrames.length + ' FOTOGRAMAS';

      renderAnimThumbStrip();
      runAnimLoop();
    }

    function stopAnimation() {
      isAnimating = false;
      animIsPaused = false;
      if (animTimer) {
        clearTimeout(animTimer);
        animTimer = null;
      }
      document.getElementById('animPanel').style.display = 'none';
      document.getElementById('propsPanel').style.display = 'flex';
      document.getElementById('btnAnimateToolbar').classList.remove('active');
      const animHeaderBtn = document.getElementById('btnAnimHeader');
      if (animHeaderBtn) animHeaderBtn.classList.remove('active');

      if (fpgData.sprites[selectedIndex]) {
        selectSprite(selectedIndex);
      }
    }

    function toggleAnimation() {
      if (isAnimating) {
        stopAnimation();
      } else {
        startAnimation();
      }
    }

    function toggleAnimPlayPause() {
      if (!isAnimating) return;
      animIsPaused = !animIsPaused;
      document.getElementById('btnAnimPlayPause').innerText = animIsPaused ? '▶ Reanudar' : '⏸ Pausar';
      if (!animIsPaused) {
        runAnimLoop();
      }
    }

    function setAnimFps(val) {
      animFps = Math.max(1, parseInt(val, 10) || 10);
    }

    function setAnimMode(val) {
      animMode = val;
    }

    function stepAnimPrev() {
      if (!isAnimating || animFrames.length === 0) return;
      animIsPaused = true;
      document.getElementById('btnAnimPlayPause').innerText = '▶ Reanudar';
      animCurrentStep = (animCurrentStep - 1 + animFrames.length) % animFrames.length;
      renderCurrentAnimFrame();
    }

    function stepAnimNext() {
      if (!isAnimating || animFrames.length === 0) return;
      animIsPaused = true;
      document.getElementById('btnAnimPlayPause').innerText = '▶ Reanudar';
      animCurrentStep = (animCurrentStep + 1) % animFrames.length;
      renderCurrentAnimFrame();
    }

    function jumpToAnimFrame(idx) {
      if (!isAnimating || !animFrames[idx]) return;
      animCurrentStep = idx;
      renderCurrentAnimFrame();
    }

    function updateAnimationFrames() {
      if (!isAnimating) return;
      animFrames = getSelectedSpritesForAnimation();
      if (animFrames.length === 0) {
        stopAnimation();
        return;
      }
      if (animCurrentStep >= animFrames.length) animCurrentStep = 0;
      document.getElementById('detailTitle').innerText = 'ANIMACIÓN (' + animFrames.length + ' FOTOGRAMAS)';
      document.getElementById('animStatusTitle').innerText = 'ANIMANDO ' + animFrames.length + ' FOTOGRAMAS';
      renderAnimThumbStrip();
      renderCurrentAnimFrame();
    }

    function renderAnimThumbStrip() {
      const strip = document.getElementById('animThumbStrip');
      strip.innerHTML = '';
      animFrames.forEach((s, idx) => {
        const item = document.createElement('div');
        item.className = 'anim-thumb-item ' + (idx === animCurrentStep ? 'active' : '');
        item.title = 'Fotograma ' + (idx + 1) + ' (ID ' + s.code + ' - ' + (s.description || '') + ')';
        item.onclick = () => jumpToAnimFrame(idx);

        const canvas = document.createElement('canvas');
        canvas.width = s.width;
        canvas.height = s.height;
        const ctx = canvas.getContext('2d');
        const imgData = new ImageData(new Uint8ClampedArray(s.rgbaData), s.width, s.height);
        ctx.putImageData(imgData, 0, 0);

        const num = document.createElement('div');
        num.className = 'thumb-num';
        num.innerText = s.code;

        item.appendChild(canvas);
        item.appendChild(num);
        strip.appendChild(item);
      });
    }

    function renderCurrentAnimFrame() {
      if (!animFrames || animFrames.length === 0) return;
      const s = animFrames[animCurrentStep] || animFrames[0];
      if (!s) return;

      const canvas = document.getElementById('previewCanvas');
      canvas.width = s.width;
      canvas.height = s.height;
      const ctx = canvas.getContext('2d');
      const imgData = new ImageData(new Uint8ClampedArray(s.rgbaData), s.width, s.height);
      ctx.putImageData(imgData, 0, 0);

      // CP0 center point indicator
      if (s.controlPoints && s.controlPoints.length > 0) {
        const pt = s.controlPoints[0];
        ctx.fillStyle = '#00ffcc';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      const wrapper = document.getElementById('canvasWrapper');
      wrapper.style.width = (s.width * currentZoom) + 'px';
      wrapper.style.height = (s.height * currentZoom) + 'px';
      canvas.style.width = '100%';
      canvas.style.height = '100%';

      document.getElementById('animFrameText').innerText = (animCurrentStep + 1) + ' / ' + animFrames.length + ' (ID ' + s.code + ')';
      document.getElementById('coordsBadge').innerText = s.width + ' × ' + s.height + ' px | ID ' + s.code;

      document.querySelectorAll('.anim-thumb-item').forEach((item, idx) => {
        item.classList.toggle('active', idx === animCurrentStep);
      });
    }

    function runAnimLoop() {
      if (!isAnimating) return;
      if (animTimer) clearTimeout(animTimer);

      if (!animIsPaused && animFrames.length > 0) {
        renderCurrentAnimFrame();

        if (animFrames.length > 1) {
          if (animMode === 'pingpong') {
            if (animDirection === 1 && animCurrentStep >= animFrames.length - 1) {
              animDirection = -1;
            } else if (animDirection === -1 && animCurrentStep <= 0) {
              animDirection = 1;
            }
            animCurrentStep += animDirection;
          } else {
            animCurrentStep = (animCurrentStep + 1) % animFrames.length;
          }
        }
      }

      const intervalMs = Math.max(16, Math.round(1000 / animFps));
      animTimer = setTimeout(runAnimLoop, intervalMs);
    }

    function toggleShowCps(checked) {
      showControlPoints = checked;
      if (fpgData.sprites[selectedIndex]) {
        renderPreview(fpgData.sprites[selectedIndex]);
      }
    }

    function clearDetail() {
      document.getElementById('detailTitle').innerText = 'SIN GRÁFICOS';
      document.getElementById('propCode').value = '';
      document.getElementById('propDesc').value = '';
      document.getElementById('propDims').value = '';
      const canvas = document.getElementById('previewCanvas');
      canvas.width = 1; canvas.height = 1;
      const body = document.getElementById('cpTableBody');
      if (body) body.innerHTML = '';
      document.getElementById('cpInputX').value = '';
      document.getElementById('cpInputY').value = '';
    }

    function renderPreview(s) {
      const canvas = document.getElementById('previewCanvas');
      canvas.width = s.width;
      canvas.height = s.height;
      const ctx = canvas.getContext('2d');
      const imgData = new ImageData(new Uint8ClampedArray(s.rgbaData), s.width, s.height);
      ctx.putImageData(imgData, 0, 0);

      // Draw Control Points as 3x3 Crosshairs (+) without text labels
      if (showControlPoints && s.controlPoints && s.controlPoints.length > 0) {
        s.controlPoints.forEach((pt, i) => {
          const isCp0 = (i === 0);
          const isSel = (i === selectedCpIndex);
          const x = pt.x;
          const y = pt.y;

          // Color: cian fluorescente para seleccionado, rojo para CP0, amarillo brillante para otros
          const color = isSel ? '#00ffff' : (isCp0 ? '#ff3333' : '#ffee00');
          ctx.fillStyle = color;

          // Cruz (+) de exactamente 3x3 píxeles centrada en (x, y)
          ctx.fillRect(x, y, 1, 1);
          ctx.fillRect(x - 1, y, 1, 1);
          ctx.fillRect(x + 1, y, 1, 1);
          ctx.fillRect(x, y - 1, 1, 1);
          ctx.fillRect(x, y + 1, 1, 1);
        });
      }

      applyZoom();
    }

    function setZoom(val) {
      currentZoom = parseFloat(val);
      applyZoom();
    }

    function applyZoom() {
      const wrapper = document.getElementById('canvasWrapper');
      const s = isAnimating ? (animFrames[animCurrentStep] || fpgData.sprites[selectedIndex]) : fpgData.sprites[selectedIndex];
      if (!s) return;
      wrapper.style.width = (s.width * currentZoom) + 'px';
      wrapper.style.height = (s.height * currentZoom) + 'px';
      const canvas = document.getElementById('previewCanvas');
      canvas.style.width = '100%';
      canvas.style.height = '100%';
    }

    // Tracking coordenadas X,Y en tiempo real
    const previewStage = document.getElementById('previewStage');
    const canvasWrapper = document.getElementById('canvasWrapper');
    const coordsBadge = document.getElementById('coordsBadge');

    canvasWrapper.addEventListener('mousemove', e => {
      const s = isAnimating ? (animFrames[animCurrentStep] || fpgData.sprites[selectedIndex]) : fpgData.sprites[selectedIndex];
      if (!s) return;
      const rect = canvasWrapper.getBoundingClientRect();
      const rawX = Math.floor((e.clientX - rect.left) / currentZoom);
      const rawY = Math.floor((e.clientY - rect.top) / currentZoom);
      const x = Math.max(0, Math.min(s.width - 1, rawX));
      const y = Math.max(0, Math.min(s.height - 1, rawY));
      coordsBadge.innerText = 'X: ' + x + ' | Y: ' + y;
    });

    // Clic en canvas para seleccionar, situar o añadir punto de control
    canvasWrapper.addEventListener('click', e => {
      if (isAnimating) return;
      const s = fpgData.sprites[selectedIndex];
      if (!s) return;
      const rect = canvasWrapper.getBoundingClientRect();
      const rawX = Math.max(0, Math.min(s.width - 1, Math.floor((e.clientX - rect.left) / currentZoom)));
      const rawY = Math.max(0, Math.min(s.height - 1, Math.floor((e.clientY - rect.top) / currentZoom)));

      // Comprobar si se hace clic cerca de un punto existente (radio 6px)
      const nearIndex = (s.controlPoints || []).findIndex(pt => Math.hypot(pt.x - rawX, pt.y - rawY) <= 6);

      if (nearIndex >= 0) {
        selectedCpIndex = nearIndex;
        clearPresetSelection();
      } else if (e.shiftKey) {
        // Shift+Clic: Añadir nuevo punto
        if (!s.controlPoints) s.controlPoints = [];
        s.controlPoints.push({ x: rawX, y: rawY });
        selectedCpIndex = s.controlPoints.length - 1;
        clearPresetSelection();
      } else if (s.controlPoints && s.controlPoints.length > 0 && selectedCpIndex >= 0) {
        // Clic simple: Mover el punto seleccionado actual
        s.controlPoints[selectedCpIndex] = { x: rawX, y: rawY };
        clearPresetSelection();
      } else {
        return;
      }

      vscode.postMessage({
        type: 'updateSprite',
        index: selectedIndex,
        controlPoints: s.controlPoints
      });

      renderPreview(s);
      renderPointsList(s);
    });

    function clearPresetSelection() {
      selectedPreset = null;
      document.querySelectorAll('.cp-preset-btn').forEach(b => b.classList.remove('active'));
      updateAddPointBtnState();
    }

    function updateAddPointBtnState() {
      const btn = document.getElementById('btnAddCp');
      if (!btn) return;
      const s = fpgData.sprites[selectedIndex];
      const enabled = !!(s && selectedPreset !== null);
      btn.disabled = !enabled;
      if (enabled) {
        btn.classList.remove('disabled');
        btn.title = 'Añadir punto en la posición seleccionada';
      } else {
        btn.classList.add('disabled');
        btn.title = 'Selecciona una posición en la cuadrícula 3x3 para añadir un punto';
      }
    }

    function renderPointsList(s) {
      const body = document.getElementById('cpTableBody');
      if (!body) return;
      body.innerHTML = '';
      if (!s || !s.controlPoints || s.controlPoints.length === 0) {
        document.getElementById('cpInputX').value = '';
        document.getElementById('cpInputY').value = '';
        selectedCpIndex = -1;
        updateAddPointBtnState();
        return;
      }

      if (selectedCpIndex < 0 || selectedCpIndex >= s.controlPoints.length) {
        selectedCpIndex = 0;
      }

      s.controlPoints.forEach((pt, i) => {
        const row = document.createElement('div');
        row.className = 'cp-table-row ' + (i === 0 ? 'cp0 ' : '') + (i === selectedCpIndex ? 'selected' : '');
        row.onclick = () => selectControlPoint(i);

        const numSpan = document.createElement('span');
        numSpan.style.width = '52px';
        numSpan.innerText = i.toString().padStart(3, '0') + (i === 0 ? ' (C)' : '');

        const xSpan = document.createElement('span');
        xSpan.style.width = '38px';
        xSpan.innerText = pt.x;

        const ySpan = document.createElement('span');
        ySpan.style.width = '38px';
        ySpan.innerText = pt.y;

        row.appendChild(numSpan);
        row.appendChild(xSpan);
        row.appendChild(ySpan);
        body.appendChild(row);
      });

      const curPt = s.controlPoints[selectedCpIndex];
      if (curPt) {
        document.getElementById('cpInputX').value = curPt.x;
        document.getElementById('cpInputY').value = curPt.y;
      }
      updateAddPointBtnState();
    }

    function selectControlPoint(i) {
      selectedCpIndex = i;
      clearPresetSelection();
      const s = fpgData.sprites[selectedIndex];
      if (s) {
        renderPointsList(s);
        renderPreview(s);
      }
    }

    function onCpCoordsInput() {
      const s = fpgData.sprites[selectedIndex];
      if (!s || !s.controlPoints || s.controlPoints.length === 0 || selectedCpIndex < 0) return;
      let x = parseInt(document.getElementById('cpInputX').value, 10);
      let y = parseInt(document.getElementById('cpInputY').value, 10);
      if (isNaN(x)) x = 0;
      if (isNaN(y)) y = 0;
      x = Math.max(0, Math.min(s.width - 1, x));
      y = Math.max(0, Math.min(s.height - 1, y));

      clearPresetSelection();

      if (s.controlPoints[selectedCpIndex]) {
        s.controlPoints[selectedCpIndex] = { x, y };
        vscode.postMessage({
          type: 'updateSprite',
          index: selectedIndex,
          controlPoints: s.controlPoints
        });
        renderPreview(s);

        const rows = document.querySelectorAll('.cp-table-row');
        if (rows[selectedCpIndex]) {
          const spans = rows[selectedCpIndex].querySelectorAll('span');
          if (spans.length >= 3) {
            spans[1].innerText = x;
            spans[2].innerText = y;
          }
        }
      }
    }

    function applyPresetPosition(rx, ry, btnEl) {
      const s = fpgData.sprites[selectedIndex];
      if (!s) return;
      selectedPreset = { rx, ry };
      const x = Math.max(0, Math.min(s.width - 1, Math.round(rx * (s.width - 1))));
      const y = Math.max(0, Math.min(s.height - 1, Math.round(ry * (s.height - 1))));
      document.getElementById('cpInputX').value = x;
      document.getElementById('cpInputY').value = y;

      document.querySelectorAll('.cp-preset-btn').forEach(b => b.classList.remove('active'));
      if (btnEl) btnEl.classList.add('active');

      if (s.controlPoints && selectedCpIndex >= 0 && s.controlPoints[selectedCpIndex]) {
        s.controlPoints[selectedCpIndex] = { x, y };
        vscode.postMessage({
          type: 'updateSprite',
          index: selectedIndex,
          controlPoints: s.controlPoints
        });
        renderPreview(s);

        const rows = document.querySelectorAll('.cp-table-row');
        if (rows[selectedCpIndex]) {
          const spans = rows[selectedCpIndex].querySelectorAll('span');
          if (spans.length >= 3) {
            spans[1].innerText = x;
            spans[2].innerText = y;
          }
        }
      }

      updateAddPointBtnState();
    }

    function addControlPointFromInputs() {
      const s = fpgData.sprites[selectedIndex];
      if (!s || !selectedPreset) return;
      if (!s.controlPoints) s.controlPoints = [];

      const x = Math.max(0, Math.min(s.width - 1, Math.round(selectedPreset.rx * (s.width - 1))));
      const y = Math.max(0, Math.min(s.height - 1, Math.round(selectedPreset.ry * (s.height - 1))));

      s.controlPoints.push({ x, y });
      selectedCpIndex = s.controlPoints.length - 1;

      clearPresetSelection();

      vscode.postMessage({
        type: 'updateSprite',
        index: selectedIndex,
        controlPoints: s.controlPoints
      });
      renderPreview(s);
      renderPointsList(s);
    }

    function setRealCenterPoint() {
      const s = fpgData.sprites[selectedIndex];
      if (!s) return;
      if (!s.controlPoints) s.controlPoints = [];

      let cx, cy;
      if (selectedPreset) {
        cx = Math.max(0, Math.min(s.width - 1, Math.round(selectedPreset.rx * (s.width - 1))));
        cy = Math.max(0, Math.min(s.height - 1, Math.round(selectedPreset.ry * (s.height - 1))));
      } else {
        cx = Math.floor(s.width / 2);
        cy = Math.floor(s.height / 2);
      }

      if (s.controlPoints.length === 0) {
        s.controlPoints.push({ x: cx, y: cy });
      } else {
        s.controlPoints[0] = { x: cx, y: cy };
      }
      selectedCpIndex = 0;

      clearPresetSelection();

      vscode.postMessage({
        type: 'updateSprite',
        index: selectedIndex,
        controlPoints: s.controlPoints
      });
      renderPreview(s);
      renderPointsList(s);
    }

    function deleteSelectedControlPoint() {
      const s = fpgData.sprites[selectedIndex];
      if (!s || !s.controlPoints || s.controlPoints.length === 0 || selectedCpIndex < 0) return;

      s.controlPoints.splice(selectedCpIndex, 1);
      if (s.controlPoints.length === 0) {
        selectedCpIndex = -1;
      } else if (selectedCpIndex >= s.controlPoints.length) {
        selectedCpIndex = s.controlPoints.length - 1;
      }

      clearPresetSelection();

      vscode.postMessage({
        type: 'updateSprite',
        index: selectedIndex,
        controlPoints: s.controlPoints
      });
      renderPreview(s);
      renderPointsList(s);
    }

    function resetAllControlPoints() {
      const s = fpgData.sprites[selectedIndex];
      if (!s) return;
      s.controlPoints = [];
      selectedCpIndex = -1;

      clearPresetSelection();

      vscode.postMessage({
        type: 'updateSprite',
        index: selectedIndex,
        controlPoints: s.controlPoints
      });
      renderPreview(s);
      renderPointsList(s);
    }

    // Horizontal Splitter / Resizer between Preview and Bottom Pane
    const rightPaneResizer = document.getElementById('rightPaneResizer');
    const previewStageEl = document.getElementById('previewStage');
    const rightPaneEl = document.querySelector('.right-pane');
    let isResizingPreview = false;

    if (rightPaneResizer && previewStageEl && rightPaneEl) {
      rightPaneResizer.addEventListener('mousedown', (e) => {
        isResizingPreview = true;
        rightPaneResizer.classList.add('dragging');
        document.body.style.cursor = 'row-resize';
        document.body.style.userSelect = 'none';
      });

      window.addEventListener('mousemove', (e) => {
        if (!isResizingPreview) return;
        const rightPaneRect = rightPaneEl.getBoundingClientRect();
        const detailHeader = document.querySelector('.detail-header');
        const headerHeight = detailHeader ? detailHeader.offsetHeight : 36;
        const newHeight = e.clientY - rightPaneRect.top - headerHeight;
        const minH = 60;
        const maxH = Math.max(minH, rightPaneRect.height - 120);
        const clampedH = Math.max(minH, Math.min(maxH, newHeight));
        previewStageEl.style.height = clampedH + 'px';
      });

      window.addEventListener('mouseup', () => {
        if (isResizingPreview) {
          isResizingPreview = false;
          rightPaneResizer.classList.remove('dragging');
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
        }
      });
    }

    function updateSelectedProp(key, value) {
      const s = fpgData.sprites[selectedIndex];
      if (!s) return;
      s[key] = value;
      vscode.postMessage({
        type: 'updateSprite',
        index: selectedIndex,
        [key]: value
      });
      renderList();
    }

    // Toolbar Actions
    function triggerSave() { vscode.postMessage({ type: 'save' }); }
    function triggerSaveAs() { vscode.postMessage({ type: 'saveAs' }); }
    function triggerOpenFile() { vscode.postMessage({ type: 'openFile' }); }

    function openNewModal() {
      vscode.postMessage({ type: 'newFile', bpp: 32 });
    }

    function triggerSelectImages() {
      vscode.postMessage({ type: 'selectImages' });
    }

    // Modal Añadir Gráfico(s)
    function openAddModal() {
      let nextId = 1;
      if (fpgData.sprites.length > 0) {
        const maxId = Math.max(...fpgData.sprites.map(s => s.code));
        nextId = maxId + 1;
      }
      document.getElementById('addCodeInput').value = nextId;
      document.getElementById('addDescInput').value = '';
      document.getElementById('addFileInput').value = '';
      document.getElementById('addWarningBox').style.display = 'none';
      document.getElementById('addPreviewSection').style.display = 'none';
      document.getElementById('addRangeBadge').value = '-';
      document.getElementById('singleDescField').style.display = 'flex';
      selectedNewSprites = [];
      document.getElementById('addModal').classList.add('active');
      triggerSelectImages();
    }

    function closeAddModal() {
      document.getElementById('addModal').classList.remove('active');
    }

    async function loadImagesFromDataUrls(files) {
      if (!files || files.length === 0) return;

      // Orden natural numérico por nombre de archivo (ej. 1.png, 2.png, 10.png)
      files.sort((a, b) => a.filename.localeCompare(b.filename, undefined, { numeric: true, sensitivity: 'base' }));

      selectedNewSprites = [];
      const promises = files.map(file => {
        return new Promise(resolve => {
          const img = new Image();
          img.onload = () => {
            const cvs = document.createElement('canvas');
            cvs.width = img.width;
            cvs.height = img.height;
            const ctx = cvs.getContext('2d');
            ctx.drawImage(img, 0, 0);
            const imgData = ctx.getImageData(0, 0, img.width, img.height);
            resolve({
              filename: file.filename,
              defaultDesc: file.filename.replace(/\.[^/.]+$/, ''),
              width: img.width,
              height: img.height,
              rgbaData: Array.from(imgData.data),
              dataUrl: file.dataUrl
            });
          };
          img.src = file.dataUrl;
        });
      });

      selectedNewSprites = await Promise.all(promises);

      document.getElementById('selectedCountBadge').innerText = selectedNewSprites.length;
      if (selectedNewSprites.length === 1) {
        document.getElementById('singleDescField').style.display = 'flex';
        document.getElementById('addDescInput').value = selectedNewSprites[0].defaultDesc;
      } else {
        document.getElementById('singleDescField').style.display = 'none';
      }

      updateAddIds();
      document.getElementById('addModal').classList.add('active');
    }

    async function handleImagesSelected(input) {
      const files = Array.from(input.files || []);
      if (files.length === 0) return;

      const fileDataPromises = files.map(file => {
        return new Promise(resolve => {
          const reader = new FileReader();
          reader.onload = evt => {
            resolve({
              filename: file.name,
              dataUrl: evt.target.result
            });
          };
          reader.readAsDataURL(file);
        });
      });

      const loadedFiles = await Promise.all(fileDataPromises);
      await loadImagesFromDataUrls(loadedFiles);
    }

    function updateAddIds() {
      const startId = parseInt(document.getElementById('addCodeInput').value, 10);
      const count = selectedNewSprites.length;

      if (isNaN(startId) || startId <= 0 || count === 0) {
        document.getElementById('addRangeBadge').value = count > 0 ? '(' + count + ' gráficos)' : '-';
        document.getElementById('addWarningBox').style.display = 'none';
        return;
      }

      const endId = startId + count - 1;
      document.getElementById('addRangeBadge').value = count === 1 ? '#' + startId : '#' + startId + ' ... #' + endId + ' (' + count + ' gráficos)';

      // Render grid de thumbnails con sus IDs sucesivos
      const grid = document.getElementById('addMultiGrid');
      grid.innerHTML = '';

      const collisions = [];

      selectedNewSprites.forEach((item, idx) => {
        const assignedId = startId + idx;
        const exists = fpgData.sprites.some(s => s.code === assignedId);
        if (exists) collisions.push(assignedId);

        const card = document.createElement('div');
        card.className = 'multi-thumb-card' + (exists ? ' collision' : '');
        card.title = item.filename + ' (' + item.width + 'x' + item.height + 'px) -> ID #' + assignedId + (exists ? ' [SOBREESCRIBE]' : '');

        const canvas = document.createElement('canvas');
        canvas.width = item.width;
        canvas.height = item.height;
        const ctx = canvas.getContext('2d');
        const imgData = new ImageData(new Uint8ClampedArray(item.rgbaData), item.width, item.height);
        ctx.putImageData(imgData, 0, 0);

        const idTag = document.createElement('div');
        idTag.className = 'thumb-id-tag';
        idTag.innerText = '#' + assignedId + (exists ? ' ⚠️' : '');

        card.appendChild(canvas);
        card.appendChild(idTag);
        grid.appendChild(card);
      });

      document.getElementById('addPreviewSection').style.display = 'block';

      const warningBox = document.getElementById('addWarningBox');
      if (collisions.length > 0) {
        warningBox.innerHTML = '⚠️ <strong>¡Atención!</strong> ' + (collisions.length === 1 ? 'El ID #' + collisions[0] + ' ya existe' : 'Los IDs ' + collisions.map(c => '#' + c).join(', ') + ' ya existen') + ' en el FPG y se sobrescribirá' + (collisions.length > 1 ? 'n' : '') + '.';
        warningBox.style.display = 'block';
      } else {
        warningBox.style.display = 'none';
      }
    }

    function confirmAddSprites() {
      if (selectedNewSprites.length === 0) {
        alert('Por favor, selecciona al menos una imagen.');
        return;
      }
      const startId = parseInt(document.getElementById('addCodeInput').value, 10);
      if (isNaN(startId) || startId <= 0) {
        alert('Introduce un ID inicial válido mayor que 0.');
        return;
      }

      const customDesc = document.getElementById('addDescInput').value.trim();

      const spritesToSend = selectedNewSprites.map((item, idx) => ({
        code: startId + idx,
        description: selectedNewSprites.length === 1 && customDesc ? customDesc : item.defaultDesc,
        filename: item.filename,
        width: item.width,
        height: item.height,
        rgbaData: item.rgbaData
      }));

      vscode.postMessage({
        type: 'addSprites',
        sprites: spritesToSend
      });

      closeAddModal();
    }

    // Modal Eliminar Gráfico
    function openDeleteModal() {
      const deleteModal = document.getElementById('deleteModal');
      const input = document.getElementById('deleteCodeInput');
      const prevBox = document.getElementById('deletePreviewBox');

      if (fpgData.sprites.length === 0) {
        alert('No hay gráficos en el archivo FPG.');
        return;
      }

      if (fpgData.sprites[selectedIndex]) {
        const s = fpgData.sprites[selectedIndex];
        input.value = s.code;
        checkDeletePreview(s.code);
      } else {
        input.value = '';
        prevBox.style.display = 'none';
      }

      deleteModal.classList.add('active');
      input.focus();
    }

    function closeDeleteModal() {
      document.getElementById('deleteModal').classList.remove('active');
    }

    function checkDeletePreview(val) {
      const code = parseInt(val, 10);
      const prevBox = document.getElementById('deletePreviewBox');
      const found = fpgData.sprites.find(s => s.code === code);

      if (found) {
        const canvas = document.getElementById('deletePreviewCanvas');
        canvas.width = found.width;
        canvas.height = found.height;
        const ctx = canvas.getContext('2d');
        const imgData = new ImageData(new Uint8ClampedArray(found.rgbaData), found.width, found.height);
        ctx.putImageData(imgData, 0, 0);

        document.getElementById('deletePreviewTitle').innerText = 'ID ' + found.code + ' · ' + (found.description || 'Sprite');
        document.getElementById('deletePreviewMeta').innerText = found.width + ' × ' + found.height + ' px';
        prevBox.style.display = 'flex';
      } else {
        prevBox.style.display = 'none';
      }
    }

    function confirmDeleteSprite() {
      const val = parseInt(document.getElementById('deleteCodeInput').value, 10);
      if (isNaN(val) || val <= 0) {
        alert('Por favor, introduce un ID válido.');
        return;
      }
      vscode.postMessage({
        type: 'deleteSprite',
        code: val
      });
      closeDeleteModal();
    }

    function exportSelectedPng() {
      const s = fpgData.sprites[selectedIndex];
      if (!s) return;
      const canvas = document.createElement('canvas');
      canvas.width = s.width;
      canvas.height = s.height;
      const ctx = canvas.getContext('2d');
      const imgData = new ImageData(new Uint8ClampedArray(s.rgbaData), s.width, s.height);
      ctx.putImageData(imgData, 0, 0);

      const a = document.createElement('a');
      a.download = (s.description || 'sprite_' + s.code) + '.png';
      a.href = canvas.toDataURL('image/png');
      a.click();
    }
  </script>
</body>
</html>`;
  }
}
