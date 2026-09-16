import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn, ChildProcess } from 'child_process';

export type BennuVersion = 'v1' | 'v2';

export interface BennuProfileConfig {
  version: BennuVersion;
  compilerPath: string;
  runtimePath: string;
  compilerArgs: string[];
  runtimeArgs: string[];
  includePaths: string[];
}

export class BennuCompiler {
  private outputChannel: vscode.OutputChannel;
  private diagnosticCollection: vscode.DiagnosticCollection;
  private runningProcess: ChildProcess | null = null;
  private statusBarItem: vscode.StatusBarItem | null = null;

  constructor(outputChannel: vscode.OutputChannel, diagnosticCollection: vscode.DiagnosticCollection) {
    this.outputChannel = outputChannel;
    this.diagnosticCollection = diagnosticCollection;
  }

  public setStatusBarItem(item: vscode.StatusBarItem): void {
    this.statusBarItem = item;
    this.updateStatusBar();
  }

  public getActiveVersion(): BennuVersion {
    const config = vscode.workspace.getConfiguration('bennugd');
    const ver = config.get<string>('version', 'v2');
    return ver.toLowerCase() === 'v1' ? 'v1' : 'v2';
  }

  public async setVersion(ver: BennuVersion): Promise<void> {
    const config = vscode.workspace.getConfiguration('bennugd');
    await config.update('version', ver, vscode.ConfigurationTarget.Workspace);
    this.updateStatusBar();
  }

  public updateStatusBar(): void {
    if (!this.statusBarItem) return;
    const ver = this.getActiveVersion();
    this.statusBarItem.text = `$(tools) BennuGD ${ver.toUpperCase()}`;
    this.statusBarItem.tooltip = `BennuGD: Versión activa del compilador (${ver.toUpperCase()}). Clic para cambiar.`;
    this.statusBarItem.show();
  }

  public getProfileConfig(): BennuProfileConfig {
    const config = vscode.workspace.getConfiguration('bennugd');
    const version = this.getActiveVersion();
    const section = version === 'v1' ? 'v1' : 'v2';

    // Fallbacks for backwards compatibility
    const oldConfig = vscode.workspace.getConfiguration('bennugd2');

    const compilerPath = config.get<string>(`${section}.compilerPath`) ||
      oldConfig.get<string>('compilerPath') ||
      'bgdc';

    const runtimePath = config.get<string>(`${section}.runtimePath`) ||
      oldConfig.get<string>('runtimePath') ||
      'bgdi';

    const compilerArgs = config.get<string[]>(`${section}.compilerArgs`) ||
      oldConfig.get<string[]>('compilerArgs') ||
      [];

    const runtimeArgs = config.get<string[]>(`${section}.runtimeArgs`) || [];
    const includePaths = config.get<string[]>(`${section}.includePaths`) || [];

    return {
      version,
      compilerPath,
      runtimePath,
      compilerArgs,
      runtimeArgs,
      includePaths
    };
  }

  public async getTargetFile(activeEditor?: vscode.TextEditor): Promise<string | undefined> {
    const config = vscode.workspace.getConfiguration('bennugd');
    const configuredMain = config.get<string>('mainFile') || vscode.workspace.getConfiguration('bennugd2').get<string>('mainFile');

    if (configuredMain && configuredMain.trim().length > 0) {
      if (path.isAbsolute(configuredMain)) {
        return configuredMain;
      }
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (workspaceFolder) {
        return path.join(workspaceFolder, configuredMain);
      }
    }

    if (activeEditor) {
      const fileName = activeEditor.document.fileName;
      const isPrg = fileName.toLowerCase().endsWith('.prg') || fileName.toLowerCase().endsWith('.inc') || activeEditor.document.languageId === 'bennugd2';
      if (isPrg) {
        return fileName;
      }
    }

    // Look for common main files in workspace
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceFolder) {
      const candidates = ['main.prg', 'game.prg', 'antiriad.prg', 'program.prg', 'app.prg', 'index.prg'];
      for (const candidate of candidates) {
        const fullPath = path.join(workspaceFolder, candidate);
        if (fs.existsSync(fullPath)) {
          return fullPath;
        }
      }

      // Check first .prg file in workspace root
      try {
        const rootFiles = fs.readdirSync(workspaceFolder);
        const prgFile = rootFiles.find(f => f.toLowerCase().endsWith('.prg'));
        if (prgFile) {
          return path.join(workspaceFolder, prgFile);
        }
      } catch {}
    }

