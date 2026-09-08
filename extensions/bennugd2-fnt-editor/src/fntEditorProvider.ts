import * as vscode from 'vscode';
import * as path from 'path';
import { FntParser, BennuFont, Glyph } from './fntParser';

class FntDocument implements vscode.CustomDocument {
  public readonly uri: vscode.Uri;
  public font: BennuFont;

  constructor(uri: vscode.Uri, initialData: Uint8Array) {
    this.uri = uri;
    if (initialData.length > 0) {
      this.font = FntParser.parse(initialData);
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
    const data = await vscode.workspace.fs.readFile(uri);
    return new FntDocument(uri, data);
  }

  async resolveCustomEditor(
    document: FntDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.file(path.join(this.context.extensionPath, 'media'))
      ]
    };

    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

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
        isFnx: document.font.isFnx,
        charsetType: document.font.charsetType,
        bpp: document.font.bpp,
        glyphs: glyphsPayload
      });
    };

    webviewPanel.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'ready':
          sendFontData();
          break;

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
          this._onDidChangeCustomDocument.fire({
            document,
            undo: () => {},
            redo: () => {}
          });
          sendFontData();
          break;
        }
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

  private getHtmlForWebview(_webview: vscode.Webview): string {
    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BennuGD Font Editor</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background, #1e1e1e);
      --fg: var(--vscode-editor-foreground, #d4d4d4);
      --card-bg: var(--vscode-editorWidget-background, #252526);
      --card-border: var(--vscode-widget-border, #3c3c3c);
      --accent: var(--vscode-button-background, #007acc);
      --accent-hover: var(--vscode-button-hoverBackground, #0062a3);
      --selection: var(--vscode-list-activeSelectionBackground, #094771);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    body { background: var(--bg); color: var(--fg); height: 100vh; display: flex; flex-direction: column; overflow: hidden; }
    header { padding: 10px 16px; background: var(--card-bg); border-bottom: 1px solid var(--card-border); display: flex; justify-content: space-between; align-items: center; }
    .btn { background: var(--accent); color: #fff; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: 500; }
    .btn:hover { background: var(--accent-hover); }
    .btn-secondary { background: var(--card-border); }
    .main-container { flex: 1; display: flex; overflow: hidden; }
    .sidebar { width: 360px; border-right: 1px solid var(--card-border); display: flex; flex-direction: column; background: var(--card-bg); padding: 12px; gap: 12px; overflow-y: auto; }
    .editor-pane { flex: 1; display: flex; flex-direction: column; padding: 16px; gap: 16px; overflow-y: auto; }
    .field-group { display: flex; flex-direction: column; gap: 6px; }
    .field-group label { font-size: 11px; text-transform: uppercase; color: #888; font-weight: 600; }
    .field-group input, .field-group select { background: var(--bg); border: 1px solid var(--card-border); color: var(--fg); padding: 6px 8px; border-radius: 4px; font-size: 13px; }
    .glyph-grid { display: grid; grid-template-columns: repeat(16, 1fr); gap: 4px; background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 8px; padding: 8px; max-height: 280px; overflow-y: auto; }
    .glyph-cell { aspect-ratio: 1; background: var(--bg); border: 1px solid var(--card-border); border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 12px; cursor: pointer; }
    .glyph-cell.active { border-color: var(--accent); background: var(--selection); }
    .glyph-cell.has-glyph { background: rgba(0, 122, 204, 0.2); }
    .preview-box { flex: 1; min-height: 180px; background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 8px; padding: 16px; display: flex; flex-direction: column; gap: 10px; }
    .preview-canvas { width: 100%; height: 140px; background: #000; border-radius: 4px; image-rendering: pixelated; }
  </style>
</head>
<body>
  <header>
    <div><strong>🔤 BennuGD Font Editor</strong> <span id="fontBadge" style="font-size:12px; color:#888; margin-left:8px;"></span></div>
    <div style="display:flex; gap:8px;">
      <input type="file" id="ttfInput" accept=".ttf,.otf" style="display:none;" />
      <button class="btn" onclick="document.getElementById('ttfInput').click()">📁 Cargar TTF / OTF</button>
      <button class="btn btn-secondary" onclick="generateFromTTF()">⚡ Generar Glifos</button>
    </div>
  </header>

  <div class="main-container">
    <div class="sidebar">
      <div class="field-group">
        <label>Familia de Fuente</label>
        <input type="text" id="fontFamily" value="Arial, sans-serif" />
      </div>

      <div class="field-group">
        <label>Tamaño de Cuerpo (px)</label>
        <input type="number" id="fontSize" value="24" min="6" max="150" />
      </div>

      <div class="field-group">
        <label>Color de Fuente</label>
        <input type="color" id="fontColor" value="#ffffff" />
      </div>

      <div class="field-group">
        <label>Efecto de Reborde (Stroke)</label>
        <div style="display:flex; gap:6px;">
          <input type="number" id="strokeWidth" value="0" min="0" max="10" placeholder="Grosor" style="width:70px;" />
          <input type="color" id="strokeColor" value="#000000" style="flex:1;" />
        </div>
      </div>

      <div class="field-group">
        <label>Sombra (Shadow)</label>
        <div style="display:flex; gap:6px;">
          <input type="number" id="shadowBlur" value="0" min="0" max="10" placeholder="Blur" style="width:70px;" />
          <input type="color" id="shadowColor" value="#000000" style="flex:1;" />
        </div>
      </div>

      <div class="field-group">
        <label>Rango de Caracteres</label>
        <select id="charRange">
          <option value="basic">Dígitos y Letras (32..126 ASCII)</option>
          <option value="extended" selected>Extendido ISO-8859-1 (32..255 ñ, á, ü, ¡...)</option>
          <option value="digits">Solo Dígitos (0..9)</option>
        </select>
      </div>
    </div>

    <div class="editor-pane">
      <div style="font-size:12px; font-weight:bold; text-transform:uppercase; color:#888;">Tabla de Glifos (256 Slots)</div>
      <div class="glyph-grid" id="glyphGrid"></div>

      <div class="preview-box">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <label style="font-size:11px; text-transform:uppercase; color:#888; font-weight:600;">Vista Previa en Vivo</label>
          <input type="text" id="sampleText" value="BennuGD2: ¡Hola Mundo! 1234567890" style="background:var(--bg); border:1px solid var(--card-border); color:var(--fg); padding:4px 8px; border-radius:4px; font-size:12px; width:60%;" oninput="renderSampleText()" />
        </div>
        <canvas id="previewCanvas" class="preview-canvas"></canvas>
      </div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    let fontData = { isFnx: true, charsetType: 0, bpp: 32, glyphs: [] };
    let selectedChar = 65; // 'A'

    window.addEventListener('message', e => {
      const msg = e.data;
      if (msg.type === 'init') {
        fontData = msg;
        document.getElementById('fontBadge').innerText = (fontData.isFnx ? 'FNX (Moderno)' : 'FNT (Legado)') + ' - 32 bpp';
        renderGlyphGrid();
        renderSampleText();
      }
    });

    vscode.postMessage({ type: 'ready' });

    function renderGlyphGrid() {
      const grid = document.getElementById('glyphGrid');
      grid.innerHTML = '';
      for (let i = 0; i < 256; i++) {
        const cell = document.createElement('div');
        const has = fontData.glyphs && fontData.glyphs[i] !== null;
        cell.className = 'glyph-cell ' + (has ? 'has-glyph ' : '') + (i === selectedChar ? 'active' : '');
        cell.innerText = i >= 32 && i <= 126 ? String.fromCharCode(i) : (i === 0 ? '·' : i.toString(16).toUpperCase());
        cell.title = 'Slot ' + i + ' (0x' + i.toString(16).toUpperCase() + ')';
        cell.onclick = () => {
          selectedChar = i;
          renderGlyphGrid();
        };
        grid.appendChild(cell);
      }
    }

    function renderSampleText() {
      const canvas = document.getElementById('previewCanvas');
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const text = document.getElementById('sampleText').value;
      let curX = 20;
      const curY = 60;

      for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        const g = fontData.glyphs ? fontData.glyphs[code] : null;
        if (g && g.rgbaData) {
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = g.width;
          tempCanvas.height = g.height;
          const tempCtx = tempCanvas.getContext('2d');
          const imgData = new ImageData(new Uint8ClampedArray(g.rgbaData), g.width, g.height);
          tempCtx.putImageData(imgData, 0, 0);

          ctx.drawImage(tempCanvas, curX + g.xoffset, curY + g.yoffset);
          curX += g.xadvance;
        } else {
          curX += 16; // Space default
        }
      }
    }

    // Generator from TTF using Canvas Rasterizer
    function generateFromTTF() {
      const fontFamily = document.getElementById('fontFamily').value;
      const fontSize = parseInt(document.getElementById('fontSize').value, 10);
      const fontColor = document.getElementById('fontColor').value;
      const strokeWidth = parseInt(document.getElementById('strokeWidth').value, 10);
      const strokeColor = document.getElementById('strokeColor').value;
      const shadowBlur = parseInt(document.getElementById('shadowBlur').value, 10);
      const shadowColor = document.getElementById('shadowColor').value;
      const range = document.getElementById('charRange').value;

      const newGlyphs = new Array(256).fill(null);
      const startChar = range === 'digits' ? 48 : 32;
      const endChar = range === 'digits' ? 57 : (range === 'basic' ? 126 : 255);

      const offscreen = document.createElement('canvas');
      const ctx = offscreen.getContext('2d');

      for (let code = startChar; code <= endChar; code++) {
        const char = String.fromCharCode(code);
        ctx.font = fontSize + 'px ' + fontFamily;
        const metrics = ctx.measureText(char);

        const width = Math.ceil(metrics.width + (strokeWidth * 2) + (shadowBlur * 2)) + 4;
        const height = Math.ceil(fontSize * 1.3 + (strokeWidth * 2) + (shadowBlur * 2));

        offscreen.width = Math.max(4, width);
        offscreen.height = Math.max(4, height);

        ctx.clearRect(0, 0, offscreen.width, offscreen.height);
        ctx.font = fontSize + 'px ' + fontFamily;
        ctx.textBaseline = 'top';

        if (shadowBlur > 0) {
          ctx.shadowBlur = shadowBlur;
          ctx.shadowColor = shadowColor;
        }

        if (strokeWidth > 0) {
          ctx.lineWidth = strokeWidth * 2;
          ctx.strokeStyle = strokeColor;
          ctx.strokeText(char, strokeWidth + shadowBlur, strokeWidth + shadowBlur);
        }

        ctx.fillStyle = fontColor;
        ctx.fillText(char, strokeWidth + shadowBlur, strokeWidth + shadowBlur);

        const imgData = ctx.getImageData(0, 0, offscreen.width, offscreen.height);

        newGlyphs[code] = {
          charIndex: code,
          width: offscreen.width,
          height: offscreen.height,
          xadvance: Math.ceil(metrics.width) + (strokeWidth * 2) + 2,
          yadvance: height,
          xoffset: 0,
          yoffset: 0,
          rgbaData: Array.from(imgData.data)
        };
      }

      vscode.postMessage({
        type: 'updateGlyphs',
        glyphs: newGlyphs
      });
    }

    // Load custom TTF into font family
    document.getElementById('ttfInput').addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = evt => {
        const fontFace = new FontFace('CustomTTF', evt.target.result);
        fontFace.load().then(loadedFace => {
          document.fonts.add(loadedFace);
          document.getElementById('fontFamily').value = 'CustomTTF';
          generateFromTTF();
        });
      };
      reader.readAsArrayBuffer(file);
    });
  </script>
</body>
</html>`;
  }
}
