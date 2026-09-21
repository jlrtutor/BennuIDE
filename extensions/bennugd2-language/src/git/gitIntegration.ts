import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';

interface GitStatusInfo {
  isRepo: boolean;
  branch: string;
  lastCommitHash: string;
  lastCommitMsg: string;
  lastCommitAuthor: string;
  lastCommitDate: string;
  uncommittedCount: number;
  aheadCount: number;
  behindCount: number;
  hasRemote: boolean;
}

export class GitIntegration implements vscode.Disposable {
  private _branchStatusBarItem: vscode.StatusBarItem;
  private _syncStatusBarItem: vscode.StatusBarItem;
  private _disposables: vscode.Disposable[] = [];
  private _currentInfo: GitStatusInfo | null = null;
  private _isBusy: boolean = false;

  constructor(private context: vscode.ExtensionContext) {
    // 1. Branch Status Bar Item (Alignment Left, priority 99)
    this._branchStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
    this._branchStatusBarItem.command = 'bennuide.git.menu';
    this._disposables.push(this._branchStatusBarItem);

    // 2. Sync Status Bar Item (Alignment Left, priority 98)
    this._syncStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 98);
    this._syncStatusBarItem.command = 'bennuide.git.sync';
    this._disposables.push(this._syncStatusBarItem);

    // 3. Register Git Commands
    this._disposables.push(
      vscode.commands.registerCommand('bennuide.git.menu', () => this.showGitMenu()),
      vscode.commands.registerCommand('bennuide.git.sync', () => this.sync()),
      vscode.commands.registerCommand('bennuide.git.pull', () => this.pull()),
      vscode.commands.registerCommand('bennuide.git.push', () => this.push()),
      vscode.commands.registerCommand('bennuide.git.commit', () => this.commitQuick()),
      vscode.commands.registerCommand('bennuide.git.switchBranch', () => this.switchBranch()),
      vscode.commands.registerCommand('bennuide.git.viewLog', () => this.viewLog())
    );