    vscode.window.showErrorMessage('BennuGD: No se encontró ningún archivo .prg abierto o archivo principal configurado.');
    return undefined;
  }

  public async compile(targetPrgPath: string, debug: boolean = false): Promise<boolean> {
    const profile = this.getProfileConfig();
    const config = vscode.workspace.getConfiguration('bennugd');
    const clearOutput = config.get<boolean>('clearOutputBeforeCompile', true);

    this.outputChannel.show(true);
    if (clearOutput) {
      this.outputChannel.clear();
    }

    const timestamp = new Date().toLocaleTimeString();
    this.outputChannel.appendLine(`==========================================================`);
    this.outputChannel.appendLine(`🚀 [BennuGD ${profile.version.toUpperCase()}] Compilando: ${path.basename(targetPrgPath)} (${timestamp})`);
    this.outputChannel.appendLine(`📍 Archivo: ${targetPrgPath}`);
    this.outputChannel.appendLine(`⚙️ Compilador: ${profile.compilerPath}`);

    this.diagnosticCollection.clear();

    const workDir = path.dirname(targetPrgPath);
    const args: string[] = [];

    // Add include paths
    for (const inc of profile.includePaths) {
      if (inc && inc.trim().length > 0) {
        args.push('-i', inc.trim());
      }
    }

    // Add extra compiler args
    args.push(...profile.compilerArgs);

    if (debug) {
      args.push('-g');
    }

    args.push(targetPrgPath);

    this.outputChannel.appendLine(`💻 Comando: ${profile.compilerPath} ${args.join(' ')}\n==========================================================\n`);

    return new Promise<boolean>((resolve) => {
      try {
        const env = { ...process.env };
        const process = spawn(profile.compilerPath, args, {
          cwd: workDir,
          shell: true,
          env
        });

        const diagnosticsMap: Map<string, vscode.Diagnostic[]> = new Map();

        const processOutput = (data: Buffer) => {
          const text = data.toString();
          this.outputChannel.append(text);

          // Support multiple error output formats (bgdc v1 and bgdc v2)
          // 1. file.prg:12: error: message
          // 2. file.prg(12): error: message
          // 3. file.prg:12: message
          const errorRegexes = [
            /^(.+?):(\d+)(?::(\d+))?:\s*(error|warning|fatal error)?:\s*(.+)$/gim,
            /^(.+?)\((\d+)\):\s*(error|warning)?:\s*(.+)$/gim
          ];

          for (const regex of errorRegexes) {
            let match;
            while ((match = regex.exec(text)) !== null) {
              const rawFilePath = match[1].trim();
              const lineNum = Math.max(0, parseInt(match[2], 10) - 1);
              const colNum = match[3] ? Math.max(0, parseInt(match[3], 10) - 1) : 0;
              const severityStr = (match[4] || 'error').toLowerCase();
              const message = match[5] ? match[5].trim() : match[4].trim();

              const fullFilePath = path.isAbsolute(rawFilePath)
                ? rawFilePath
                : path.join(workDir, rawFilePath);

              const severity = severityStr.includes('warning')
                ? vscode.DiagnosticSeverity.Warning
                : vscode.DiagnosticSeverity.Error;

              const diagnostic = new vscode.Diagnostic(
                new vscode.Range(lineNum, colNum, lineNum, 200),
                message,
                severity
              );
              diagnostic.source = `BennuGD ${profile.version.toUpperCase()}`;

              const list = diagnosticsMap.get(fullFilePath) || [];
              list.push(diagnostic);
              diagnosticsMap.set(fullFilePath, list);
            }
          }
        };

        process.stdout.on('data', processOutput);
        process.stderr.on('data', processOutput);

        process.on('error', (err) => {
          this.outputChannel.appendLine(`\n❌ [ERROR] No se pudo ejecutar el compilador '${profile.compilerPath}': ${err.message}`);
          this.outputChannel.appendLine(`ℹ️ Configura la ruta correcta en: Ajustes -> BennuGD -> bennugd.${profile.version}.compilerPath`);
          vscode.window.showErrorMessage(`BennuGD ${profile.version.toUpperCase()}: No se pudo ejecutar '${profile.compilerPath}'. Revisa la configuración de rutas.`);
          resolve(false);
        });

        process.on('close', (code) => {
          // Apply diagnostics to editor
          for (const [file, diags] of diagnosticsMap.entries()) {
            this.diagnosticCollection.set(vscode.Uri.file(file), diags);
          }

          if (code === 0) {
            this.outputChannel.appendLine('\n==========================================================');
            this.outputChannel.appendLine(`✅ [BennuGD ${profile.version.toUpperCase()}] Compilación completada con ÉXITO.`);
            this.outputChannel.appendLine('==========================================================\n');
            vscode.window.showInformationMessage(`BennuGD ${profile.version.toUpperCase()}: Compilación completada con éxito.`);
            resolve(true);
          } else {
            this.outputChannel.appendLine('\n==========================================================');
            this.outputChannel.appendLine(`❌ [BennuGD ${profile.version.toUpperCase()}] Compilación FALLIDA (código de salida: ${code}).`);
            this.outputChannel.appendLine('==========================================================\n');
            vscode.window.showErrorMessage(`BennuGD ${profile.version.toUpperCase()}: La compilación falló.`);
            resolve(false);
          }
        });
      } catch (err: any) {
        this.outputChannel.appendLine(`\n[ERROR EXCEPCIÓN] ${err.message}`);
        resolve(false);
      }
    });
  }

  public async run(targetPrgPath: string): Promise<void> {
    const profile = this.getProfileConfig();
    const config = vscode.workspace.getConfiguration('bennugd');
    const killPrevious = config.get<boolean>('killPreviousOnRun', true);

    const dcbPath = targetPrgPath.replace(/\.(prg|inc|bgd)$/i, '.dcb');

    if (!fs.existsSync(dcbPath)) {
      this.outputChannel.appendLine(`ℹ️ Archivo .dcb no encontrado. Compilando primero...`);
      const compiled = await this.compile(targetPrgPath);
      if (!compiled) {
        return;
      }
    }

    const workDir = path.dirname(dcbPath);

    if (killPrevious && this.runningProcess) {
      try {
        this.runningProcess.kill();
      } catch {}
      this.runningProcess = null;
    }

    const args = [...profile.runtimeArgs, dcbPath];
    this.outputChannel.appendLine(`\n🎮 [BennuGD ${profile.version.toUpperCase()}] Ejecutando: ${profile.runtimePath} ${args.join(' ')}`);

    try {
      this.runningProcess = spawn(profile.runtimePath, args, {
        cwd: workDir,
        shell: true,
        env: { ...process.env }
      });

      this.runningProcess.stdout?.on('data', (data) => {
        this.outputChannel.append(`[GAME] ${data.toString()}`);
      });

      this.runningProcess.stderr?.on('data', (data) => {
        this.outputChannel.append(`[GAME ERR] ${data.toString()}`);
      });

      this.runningProcess.on('error', (err) => {
        this.outputChannel.appendLine(`\n❌ [ERROR] No se pudo ejecutar el intérprete '${profile.runtimePath}': ${err.message}`);
        this.outputChannel.appendLine(`ℹ️ Configura la ruta en: Ajustes -> BennuGD -> bennugd.${profile.version}.runtimePath`);
        vscode.window.showErrorMessage(`BennuGD ${profile.version.toUpperCase()}: No se pudo ejecutar '${profile.runtimePath}'.`);
      });

      this.runningProcess.on('close', (code) => {
        this.outputChannel.appendLine(`\n⏹️ [BennuGD ${profile.version.toUpperCase()}] Juego finalizado (código: ${code}).`);
        this.runningProcess = null;
      });
    } catch (err: any) {
      this.outputChannel.appendLine(`\n[ERROR EXCEPCIÓN AL EJECUTAR] ${err.message}`);
    }
  }

  public async compileAndRun(targetPrgPath: string): Promise<void> {
    const compiled = await this.compile(targetPrgPath);
    if (compiled) {
      await this.run(targetPrgPath);
    }
  }

  public async switchVersionInteractive(): Promise<void> {
    const current = this.getActiveVersion();
    const items: vscode.QuickPickItem[] = [
      {
        label: '$(tools) BennuGD v2',
        description: current === 'v2' ? '(Actual / Active)' : '',
        detail: 'Compilador y runtime moderno de BennuGD 2 (bgdc / bgd2)'
      },
      {
        label: '$(tools) BennuGD v1',
        description: current === 'v1' ? '(Actual / Active)' : '',
        detail: 'Compilador y runtime clásico de BennuGD 1.0 (bgdc / bgdi v1)'
      }
    ];

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Selecciona la versión de BennuGD para compilar este proyecto'
    });

    if (selected) {
      const chosenVer: BennuVersion = selected.label.includes('v1') ? 'v1' : 'v2';
      await this.setVersion(chosenVer);
      vscode.window.showInformationMessage(`BennuGD: Versión activa cambiada a ${chosenVer.toUpperCase()} para el proyecto.`);
    }
  }

  public async clean(targetPrgPath: string): Promise<void> {
    const workDir = path.dirname(targetPrgPath);
    try {
      const files = fs.readdirSync(workDir);
      let count = 0;
      for (const file of files) {
        if (file.toLowerCase().endsWith('.dcb')) {
          fs.unlinkSync(path.join(workDir, file));
          count++;
        }
      }
      this.outputChannel.appendLine(`🧹 Limpieza completada: ${count} archivos .dcb eliminados.`);
      vscode.window.showInformationMessage(`BennuGD: ${count} archivos .dcb eliminados.`);
    } catch (err: any) {
      vscode.window.showErrorMessage(`Error al limpiar archivos: ${err.message}`);
    }
  }
}

