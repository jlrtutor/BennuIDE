import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn, ChildProcess } from 'child_process';

export class BennuCompiler {
  private outputChannel: vscode.OutputChannel;
  private diagnosticCollection: vscode.DiagnosticCollection;
  private runningProcess: ChildProcess | null = null;

  constructor(outputChannel: vscode.OutputChannel, diagnosticCollection: vscode.DiagnosticCollection) {
    this.outputChannel = outputChannel;
    this.diagnosticCollection = diagnosticCollection;
  }

  public async getTargetFile(activeEditor?: vscode.TextEditor): Promise<string | undefined> {
    const config = vscode.workspace.getConfiguration('bennugd2');
    const configuredMain = config.get<string>('mainFile');

    if (configuredMain && configuredMain.trim().length > 0) {
      if (path.isAbsolute(configuredMain)) {
        return configuredMain;
      }
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (workspaceFolder) {
        return path.join(workspaceFolder, configuredMain);
      }
    }

    if (activeEditor && (activeEditor.document.languageId === 'bennugd2' || activeEditor.document.fileName.endsWith('.prg'))) {
      return activeEditor.document.fileName;
    }

    // Look for common main files in workspace
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceFolder) {
      const candidates = ['main.prg', 'game.prg', 'program.prg', 'app.prg'];
      for (const candidate of candidates) {
        const fullPath = path.join(workspaceFolder, candidate);
        if (fs.existsSync(fullPath)) {
          return fullPath;
        }
      }
    }

    vscode.window.showErrorMessage('BennuGD2: No se encontró ningún archivo .prg activo o archivo principal configurado.');
    return undefined;
  }

  public async compile(targetPrgPath: string, debug: boolean = false): Promise<boolean> {
    this.outputChannel.show(true);
    this.outputChannel.clear();
    this.outputChannel.appendLine(`=== [BennuGD2] Compilando: ${targetPrgPath} ===`);

    this.diagnosticCollection.clear();

    const config = vscode.workspace.getConfiguration('bennugd2');
    const compilerPath = config.get<string>('compilerPath') || 'bgdc';
    const extraArgs = config.get<string[]>('compilerArgs') || [];

    const workDir = path.dirname(targetPrgPath);
    const args = [...extraArgs];
    if (debug) {
      args.push('-g');
    }
    args.push(targetPrgPath);

    this.outputChannel.appendLine(`Ejecutando: ${compilerPath} ${args.join(' ')} (en ${workDir})\n`);

    return new Promise<boolean>((resolve) => {
      try {
        const process = spawn(compilerPath, args, {
          cwd: workDir,
          shell: true
        });

        const diagnosticsMap: Map<string, vscode.Diagnostic[]> = new Map();

        const processOutput = (data: Buffer) => {
          const text = data.toString();
          this.outputChannel.append(text);

          // Regex for bgdc error format: file:line: error/warning: message
          const errorRegex = /^(.+?):(\d+):\s*(error|warning)?:\s*(.+)$/gim;
          let match;
          while ((match = errorRegex.exec(text)) !== null) {
            const rawFilePath = match[1].trim();
            const lineNum = Math.max(0, parseInt(match[2], 10) - 1);
            const severityStr = (match[3] || 'error').toLowerCase();
            const message = match[4].trim();

            const fullFilePath = path.isAbsolute(rawFilePath)
              ? rawFilePath
              : path.join(workDir, rawFilePath);

            const severity = severityStr === 'warning'
              ? vscode.DiagnosticSeverity.Warning
              : vscode.DiagnosticSeverity.Error;

            const diagnostic = new vscode.Diagnostic(
              new vscode.Range(lineNum, 0, lineNum, 200),
              message,
              severity
            );
            diagnostic.source = 'BennuGD2 (bgdc)';

            const list = diagnosticsMap.get(fullFilePath) || [];
            list.push(diagnostic);
            diagnosticsMap.set(fullFilePath, list);
          }
        };

        process.stdout.on('data', processOutput);
        process.stderr.on('data', processOutput);

        process.on('error', (err) => {
          this.outputChannel.appendLine(`\n[ERROR] No se pudo ejecutar '${compilerPath}': ${err.message}`);
          this.outputChannel.appendLine(`Asegúrate de que 'bgdc' esté instalado y disponible en tu PATH o configurado en bennugd2.compilerPath.`);
          vscode.window.showErrorMessage(`No se pudo ejecutar el compilador bgdc: ${err.message}`);
          resolve(false);
        });

        process.on('close', (code) => {
          // Apply diagnostics to IDE
          for (const [file, diags] of diagnosticsMap.entries()) {
            this.diagnosticCollection.set(vscode.Uri.file(file), diags);
          }

          if (code === 0) {
            this.outputChannel.appendLine('\n=== Compilación completada con ÉXITO ===');
            vscode.window.showInformationMessage('BennuGD2: Compilación completada con éxito.');
            resolve(true);
          } else {
            this.outputChannel.appendLine(`\n=== Compilación FALLIDA (código de salida: ${code}) ===`);
            vscode.window.showErrorMessage(`BennuGD2: La compilación falló con errores.`);
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
    const dcbPath = targetPrgPath.replace(/\.prg$/i, '.dcb');

    if (!fs.existsSync(dcbPath)) {
      vscode.window.showWarningMessage(`No se encontró el archivo compilado ${path.basename(dcbPath)}. Compilando primero...`);
      const compiled = await this.compile(targetPrgPath);
      if (!compiled) {
        return;
      }
    }

    const config = vscode.workspace.getConfiguration('bennugd2');
    const runtimePath = config.get<string>('runtimePath') || 'bgdi';
    const workDir = path.dirname(dcbPath);

    this.outputChannel.appendLine(`\n=== [BennuGD2] Ejecutando: ${runtimePath} ${dcbPath} ===\n`);

    if (this.runningProcess) {
      this.runningProcess.kill();
      this.runningProcess = null;
    }

    this.runningProcess = spawn(runtimePath, [dcbPath], {
      cwd: workDir,
      shell: true
    });

    this.runningProcess.stdout?.on('data', (data) => {
      this.outputChannel.append(`[GAME] ${data.toString()}`);
    });

    this.runningProcess.stderr?.on('data', (data) => {
      this.outputChannel.append(`[GAME ERR] ${data.toString()}`);
    });

    this.runningProcess.on('error', (err) => {
      this.outputChannel.appendLine(`\n[ERROR] No se pudo ejecutar '${runtimePath}': ${err.message}`);
      vscode.window.showErrorMessage(`No se pudo ejecutar el intérprete bgdi: ${err.message}`);
    });

    this.runningProcess.on('close', (code) => {
      this.outputChannel.appendLine(`\n=== Juego finalizado (código de salida: ${code}) ===`);
      this.runningProcess = null;
    });
  }

  public async clean(targetPrgPath: string): Promise<void> {
    const workDir = path.dirname(targetPrgPath);
    try {
      const files = fs.readdirSync(workDir);
      let count = 0;
      for (const file of files) {
        if (file.endsWith('.dcb')) {
          fs.unlinkSync(path.join(workDir, file));
          count++;
        }
      }
      this.outputChannel.appendLine(`Limpieza completada: ${count} archivos .dcb eliminados.`);
      vscode.window.showInformationMessage(`BennuGD2: ${count} archivos .dcb eliminados.`);
    } catch (err: any) {
      vscode.window.showErrorMessage(`Error al limpiar archivos: ${err.message}`);
    }
  }
}