    // 4. File Watchers for automatic updates
    const gitWatcher = vscode.workspace.createFileSystemWatcher('**/.git/**');
    this._disposables.push(
      gitWatcher.onDidChange(() => this.updateStatus()),
      gitWatcher.onDidCreate(() => this.updateStatus()),
      gitWatcher.onDidDelete(() => this.updateStatus()),
      vscode.workspace.onDidSaveTextDocument(() => this.updateStatus()),
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.updateStatus())
    );

    // Initial update
    this.updateStatus();
  }

  private getRootPath(): string | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }

  private execGit(cmd: string, cwd?: string): Promise<{ stdout: string; stderr: string }> {
    const root = cwd || this.getRootPath();
    if (!root) return Promise.reject(new Error('No workspace folder open'));

    return new Promise((resolve, reject) => {
      exec(cmd, { cwd: root, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) {
          reject(err);
        } else {
          resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
        }
      });
    });
  }

  public async updateStatus(): Promise<void> {
    const root = this.getRootPath();
    if (!root) {
      this._branchStatusBarItem.hide();
      this._syncStatusBarItem.hide();
      return;
    }

    try {
      // Check if git repo
      const { stdout: isInside } = await this.execGit('git rev-parse --is-inside-work-tree');
      if (isInside !== 'true') {
        this._branchStatusBarItem.hide();
        this._syncStatusBarItem.hide();
        return;
      }

      // 1. Get current branch
      let branch = 'HEAD';
      try {
        const { stdout: branchOut } = await this.execGit('git branch --show-current');
        branch = branchOut || 'HEAD';
      } catch {
        const { stdout: revOut } = await this.execGit('git rev-parse --short HEAD');
        branch = revOut || 'HEAD';
      }

      // 2. Uncommitted changes count
      let uncommittedCount = 0;
      try {
        const { stdout: statusOut } = await this.execGit('git status --porcelain');
        if (statusOut) {
          uncommittedCount = statusOut.split('\n').filter(l => l.trim().length > 0).length;
        }
      } catch { /* ignore */ }

      // 3. Last commit info
      let lastCommitHash = '';
      let lastCommitMsg = '';
      let lastCommitAuthor = '';
      let lastCommitDate = '';
      try {
        const { stdout: logOut } = await this.execGit('git log -1 --pretty=format:"%h|%s|%an|%cr"');
        if (logOut) {
          const parts = logOut.replace(/^"|"$/g, '').split('|');
          lastCommitHash = parts[0] || '';
          lastCommitMsg = parts[1] || '';
          lastCommitAuthor = parts[2] || '';
          lastCommitDate = parts[3] || '';
        }
      } catch { /* ignore */ }

      // 4. Remote ahead/behind count
      let aheadCount = 0;
      let behindCount = 0;
      let hasRemote = false;
      try {
        const { stdout: remoteOut } = await this.execGit('git remote');
        if (remoteOut && remoteOut.length > 0) {
          hasRemote = true;
          const { stdout: countOut } = await this.execGit('git rev-list --left-right --count HEAD...@{upstream}');
          if (countOut) {
            const counts = countOut.split(/\s+/);
            aheadCount = parseInt(counts[0], 10) || 0;
            behindCount = parseInt(counts[1], 10) || 0;
          }
        }
      } catch { /* upstream might not be configured */ }

      this._currentInfo = {
        isRepo: true,
        branch,
        lastCommitHash,
        lastCommitMsg,
        lastCommitAuthor,
        lastCommitDate,
        uncommittedCount,
        aheadCount,
        behindCount,
        hasRemote
      };

      // ── Render Branch Item ──
      const dirtyMark = uncommittedCount > 0 ? `* (${uncommittedCount})` : '';
      this._branchStatusBarItem.text = `$(git-branch) ${branch}${dirtyMark}`;
      this._branchStatusBarItem.tooltip = new vscode.MarkdownString(
        `### 🌿 Rama Git: \`${branch}\`\n\n` +
        `- **Último Commit:** \`${lastCommitHash}\` — ${lastCommitMsg}\n` +
        `- **Autor:** ${lastCommitAuthor} (${lastCommitDate})\n` +
        `- **Cambios locales:** ${uncommittedCount > 0 ? `⚠️ ${uncommittedCount} archivo(s) sin confirmar` : '✅ Árbol de trabajo limpio'}\n` +
        `- **Sincronización:** ${aheadCount} por subir (Push), ${behindCount} por descargar (Pull)\n\n` +
        `---\n*Haz clic para abrir el menú Git de BennuIDE*`
      );
      this._branchStatusBarItem.show();

      // ── Render Sync Item ──
      if (hasRemote) {
        let syncText = '$(sync)';
        if (aheadCount > 0 || behindCount > 0) {
          syncText = `$(sync) ${aheadCount}↑ ${behindCount}↓`;
        }
        this._syncStatusBarItem.text = syncText;
        this._syncStatusBarItem.tooltip = `Sincronizar cambios con el repositorio remoto (${aheadCount} push, ${behindCount} pull). Clic para sincronizar.`;
        this._syncStatusBarItem.show();
      } else {
        this._syncStatusBarItem.hide();
      }
    } catch {
      this._branchStatusBarItem.hide();
      this._syncStatusBarItem.hide();
    }
  }

  public async showGitMenu(): Promise<void> {
    if (!this._currentInfo || !this._currentInfo.isRepo) {
      vscode.window.showInformationMessage('El espacio de trabajo actual no es un repositorio Git.');
      return;
    }

    const info = this._currentInfo;
    const items: vscode.QuickPickItem[] = [
      {
        label: '$(sync) Sincronizar Cambios (Pull & Push)',
        description: `↑ ${info.aheadCount}  ↓ ${info.behindCount}`,
        detail: 'Descarga los últimos commits remotos y sube los cambios locales pendientes'
      },
      {
        label: '$(cloud-download) Hacer Pull (Descargar)',
        description: `↓ ${info.behindCount} commit(s)`,
        detail: 'Descarga e incorpora los cambios del repositorio remoto a la rama actual'
      },
      {
        label: '$(cloud-upload) Hacer Push (Subir)',
        description: `↑ ${info.aheadCount} commit(s)`,
        detail: 'Envía los commits locales confirmados al repositorio remoto'
      },
      {
        label: '$(git-commit) Commit Rápido...',
        description: `${info.uncommittedCount} archivo(s) modificado(s)`,
        detail: 'Agrega todos los cambios locales y crea un nuevo commit con tu mensaje'
      },
      {
        label: '$(git-branch) Cambiar o Crear Rama...',
        description: `Rama actual: ${info.branch}`,
        detail: 'Cambia a otra rama existente o crea una nueva rama de desarrollo'
      },
      {
        label: '$(history) Ver Historial de Commits...',
        description: 'Ver los últimos commits del proyecto',
        detail: 'Explora los mensajes de commit, autores y fechas recientes'
      }
    ];

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: `BennuIDE Git [Rama: ${info.branch}] — Elige una acción`
    });

    if (!selected) return;

    if (selected.label.includes('Sincronizar')) {
      await this.sync();
    } else if (selected.label.includes('Pull')) {
      await this.pull();
    } else if (selected.label.includes('Push')) {
      await this.push();
    } else if (selected.label.includes('Commit Rápido')) {
      await this.commitQuick();
    } else if (selected.label.includes('Cambiar o Crear Rama')) {
      await this.switchBranch();
    } else if (selected.label.includes('Historial')) {
      await this.viewLog();
    }
  }

  public async sync(): Promise<void> {
    if (this._isBusy) return;
    this._isBusy = true;
    this._syncStatusBarItem.text = '$(sync~spin) Sincronizando...';

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'BennuIDE Git: Sincronizando con repositorio remoto...',
        cancellable: false
      },
      async () => {
        try {
          await this.execGit('git pull --rebase');
          await this.execGit('git push');
          vscode.window.showInformationMessage('BennuIDE: Sincronización Git completada con éxito.');
        } catch (err: any) {
          vscode.window.showErrorMessage(`Error al sincronizar: ${err?.message || err}`);
        } finally {
          this._isBusy = false;
          await this.updateStatus();
        }
      }
    );
  }

  public async pull(): Promise<void> {
    if (this._isBusy) return;
    this._isBusy = true;
    this._syncStatusBarItem.text = '$(sync~spin) Pull...';

    try {
      const { stdout } = await this.execGit('git pull');
      vscode.window.showInformationMessage(`BennuIDE Git Pull: ${stdout || 'Actualizado'}`);
    } catch (err: any) {
      vscode.window.showErrorMessage(`Error en git pull: ${err?.message || err}`);
    } finally {
      this._isBusy = false;
      await this.updateStatus();
    }
  }

  public async push(): Promise<void> {
    if (this._isBusy) return;
    this._isBusy = true;
    this._syncStatusBarItem.text = '$(sync~spin) Push...';

    try {
      await this.execGit('git push');
      vscode.window.showInformationMessage('BennuIDE Git Push: Cambios enviados al repositorio remoto.');
    } catch (err: any) {
      vscode.window.showErrorMessage(`Error en git push: ${err?.message || err}`);
    } finally {
      this._isBusy = false;
      await this.updateStatus();
    }
  }

  public async commitQuick(): Promise<void> {
    const msg = await vscode.window.showInputBox({
      prompt: 'Introduce el mensaje del commit',
      placeHolder: 'Ej. feat(game): añadir colisiones y puntuación'
    });

    if (!msg || !msg.trim()) return;

    try {
      await this.execGit('git add -A');
      const { stdout } = await this.execGit(`git commit -m "${msg.replace(/"/g, '\\"')}"`);
      vscode.window.showInformationMessage(`BennuIDE Git: Commit creado con éxito.`);
      await this.updateStatus();
    } catch (err: any) {
      vscode.window.showErrorMessage(`Error al hacer commit: ${err?.message || err}`);
    }
  }

  public async switchBranch(): Promise<void> {
    try {
      const { stdout: branchesOut } = await this.execGit('git branch -a');
      const rawLines = branchesOut.split('\n');
      const branchItems: vscode.QuickPickItem[] = [
        {
          label: '$(plus) Crear Nueva Rama...',
          description: 'Crea una rama a partir de la actual'
        }
      ];

      for (const line of rawLines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.includes('->')) continue;
        const isCurrent = trimmed.startsWith('*');
        const branchName = trimmed.replace(/^\*\s*/, '').replace(/^remotes\/origin\//, '');
        if (!branchItems.some(b => b.label === branchName)) {
          branchItems.push({
            label: isCurrent ? `$(check) ${branchName}` : `$(git-branch) ${branchName}`,
            description: isCurrent ? 'Rama activa' : ''
          });
        }
      }

      const selected = await vscode.window.showQuickPick(branchItems, {
        placeHolder: 'Selecciona una rama para cambiar o crea una nueva'
      });

      if (!selected) return;

      if (selected.label.includes('Crear Nueva Rama')) {
        const newBranchName = await vscode.window.showInputBox({
          prompt: 'Nombre de la nueva rama',
          placeHolder: 'Ej. feature/nueva-arma'
        });
        if (newBranchName && newBranchName.trim()) {
          await this.execGit(`git checkout -b "${newBranchName.trim()}"`);
          vscode.window.showInformationMessage(`BennuIDE Git: Cambiado a la nueva rama '${newBranchName.trim()}'.`);
        }
      } else {
        const targetBranch = selected.label.replace(/\$\([^)]+\)\s*/, '').trim();
        await this.execGit(`git checkout "${targetBranch}"`);
        vscode.window.showInformationMessage(`BennuIDE Git: Cambiado a la rama '${targetBranch}'.`);
      }

      await this.updateStatus();
    } catch (err: any) {
      vscode.window.showErrorMessage(`Error al cambiar de rama: ${err?.message || err}`);
    }
  }

  public async viewLog(): Promise<void> {
    try {
      const { stdout: logOut } = await this.execGit('git log -n 25 --pretty=format:"%h|%s|%an|%cr"');
      if (!logOut) {
        vscode.window.showInformationMessage('No hay commits en el historial.');
        return;
      }

      const lines = logOut.split('\n');
      const items: vscode.QuickPickItem[] = lines.map(line => {
        const parts = line.replace(/^"|"$/g, '').split('|');
        return {
          label: `$(git-commit) ${parts[0]} — ${parts[1]}`,
          description: `${parts[2]} (${parts[3]})`,
          detail: `Hash: ${parts[0]}`
        };
      });

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Historial de Commits Recientes (selecciona para copiar hash)'
      });

      if (selected && selected.detail) {
        const hash = selected.detail.replace('Hash: ', '').trim();
        await vscode.env.clipboard.writeText(hash);
        vscode.window.showInformationMessage(`Hash '${hash}' copiado al portapapeles.`);
      }
    } catch (err: any) {
      vscode.window.showErrorMessage(`Error al leer historial Git: ${err?.message || err}`);
    }
  }

  public dispose(): void {
    while (this._disposables.length) {
      const d = this._disposables.pop();
      if (d) d.dispose();
    }
  }
}
