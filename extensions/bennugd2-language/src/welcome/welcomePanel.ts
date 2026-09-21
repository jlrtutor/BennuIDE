import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { BennuCompiler } from '../compiler/compiler';
import { TEMPLATES, getTemplateFiles } from './templates';

export interface RecentProject {
  name: string;
  path: string;
  lastOpened: number;
  version: 'v1' | 'v2';
}

export class WelcomePanel {
  public static currentPanel: WelcomePanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _context: vscode.ExtensionContext;
  private readonly _compiler: BennuCompiler;
  private _disposables: vscode.Disposable[] = [];

  private static readonly STORAGE_KEY_RECENT = 'bennuide.recentProjects';

  public static createOrShow(context: vscode.ExtensionContext, compiler: BennuCompiler, initialTab: string = 'home'): void {
    const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

    if (WelcomePanel.currentPanel) {
      WelcomePanel.currentPanel._panel.reveal(column);
      WelcomePanel.currentPanel._sendMessage({ command: 'switchTab', tab: initialTab });
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'bennuide.welcome',
      'BennuIDE — Inicio',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.file(context.extensionPath)]
      }
    );

    WelcomePanel.currentPanel = new WelcomePanel(panel, context, compiler, initialTab);
  }

  public static addRecentProject(context: vscode.ExtensionContext, folderPath: string): void {
    try {
      if (!fs.existsSync(folderPath)) return;
      const projectName = path.basename(folderPath);
      let list = context.globalState.get<RecentProject[]>(WelcomePanel.STORAGE_KEY_RECENT, []);

      // Check if project has settings for version
      let version: 'v1' | 'v2' = 'v2';
      const settingsPath = path.join(folderPath, '.vscode', 'settings.json');
      if (fs.existsSync(settingsPath)) {
        try {
          const content = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
          if (content['bennugd.version'] === 'v1') version = 'v1';
        } catch { /* ignore */ }
      }

      // Filter out existing entry
      list = list.filter(p => p.path !== folderPath);
      list.unshift({
        name: projectName,
        path: folderPath,
        lastOpened: Date.now(),
        version
      });

      // Keep max 20 recent
      if (list.length > 20) list = list.slice(0, 20);
      context.globalState.update(WelcomePanel.STORAGE_KEY_RECENT, list);

      if (WelcomePanel.currentPanel) {
        WelcomePanel.currentPanel._sendRecentProjects();
      }
    } catch { /* ignore */ }
  }

  private constructor(
    panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    compiler: BennuCompiler,
    initialTab: string
  ) {
    this._panel = panel;
    this._context = context;
    this._compiler = compiler;

    this._updateHtml(initialTab);

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      async message => {
        await this._handleMessage(message);
      },
      null,
      this._disposables
    );
  }

  private _sendMessage(msg: any): void {
    this._panel.webview.postMessage(msg);
  }

  private _sendRecentProjects(): void {
    const list = this._context.globalState.get<RecentProject[]>(WelcomePanel.STORAGE_KEY_RECENT, []);
    // Filter existing on disk
    const existing = list.filter(p => {
      try { return fs.existsSync(p.path); } catch { return false; }
    });
    this._sendMessage({ command: 'updateRecent', projects: existing });
  }

  private _sendCompilerStatus(): void {
    const activeVer = this._compiler.getActiveVersion();
    const config = this._compiler.getProfileConfig();

    let compilerFound = false;
    let runtimeFound = false;

    try {
      if (config.compilerPath && fs.existsSync(config.compilerPath)) {
        compilerFound = true;
      }
    } catch { /* ignore */ }

    try {
      if (config.runtimePath && fs.existsSync(config.runtimePath)) {
        runtimeFound = true;
      }
    } catch { /* ignore */ }

    this._sendMessage({
      command: 'updateCompilerStatus',
      activeVersion: activeVer,
      compilerPath: config.compilerPath,
      runtimePath: config.runtimePath,
      compilerFound,
      runtimeFound
    });
  }

  private async _handleMessage(message: any): Promise<void> {
    switch (message.command) {
      case 'ready': {
        this._sendRecentProjects();
        this._sendCompilerStatus();
        break;
      }

      case 'openProject': {
        const uris = await vscode.window.showOpenDialog({
          canSelectFiles: false,
          canSelectFolders: true,
          canSelectMany: false,
          openLabel: 'Abrir Proyecto BennuGD'
        });
        if (uris && uris.length > 0) {
          const selectedPath = uris[0].fsPath;
          WelcomePanel.addRecentProject(this._context, selectedPath);
          await vscode.commands.executeCommand('vscode.openFolder', uris[0], false);
        }
        break;
      }

      case 'openRecent': {
        if (message.path && fs.existsSync(message.path)) {
          WelcomePanel.addRecentProject(this._context, message.path);
          await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(message.path), false);
        } else {
          vscode.window.showWarningMessage(`La carpeta '${message.path}' ya no existe en el disco.`);
          this._removeRecent(message.path);
        }
        break;
      }

      case 'removeRecent': {
        this._removeRecent(message.path);
        break;
      }

      case 'browseFolder': {
        const uris = await vscode.window.showOpenDialog({
          canSelectFiles: false,
          canSelectFolders: true,
          canSelectMany: false,
          openLabel: 'Seleccionar Carpeta de Destino',
          defaultUri: vscode.Uri.file(process.env.HOME || '/')
        });
        if (uris && uris.length > 0) {
          this._sendMessage({ command: 'folderSelected', path: uris[0].fsPath });
        }
        break;
      }

      case 'browseCompilerPath': {
        const uris = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectFolders: false,
          canSelectMany: false,
          openLabel: 'Seleccionar Binario del Compilador (bgdc)'
        });
        if (uris && uris.length > 0) {
          this._sendMessage({ command: 'compilerPathSelected', path: uris[0].fsPath });
        }
        break;
      }

      case 'browseRuntimePath': {
        const uris = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectFolders: false,
          canSelectMany: false,
          openLabel: 'Seleccionar Binario del Runtime (bgdi)'
        });
        if (uris && uris.length > 0) {
          this._sendMessage({ command: 'runtimePathSelected', path: uris[0].fsPath });
        }
        break;
      }

      case 'saveCompilerConfig': {
        try {
          const cfg = vscode.workspace.getConfiguration('bennugd');
          const ver = message.version || 'v2';
          await cfg.update(`${ver}.compilerPath`, message.compilerPath, vscode.ConfigurationTarget.Global);
          await cfg.update(`${ver}.runtimePath`, message.runtimePath, vscode.ConfigurationTarget.Global);
          await cfg.update('version', ver, vscode.ConfigurationTarget.Global);
          this._compiler.updateStatusBar();
          this._sendCompilerStatus();
          vscode.window.showInformationMessage(`Rutas de BennuGD ${ver.toUpperCase()} guardadas con éxito.`);
        } catch (err: any) {
          vscode.window.showErrorMessage(`Error al guardar configuración: ${err?.message || err}`);
        }
        break;
      }

      case 'switchActiveVersion': {
        await this._compiler.setVersion(message.version);
        this._sendCompilerStatus();
        break;
      }

      case 'createProject': {
        await this._executeCreateProject(message);
        break;
      }

      case 'openDemoProject': {
        await this._openDemo();
        break;
      }

      case 'openDocument': {
        const docName = message.doc;
        let filePath = '';
        const root = path.resolve(this._context.extensionPath, '..', '..');

        if (docName === 'routes') {
          filePath = path.join(root, 'docs', 'CONFIGURACION_RUTAS.md');
        } else if (docName === 'features') {
          filePath = path.join(root, 'docs', 'CARACTERISTICAS.md');
        } else if (docName === 'todo') {
          filePath = path.join(root, 'TODO.md');
        } else if (docName === 'readme') {
          filePath = path.join(root, 'README.md');
        }

        if (filePath && fs.existsSync(filePath)) {
          const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
          await vscode.window.showTextDocument(doc, { preview: false });
        } else {
          vscode.window.showInformationMessage(`Documento '${docName}' no encontrado en el sistema.`);
        }
        break;
      }
    }
  }

  private _removeRecent(targetPath: string): void {
    let list = this._context.globalState.get<RecentProject[]>(WelcomePanel.STORAGE_KEY_RECENT, []);
    list = list.filter(p => p.path !== targetPath);
    this._context.globalState.update(WelcomePanel.STORAGE_KEY_RECENT, list);
    this._sendRecentProjects();
  }

  private async _executeCreateProject(params: {
    name: string;
    parentDir: string;
    template: string;
    version: 'v1' | 'v2';
    width: number;
    height: number;
    fps: number;
  }): Promise<void> {
    const rawName = params.name.trim();
    if (!rawName) {
      vscode.window.showErrorMessage('Por favor introduce un nombre para el proyecto.');
      return;
    }

    const safeName = rawName.replace(/[^a-zA-Z0-9_\-]/g, '_');
    const projectDir = path.join(params.parentDir, safeName);

    if (fs.existsSync(projectDir)) {
      const choice = await vscode.window.showWarningMessage(
        `La carpeta '${projectDir}' ya existe. ¿Deseas continuar e instalar el proyecto en ella?`,
        'Continuar',
        'Cancelar'
      );
      if (choice !== 'Continuar') return;
    }

    try {
      // 1. Create main folder and subfolders
      fs.mkdirSync(projectDir, { recursive: true });
      fs.mkdirSync(path.join(projectDir, 'src'), { recursive: true });
      fs.mkdirSync(path.join(projectDir, 'data', 'fpg'), { recursive: true });
      fs.mkdirSync(path.join(projectDir, 'data', 'fnt'), { recursive: true });
      fs.mkdirSync(path.join(projectDir, 'data', 'audio'), { recursive: true });
      fs.mkdirSync(path.join(projectDir, '.vscode'), { recursive: true });

      // 2. Generate template files
      const templateFiles = getTemplateFiles(
        params.template,
        rawName,
        params.version,
        params.width || 800,
        params.height || 600,
        params.fps || 60
      );

      for (const [relPath, content] of Object.entries(templateFiles)) {
        const fullFilePath = path.join(projectDir, relPath);
        const dir = path.dirname(fullFilePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(fullFilePath, content, 'utf8');
      }

      // 3. Register in recent
      WelcomePanel.addRecentProject(this._context, projectDir);

      vscode.window.showInformationMessage(`¡Proyecto '${rawName}' creado con éxito en ${projectDir}!`);

      // 4. Open project in IDE
      const projectUri = vscode.Uri.file(projectDir);
      await vscode.commands.executeCommand('vscode.openFolder', projectUri, false);
    } catch (err: any) {
      vscode.window.showErrorMessage(`Error al crear el proyecto: ${err?.message || err}`);
    }
  }

  private async _openDemo(): Promise<void> {
    const root = path.resolve(this._context.extensionPath, '..', '..');
    const samplePath = path.join(root, 'examples', 'shooter_sample');

    if (fs.existsSync(samplePath)) {
      WelcomePanel.addRecentProject(this._context, samplePath);
      await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(samplePath), false);
    } else {
      vscode.window.showErrorMessage(`No se encontró la carpeta de ejemplo en ${samplePath}`);
    }
  }

  public dispose(): void {
    WelcomePanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const d = this._disposables.pop();
      if (d) d.dispose();
    }
  }

  private _updateHtml(initialTab: string): void {
    const webview = this._panel.webview;
    const defaultParentDir = process.env.HOME ? path.join(process.env.HOME, 'Projects') : '/';
    const templatesJson = JSON.stringify(TEMPLATES);

    webview.html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BennuIDE — Inicio</title>
  <style>
    :root {
      --bg-primary: #181a1f;
      --bg-secondary: #21252b;
      --bg-card: #282c34;
      --bg-hover: #323842;
      --border-color: #3b4048;
      --accent: #ff6b35;
      --accent-hover: #ff8552;
      --accent-gradient: linear-gradient(135deg, #ff6b35 0%, #f7931e 100%);
      --text-main: #abb2bf;
      --text-bright: #ffffff;
      --text-muted: #5c6370;
      --badge-bg: rgba(255, 107, 53, 0.15);
      --badge-border: rgba(255, 107, 53, 0.4);
      --green: #98c379;
      --yellow: #e5c07b;
      --red: #e06c75;
      --radius-sm: 6px;
      --radius-md: 10px;
      --radius-lg: 14px;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      user-select: none;
    }

    body {
      background-color: var(--bg-primary);
      color: var(--text-main);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      height: 100vh;
      overflow: hidden;
      display: flex;
    }

    /* ─── SIDEBAR NAVIGATION ─── */
    .sidebar {
      width: 240px;
      background-color: var(--bg-secondary);
      border-right: 1px solid var(--border-color);
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
    }

    .brand {
      padding: 24px 20px;
      display: flex;
      align-items: center;
      gap: 12px;
      border-bottom: 1px solid var(--border-color);
    }

    .brand-logo {
      width: 38px;
      height: 38px;
      background: var(--accent-gradient);
      border-radius: var(--radius-md);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(255, 107, 53, 0.35);
      font-size: 20px;
    }

    .brand-text h1 {
      font-size: 18px;
      font-weight: 700;
      color: var(--text-bright);
      letter-spacing: -0.3px;
    }

    .brand-text span {
      font-size: 11px;
      color: var(--accent);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.8px;
    }

    .nav-list {
      list-style: none;
      padding: 16px 12px;
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .nav-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 14px;
      border-radius: var(--radius-sm);
      color: var(--text-main);
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .nav-item:hover {
      background-color: var(--bg-hover);
      color: var(--text-bright);
    }

    .nav-item.active {
      background: var(--accent-gradient);
      color: var(--text-bright);
      box-shadow: 0 2px 8px rgba(255, 107, 53, 0.25);
    }

    .nav-icon {
      font-size: 16px;
      width: 20px;
      text-align: center;
    }

    .sidebar-footer {
      padding: 16px;
      border-top: 1px solid var(--border-color);
      font-size: 11px;
      color: var(--text-muted);
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 8px;
      border-radius: 20px;
      background-color: rgba(152, 195, 121, 0.1);
      border: 1px solid rgba(152, 195, 121, 0.3);
      color: var(--green);
      font-weight: 600;
      font-size: 10px;
    }

    .status-badge.warning {
      background-color: rgba(229, 192, 123, 0.1);
      border-color: rgba(229, 192, 123, 0.3);
      color: var(--yellow);
    }

    /* ─── MAIN CONTENT CONTAINER ─── */
    .content {
      flex: 1;
      overflow-y: auto;
      padding: 32px 40px;
      display: flex;
      flex-direction: column;
    }

    .tab-pane {
      display: none;
      animation: fadeIn 0.2s ease-in-out;
    }

    .tab-pane.active {
      display: block;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* ─── TYPOGRAPHY & HEADINGS ─── */
    .page-header {
      margin-bottom: 28px;
    }

    .page-title {
      font-size: 26px;
      font-weight: 700;
      color: var(--text-bright);
      margin-bottom: 6px;
    }

    .page-subtitle {
      font-size: 14px;
      color: var(--text-muted);
    }

    /* ─── HERO ACTIONS GRID ─── */
    .hero-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 16px;
      margin-bottom: 32px;
    }

    .hero-card {
      background-color: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      padding: 22px;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      gap: 12px;
      transition: all 0.2s ease;
      position: relative;
      overflow: hidden;
    }

    .hero-card:hover {
      border-color: var(--accent);
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
    }

    .hero-card.primary {
      background: linear-gradient(135deg, #2c2220 0%, #282c34 100%);
      border-color: rgba(255, 107, 53, 0.4);
    }

    .hero-card.primary:hover {
      border-color: var(--accent);
      box-shadow: 0 6px 24px rgba(255, 107, 53, 0.2);
    }

    .hero-icon {
      font-size: 28px;
    }

    .hero-title {
      font-size: 16px;
      font-weight: 600;
      color: var(--text-bright);
    }

    .hero-desc {
      font-size: 13px;
      color: var(--text-main);
      line-height: 1.4;
    }

    /* ─── TWO COLUMNS DASHBOARD ─── */
    .dashboard-columns {
      display: grid;
      grid-template-columns: 1.4fr 1fr;
      gap: 24px;
    }

    .section-card {
      background-color: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      padding: 20px;
    }

    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
      padding-bottom: 10px;
      border-bottom: 1px solid var(--border-color);
    }

    .section-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-bright);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    /* ─── RECENT PROJECTS LIST ─── */
    .recent-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .recent-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px;
      background-color: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-sm);
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .recent-item:hover {
      border-color: var(--accent);
      background-color: var(--bg-hover);
    }

    .recent-info {
      display: flex;
      align-items: center;
      gap: 12px;
      overflow: hidden;
    }

    .recent-name {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-bright);
    }

    .recent-path {
      font-size: 11px;
      color: var(--text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 260px;
    }

    .recent-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .btn-icon {
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      font-size: 14px;
      padding: 4px;
      border-radius: 4px;
      transition: color 0.15s ease;
    }

    .btn-icon:hover {
      color: var(--red);
    }

    .empty-state {
      padding: 32px 16px;
      text-align: center;
      color: var(--text-muted);
      font-size: 13px;
    }

    /* ─── DOCUMENTATION & RESOURCES LIST ─── */
    .resource-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .resource-link {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      border-radius: var(--radius-sm);
      background-color: var(--bg-secondary);
      color: var(--text-main);
      text-decoration: none;
      cursor: pointer;
      font-size: 13px;
      transition: all 0.15s ease;
    }

    .resource-link:hover {
      background-color: var(--bg-hover);
      color: var(--text-bright);
    }

    /* ─── PROJECT WIZARD FORM ─── */
    .wizard-container {
      max-width: 820px;
    }

    .form-group {
      margin-bottom: 22px;
    }

    .form-label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      color: var(--text-bright);
      margin-bottom: 8px;
    }

    .form-desc {
      font-size: 12px;
      color: var(--text-muted);
      margin-bottom: 8px;
    }

    .input-row {
      display: flex;
      gap: 10px;
    }

    input[type="text"], select {
      background-color: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-sm);
      color: var(--text-bright);
      font-size: 14px;
      padding: 10px 14px;
      outline: none;
      width: 100%;
      transition: border-color 0.15s ease;
      font-family: inherit;
    }

    input[type="text"]:focus, select:focus {
      border-color: var(--accent);
    }

    .btn {
      background-color: var(--bg-card);
      border: 1px solid var(--border-color);
      color: var(--text-bright);
      font-size: 13px;
      font-weight: 600;
      padding: 10px 18px;
      border-radius: var(--radius-sm);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: all 0.15s ease;
      white-space: nowrap;
      font-family: inherit;
    }

    .btn:hover {
      background-color: var(--bg-hover);
      border-color: var(--text-main);
    }

    .btn-primary {
      background: var(--accent-gradient);
      border-color: transparent;
      color: #ffffff;
      box-shadow: 0 4px 14px rgba(255, 107, 53, 0.35);
    }

    .btn-primary:hover {
      background: linear-gradient(135deg, #ff7a47 0%, #faa238 100%);
      transform: translateY(-1px);
      box-shadow: 0 6px 18px rgba(255, 107, 53, 0.45);
    }

    .path-preview {
      margin-top: 6px;
      font-size: 11px;
      color: var(--text-muted);
      font-family: monospace;
    }

    /* ─── TEMPLATE CARDS SELECTOR ─── */
    .templates-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 14px;
    }

    .template-card {
      background-color: var(--bg-secondary);
      border: 2px solid var(--border-color);
      border-radius: var(--radius-md);
      padding: 16px;
      cursor: pointer;
      transition: all 0.15s ease;
      display: flex;
      flex-direction: column;
      gap: 8px;
      position: relative;
    }

    .template-card:hover {
      border-color: var(--text-muted);
      background-color: var(--bg-card);
    }

    .template-card.selected {
      border-color: var(--accent);
      background-color: var(--bg-card);
      box-shadow: 0 4px 16px rgba(255, 107, 53, 0.15);
    }

    .template-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .template-icon {
      font-size: 24px;
    }

    .template-badge {
      font-size: 10px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 12px;
      background: var(--badge-bg);
      border: 1px solid var(--badge-border);
      color: var(--accent);
      text-transform: uppercase;
    }

    .template-name {
      font-size: 14px;
      font-weight: 700;
      color: var(--text-bright);
    }

    .template-desc {
      font-size: 12px;
      color: var(--text-main);
      line-height: 1.4;
      flex: 1;
    }

    .template-features {
      list-style: none;
      margin-top: 6px;
      font-size: 11px;
      color: var(--text-muted);
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .template-features li::before {
      content: "✓ ";
      color: var(--green);
      font-weight: bold;
    }

    /* ─── VERSION & SETTINGS RADIO PILLS ─── */
    .radio-pills {
      display: flex;
      gap: 12px;
    }

    .radio-pill {
      flex: 1;
      padding: 12px 16px;
      background-color: var(--bg-secondary);
      border: 2px solid var(--border-color);
      border-radius: var(--radius-sm);
      cursor: pointer;
      transition: all 0.15s ease;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .radio-pill.selected {
      border-color: var(--accent);
      background-color: var(--bg-card);
    }

    .radio-title {
      font-size: 14px;
      font-weight: 700;
      color: var(--text-bright);
    }

    .radio-desc {
      font-size: 11px;
      color: var(--text-muted);
    }

    .form-grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }
  </style>
</head>
<body>

  <!-- SIDEBAR -->
  <aside class="sidebar">
    <div class="brand">
      <div class="brand-logo">🔥</div>
      <div class="brand-text">
        <h1>BennuIDE</h1>
        <span>Game Studio</span>
      </div>
    </div>

    <ul class="nav-list">
      <li class="nav-item active" data-tab="home">
        <span class="nav-icon">🏠</span>
        <span>Inicio</span>
      </li>
      <li class="nav-item" data-tab="new-project">
        <span class="nav-icon">🚀</span>
        <span>Nuevo Proyecto</span>
      </li>
      <li class="nav-item" data-tab="recent">
        <span class="nav-icon">🕒</span>
        <span>Proyectos Recientes</span>
      </li>
      <li class="nav-item" data-tab="config">
        <span class="nav-icon">⚙️</span>
        <span>Compilador y Rutas</span>
      </li>
      <li class="nav-item" data-tab="docs">
        <span class="nav-icon">📚</span>
        <span>Documentación</span>
      </li>
    </ul>

    <div class="sidebar-footer">
      <div id="compilerStatusBadge" class="status-badge">
        <span id="compilerStatusDot">●</span>
        <span id="compilerStatusText">BennuGD2 Listo</span>
      </div>
      <div>BennuIDE v1.0.0 (macOS)</div>
    </div>
  </aside>

  <!-- CONTENT -->
  <main class="content">

    <!-- ─── TAB 1: HOME ─── -->
    <section id="tab-home" class="tab-pane active">
      <div class="page-header">
        <h2 class="page-title">Bienvenido a BennuIDE</h2>
        <p class="page-subtitle">Crea, edita y compila videojuegos 2D de alto rendimiento para BennuGD y BennuGD2.</p>
      </div>

      <div class="hero-grid">
        <div class="hero-card primary" onclick="switchTab('new-project')">
          <div class="hero-icon">🚀</div>
          <div class="hero-title">Nuevo Proyecto</div>
          <div class="hero-desc">Asistente guiado con plantillas de juegos 2D, configuración de resolución y estructura recomendada.</div>
        </div>

        <div class="hero-card" onclick="triggerOpenProject()">
          <div class="hero-icon">📂</div>
          <div class="hero-title">Abrir Proyecto Existente</div>
          <div class="hero-desc">Abre una carpeta de juego existente o cualquier directorio de código fuente .prg / .inc.</div>
        </div>

        <div class="hero-card" onclick="triggerOpenDemo()">
          <div class="hero-icon">🎮</div>
          <div class="hero-title">Probar Demo Star Shooter</div>
          <div class="hero-desc">Explora y ejecuta el juego de ejemplo completo Star Shooter 2D incluido con BennuIDE.</div>
        </div>
      </div>

      <div class="dashboard-columns">
        <!-- Columna Izquierda: Recientes -->
        <div class="section-card">
          <div class="section-header">
            <span class="section-title">Proyectos Recientes</span>
            <button class="btn" style="padding: 4px 10px; font-size: 11px;" onclick="triggerOpenProject()">Examinar...</button>
          </div>
          <div id="homeRecentList" class="recent-list">
            <div class="empty-state">No hay proyectos recientes abiertos todavía.</div>
          </div>
        </div>

        <!-- Columna Derecha: Guías y Acceso Rápido -->
        <div class="section-card">
          <div class="section-header">
            <span class="section-title">Recursos y Ayuda</span>
          </div>
          <div class="resource-list">
            <div class="resource-link" onclick="openDoc('routes')">
              <span>⚙️</span>
              <div>
                <strong>Guía de Configuración de Rutas</strong>
                <div style="font-size: 11px; color: var(--text-muted);">Cómo configurar bgdc, bgdi y resolver librerías</div>
              </div>
            </div>
            <div class="resource-link" onclick="openDoc('features')">
              <span>✨</span>
              <div>
                <strong>Características de BennuIDE</strong>
                <div style="font-size: 11px; color: var(--text-muted);">LSP, Debugger, Editores FPG/FNT/Audio</div>
              </div>
            </div>
            <div class="resource-link" onclick="openDoc('readme')">
              <span>📖</span>
              <div>
                <strong>Manual de Primeros Pasos</strong>
                <div style="font-size: 11px; color: var(--text-muted);">Compilación, atajos de teclado y ejecución</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ─── TAB 2: NEW PROJECT WIZARD ─── -->
    <section id="tab-new-project" class="tab-pane">
      <div class="page-header">
        <h2 class="page-title">Asistente de Nuevo Proyecto</h2>
        <p class="page-subtitle">Configura y crea una nueva estructura de proyecto para BennuGD.</p>
      </div>

      <div class="wizard-container">
        <!-- Nombre y Ubicación -->
        <div class="form-group">
          <label class="form-label" for="projectName">Nombre del Proyecto</label>
          <input type="text" id="projectName" value="MiPrimerJuego" placeholder="Ej. MiJuegoEspacial" oninput="updatePathPreview()">
        </div>

        <div class="form-group">
          <label class="form-label" for="projectDir">Carpeta de Destino</label>
          <div class="input-row">
            <input type="text" id="projectDir" value="${defaultParentDir}" oninput="updatePathPreview()">
            <button class="btn" type="button" onclick="browseFolder()">Examinar...</button>
          </div>
          <div class="path-preview" id="pathPreview">Ruta completa: ${defaultParentDir}/MiPrimerJuego</div>
        </div>

        <!-- Versión de Motor -->
        <div class="form-group">
          <label class="form-label">Versión de BennuGD</label>
          <div class="radio-pills">
            <div class="radio-pill selected" id="optVer2" onclick="selectVersion('v2')">
              <span class="radio-title">BennuGD 2 (Recomendado)</span>
              <span class="radio-desc">Motor moderno, gráficos 32-bit, OOP y audio SDL2</span>
            </div>
            <div class="radio-pill" id="optVer1" onclick="selectVersion('v1')">
              <span class="radio-title">BennuGD 1 (Clásico)</span>
              <span class="radio-desc">Compatibilidad con juegos y sintaxis Fenix clásica</span>
            </div>
          </div>
        </div>

        <!-- Selector de Plantilla -->
        <div class="form-group">
          <label class="form-label">Elige una Plantilla de Juego</label>
          <div class="templates-grid" id="templatesContainer"></div>
        </div>

        <!-- Configuración de Pantalla -->
        <div class="form-group">
          <label class="form-label">Resolución y Tasa de Cuadros</label>
          <div class="form-grid-2">
            <div>
              <span class="form-desc">Resolución Inicial</span>
              <select id="resolutionSelect">
                <option value="1920x1080">1920 x 1080 (16:9 Full HD)</option>
                <option value="1280x720">1280 x 720 (16:9 HD)</option>
                <option value="800x600" selected>800 x 600 (4:3 SVGA)</option>
                <option value="640x480">640 x 480 (4:3 Retro VGA)</option>
                <option value="320x240">320 x 240 (4:3 Pixel Art)</option>
              </select>
            </div>
            <div>
              <span class="form-desc">Tasa de Cuadros (FPS)</span>
              <select id="fpsSelect">
                <option value="60" selected>60 FPS (Estándar fluido)</option>
                <option value="30">30 FPS (Retro / Bajo consumo)</option>
                <option value="120">120 FPS (Alta tasa de refresco)</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Botones de Acción -->
        <div style="margin-top: 32px; display: flex; gap: 14px;">
          <button class="btn btn-primary" style="padding: 12px 28px; font-size: 15px;" onclick="submitCreateProject()">
            <span>🚀 Crear y Abrir Proyecto</span>
          </button>
          <button class="btn" style="padding: 12px 20px;" onclick="switchTab('home')">Cancelar</button>
        </div>
      </div>
    </section>

    <!-- ─── TAB 3: PROYECTOS RECIENTES ─── -->
    <section id="tab-recent" class="tab-pane">
      <div class="page-header">
        <h2 class="page-title">Proyectos Recientes</h2>
        <p class="page-subtitle">Acceso rápido al historial de proyectos abiertos en este equipo.</p>
      </div>

      <div class="section-card" style="max-width: 800px;">
        <div style="margin-bottom: 16px;">
          <input type="text" id="recentSearch" placeholder="🔍 Filtrar proyectos recientes..." oninput="filterRecentList()">
        </div>
        <div id="fullRecentList" class="recent-list"></div>
      </div>
    </section>

    <!-- ─── TAB 4: CONFIGURADOR DE COMPILADOR ─── -->
    <section id="tab-config" class="tab-pane">
      <div class="page-header">
        <h2 class="page-title">Compilador y Rutas del Sistema</h2>
        <p class="page-subtitle">Verifica y personaliza las rutas de los ejecutables bgdc y bgdi para BennuGD v1 y v2.</p>
      </div>

      <div class="wizard-container">
        <div class="form-group">
          <label class="form-label">Versión Activa por Defecto</label>
          <div class="radio-pills">
            <div class="radio-pill" id="cfgVer2" onclick="setCfgVersion('v2')">
              <span class="radio-title">BennuGD 2 (v2)</span>
              <span class="radio-desc">bgdc / bgdi moderno</span>
            </div>
            <div class="radio-pill" id="cfgVer1" onclick="setCfgVersion('v1')">
              <span class="radio-title">BennuGD 1 (v1)</span>
              <span class="radio-desc">bgdc / bgdi clásico</span>
            </div>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="cfgCompilerPath">Ruta de bgdc (Compilador)</label>
          <div class="input-row">
            <input type="text" id="cfgCompilerPath" placeholder="bgdc o /ruta/a/bgdc">
            <button class="btn" type="button" onclick="browseCompiler()">Examinar...</button>
          </div>
          <div class="path-preview" id="compilerPathStatus">Comprobando binario...</div>
        </div>

        <div class="form-group">
          <label class="form-label" for="cfgRuntimePath">Ruta de bgdi (Runtime / Intérprete)</label>
          <div class="input-row">
            <input type="text" id="cfgRuntimePath" placeholder="bgdi o /ruta/a/bgdi">
            <button class="btn" type="button" onclick="browseRuntime()">Examinar...</button>
          </div>
          <div class="path-preview" id="runtimePathStatus">Comprobando binario...</div>
        </div>

        <div style="margin-top: 24px; display: flex; gap: 14px;">
          <button class="btn btn-primary" onclick="saveCompilerSettings()">💾 Guardar Rutas</button>
          <button class="btn" onclick="openDoc('routes')">📖 Ver Guía de Rutas</button>
        </div>
      </div>
    </section>

    <!-- ─── TAB 5: DOCUMENTACIÓN ─── -->
    <section id="tab-docs" class="tab-pane">
      <div class="page-header">
        <h2 class="page-title">Documentación & Recursos</h2>
        <p class="page-subtitle">Guías completas para aprovechar al máximo BennuIDE.</p>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; max-width: 900px;">
        <div class="section-card" style="cursor: pointer;" onclick="openDoc('routes')">
          <div class="hero-icon">⚙️</div>
          <h3 style="color: var(--text-bright); margin: 10px 0 6px 0;">Configuración de Rutas</h3>
          <p style="font-size: 13px; color: var(--text-main); line-height: 1.5;">
            Aprende cómo configurar las rutas de bgdc y bgdi en macOS, Windows y Linux, y cómo resolver errores como <code>Library not found</code> mediante DYLD_LIBRARY_PATH o variables de entorno.
          </p>
        </div>

        <div class="section-card" style="cursor: pointer;" onclick="openDoc('features')">
          <div class="hero-icon">🎮</div>
          <h3 style="color: var(--text-bright); margin: 10px 0 6px 0;">Características del IDE</h3>
          <p style="font-size: 13px; color: var(--text-main); line-height: 1.5;">
            Descubre todas las herramientas integradas: editores visuales FPG, FNT y Audio, Language Server con autocompletado inteligente, CodeLens, Inlay Hints y refactorización automática.
          </p>
        </div>

        <div class="section-card" style="cursor: pointer;" onclick="openDoc('readme')">
          <div class="hero-icon">📖</div>
          <h3 style="color: var(--text-bright); margin: 10px 0 6px 0;">Manual Principal</h3>
          <p style="font-size: 13px; color: var(--text-main); line-height: 1.5;">
            Estructura del proyecto, comandos rápidos de compilación y ejecución, atajos de teclado esenciales y arquitectura multiplataforma.
          </p>
        </div>

        <div class="section-card" style="cursor: pointer;" onclick="openDoc('todo')">
          <div class="hero-icon">📋</div>
          <h3 style="color: var(--text-bright); margin: 10px 0 6px 0;">Hoja de Ruta (TODO)</h3>
          <p style="font-size: 13px; color: var(--text-main); line-height: 1.5;">
            Estado de desarrollo actual del IDE, características completadas y próximas funcionalidades planificadas.
          </p>
        </div>
      </div>
    </section>

  </main>

  <script>
    const vscode = acquireVsCodeApi();
    const TEMPLATES = ${templatesJson};

    let selectedVersion = 'v2';
    let selectedTemplate = 'arcade_shooter';
    let cfgSelectedVersion = 'v2';
    let recentProjectsData = [];

    // Render templates
    function renderTemplates() {
      const container = document.getElementById('templatesContainer');
      container.innerHTML = '';

      TEMPLATES.forEach(t => {
        const card = document.createElement('div');
        card.className = 'template-card' + (t.id === selectedTemplate ? ' selected' : '');
        card.onclick = () => selectTemplate(t.id);

        const featuresHtml = t.features.map(f => '<li>' + f + '</li>').join('');

        card.innerHTML = \`
          <div class="template-header">
            <span class="template-icon">\${t.icon}</span>
            <span class="template-badge">\${t.badge}</span>
          </div>
          <div class="template-name">\${t.name}</div>
          <div class="template-desc">\${t.description}</div>
          <ul class="template-features">\${featuresHtml}</ul>
        \`;
        container.appendChild(card);
      });
    }

    function selectTemplate(id) {
      selectedTemplate = id;
      renderTemplates();
    }

    function selectVersion(ver) {
      selectedVersion = ver;
      document.getElementById('optVer2').classList.toggle('selected', ver === 'v2');
      document.getElementById('optVer1').classList.toggle('selected', ver === 'v1');
    }

    function setCfgVersion(ver) {
      cfgSelectedVersion = ver;
      document.getElementById('cfgVer2').classList.toggle('selected', ver === 'v2');
      document.getElementById('cfgVer1').classList.toggle('selected', ver === 'v1');
      vscode.postMessage({ command: 'switchActiveVersion', version: ver });
    }

    function updatePathPreview() {
      const name = document.getElementById('projectName').value.trim() || 'MiJuego';
      const dir = document.getElementById('projectDir').value.trim() || '/';
      const safe = name.replace(/[^a-zA-Z0-9_\\-]/g, '_');
      document.getElementById('pathPreview').textContent = 'Ruta completa: ' + dir.replace(/\\/+$/, '') + '/' + safe;
    }

    // Navigation tabs
    function switchTab(tabName) {
      document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.toggle('active', el.dataset.tab === tabName);
      });
      document.querySelectorAll('.tab-pane').forEach(el => {
        el.classList.toggle('active', el.id === 'tab-' + tabName);
      });
    }

    document.querySelectorAll('.nav-item').forEach(el => {
      el.addEventListener('click', () => {
        switchTab(el.dataset.tab);
      });
    });

    // Actions
    function triggerOpenProject() {
      vscode.postMessage({ command: 'openProject' });
    }

    function triggerOpenDemo() {
      vscode.postMessage({ command: 'openDemoProject' });
    }

    function browseFolder() {
      vscode.postMessage({ command: 'browseFolder' });
    }

    function browseCompiler() {
      vscode.postMessage({ command: 'browseCompilerPath' });
    }

    function browseRuntime() {
      vscode.postMessage({ command: 'browseRuntimePath' });
    }

    function openDoc(docName) {
      vscode.postMessage({ command: 'openDocument', doc: docName });
    }

    function saveCompilerSettings() {
      vscode.postMessage({
        command: 'saveCompilerConfig',
        version: cfgSelectedVersion,
        compilerPath: document.getElementById('cfgCompilerPath').value.trim(),
        runtimePath: document.getElementById('cfgRuntimePath').value.trim()
      });
    }

    function submitCreateProject() {
      const name = document.getElementById('projectName').value.trim();
      const parentDir = document.getElementById('projectDir').value.trim();
      const res = document.getElementById('resolutionSelect').value.split('x');
      const fps = parseInt(document.getElementById('fpsSelect').value, 10) || 60;

      if (!name) {
        alert('Por favor, indica un nombre para el proyecto.');
        return;
      }

      vscode.postMessage({
        command: 'createProject',
        name,
        parentDir,
        template: selectedTemplate,
        version: selectedVersion,
        width: parseInt(res[0], 10) || 800,
        height: parseInt(res[1], 10) || 600,
        fps
      });
    }

    // Render Recent
    function renderRecentProjects(projects, filter = '') {
      recentProjectsData = projects || [];
      const homeList = document.getElementById('homeRecentList');
      const fullList = document.getElementById('fullRecentList');

      const filtered = recentProjectsData.filter(p => {
        if (!filter) return true;
        const q = filter.toLowerCase();
        return p.name.toLowerCase().includes(q) || p.path.toLowerCase().includes(q);
      });

      if (filtered.length === 0) {
        const empty = '<div class="empty-state">No hay proyectos recientes encontrados.</div>';
        if (homeList) homeList.innerHTML = empty;
        if (fullList) fullList.innerHTML = empty;
        return;
      }

      const generateItemHtml = (p) => {
        const verBadge = p.version ? p.version.toUpperCase() : 'V2';
        return \`
          <div class="recent-item" onclick="openRecent('\${p.path.replace(/\\\\/g, '\\\\\\\\')}')">
            <div class="recent-info">
              <span style="font-size: 18px;">🕹️</span>
              <div>
                <div class="recent-name">\${p.name} <span class="template-badge" style="font-size: 9px;">\${verBadge}</span></div>
                <div class="recent-path">\${p.path}</div>
              </div>
            </div>
            <div class="recent-actions">
              <button class="btn-icon" title="Quitar de recientes" onclick="event.stopPropagation(); removeRecent('\${p.path.replace(/\\\\/g, '\\\\\\\\')}')">✕</button>
            </div>
          </div>
        \`;
      };

      if (homeList) {
        homeList.innerHTML = filtered.slice(0, 5).map(generateItemHtml).join('');
      }

      if (fullList) {
        fullList.innerHTML = filtered.map(generateItemHtml).join('');
      }
    }

    function openRecent(path) {
      vscode.postMessage({ command: 'openRecent', path });
    }

    function removeRecent(path) {
      vscode.postMessage({ command: 'removeRecent', path });
    }

    function filterRecentList() {
      const q = document.getElementById('recentSearch').value;
      renderRecentProjects(recentProjectsData, q);
    }

    // Message listener from extension
    window.addEventListener('message', event => {
      const msg = event.data;
      switch (msg.command) {
        case 'switchTab':
          switchTab(msg.tab);
          break;

        case 'updateRecent':
          renderRecentProjects(msg.projects);
          break;

        case 'folderSelected':
          document.getElementById('projectDir').value = msg.path;
          updatePathPreview();
          break;

        case 'compilerPathSelected':
          document.getElementById('cfgCompilerPath').value = msg.path;
          break;

        case 'runtimePathSelected':
          document.getElementById('cfgRuntimePath').value = msg.path;
          break;

        case 'updateCompilerStatus':
          const dot = document.getElementById('compilerStatusDot');
          const txt = document.getElementById('compilerStatusText');
          const badge = document.getElementById('compilerStatusBadge');

          document.getElementById('cfgCompilerPath').value = msg.compilerPath || '';
          document.getElementById('cfgRuntimePath').value = msg.runtimePath || '';
          cfgSelectedVersion = msg.activeVersion;
          document.getElementById('cfgVer2').classList.toggle('selected', cfgSelectedVersion === 'v2');
          document.getElementById('cfgVer1').classList.toggle('selected', cfgSelectedVersion === 'v1');

          if (msg.compilerFound) {
            badge.className = 'status-badge';
            dot.textContent = '●';
            txt.textContent = 'BennuGD ' + msg.activeVersion.toUpperCase() + ' Listo';
            document.getElementById('compilerPathStatus').textContent = '✅ Binario detectado y listo';
            document.getElementById('compilerPathStatus').style.color = 'var(--green)';
          } else {
            badge.className = 'status-badge warning';
            dot.textContent = '⚠️';
            txt.textContent = 'Configuración requerida';
            document.getElementById('compilerPathStatus').textContent = '⚠️ Binario no encontrado en la ruta especificada';
            document.getElementById('compilerPathStatus').style.color = 'var(--yellow)';
          }
          break;
      }
    });

    // Init
    renderTemplates();
    updatePathPreview();
    switchTab('${initialTab}');
    vscode.postMessage({ command: 'ready' });
  </script>
</body>
</html>`;
  }
}
