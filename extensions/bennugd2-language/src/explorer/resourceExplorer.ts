import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export type ResourceCategory = 'fpg' | 'fnt' | 'audio' | 'maps' | 'source';

export class ResourceItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly category?: ResourceCategory,
    public readonly fileUri?: vscode.Uri,
    public readonly details?: string
  ) {
    super(label, collapsibleState);

    if (fileUri) {
      this.resourceUri = fileUri;
      this.description = details;
      this.tooltip = fileUri.fsPath;
      this.contextValue = 'resourceFile';

      // Assign custom commands according to file type
      const ext = path.extname(fileUri.fsPath).toLowerCase();
      if (['.fpg'].includes(ext)) {
        this.command = {
          command: 'vscode.openWith',
          title: 'Abrir en FPG Editor',
          arguments: [fileUri, 'bennugd2.fpgEditor']
        };
        this.iconPath = new vscode.ThemeIcon('file-media');
      } else if (['.fnt', '.fnx'].includes(ext)) {
        this.command = {
          command: 'vscode.openWith',
          title: 'Abrir en FNT Editor',
          arguments: [fileUri, 'bennugd2.fntEditor']
        };
        this.iconPath = new vscode.ThemeIcon('symbol-font');
      } else if (['.wav', '.ogg', '.mp3', '.flac'].includes(ext)) {
        this.command = {
          command: 'vscode.openWith',
          title: 'Abrir en Audio Editor',
          arguments: [fileUri, 'bennugd2.audioEditor']
        };
        this.iconPath = new vscode.ThemeIcon('unmute');
      } else if (['.prg', '.inc', '.h', '.bgd'].includes(ext)) {
        this.command = {
          command: 'vscode.open',
          title: 'Abrir Código',
          arguments: [fileUri]
        };
        this.iconPath = new vscode.ThemeIcon('file-code');
      } else {
        this.command = {
          command: 'vscode.open',
          title: 'Abrir Archivo',
          arguments: [fileUri]
        };
        this.iconPath = new vscode.ThemeIcon('file');
      }
    } else if (category) {
      this.contextValue = 'resourceCategory';
      switch (category) {
        case 'fpg':
          this.iconPath = new vscode.ThemeIcon('file-media');
          break;
        case 'fnt':
          this.iconPath = new vscode.ThemeIcon('symbol-font');
          break;
        case 'audio':
          this.iconPath = new vscode.ThemeIcon('unmute');
          break;
        case 'maps':
          this.iconPath = new vscode.ThemeIcon('map');
          break;
        case 'source':
          this.iconPath = new vscode.ThemeIcon('code');
          break;
      }
    }
  }
}

export class ResourceTreeProvider implements vscode.TreeDataProvider<ResourceItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<ResourceItem | undefined | null | void> = new vscode.EventEmitter<ResourceItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<ResourceItem | undefined | null | void> = this._onDidChangeTreeData.event;

  constructor(private context: vscode.ExtensionContext) {
    const watcher = vscode.workspace.createFileSystemWatcher('**/*');
    watcher.onDidChange(() => this.refresh());
    watcher.onDidCreate(() => this.refresh());
    watcher.onDidDelete(() => this.refresh());
    context.subscriptions.push(watcher);
  }

  public refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: ResourceItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: ResourceItem): Promise<ResourceItem[]> {
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
      return [new ResourceItem('Ningún proyecto abierto en el espacio de trabajo', vscode.TreeItemCollapsibleState.None)];
    }

    if (!element) {
      // Root categories
      return [
        new ResourceItem('Paquetes de Sprites (FPG)', vscode.TreeItemCollapsibleState.Expanded, 'fpg'),
        new ResourceItem('Fuentes Tipográficas (FNT / FNX)', vscode.TreeItemCollapsibleState.Expanded, 'fnt'),
        new ResourceItem('Efectos y Música (Audio)', vscode.TreeItemCollapsibleState.Expanded, 'audio'),
        new ResourceItem('Mapas e Imágenes', vscode.TreeItemCollapsibleState.Collapsed, 'maps'),
        new ResourceItem('Código Fuente (PRG / INC)', vscode.TreeItemCollapsibleState.Collapsed, 'source')
      ];
    }

    if (element.category) {
      let globPattern = '';
      switch (element.category) {
        case 'fpg':
          globPattern = '**/*.{fpg,FPG}';
          break;
        case 'fnt':
          globPattern = '**/*.{fnt,fnx,fnt.gz,FNT,FNX}';
          break;
        case 'audio':
          globPattern = '**/*.{wav,ogg,mp3,flac,WAV,OGG,MP3,FLAC}';
          break;
        case 'maps':
          globPattern = '**/*.{map,png,bmp,MAP,PNG,BMP}';
          break;
        case 'source':
          globPattern = '**/*.{prg,inc,bgd,h,PRG,INC,BGD,H}';
          break;
      }

      if (!globPattern) return [];

      const uris = await vscode.workspace.findFiles(globPattern, '**/node_modules/**');
      if (uris.length === 0) {
        return [new ResourceItem('Sin archivos en este proyecto', vscode.TreeItemCollapsibleState.None)];
      }

      // Sort alphabetically
      uris.sort((a, b) => path.basename(a.fsPath).localeCompare(path.basename(b.fsPath)));

      return uris.map(uri => {
        let sizeStr = '';
        try {
          const st = fs.statSync(uri.fsPath);
          if (st.size < 1024) sizeStr = `${st.size} B`;
          else if (st.size < 1024 * 1024) sizeStr = `${(st.size / 1024).toFixed(1)} KB`;
          else sizeStr = `${(st.size / (1024 * 1024)).toFixed(1)} MB`;
        } catch { /* ignore */ }

        const workspaceRoot = vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath;
        const relDir = workspaceRoot ? path.relative(workspaceRoot, path.dirname(uri.fsPath)) : '';
        const details = relDir && relDir !== '.' ? `${sizeStr} • ${relDir}` : sizeStr;

        return new ResourceItem(path.basename(uri.fsPath), vscode.TreeItemCollapsibleState.None, undefined, uri, details);
      });
    }

    return [];
  }
}
