import * as vscode from 'vscode';
import * as path from 'path';
import { FntParser, BennuFont, Glyph } from './fntParser';

class FntDocument implements vscode.CustomDocument {
  public readonly uri: vscode.Uri;
  public font: BennuFont;
  public isDirty: boolean = false;

  constructor(uri: vscode.Uri, initialData: Uint8Array) {
    this.uri = uri;
    if (initialData.length > 0) {
      try {
        this.font = FntParser.parse(initialData);
      } catch {
        const isFnx = uri.fsPath.toLowerCase().endsWith('.fnx');
        this.font = {
          isFnx,
          charsetType: 0,
          bpp: 32,
          glyphs: new Array(256).fill(null)
        };
      }
    } else {
      const isFnx = uri.fsPath.toLowerCase().endsWith('.fnx');
      this.font = {
        isFnx,
        charsetType: 0,
        bpp: 32,
        glyphs: new Array(256).fill(null)
      };
    }
  }

  dispose(): void {}
}

export class FntEditorProvider implements vscode.CustomEditorProvider<FntDocument> {
  public static readonly viewType = 'bennugd2.fntEditor';

  private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<vscode.CustomDocumentEditEvent<FntDocument>>();
  public readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

  constructor(private readonly context: vscode.ExtensionContext) {}

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new FntEditorProvider(context);
    return vscode.window.registerCustomEditorProvider(FntEditorProvider.viewType, provider, {
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
  ): Promise<FntDocument> {
    const isSpanish = (vscode.env.language || 'es').toLowerCase().startsWith('es');
    try {
      const data = await vscode.workspace.fs.readFile(uri);
      return new FntDocument(uri, data);
    } catch (err: any) {
      const errMsg = isSpanish
        ? `Error al leer archivo de fuente (${path.basename(uri.fsPath)}): ${err?.message || err}`
        : `Error reading font file (${path.basename(uri.fsPath)}): ${err?.message || err}`;
      vscode.window.showErrorMessage(errMsg);
      return new FntDocument(uri, new Uint8Array(0));
    }
  }

  async resolveCustomEditor(
    document: FntDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    const isSpanish = (vscode.env.language || 'es').toLowerCase().startsWith('es');

    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.file(path.join(this.context.extensionPath, 'media'))
      ]
    };

    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview, document, isSpanish);

    const sendFontData = () => {
      const glyphsPayload = document.font.glyphs.map((g, idx) => {
        if (!g) return null;
        return {
          charIndex: idx,
          char: String.fromCharCode(idx),
          width: g.width,
          height: g.height,
          xadvance: g.xadvance,
          yadvance: g.yadvance,
          xoffset: g.xoffset,
          yoffset: g.yoffset,
          rgbaData: Array.from(g.rgbaData)
        };
      });

      webviewPanel.webview.postMessage({
        type: 'init',
        filename: path.basename(document.uri.fsPath),
        isFnx: document.font.isFnx,
        charsetType: document.font.charsetType,
        bpp: document.font.bpp,
        isSpanish,
        hasExistingGlyphs: document.font.glyphs.some(g => g !== null),
        glyphs: glyphsPayload
      });
    };

    webviewPanel.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'ready':
          sendFontData();
          break;

        case 'browseTTF': {
          try {
            const files = await vscode.window.showOpenDialog({
              canSelectMany: false,
              openLabel: isSpanish ? 'Seleccionar Fuente TTF/OTF' : 'Select TTF/OTF Font',
              filters: {
                'Font Files (*.ttf, *.otf, *.woff)': ['ttf', 'otf', 'woff', 'woff2']
              }
            });

            if (files && files.length > 0) {
              const fileUri = files[0];
              const fileData = await vscode.workspace.fs.readFile(fileUri);
              const filename = path.basename(fileUri.fsPath);
              const familyName = path.parse(filename).name.replace(/[^a-zA-Z0-9_-]/g, '_');

              webviewPanel.webview.postMessage({
                type: 'loadedTTF',
                filePath: fileUri.fsPath,
                filename,
                familyName,
                fontData: Array.from(fileData)
              });
            }
          } catch (err: any) {
            const errMsg = isSpanish
              ? `Error al cargar la fuente: ${err?.message || err}`
              : `Error loading font: ${err?.message || err}`;
            vscode.window.showErrorMessage(errMsg);
          }
          break;
        }

        case 'updateGlyphs': {
          for (let i = 0; i < 256; i++) {
            const rawG = message.glyphs[i];
            if (rawG) {
              document.font.glyphs[i] = {
                charIndex: i,
                width: rawG.width,
                height: rawG.height,
                xadvance: rawG.xadvance,
                yadvance: rawG.yadvance,
                xoffset: rawG.xoffset,
                yoffset: rawG.yoffset,
                rgbaData: new Uint8Array(rawG.rgbaData)
              };
            } else {
              document.font.glyphs[i] = null;
            }
          }
          document.isDirty = true;
          this._onDidChangeCustomDocument.fire({
            document,
            undo: () => {},
            redo: () => {}
          });
          break;
        }

        case 'save': {
          try {
            const serialized = FntParser.serialize(document.font);
            await vscode.workspace.fs.writeFile(document.uri, serialized);
            document.isDirty = false;
            const okMsg = isSpanish
              ? `Fuente guardada correctamente: ${path.basename(document.uri.fsPath)}`
              : `Font saved successfully: ${path.basename(document.uri.fsPath)}`;
            vscode.window.showInformationMessage(okMsg);
            webviewPanel.webview.postMessage({ type: 'savedSuccess' });
          } catch (err: any) {
            const errMsg = isSpanish
              ? `Error al guardar fuente: ${err?.message || err}`
              : `Error saving font: ${err?.message || err}`;
            vscode.window.showErrorMessage(errMsg);
          }
          break;
        }

        case 'saveAs': {
          try {
            const targetUri = await vscode.window.showSaveDialog({
              defaultUri: document.uri,
              filters: {
                'BennuGD Font (*.fnx, *.fnt)': ['fnx', 'fnt']
              },
              saveLabel: isSpanish ? 'Guardar Fuente Como' : 'Save Font As'
            });

            if (targetUri) {
              document.font.isFnx = targetUri.fsPath.toLowerCase().endsWith('.fnx');
              const serialized = FntParser.serialize(document.font);
              await vscode.workspace.fs.writeFile(targetUri, serialized);
              const expMsg = isSpanish
                ? `Fuente exportada a: ${targetUri.fsPath}`
                : `Font exported to: ${targetUri.fsPath}`;
              vscode.window.showInformationMessage(expMsg);
              await vscode.commands.executeCommand('vscode.openWith', targetUri, FntEditorProvider.viewType);
            }
          } catch (err: any) {
            const errMsg = isSpanish
              ? `Error al exportar fuente: ${err?.message || err}`
              : `Error exporting font: ${err?.message || err}`;
            vscode.window.showErrorMessage(errMsg);
          }
          break;
        }

        case 'showInfo':
          vscode.window.showInformationMessage(message.message);
          break;

        case 'showError':
          vscode.window.showErrorMessage(message.message);
          break;
      }
    });
  }

  async saveCustomDocument(document: FntDocument, _cancellation: vscode.CancellationToken): Promise<void> {
    const serialized = FntParser.serialize(document.font);
    await vscode.workspace.fs.writeFile(document.uri, serialized);
  }

  async saveCustomDocumentAs(document: FntDocument, targetResource: vscode.Uri, _cancellation: vscode.CancellationToken): Promise<void> {
    const serialized = FntParser.serialize(document.font);
    await vscode.workspace.fs.writeFile(targetResource, serialized);
  }

  async revertCustomDocument(document: FntDocument, _cancellation: vscode.CancellationToken): Promise<void> {
    const data = await vscode.workspace.fs.readFile(document.uri);
    document.font = FntParser.parse(data);
  }

  async backupCustomDocument(document: FntDocument, context: vscode.CustomDocumentBackupContext, _cancellation: vscode.CancellationToken): Promise<vscode.CustomDocumentBackup> {
    const serialized = FntParser.serialize(document.font);
    await vscode.workspace.fs.writeFile(context.destination, serialized);
    return {
      id: context.destination.toString(),
      delete: () => vscode.workspace.fs.delete(context.destination)
    };
  }

  private getHtmlForWebview(_webview: vscode.Webview, document: FntDocument, isSpanish: boolean): string {
    const filename = path.basename(document.uri.fsPath);

    const t = isSpanish ? {
      menuFile: 'Archivo',
      menuView: 'Ver',
      menuHelp: 'Ayuda',
      openTTF: 'Examinar TTF...',
      save: 'Guardar',
      saveAs: 'Guardar Como...',
      exportFnt: 'Exportar FNT/FNX...',
      zoomFit: 'Ajustar al área',
      zoom100: '1:1',
      toggleCharCodes: 'Alternar código del carácter',
      aboutTitle: 'Acerca de BGDFntEditor',
      secFont: 'Fuente',
      ttfFile: 'Archivo TTF',
      browseBtn: 'Examinar...',
      size: 'Tamaño',
      metricsFamily: 'Familia',
      metricsAscent: 'Ascendente',
      metricsDescent: 'Descendente',
      metricsLineHeight: 'Interlínea',
      secCharSet: 'Conjunto de caracteres a exportar',
      chkDigits: 'Dígitos',
      chkSymbols: 'Símbolos',
      chkUppercase: 'Mayúsculas',
      chkExtended: 'Extendido (ISO-8859-1)',
      chkLowercase: 'Minúsculas',
      customRange: 'Rango personalizado',
      charsSelected: 'caracteres seleccionados',
      secEffects: 'Efectos',
      aaNone: 'Sin AA',
      aaNormal: 'Normal',
      aaStrong: 'Fuerte',
      fontAlpha: 'Alpha de letra',
      fontColor: 'Color de la fuente',
      strokeTitle: 'Reborde',
      strokeActivate: 'Activar',
      strokeThickness: 'Grosor',
      strokeColor: 'Color del reborde',
      strokeAlpha: 'Alpha',
      shadowTitle: 'Sombra',
      shadowActivate: 'Activar',
      shadowDistance: 'Distancia',
      shadowColor: 'Color de sombra',
      shadowAlpha: 'Alpha',
      secPreview: 'Vista previa',
      previewBgColor: 'Color de fondo',
      colorLbl: 'Color',
      fineAdjust: 'Ajuste fino en vista previa (no exportable)',
      canvasLbl: 'Lienzo:',
      secGlyphs: 'Glifos',
      showCharCode: 'Mostrar código del carácter',
      sampleDefaultText: 'La Armadura SAGRADA DE ANTIRIAD\nJUGAR\nTECLADO\nDIFICULTAD\nIDIOMA ESPAÑOL'
    } : {
      menuFile: 'File',
      menuView: 'View',
      menuHelp: 'Help',
      openTTF: 'Browse TTF...',
      save: 'Save',
      saveAs: 'Save As...',
      exportFnt: 'Export FNT/FNX...',
      zoomFit: 'Fit to area',
      zoom100: '1:1',
      toggleCharCodes: 'Toggle character code',
      aboutTitle: 'About BGDFntEditor',
      secFont: 'Font',
      ttfFile: 'TTF File',
      browseBtn: 'Browse...',
      size: 'Size',
      metricsFamily: 'Family',
      metricsAscent: 'Ascent',
      metricsDescent: 'Descent',
      metricsLineHeight: 'Line Height',
      secCharSet: 'Character set to export',
      chkDigits: 'Digits',
      chkSymbols: 'Symbols',
      chkUppercase: 'Uppercase',
      chkExtended: 'Extended (ISO-8859-1)',
      chkLowercase: 'Lowercase',
      customRange: 'Custom range',
      charsSelected: 'characters selected',
      secEffects: 'Effects',
      aaNone: 'No AA',
      aaNormal: 'Normal',
      aaStrong: 'Strong',
      fontAlpha: 'Letter alpha',
      fontColor: 'Font color',
      strokeTitle: 'Outline / Stroke',
      strokeActivate: 'Enable',
      strokeThickness: 'Thickness',
      strokeColor: 'Outline color',
      strokeAlpha: 'Alpha',
      shadowTitle: 'Shadow',
      shadowActivate: 'Enable',
      shadowDistance: 'Distance',
      shadowColor: 'Shadow color',
      shadowAlpha: 'Alpha',
      secPreview: 'Live Preview',
      previewBgColor: 'Background color',
      colorLbl: 'Color',
      fineAdjust: 'Fine adjustment in preview (non-exportable)',
      canvasLbl: 'Canvas:',
      secGlyphs: 'Glyphs',
      showCharCode: 'Show character code',
      sampleDefaultText: 'THE SACRED ARMOUR OF ANTIRIAD\nPLAY GAME\nKEYBOARD\nDIFFICULTY\nENGLISH LANGUAGE'
    };

    return /*html*/ `<!DOCTYPE html>
<html lang="${isSpanish ? 'es' : 'en'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BGDFntEditor - ${filename}</title>
  <style>
    :root {
      --app-bg: var(--vscode-editor-background, #1e1e24);
      --panel-bg: var(--vscode-sideBar-background, #252530);
      --card-bg: var(--vscode-input-background, #1a1a22);
      --border-color: var(--vscode-widget-border, #3a3a4c);
      --text-main: var(--vscode-editor-foreground, #e2e8f0);
      --text-muted: var(--vscode-descriptionForeground, #94a3b8);
      --accent: var(--vscode-button-background, #3b82f6);
      --accent-hover: var(--vscode-button-hoverBackground, #2563eb);
      --accent-active: #60a5fa;
      --control-bg: var(--vscode-input-background, #121217);
      --control-border: var(--vscode-input-border, #475569);
      --selection: var(--vscode-list-activeSelectionBackground, rgba(59, 130, 246, 0.3));
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      user-select: none;
    }

    body {
      background-color: var(--app-bg);
      color: var(--text-main);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      font-size: 12px;
    }

    /* TOP MENUBAR */
    .menubar {
      background-color: var(--panel-bg);
      border-bottom: 1px solid var(--border-color);
      display: flex;
      align-items: center;
      padding: 2px 10px;
      gap: 12px;
      font-size: 11.5px;
      position: relative;
      flex-shrink: 0;
    }

    .app-title-tag {
      font-weight: bold;
      color: var(--accent-active);
      margin-right: 6px;
      display: flex;
      align-items: center;
      gap: 5px;
    }

    .menu-item {
      position: relative;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 4px;
      transition: background 0.1s ease;
    }

    .menu-item:hover {
      background-color: rgba(255, 255, 255, 0.08);
    }

    .menu-dropdown {
      display: none;
      position: absolute;
      top: 100%;
      left: 0;
      background: var(--panel-bg);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.4);
      min-width: 170px;
      z-index: 1000;
      padding: 4px 0;
    }

    .menu-item:hover .menu-dropdown {
      display: block;
    }

    .menu-dropdown-item {
      padding: 6px 12px;
      font-size: 11px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      cursor: pointer;
      color: var(--text-main);
    }

    .menu-dropdown-item:hover {
      background: var(--accent);
      color: #fff;
    }

    .menu-separator {
      height: 1px;
      background: var(--border-color);
      margin: 4px 0;
    }

    /* MAIN CONTAINER (2 COLUMNS) */
    .app-body {
      flex: 1;
      display: flex;
      overflow: hidden;
    }

    /* LEFT SIDEBAR */
    .sidebar {
      width: 380px;
      min-width: 350px;
      max-width: 440px;
      background-color: var(--panel-bg);
      border-right: 1px solid var(--border-color);
      display: flex;
      flex-direction: column;
      overflow-y: auto;
      padding: 10px;
      gap: 10px;
    }

    /* SECTION COLLAPSIBLE CARDS */
    .section-card {
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 8px 10px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .section-title {
      font-size: 11.5px;
      font-weight: 700;
      color: var(--text-main);
      display: flex;
      align-items: center;
      gap: 4px;
      cursor: pointer;
    }

    .section-title::before {
      content: "▼";
      font-size: 9px;
      color: var(--text-muted);
    }

    .form-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .form-label {
      font-size: 11px;
      color: var(--text-muted);
    }

    .btn-input {
      background: var(--accent);
      color: #fff;
      border: none;
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.15s ease;
      white-space: nowrap;
    }

    .btn-input:hover {
      background: var(--accent-hover);
    }

    .text-input {
      background: var(--control-bg);
      border: 1px solid var(--control-border);
      color: var(--text-main);
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 11px;
      outline: none;
    }

    .text-input:focus {
      border-color: var(--accent);
    }

    /* METRICS TABLE */
    .metrics-table {
      width: 100%;
      border-collapse: collapse;
      background: var(--control-bg);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      font-size: 10.5px;
      margin-top: 4px;
      overflow: hidden;
    }

    .metrics-table th {
      background: rgba(255, 255, 255, 0.05);
      color: var(--text-muted);
      font-weight: 600;
      padding: 4px 6px;
      text-align: left;
      border-bottom: 1px solid var(--border-color);
    }

    .metrics-table td {
      padding: 4px 6px;
      color: var(--text-main);
      font-family: monospace;
    }

    /* CHECKBOX GRID */
    .checkbox-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px 12px;
      font-size: 11px;
    }

    .checkbox-lbl {
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
    }

    .checkbox-lbl input[type="checkbox"] {
      accent-color: var(--accent);
      cursor: pointer;
    }

    /* ANTIALIASING PILL SELECTOR */
    .aa-selector {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 11px;
    }

    .aa-option {
      display: flex;
      align-items: center;
      gap: 4px;
      cursor: pointer;
    }

    .aa-option input[type="radio"] {
      accent-color: var(--accent);
      cursor: pointer;
    }

    /* SLIDER WITH VALUE BADGE */
    .slider-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .slider-styled {
      flex: 1;
      accent-color: var(--accent);
      height: 4px;
      cursor: pointer;
    }

    .val-badge {
      background: var(--control-bg);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      padding: 2px 6px;
      font-size: 10.5px;
      font-family: monospace;
      min-width: 44px;
      text-align: center;
      color: var(--text-main);
    }

    /* RGB INPUT GROUP */
    .rgb-group {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 10.5px;
      color: var(--text-muted);
    }

    .rgb-input {
      width: 38px;
      background: var(--control-bg);
      border: 1px solid var(--control-border);
      color: var(--text-main);
      padding: 2px 4px;
      border-radius: 3px;
      text-align: center;
      font-family: monospace;
      font-size: 11px;
      outline: none;
    }

    .rgb-input:focus {
      border-color: var(--accent);
    }

    .color-swatch {
      width: 22px;
      height: 20px;
      border-radius: 4px;
      border: 1px solid var(--border-color);
      cursor: pointer;
      position: relative;
      flex-shrink: 0;
    }

    .color-swatch input[type="color"] {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      opacity: 0;
      cursor: pointer;
    }

    /* 3x3 SHADOW MATRIX */
    .shadow-matrix-container {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .shadow-matrix {
      display: grid;
      grid-template-columns: repeat(3, 16px);
      gap: 4px;
      background: var(--control-bg);
      padding: 4px;
      border-radius: 4px;
      border: 1px solid var(--border-color);
    }

    .matrix-radio {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      border: 1.5px solid var(--text-muted);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.1s ease;
    }

    .matrix-radio:hover {
      border-color: var(--accent);
    }

    .matrix-radio.active {
      background-color: var(--accent);
      border-color: var(--accent);
    }

    /* RIGHT COLUMN (WORKSPACE & PREVIEW) */
    .workspace {
      flex: 1;
      display: flex;
      flex-direction: column;
      padding: 10px 14px;
      gap: 10px;
      overflow-y: auto;
      background-color: var(--app-bg);
    }

    /* LIVE PREVIEW BOX */
    .preview-card {
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .sample-textarea {
      width: 100%;
      height: 75px;
      background: var(--control-bg);
      border: 1px solid var(--control-border);
      color: var(--text-main);
      padding: 6px 8px;
      border-radius: 4px;
      font-size: 11.5px;
      font-family: inherit;
      resize: vertical;
      outline: none;
    }

    .sample-textarea:focus {
      border-color: var(--accent);
    }

    .preview-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 8px;
      font-size: 11px;
    }

    .zoom-toolbar {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .btn-tool {
      background: var(--control-bg);
      border: 1px solid var(--control-border);
      color: var(--text-main);
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 11px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s ease;
    }

    .btn-tool:hover {
      background: var(--accent);
      border-color: var(--accent);
      color: #fff;
    }

    .preview-canvas-container {
      width: 100%;
      min-height: 160px;
      max-height: 320px;
      background-color: #474760;
      border: 1px solid var(--border-color);
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: auto;
      padding: 10px;
      position: relative;
    }

    .checkerboard-pattern {
      background-image: 
        linear-gradient(45deg, #22222a 25%, transparent 25%), 
        linear-gradient(-45deg, #22222a 25%, transparent 25%), 
        linear-gradient(45deg, transparent 75%, #22222a 75%), 
        linear-gradient(-45deg, transparent 75%, #22222a 75%);
      background-size: 16px 16px;
      background-position: 0 0, 0 8px, 8px -8px, -8px 0px;
    }

    #previewCanvas {
      image-rendering: pixelated;
      image-rendering: crisp-edges;
      max-width: none;
      box-shadow: 0 2px 10px rgba(0,0,0,0.3);
    }

    /* GLYPH ATLAS SECTION */
    .glyphs-card {
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      flex: 1;
      min-height: 240px;
    }

    .glyph-grid {
      display: grid;
      grid-template-columns: repeat(16, minmax(28px, 1fr));
      grid-auto-rows: 36px;
      gap: 5px;
      overflow-y: auto;
      max-height: 360px;
      background: var(--control-bg);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      padding: 8px;
    }

    .glyph-cell {
      height: 36px;
      min-height: 36px;
      min-width: 28px;
      background: var(--control-bg);
      border: 1px solid var(--control-border);
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2px;
      font-size: 11px;
      cursor: pointer;
      position: relative;
      transition: all 0.12s ease;
      overflow: hidden;
      box-sizing: border-box;
      flex-shrink: 0;
    }

    .glyph-cell:hover {
      border-color: var(--accent);
      background: rgba(59, 130, 246, 0.15);
      transform: scale(1.04);
      z-index: 2;
    }

    .glyph-cell.active {
      border-color: var(--accent-active);
      background: var(--selection);
      box-shadow: 0 0 0 1.5px var(--accent-active);
      z-index: 3;
    }

    .glyph-cell.has-glyph {
      background-color: rgba(255, 255, 255, 0.03);
      background-image: 
        linear-gradient(45deg, rgba(255,255,255,0.02) 25%, transparent 25%), 
        linear-gradient(-45deg, rgba(255,255,255,0.02) 25%, transparent 25%), 
        linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.02) 75%), 
        linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.02) 75%);
      background-size: 6px 6px;
      background-position: 0 0, 0 3px, 3px -3px, -3px 0px;
    }

    .glyph-cell canvas {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      image-rendering: pixelated;
      image-rendering: crisp-edges;
      display: block;
      pointer-events: none;
    }

    .glyph-code-tag {
      font-size: 9.5px;
      font-family: monospace;
      color: var(--text-muted);
      line-height: 1;
      text-align: center;
      pointer-events: none;
    }
  </style>
</head>
<body>

  <!-- TOP MENUBAR -->
  <div class="menubar">
    <span class="app-title-tag">🔤 BGDFntEditor</span>
    
    <div class="menu-item">
      <span>${t.menuFile}</span>
      <div class="menu-dropdown">
        <div class="menu-dropdown-item" onclick="browseTTF()">
          <span>${t.openTTF}</span>
        </div>
        <div class="menu-separator"></div>
        <div class="menu-dropdown-item" onclick="saveFont()">
          <span>${t.save}</span>
          <span style="font-size:9.5px; opacity:0.6;">Ctrl+S</span>
        </div>
        <div class="menu-dropdown-item" onclick="saveFontAs()">
          <span>${t.saveAs}</span>
        </div>
      </div>
    </div>

    <div class="menu-item">
      <span>${t.menuView}</span>
      <div class="menu-dropdown">
        <div class="menu-dropdown-item" onclick="setZoom(1.0)">
          <span>${t.zoom100}</span>
        </div>
        <div class="menu-dropdown-item" onclick="fitPreviewZoom()">
          <span>${t.zoomFit}</span>
        </div>
        <div class="menu-separator"></div>
        <div class="menu-dropdown-item" onclick="toggleCharCodes()">
          <span>${t.toggleCharCodes}</span>
        </div>
      </div>
    </div>

    <div class="menu-item">
      <span>${t.menuHelp}</span>
      <div class="menu-dropdown">
        <div class="menu-dropdown-item" onclick="showAboutDialog()">
          <span>${t.aboutTitle}</span>
        </div>
      </div>
    </div>
  </div>

  <!-- MAIN TWO-COLUMN BODY -->
  <div class="app-body">

    <!-- LEFT SIDEBAR -->
    <div class="sidebar">

      <!-- SECTION 1: FUENTE -->
      <div class="section-card">
        <div class="section-title">${t.secFont}</div>
        
        <div style="display:flex; flex-direction:column; gap:4px;">
          <span class="form-label">${t.ttfFile}</span>
          <div class="form-row">
            <input type="text" id="ttfPathInput" class="text-input" style="flex:1;" readonly placeholder="/path/to/font.ttf" />
            <button class="btn-input" onclick="browseTTF()">${t.browseBtn}</button>
          </div>
        </div>

        <div style="display:flex; flex-direction:column; gap:4px; margin-top:2px;">
          <div class="slider-row">
            <span class="val-badge" id="fontSizeBadge">19 px</span>
            <input type="range" id="fontSizeSlider" class="slider-styled" min="8" max="96" value="19" oninput="onParamChange()" />
            <span class="form-label">${t.size}</span>
          </div>
        </div>

        <table class="metrics-table">
          <thead>
            <tr>
              <th>${t.metricsFamily}</th>
              <th>${t.metricsAscent}</th>
              <th>${t.metricsDescent}</th>
              <th>${t.metricsLineHeight}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td id="metricFamily">Acknowledge TT</td>
              <td id="metricAscent">14</td>
              <td id="metricDescent">-2</td>
              <td id="metricLineHeight">17</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- SECTION 2: CONJUNTO DE CARACTERES A EXPORTAR -->
      <div class="section-card">
        <div class="section-title">${t.secCharSet}</div>

        <div class="checkbox-grid">
          <label class="checkbox-lbl">
            <input type="checkbox" id="chkDigits" checked onchange="onCharSetChange()" />
            <span>${t.chkDigits}</span>
          </label>
          <label class="checkbox-lbl">
            <input type="checkbox" id="chkSymbols" checked onchange="onCharSetChange()" />
            <span>${t.chkSymbols}</span>
          </label>
          <label class="checkbox-lbl">
            <input type="checkbox" id="chkUppercase" checked onchange="onCharSetChange()" />
            <span>${t.chkUppercase}</span>
          </label>
          <label class="checkbox-lbl">
            <input type="checkbox" id="chkExtended" checked onchange="onCharSetChange()" />
            <span>${t.chkExtended}</span>
          </label>
          <label class="checkbox-lbl">
            <input type="checkbox" id="chkLowercase" checked onchange="onCharSetChange()" />
            <span>${t.chkLowercase}</span>
          </label>
        </div>

        <div style="display:flex; flex-direction:column; gap:4px; margin-top:2px;">
          <div class="form-row">
            <input type="text" id="customRangeInput" class="text-input" style="flex:1;" placeholder="A-Z, 0x20-0x7E, 0xC0-0xFF" oninput="onCharSetChange()" />
            <span class="form-label">${t.customRange}</span>
          </div>
          <span style="font-size:10px; color:var(--accent-active); font-weight:600;" id="charCountLabel">191 ${t.charsSelected}</span>
        </div>
      </div>

      <!-- SECTION 3: EFECTOS -->
      <div class="section-card">
        <div class="section-title">${t.secEffects}</div>

        <!-- ANTIALIASING -->
        <div class="aa-selector">
          <label class="aa-option">
            <input type="radio" name="aaMode" value="none" checked onchange="onParamChange()" />
            <span>${t.aaNone}</span>
          </label>
          <label class="aa-option">
            <input type="radio" name="aaMode" value="normal" onchange="onParamChange()" />
            <span>${t.aaNormal}</span>
          </label>
          <label class="aa-option">
            <input type="radio" name="aaMode" value="strong" onchange="onParamChange()" />
            <span>${t.aaStrong}</span>
          </label>
        </div>

        <!-- FONT ALPHA -->
        <div class="slider-row">
          <span class="val-badge" id="fontAlphaBadge">255</span>
          <input type="range" id="fontAlphaSlider" class="slider-styled" min="0" max="255" value="255" oninput="onParamChange()" />
          <span class="form-label">${t.fontAlpha}</span>
        </div>

        <!-- FONT COLOR RGB -->
        <div class="form-row">
          <div class="rgb-group">
            <span>R:</span><input type="number" id="fontColorR" class="rgb-input" min="0" max="255" value="255" oninput="onColorRgbChange('font')" />
            <span>G:</span><input type="number" id="fontColorG" class="rgb-input" min="0" max="255" value="0" oninput="onColorRgbChange('font')" />
            <span>B:</span><input type="number" id="fontColorB" class="rgb-input" min="0" max="255" value="0" oninput="onColorRgbChange('font')" />
          </div>
          <div class="color-swatch" id="fontColorSwatch" style="background:#ff0000;">
            <input type="color" id="fontColorPicker" value="#ff0000" oninput="onColorPickerChange('font')" />
          </div>
          <span class="form-label">${t.fontColor}</span>
        </div>

        <!-- REBORDE (STROKE) -->
        <div style="display:flex; flex-direction:column; gap:6px; margin-top:2px;">
          <div style="display:flex; align-items:center; justify-content:space-between;">
            <span style="font-size:11px; font-weight:600; color:var(--text-main);">${t.strokeTitle}</span>
            <label class="checkbox-lbl">
              <input type="checkbox" id="chkStroke" checked onchange="onParamChange()" />
              <span>${t.strokeActivate}</span>
            </label>
          </div>
          
          <div class="slider-row">
            <span class="val-badge" id="strokeWidthBadge">1 px</span>
            <input type="range" id="strokeWidthSlider" class="slider-styled" min="1" max="8" value="1" oninput="onParamChange()" />
            <span class="form-label">${t.strokeThickness}</span>
          </div>

          <div class="form-row">
            <div class="rgb-group">
              <span>R:</span><input type="number" id="strokeColorR" class="rgb-input" min="0" max="255" value="255" oninput="onColorRgbChange('stroke')" />
              <span>G:</span><input type="number" id="strokeColorG" class="rgb-input" min="0" max="255" value="255" oninput="onColorRgbChange('stroke')" />
              <span>B:</span><input type="number" id="strokeColorB" class="rgb-input" min="0" max="255" value="255" oninput="onColorRgbChange('stroke')" />
            </div>
            <div class="color-swatch" id="strokeColorSwatch" style="background:#ffffff;">
              <input type="color" id="strokeColorPicker" value="#ffffff" oninput="onColorPickerChange('stroke')" />
            </div>
            <span class="form-label">${t.strokeColor}</span>
          </div>

          <div class="slider-row">
            <span class="val-badge" id="strokeAlphaBadge">255</span>
            <input type="range" id="strokeAlphaSlider" class="slider-styled" min="0" max="255" value="255" oninput="onParamChange()" />
            <span class="form-label">${t.strokeAlpha}</span>
          </div>
        </div>

        <!-- SOMBRA (SHADOW) -->
        <div style="display:flex; flex-direction:column; gap:6px; margin-top:2px;">
          <div style="display:flex; align-items:center; justify-content:space-between;">
            <span style="font-size:11px; font-weight:600; color:var(--text-main);">${t.shadowTitle}</span>
            <label class="checkbox-lbl">
              <input type="checkbox" id="chkShadow" checked onchange="onParamChange()" />
              <span>${t.shadowActivate}</span>
            </label>
          </div>

          <div class="shadow-matrix-container">
            <!-- 3x3 MATRIX -->
            <div class="shadow-matrix" id="shadowMatrix">
              <div class="matrix-radio" data-dir="tl" onclick="setShadowDir('tl')"></div>
              <div class="matrix-radio" data-dir="t" onclick="setShadowDir('t')"></div>
              <div class="matrix-radio" data-dir="tr" onclick="setShadowDir('tr')"></div>
              <div class="matrix-radio" data-dir="l" onclick="setShadowDir('l')"></div>
              <div class="matrix-radio" data-dir="c" onclick="setShadowDir('c')"></div>
              <div class="matrix-radio" data-dir="r" onclick="setShadowDir('r')"></div>
              <div class="matrix-radio" data-dir="bl" onclick="setShadowDir('bl')"></div>
              <div class="matrix-radio" data-dir="b" onclick="setShadowDir('b')"></div>
              <div class="matrix-radio active" data-dir="br" onclick="setShadowDir('br')"></div>
            </div>

            <div style="flex:1; display:flex; flex-direction:column; gap:6px;">
              <div class="slider-row">
                <span class="val-badge" id="shadowDistBadge">2 px</span>
                <input type="range" id="shadowDistSlider" class="slider-styled" min="1" max="15" value="2" oninput="onParamChange()" />
                <span class="form-label">${t.shadowDistance}</span>
              </div>

              <div class="form-row">
                <div class="rgb-group">
                  <span>R:</span><input type="number" id="shadowColorR" class="rgb-input" min="0" max="255" value="0" oninput="onColorRgbChange('shadow')" />
                  <span>G:</span><input type="number" id="shadowColorG" class="rgb-input" min="0" max="255" value="0" oninput="onColorRgbChange('shadow')" />
                  <span>B:</span><input type="number" id="shadowColorB" class="rgb-input" min="0" max="255" value="0" oninput="onColorRgbChange('shadow')" />
                </div>
                <div class="color-swatch" id="shadowColorSwatch" style="background:#000000;">
                  <input type="color" id="shadowColorPicker" value="#000000" oninput="onColorPickerChange('shadow')" />
                </div>
                <span class="form-label">${t.shadowColor}</span>
              </div>
            </div>
          </div>
        </div>

      </div>

    </div>

    <!-- RIGHT WORKSPACE -->
    <div class="workspace">

      <!-- SECTION: VISTA PREVIA -->
      <div class="preview-card">
        <div class="section-title">${t.secPreview}</div>

        <textarea class="sample-textarea" id="sampleTextArea" oninput="renderLivePreview()">${t.sampleDefaultText}</textarea>

        <div class="preview-toolbar">
          <div style="display:flex; align-items:center; gap:10px;">
            <label class="checkbox-lbl">
              <input type="checkbox" id="chkPreviewBg" checked onchange="renderLivePreview()" />
              <span>${t.previewBgColor}</span>
            </label>
            <div class="rgb-group">
              <span>R:</span><input type="number" id="previewBgR" class="rgb-input" min="0" max="255" value="71" oninput="onPreviewBgRgbChange()" />
              <span>G:</span><input type="number" id="previewBgG" class="rgb-input" min="0" max="255" value="71" oninput="onPreviewBgRgbChange()" />
              <span>B:</span><input type="number" id="previewBgB" class="rgb-input" min="0" max="255" value="96" oninput="onPreviewBgRgbChange()" />
            </div>
            <div class="color-swatch" id="previewBgSwatch" style="background:rgb(71,71,96);">
              <input type="color" id="previewBgPicker" value="#474760" oninput="onPreviewBgPickerChange()" />
            </div>
            <span class="form-label">${t.colorLbl}</span>

            <label class="checkbox-lbl" style="margin-left:8px;">
              <input type="checkbox" id="chkFineAdjust" checked onchange="renderLivePreview()" />
              <span>${t.fineAdjust}</span>
            </label>
          </div>
        </div>

        <div class="preview-toolbar" style="border-top:1px solid var(--border-color); padding-top:6px;">
          <div class="zoom-toolbar">
            <button class="btn-tool" onclick="fitPreviewZoom()">${t.zoomFit}</button>
            <button class="btn-tool" onclick="setZoom(1.0)">1:1</button>
            <button class="btn-tool" onclick="adjustZoom(-0.15)">◄</button>
            <span class="val-badge" id="zoomBadge" style="cursor:pointer;" onclick="setZoom(1.0)">100%</span>
            <button class="btn-tool" onclick="adjustZoom(0.15)">►</button>
          </div>
          <span style="font-size:10.5px; color:var(--text-muted);" id="canvasInfoLabel">${t.canvasLbl} 321 × 101 · Acknowledge TT · 19 px</span>
        </div>

        <div class="preview-canvas-container checkerboard-pattern" id="previewContainer">
          <canvas id="previewCanvas"></canvas>
        </div>
      </div>

      <!-- SECTION: GLIFOS ATLAS -->
      <div class="glyphs-card">
        <div style="display:flex; align-items:center; justify-content:space-between;">
          <div class="section-title" id="glyphsSecTitle">${t.secGlyphs} (191)</div>
          <label class="checkbox-lbl">
            <input type="checkbox" id="chkShowCodes" onchange="toggleCharCodes()" />
            <span>${t.showCharCode}</span>
          </label>
        </div>

        <div class="glyph-grid" id="glyphGrid"></div>
      </div>

    </div>

  </div>

  <script>
    const vscode = acquireVsCodeApi();
    
    // Application State
    let fontMeta = {
      filename: '${filename}',
      isFnx: true,
      charsetType: 0,
      bpp: 32,
      familyName: 'Acknowledge TT',
      loadedFontFace: null
    };

    let selectedCharCodes = new Set();
    let generatedGlyphs = new Array(256).fill(null);
    let shadowDirection = 'br'; // 'tl', 't', 'tr', 'l', 'c', 'r', 'bl', 'b', 'br'
    let zoomFactor = 1.0;
    let showCodesMode = false;
    let selectedSlot = 65; // 'A'

    // Direction Offsets Map
    const DIR_MAP = {
      tl: [-1, -1],
      t:  [ 0, -1],
      tr: [ 1, -1],
      l:  [-1,  0],
      c:  [ 0,  0],
      r:  [ 1,  0],
      bl: [-1,  1],
      b:  [ 0,  1],
      br: [ 1,  1]
    };

    // Initialize character set selection
    function initCharSets() {
      selectedCharCodes.clear();
      // Digits (48..57)
      if (document.getElementById('chkDigits').checked) {
        for (let i = 48; i <= 57; i++) selectedCharCodes.add(i);
      }
      // Uppercase (65..90)
      if (document.getElementById('chkUppercase').checked) {
        for (let i = 65; i <= 90; i++) selectedCharCodes.add(i);
      }
      // Lowercase (97..122)
      if (document.getElementById('chkLowercase').checked) {
        for (let i = 97; i <= 122; i++) selectedCharCodes.add(i);
      }
      // Symbols (32..47, 58..64, 91..96, 123..126)
      if (document.getElementById('chkSymbols').checked) {
        for (let i = 32; i <= 47; i++) selectedCharCodes.add(i);
        for (let i = 58; i <= 64; i++) selectedCharCodes.add(i);
        for (let i = 91; i <= 96; i++) selectedCharCodes.add(i);
        for (let i = 123; i <= 126; i++) selectedCharCodes.add(i);
      }
      // Extended (160..255)
      if (document.getElementById('chkExtended').checked) {
        for (let i = 160; i <= 255; i++) selectedCharCodes.add(i);
      }

      // Parse custom range input (e.g., "A-Z, 0x20-0x7E, 128-150")
      const customStr = document.getElementById('customRangeInput').value.trim();
      if (customStr) {
        const parts = customStr.split(',');
        for (const p of parts) {
          const rangeMatch = p.trim().match(/^([0-9a-zA-Z]+)-([0-9a-zA-Z]+)$/);
          if (rangeMatch) {
            let start = parseNumOrChar(rangeMatch[1]);
            let end = parseNumOrChar(rangeMatch[2]);
            if (start !== null && end !== null) {
              if (start > end) { const tmp = start; start = end; end = tmp; }
              for (let c = Math.max(0, start); c <= Math.min(255, end); c++) {
                selectedCharCodes.add(c);
              }
            }
          } else {
            const single = parseNumOrChar(p.trim());
            if (single !== null && single >= 0 && single <= 255) {
              selectedCharCodes.add(single);
            }
          }
        }
      }

      document.getElementById('charCountLabel').innerText = selectedCharCodes.size + ' ${t.charsSelected}';
      document.getElementById('glyphsSecTitle').innerText = '${t.secGlyphs} (' + selectedCharCodes.size + ')';
    }

    function parseNumOrChar(str) {
      if (!str) return null;
      if (str.startsWith('0x') || str.startsWith('0X')) {
        return parseInt(str, 16);
      }
      if (/^\\d+$/.test(str)) {
        return parseInt(str, 10);
      }
      if (str.length === 1) {
        return str.charCodeAt(0);
      }
      return null;
    }

    function onCharSetChange() {
      initCharSets();
      regenerateAllGlyphs();
    }

    function setShadowDir(dir) {
      shadowDirection = dir;
      document.querySelectorAll('.matrix-radio').forEach(el => {
        el.classList.toggle('active', el.getAttribute('data-dir') === dir);
      });
      onParamChange();
    }

    // Color Synchronizations
    function onColorRgbChange(type) {
      const r = Math.min(255, Math.max(0, parseInt(document.getElementById(type + 'ColorR').value || '0', 10)));
      const g = Math.min(255, Math.max(0, parseInt(document.getElementById(type + 'ColorG').value || '0', 10)));
      const b = Math.min(255, Math.max(0, parseInt(document.getElementById(type + 'ColorB').value || '0', 10)));
      
      const hex = '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
      document.getElementById(type + 'ColorPicker').value = hex;
      document.getElementById(type + 'ColorSwatch').style.backgroundColor = hex;
      onParamChange();
    }

    function onColorPickerChange(type) {
      const hex = document.getElementById(type + 'ColorPicker').value;
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);

      document.getElementById(type + 'ColorR').value = r;
      document.getElementById(type + 'ColorG').value = g;
      document.getElementById(type + 'ColorB').value = b;
      document.getElementById(type + 'ColorSwatch').style.backgroundColor = hex;
      onParamChange();
    }

    function onPreviewBgRgbChange() {
      const r = Math.min(255, Math.max(0, parseInt(document.getElementById('previewBgR').value || '0', 10)));
      const g = Math.min(255, Math.max(0, parseInt(document.getElementById('previewBgG').value || '0', 10)));
      const b = Math.min(255, Math.max(0, parseInt(document.getElementById('previewBgB').value || '0', 10)));
      
      const hex = '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
      document.getElementById('previewBgPicker').value = hex;
      document.getElementById('previewBgSwatch').style.backgroundColor = 'rgb(' + r + ',' + g + ',' + b + ')';
      renderLivePreview();
    }

    function onPreviewBgPickerChange() {
      const hex = document.getElementById('previewBgPicker').value;
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);

      document.getElementById('previewBgR').value = r;
      document.getElementById('previewBgG').value = g;
      document.getElementById('previewBgB').value = b;
      document.getElementById('previewBgSwatch').style.backgroundColor = hex;
      renderLivePreview();
    }

    function onParamChange() {
      const fontSize = document.getElementById('fontSizeSlider').value;
      document.getElementById('fontSizeBadge').innerText = fontSize + ' px';

      const fontAlpha = document.getElementById('fontAlphaSlider').value;
      document.getElementById('fontAlphaBadge').innerText = fontAlpha;

      const strokeWidth = document.getElementById('strokeWidthSlider').value;
      document.getElementById('strokeWidthBadge').innerText = strokeWidth + ' px';

      const strokeAlpha = document.getElementById('strokeAlphaSlider').value;
      document.getElementById('strokeAlphaBadge').innerText = strokeAlpha;

      const shadowDist = document.getElementById('shadowDistSlider').value;
      document.getElementById('shadowDistBadge').innerText = shadowDist + ' px';

      regenerateAllGlyphs();
    }

    // Host Message Handling
    window.addEventListener('message', e => {
      const msg = e.data;
      if (msg.type === 'init') {
        fontMeta.filename = msg.filename || 'font.fnx';
        fontMeta.isFnx = msg.isFnx;
        fontMeta.charsetType = msg.charsetType;
        fontMeta.bpp = msg.bpp;

        if (msg.hasExistingGlyphs && msg.glyphs) {
          selectedCharCodes.clear();
          let maxH = 0;
          for (let i = 0; i < 256; i++) {
            if (msg.glyphs[i]) {
              const rawAdv = msg.glyphs[i].xadvance;
              const w = msg.glyphs[i].width;
              const h = msg.glyphs[i].height;

              generatedGlyphs[i] = {
                charIndex: i,
                width: w,
                height: h,
                xadvance: (rawAdv && rawAdv > 0) ? rawAdv : (w > 0 ? w + 1 : 8),
                yadvance: (msg.glyphs[i].yadvance && msg.glyphs[i].yadvance > 0) ? msg.glyphs[i].yadvance : h,
                xoffset: msg.glyphs[i].xoffset || 0,
                yoffset: msg.glyphs[i].yoffset || 0,
                rgbaData: new Uint8Array(msg.glyphs[i].rgbaData)
              };
              selectedCharCodes.add(i);
              if (h > maxH) maxH = h;
            } else {
              generatedGlyphs[i] = null;
            }
          }

          if (maxH > 0) {
            document.getElementById('metricFamily').innerText = fontMeta.filename;
            document.getElementById('metricLineHeight').innerText = maxH;
            document.getElementById('metricAscent').innerText = Math.round(maxH * 0.8);
            document.getElementById('metricDescent').innerText = '-' + Math.round(maxH * 0.2);
            document.getElementById('fontSizeBadge').innerText = maxH + ' px';
            document.getElementById('fontSizeSlider').value = maxH;
          }

          document.getElementById('charCountLabel').innerText = selectedCharCodes.size + ' ${t.charsSelected}';
          document.getElementById('glyphsSecTitle').innerText = '${t.secGlyphs} (' + selectedCharCodes.size + ')';
          renderLivePreview();
          renderGlyphAtlas();
        } else {
          initCharSets();
          regenerateAllGlyphs();
        }
      } else if (msg.type === 'loadedTTF') {
        document.getElementById('ttfPathInput').value = msg.filePath;
        fontMeta.familyName = msg.familyName;
        document.getElementById('metricFamily').innerText = msg.filename;

        // Register font with FontFace API
        const fontDataU8 = new Uint8Array(msg.fontData);
        const fontFace = new FontFace(msg.familyName, fontDataU8);
        fontFace.load().then(loaded => {
          document.fonts.add(loaded);
          fontMeta.loadedFontFace = loaded;
          regenerateAllGlyphs();
        }).catch(err => {
          console.error('FontFace load error:', err);
          regenerateAllGlyphs();
        });
      }
    });

    vscode.postMessage({ type: 'ready' });

    // RASTERIZATION ENGINE
    function regenerateAllGlyphs() {
      const fontSize = parseInt(document.getElementById('fontSizeSlider').value, 10);
      const fontAlpha = parseInt(document.getElementById('fontAlphaSlider').value, 10) / 255;
      const fontColorR = parseInt(document.getElementById('fontColorR').value || '0', 10);
      const fontColorG = parseInt(document.getElementById('fontColorG').value || '0', 10);
      const fontColorB = parseInt(document.getElementById('fontColorB').value || '0', 10);
      const fontColorRGBA = 'rgba(' + fontColorR + ',' + fontColorG + ',' + fontColorB + ',' + fontAlpha + ')';

      const strokeActive = document.getElementById('chkStroke').checked;
      const strokeWidth = strokeActive ? parseInt(document.getElementById('strokeWidthSlider').value, 10) : 0;
      const strokeAlpha = parseInt(document.getElementById('strokeAlphaSlider').value, 10) / 255;
      const strokeColorR = parseInt(document.getElementById('strokeColorR').value || '0', 10);
      const strokeColorG = parseInt(document.getElementById('strokeColorG').value || '0', 10);
      const strokeColorB = parseInt(document.getElementById('strokeColorB').value || '0', 10);
      const strokeColorRGBA = 'rgba(' + strokeColorR + ',' + strokeColorG + ',' + strokeColorB + ',' + strokeAlpha + ')';

      const shadowActive = document.getElementById('chkShadow').checked;
      const shadowDist = parseInt(document.getElementById('shadowDistSlider').value, 10);
      const shadowAlpha = 0.75;
      const shadowColorR = parseInt(document.getElementById('shadowColorR').value || '0', 10);
      const shadowColorG = parseInt(document.getElementById('shadowColorG').value || '0', 10);
      const shadowColorB = parseInt(document.getElementById('shadowColorB').value || '0', 10);
      const shadowColorRGBA = 'rgba(' + shadowColorR + ',' + shadowColorG + ',' + shadowColorB + ',' + shadowAlpha + ')';

      const aaMode = document.querySelector('input[name="aaMode"]:checked')?.value || 'none';
      const fontFamily = fontMeta.familyName ? '"' + fontMeta.familyName + '", Arial, sans-serif' : 'Arial, sans-serif';

      const dirVec = DIR_MAP[shadowDirection] || [1, 1];
      const shadowOffX = shadowActive ? dirVec[0] * shadowDist : 0;
      const shadowOffY = shadowActive ? dirVec[1] * shadowDist : 0;

      const padding = Math.max(4, (strokeWidth * 2) + Math.abs(shadowDist) + 4);

      // Measure font line metrics
      const measurer = document.createElement('canvas');
      const mctx = measurer.getContext('2d');
      mctx.font = fontSize + 'px ' + fontFamily;
      const mText = mctx.measureText('MgÅ');
      const ascent = Math.ceil(mText.actualBoundingBoxAscent || fontSize * 0.8);
      const descent = Math.ceil(mText.actualBoundingBoxDescent || fontSize * 0.2);
      const lineHeight = ascent + descent + strokeWidth * 2;

      document.getElementById('metricAscent').innerText = ascent;
      document.getElementById('metricDescent').innerText = '-' + descent;
      document.getElementById('metricLineHeight').innerText = lineHeight;

      const offscreen = document.createElement('canvas');
      const ctx = offscreen.getContext('2d');

      const hostGlyphsPayload = new Array(256).fill(null);

      for (let code = 0; code < 256; code++) {
        if (!selectedCharCodes.has(code)) {
          generatedGlyphs[code] = null;
          continue;
        }

        const char = String.fromCharCode(code);
        ctx.font = fontSize + 'px ' + fontFamily;
        const charMetrics = ctx.measureText(char);
        const charW = Math.ceil(charMetrics.width);

        const canvasW = Math.max(4, charW + (padding * 2));
        const canvasH = Math.max(4, lineHeight + (padding * 2));

        offscreen.width = canvasW;
        offscreen.height = canvasH;
        ctx.clearRect(0, 0, canvasW, canvasH);

        ctx.font = fontSize + 'px ' + fontFamily;
        ctx.textBaseline = 'top';

        const drawX = padding;
        const drawY = padding;

        // 1. Draw Shadow
        if (shadowActive && shadowDist > 0) {
          if (strokeWidth > 0) {
            ctx.lineWidth = strokeWidth * 2;
            ctx.strokeStyle = shadowColorRGBA;
            ctx.strokeText(char, drawX + shadowOffX, drawY + shadowOffY);
          }
          ctx.fillStyle = shadowColorRGBA;
          ctx.fillText(char, drawX + shadowOffX, drawY + shadowOffY);
        }

        // 2. Draw Stroke
        if (strokeWidth > 0) {
          ctx.lineWidth = strokeWidth * 2;
          ctx.strokeStyle = strokeColorRGBA;
          ctx.strokeText(char, drawX, drawY);
        }

        // 3. Draw Main Font Body
        ctx.fillStyle = fontColorRGBA;
        ctx.fillText(char, drawX, drawY);

        // Extract Pixels
        const imgData = ctx.getImageData(0, 0, canvasW, canvasH);
        const pixels = imgData.data;

        // 4. Antialiasing Filter (Sin AA threshold for retro pixel precision)
        if (aaMode === 'none') {
          for (let p = 0; p < pixels.length; p += 4) {
            const alpha = pixels[p + 3];
            pixels[p + 3] = alpha > 90 ? 255 : 0;
          }
        } else if (aaMode === 'strong') {
          for (let p = 0; p < pixels.length; p += 4) {
            const alpha = pixels[p + 3];
            if (alpha > 0) {
              pixels[p + 3] = Math.min(255, Math.round(alpha * 1.25));
            }
          }
        }

        const rawU8 = new Uint8Array(pixels);

        generatedGlyphs[code] = {
          charIndex: code,
          width: canvasW,
          height: canvasH,
          xadvance: Math.ceil(charMetrics.width) + (strokeWidth * 2) + 2,
          yadvance: lineHeight,
          xoffset: 0,
          yoffset: 0,
          rgbaData: rawU8
        };

        hostGlyphsPayload[code] = {
          charIndex: code,
          width: canvasW,
          height: canvasH,
          xadvance: Math.ceil(charMetrics.width) + (strokeWidth * 2) + 2,
          yadvance: lineHeight,
          xoffset: 0,
          yoffset: 0,
          rgbaData: Array.from(rawU8)
        };
      }

      // Synchronize with host document
      vscode.postMessage({
        type: 'updateGlyphs',
        glyphs: hostGlyphsPayload
      });

      renderLivePreview();
      renderGlyphAtlas();
    }

    // LIVE PREVIEW RENDERER
    function renderLivePreview() {
      const canvas = document.getElementById('previewCanvas');
      const ctx = canvas.getContext('2d');
      const text = document.getElementById('sampleTextArea').value || '';
      const lines = text.split('\\n');

      const bgActive = document.getElementById('chkPreviewBg').checked;
      const bgR = parseInt(document.getElementById('previewBgR').value || '71', 10);
      const bgG = parseInt(document.getElementById('previewBgG').value || '71', 10);
      const bgB = parseInt(document.getElementById('previewBgB').value || '96', 10);

      // Measure total canvas size
      let maxLineWidth = 0;
      const lineHeight = Math.max(12, parseInt(document.getElementById('metricLineHeight').innerText || '20', 10));

      let spaceAdvance = Math.round(lineHeight * 0.5);
      if (generatedGlyphs[65] && generatedGlyphs[65].xadvance > 0) {
        spaceAdvance = Math.round(generatedGlyphs[65].xadvance * 0.6);
      } else if (generatedGlyphs[32] && generatedGlyphs[32].xadvance > 0) {
        spaceAdvance = generatedGlyphs[32].xadvance;
      }

      for (const line of lines) {
        let lineW = 0;
        for (let i = 0; i < line.length; i++) {
          const code = line.charCodeAt(i);
          const g = generatedGlyphs[code];
          if (code === 32) {
            lineW += (g && g.xadvance > 0) ? g.xadvance : spaceAdvance;
          } else if (g) {
            lineW += (g.xadvance > 0) ? g.xadvance : (g.width > 0 ? g.width + 1 : spaceAdvance);
          } else {
            lineW += spaceAdvance;
          }
        }
        if (lineW > maxLineWidth) maxLineWidth = lineW;
      }

      const padX = 24;
      const padY = 20;
      const canvasW = Math.max(200, maxLineWidth + (padX * 2));
      const canvasH = Math.max(80, (lines.length * (lineHeight + 4)) + (padY * 2));

      canvas.width = canvasW;
      canvas.height = canvasH;

      ctx.clearRect(0, 0, canvasW, canvasH);

      // Background Fill
      if (bgActive) {
        ctx.fillStyle = 'rgb(' + bgR + ',' + bgG + ',' + bgB + ')';
        ctx.fillRect(0, 0, canvasW, canvasH);
      }

      // Draw Lines
      let curY = padY;
      for (const line of lines) {
        let curX = padX;
        for (let i = 0; i < line.length; i++) {
          const code = line.charCodeAt(i);
          const g = generatedGlyphs[code];
          if (code === 32) {
            curX += (g && g.xadvance > 0) ? g.xadvance : spaceAdvance;
          } else if (g && g.rgbaData && g.width > 0 && g.height > 0) {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = g.width;
            tempCanvas.height = g.height;
            const tctx = tempCanvas.getContext('2d');
            const imgData = new ImageData(new Uint8ClampedArray(g.rgbaData), g.width, g.height);
            tctx.putImageData(imgData, 0, 0);

            const drawY = curY + (g.yoffset || 0);
            ctx.drawImage(tempCanvas, curX + (g.xoffset || 0), drawY);
            curX += (g.xadvance > 0) ? g.xadvance : g.width + 1;
          } else {
            curX += spaceAdvance;
          }
        }
        curY += lineHeight + 4;
      }

      // Update Canvas info text
      const fontSize = document.getElementById('fontSizeSlider').value;
      const family = fontMeta.familyName || 'Font';
      document.getElementById('canvasInfoLabel').innerText = '${t.canvasLbl} ' + canvasW + ' × ' + canvasH + ' · ' + family + ' · ' + fontSize + ' px';

      applyZoomStyle();
    }

    // GLYPH ATLAS RENDERER
    function renderGlyphAtlas() {
      const grid = document.getElementById('glyphGrid');
      grid.innerHTML = '';

      for (let i = 0; i < 256; i++) {
        const cell = document.createElement('div');
        const g = generatedGlyphs[i];
        const isSelected = i === selectedSlot;

        cell.className = 'glyph-cell ' + (g ? 'has-glyph ' : '') + (isSelected ? 'active' : '');
        cell.title = 'Slot ' + i + ' (0x' + i.toString(16).toUpperCase() + ') - ' + (i >= 32 && i <= 126 ? String.fromCharCode(i) : '');

        if (showCodesMode) {
          const tag = document.createElement('span');
          tag.className = 'glyph-code-tag';
          tag.innerText = (i >= 32 && i <= 126) ? String.fromCharCode(i) : ('0x' + i.toString(16).toUpperCase());
          cell.appendChild(tag);
        } else if (g && g.rgbaData) {
          const c = document.createElement('canvas');
          c.width = g.width;
          c.height = g.height;
          const cctx = c.getContext('2d');
          const imgData = new ImageData(new Uint8ClampedArray(g.rgbaData), g.width, g.height);
          cctx.putImageData(imgData, 0, 0);
          cell.appendChild(c);
        } else {
          const tag = document.createElement('span');
          tag.className = 'glyph-code-tag';
          tag.innerText = i === 0 ? '·' : i.toString(16).toUpperCase();
          cell.appendChild(tag);
        }

        cell.onclick = () => {
          selectedSlot = i;
          renderGlyphAtlas();
        };

        grid.appendChild(cell);
      }
    }

    // Zoom Controls
    function setZoom(factor) {
      zoomFactor = Math.max(0.25, Math.min(4.0, factor));
      applyZoomStyle();
    }

    function adjustZoom(delta) {
      setZoom(zoomFactor + delta);
    }

    function fitPreviewZoom() {
      const container = document.getElementById('previewContainer');
      const canvas = document.getElementById('previewCanvas');
      if (!container || !canvas || canvas.width === 0) return;

      const scaleX = (container.clientWidth - 40) / canvas.width;
      const scaleY = (container.clientHeight - 40) / canvas.height;
      setZoom(Math.min(scaleX, scaleY, 2.0));
    }

    function applyZoomStyle() {
      const canvas = document.getElementById('previewCanvas');
      if (canvas) {
        canvas.style.transformOrigin = 'center center';
        canvas.style.transform = 'scale(' + zoomFactor.toFixed(2) + ')';
      }
      document.getElementById('zoomBadge').innerText = Math.round(zoomFactor * 100) + '%';
    }

    function toggleCharCodes() {
      showCodesMode = !showCodesMode;
      document.getElementById('chkShowCodes').checked = showCodesMode;
      renderGlyphAtlas();
    }

    // Menu Actions
    function browseTTF() {
      vscode.postMessage({ type: 'browseTTF' });
    }

    function saveFont() {
      vscode.postMessage({ type: 'save' });
    }

    function saveFontAs() {
      vscode.postMessage({ type: 'saveAs' });
    }

    function showAboutDialog() {
      vscode.postMessage({
        type: 'showInfo',
        message: 'BGDFntEditor v2.0 - Editor y Rasterizador Profesional de Fuentes Bitmap para BennuGD2'
      });
    }

    // Keyboard Shortcuts
    window.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveFont();
      }
    });
  </script>
</body>
</html>`;
  }
}
