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

  constructor(private readonly context: vscode.ExtensionContext) {}

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
    openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken
  ): Promise<FpgDocument> {
    const data = await vscode.workspace.fs.readFile(uri);
    return new FpgDocument(uri, data);
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

    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

    const sendFpgData = () => {
      // Send sprites with base64 encoded rgba or structured arrays
      const payload = {
        type: 'init',
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
          const spriteIndex = message.index;
          if (document.fpg.sprites[spriteIndex]) {
            document.fpg.sprites.splice(spriteIndex, 1);
            this._onDidChangeCustomDocument.fire({
              document,
              undo: () => {},
              redo: () => {}
            });
            sendFpgData();
          }
          break;
        }

        case 'addSprite': {
          const newSprite: FpgSprite = {
            code: message.code || (document.fpg.sprites.length > 0 ? Math.max(...document.fpg.sprites.map(s => s.code)) + 1 : 1),
            description: message.description || 'Sprite',
            filename: message.filename || 'sprite.png',
            width: message.width,
            height: message.height,
            controlPoints: [{ x: Math.floor(message.width / 2), y: Math.floor(message.height / 2) }],
            rgbaData: new Uint8Array(message.rgbaData)
          };
          document.fpg.sprites.push(newSprite);
          this._onDidChangeCustomDocument.fire({
            document,
            undo: () => {},
            redo: () => {}
          });
          sendFpgData();
          break;
        }
      }
    });
  }

  async saveCustomDocument(document: FpgDocument, cancellation: vscode.CancellationToken): Promise<void> {
    const serialized = FpgParser.serialize(document.fpg);
    await vscode.workspace.fs.writeFile(document.uri, serialized);
  }

  async saveCustomDocumentAs(document: FpgDocument, targetResource: vscode.Uri, cancellation: vscode.CancellationToken): Promise<void> {
    const serialized = FpgParser.serialize(document.fpg);
    await vscode.workspace.fs.writeFile(targetResource, serialized);
  }

  async revertCustomDocument(document: FpgDocument, cancellation: vscode.CancellationToken): Promise<void> {
    const data = await vscode.workspace.fs.readFile(document.uri);
    document.fpg = FpgParser.parse(data);
  }

  async backupCustomDocument(document: FpgDocument, context: vscode.CustomDocumentBackupContext, cancellation: vscode.CancellationToken): Promise<vscode.CustomDocumentBackup> {
    const serialized = FpgParser.serialize(document.fpg);
    await vscode.workspace.fs.writeFile(context.destination, serialized);
    return {
      id: context.destination.toString(),
      delete: () => vscode.workspace.fs.delete(context.destination)
    };
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const mediaUri = webview.asWebviewUri(vscode.Uri.file(path.join(this.context.extensionPath, 'media')));

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
    .sidebar { width: 320px; border-right: 1px solid var(--card-border); display: flex; flex-direction: column; background: var(--card-bg); }
    .sprite-list { flex: 1; overflow-y: auto; padding: 8px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; align-content: start; }
    .sprite-card { background: var(--bg); border: 2px solid transparent; border-radius: 6px; padding: 6px; cursor: pointer; text-align: center; transition: 0.15s; }
    .sprite-card.selected { border-color: var(--accent); background: var(--selection); }
    .sprite-card canvas { width: 100%; height: 90px; object-fit: contain; image-rendering: pixelated; background: repeating-conic-gradient(#333 0% 25%, #222 0% 50%) 50% / 16px 16px; border-radius: 4px; }
    .sprite-card .info { font-size: 11px; margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .editor-pane { flex: 1; display: flex; flex-direction: column; padding: 16px; gap: 16px; overflow-y: auto; }
    .preview-box { flex: 1; background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 8px; display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden; }
    .preview-canvas { max-width: 90%; max-height: 90%; image-rendering: pixelated; background: repeating-conic-gradient(#2a2a2a 0% 25%, #1a1a1a 0% 50%) 50% / 20px 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.5); cursor: crosshair; }
    .properties-pane { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 8px; padding: 12px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
    .field { display: flex; flex-direction: column; gap: 4px; }
    .field label { font-size: 11px; text-transform: uppercase; color: #888; font-weight: 600; }
    .field input { background: var(--bg); border: 1px solid var(--card-border); color: var(--fg); padding: 6px 8px; border-radius: 4px; font-size: 13px; }
    .points-list { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
    .point-badge { background: #333; padding: 3px 8px; border-radius: 4px; font-size: 11px; display: flex; align-items: center; gap: 4px; }
  </style>
</head>
<body>
  <header>
    <div><strong>🎨 BennuGD FPG Editor</strong> <span id="fpgInfo" style="font-size:12px; color:#888; margin-left:8px;"></span></div>
    <div style="display:flex; gap:8px;">
      <input type="file" id="importInput" accept="image/png,image/bmp" style="display:none;" />
      <button class="btn" onclick="document.getElementById('importInput').click()">➕ Importar PNG</button>
      <button class="btn btn-secondary" onclick="exportSelectedPng()">💾 Exportar PNG</button>
      <button class="btn btn-secondary" style="background:#a33;" onclick="deleteSelected()">🗑️ Eliminar</button>
    </div>
  </header>

  <div class="main-container">
    <div class="sidebar">
      <div style="padding:8px 12px; border-bottom:1px solid var(--card-border); font-size:12px; font-weight:bold;">
        SPRITES (<span id="spriteCount">0</span>)
      </div>
      <div class="sprite-list" id="spriteGrid"></div>
    </div>

    <div class="editor-pane">
      <div class="preview-box">
        <canvas id="previewCanvas" class="preview-canvas"></canvas>
      </div>

      <div class="properties-pane" id="propsPane">
        <div class="field">
          <label>Código (Graph ID)</label>
          <input type="number" id="propCode" onchange="updateProp('code', parseInt(this.value, 10))" />
        </div>
        <div class="field">
          <label>Descripción</label>
          <input type="text" id="propDesc" onchange="updateProp('description', this.value)" />
        </div>
        <div class="field">
          <label>Dimensiones</label>
          <input type="text" id="propDims" readonly disabled />
        </div>
        <div class="field">
          <label>Puntos de Control (Haz clic en el sprite)</label>
          <div class="points-list" id="pointsBadges"></div>
        </div>
      </div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    let fpgData = { bpp: 32, sprites: [] };
    let selectedIndex = 0;

    window.addEventListener('message', event => {
      const msg = event.data;
      if (msg.type === 'init') {
        fpgData = msg;
        document.getElementById('fpgInfo').innerText = fpgData.bpp + ' bpp';
        document.getElementById('spriteCount').innerText = fpgData.sprites.length;
        renderGrid();
        if (fpgData.sprites.length > 0) {
          selectSprite(Math.min(selectedIndex, fpgData.sprites.length - 1));
        }
      }
    });

    vscode.postMessage({ type: 'ready' });

    function renderGrid() {
      const grid = document.getElementById('spriteGrid');
      grid.innerHTML = '';
      fpgData.sprites.forEach((s, idx) => {
        const card = document.createElement('div');
        card.className = 'sprite-card ' + (idx === selectedIndex ? 'selected' : '');
        card.onclick = () => selectSprite(idx);

        const canvas = document.createElement('canvas');
        canvas.width = s.width;
        canvas.height = s.height;
        const ctx = canvas.getContext('2d');
        const imgData = new ImageData(new Uint8ClampedArray(s.rgbaData), s.width, s.height);
        ctx.putImageData(imgData, 0, 0);

        const info = document.createElement('div');
        info.className = 'info';
        info.innerText = '#' + s.code + ' ' + (s.description || 'Sprite');

        card.appendChild(canvas);
        card.appendChild(info);
        grid.appendChild(card);
      });
    }

    function selectSprite(idx) {
      selectedIndex = idx;
      const s = fpgData.sprites[idx];
      if (!s) return;

      document.querySelectorAll('.sprite-card').forEach((c, i) => {
        c.classList.toggle('selected', i === idx);
      });

      document.getElementById('propCode').value = s.code;
      document.getElementById('propDesc').value = s.description;
      document.getElementById('propDims').value = s.width + ' x ' + s.height + ' px';

      renderPreview(s);
      renderPointsBadges(s);
    }

    function renderPreview(s) {
      const canvas = document.getElementById('previewCanvas');
      canvas.width = s.width;
      canvas.height = s.height;
      const ctx = canvas.getContext('2d');
      const imgData = new ImageData(new Uint8ClampedArray(s.rgbaData), s.width, s.height);
      ctx.putImageData(imgData, 0, 0);

      // Draw Control Points
      s.controlPoints.forEach((pt, i) => {
        ctx.fillStyle = i === 0 ? '#00ffcc' : '#ff0055';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
    }

    function renderPointsBadges(s) {
      const container = document.getElementById('pointsBadges');
      container.innerHTML = '';
      s.controlPoints.forEach((pt, i) => {
        const badge = document.createElement('div');
        badge.className = 'point-badge';
        badge.innerText = 'CP' + i + ': (' + pt.x + ', ' + pt.y + ')';
        container.appendChild(badge);
      });
    }

    // Interactive point placement on canvas click
    document.getElementById('previewCanvas').addEventListener('click', e => {
      const s = fpgData.sprites[selectedIndex];
      if (!s) return;
      const rect = e.target.getBoundingClientRect();
      const scaleX = s.width / rect.width;
      const scaleY = s.height / rect.height;
      const px = Math.round((e.clientX - rect.left) * scaleX);
      const py = Math.round((e.clientY - rect.top) * scaleY);

      if (s.controlPoints.length === 0) {
        s.controlPoints.push({ x: px, y: py });
      } else {
        s.controlPoints[0] = { x: px, y: py }; // Center point CP0
      }

      vscode.postMessage({
        type: 'updateSprite',
        index: selectedIndex,
        controlPoints: s.controlPoints
      });

      renderPreview(s);
      renderPointsBadges(s);
    });

    function updateProp(key, value) {
      const s = fpgData.sprites[selectedIndex];
      if (!s) return;
      s[key] = value;
      vscode.postMessage({
        type: 'updateSprite',
        index: selectedIndex,
        [key]: value
      });
      renderGrid();
    }

    function deleteSelected() {
      if (fpgData.sprites.length === 0) return;
      vscode.postMessage({
        type: 'deleteSprite',
        index: selectedIndex
      });
    }

    // Import PNG
    document.getElementById('importInput').addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = evt => {
        const img = new Image();
        img.onload = () => {
          const cvs = document.createElement('canvas');
          cvs.width = img.width;
          cvs.height = img.height;
          const ctx = cvs.getContext('2d');
          ctx.drawImage(img, 0, 0);
          const imgData = ctx.getImageData(0, 0, img.width, img.height);

          vscode.postMessage({
            type: 'addSprite',
            width: img.width,
            height: img.height,
            filename: file.name,
            description: file.name.replace(/\\.[^/.]+$/, ''),
            rgbaData: Array.from(imgData.data)
          });
        };
        img.src = evt.target.result;
      };
      reader.readAsDataURL(file);
    });

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
