import * as vscode from 'vscode';
import * as path from 'path';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind
} from 'vscode-languageclient/node';
import { BennuCompiler } from './compiler/compiler';
import { BennuDebugSession } from './debugger/debugAdapter';
import { BennuDefinitionProvider, BennuDocumentLinkProvider } from './navigation/definitionProvider';
import { WelcomePanel } from './welcome/welcomePanel';
import { ResourceTreeProvider } from './explorer/resourceExplorer';

let client: LanguageClient;
let compiler: BennuCompiler;

export function activate(context: vscode.ExtensionContext) {
  // 0. Auto-enforce BennuGD2 language mode on .prg / .inc / .bgd / .h files
  const enforceBennuLanguage = (doc: vscode.TextDocument) => {
    if (!doc || !doc.fileName) return;
    const ext = path.extname(doc.fileName).toLowerCase();
    if (['.prg', '.inc', '.bgd', '.h'].includes(ext) && doc.languageId !== 'bennugd2') {
      vscode.languages.setTextDocumentLanguage(doc, 'bennugd2');
    }
  };

  vscode.workspace.textDocuments.forEach(enforceBennuLanguage);
  context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(enforceBennuLanguage));
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor?.document) enforceBennuLanguage(editor.document);
    })
  );

  const outputChannel = vscode.window.createOutputChannel('BennuGD Output');
  const diagnosticCollection = vscode.languages.createDiagnosticCollection('bennugd');
  compiler = new BennuCompiler(outputChannel, diagnosticCollection);

  context.subscriptions.push(outputChannel, diagnosticCollection);

  // 1. Native Definition & DocumentLink Providers
  const bennuSelector: vscode.DocumentSelector = [
    { scheme: 'file', language: 'bennugd2' },
    { scheme: 'file', pattern: '**/*.{prg,inc,bgd,h,PRG,INC,BGD,H}' }
  ];

  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(bennuSelector, new BennuDefinitionProvider()),
    vscode.languages.registerDocumentLinkProvider(bennuSelector, new BennuDocumentLinkProvider())
  );

  // 1.1 Game Resource Explorer Provider
  const resourceProvider = new ResourceTreeProvider(context);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('bennuide.resourceExplorer', resourceProvider),
    vscode.commands.registerCommand('bennuide.resources.refresh', () => resourceProvider.refresh())
  );

  // 2. Language Server Setup
  const serverModule = context.asAbsolutePath(path.join('out', 'server', 'server.js'));
  const debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] };

  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: debugOptions
    }
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: bennuSelector,
    synchronize: {
      fileEvents: vscode.workspace.createFileSystemWatcher('**/*.{prg,inc,bgd,h,PRG,INC,BGD,H}')
    }
  };

  client = new LanguageClient('bennugd2Lsp', 'BennuGD Language Server', serverOptions, clientOptions);

  client.start();

  // 3. Status Bar Buttons
  createStatusBarButtons(context);

  // 4. Listen for configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('bennugd.version')) {
        compiler.updateStatusBar();
      }
    })
  );

  // 5. Register Commands
  const executeCompile = async () => {
    const target = await compiler.getTargetFile(vscode.window.activeTextEditor);
    if (target) {
      await compiler.compile(target);
    }
  };

  const executeRun = async () => {
    const target = await compiler.getTargetFile(vscode.window.activeTextEditor);
    if (target) {
      await compiler.run(target);
    }
  };

  const executeCompileAndRun = async () => {
    const target = await compiler.getTargetFile(vscode.window.activeTextEditor);
    if (target) {
      await compiler.compileAndRun(target);
    }
  };

  const executeClean = async () => {
    const target = await compiler.getTargetFile(vscode.window.activeTextEditor);
    if (target) {
      await compiler.clean(target);
    }
  };

  const executeSwitchVersion = async () => {
    await compiler.switchVersionInteractive();
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('bennugd.compile', executeCompile),
    vscode.commands.registerCommand('bennugd2.compile', executeCompile),
    vscode.commands.registerCommand('bennugd.run', executeRun),
    vscode.commands.registerCommand('bennugd2.run', executeRun),
    vscode.commands.registerCommand('bennugd.compileAndRun', executeCompileAndRun),
    vscode.commands.registerCommand('bennugd2.compileAndRun', executeCompileAndRun),
    vscode.commands.registerCommand('bennugd.clean', executeClean),
    vscode.commands.registerCommand('bennugd2.clean', executeClean),
    vscode.commands.registerCommand('bennugd.switchVersion', executeSwitchVersion),
    vscode.commands.registerCommand('bennugd.showReferences', async (uriString: string, pos: { line: number; character: number }, locs: any[]) => {
      if (!uriString || !pos) return;
      const uri = vscode.Uri.parse(uriString);
      const position = new vscode.Position(pos.line, pos.character);
      const locations = (locs || []).map(l => new vscode.Location(
        vscode.Uri.parse(l.uri),
        new vscode.Range(l.range.start.line, l.range.start.character, l.range.end.line, l.range.end.character)
      ));
      await vscode.commands.executeCommand('editor.action.showReferences', uri, position, locations);
    }),
    vscode.commands.registerCommand('bennuide.welcome', () => WelcomePanel.createOrShow(context, compiler, 'home')),
    vscode.commands.registerCommand('bennugd.welcome', () => WelcomePanel.createOrShow(context, compiler, 'home')),
    vscode.commands.registerCommand('bennuide.newProject', () => WelcomePanel.createOrShow(context, compiler, 'new-project')),
    vscode.commands.registerCommand('bennugd.newProject', () => WelcomePanel.createOrShow(context, compiler, 'new-project'))
  );

  // 6. Automatic #include / import Refactoring on File Rename
  context.subscriptions.push(
    vscode.workspace.onDidRenameFiles(async e => {
      for (const file of e.files) {
        const oldExt = path.extname(file.oldUri.fsPath).toLowerCase();
        if (!['.inc', '.prg', '.h', '.bgd'].includes(oldExt)) continue;

        const oldBase = path.basename(file.oldUri.fsPath);
        const newBase = path.basename(file.newUri.fsPath);
        if (oldBase === newBase) continue;

        const uris = await vscode.workspace.findFiles('**/*.{prg,inc,bgd,h,PRG,INC,BGD,H}');
        const workspaceEdit = new vscode.WorkspaceEdit();
        let editCount = 0;

        for (const uri of uris) {
          if (uri.fsPath === file.newUri.fsPath) continue;
          try {
            const doc = await vscode.workspace.openTextDocument(uri);
            const text = doc.getText();
            const escapedOld = oldBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`\\b(include|import)\\s+(['"])(.*?)${escapedOld}\\2`, 'gi');
            let m: RegExpExecArray | null;
            while ((m = regex.exec(text)) !== null) {
              const startPos = doc.positionAt(m.index);
              const endPos = doc.positionAt(m.index + m[0].length);
              const directive = m[1];
              const quote = m[2];
              const prefix = m[3] || '';
              const replacement = `${directive} ${quote}${prefix}${newBase}${quote}`;
              workspaceEdit.replace(uri, new vscode.Range(startPos, endPos), replacement);
              editCount++;
            }
          } catch { /* ignore */ }
        }

        if (editCount > 0) {
          await vscode.workspace.applyEdit(workspaceEdit);
          vscode.window.showInformationMessage(
            `BennuIDE: Se actualizaron ${editCount} referencia(s) de include de '${oldBase}' a '${newBase}'.`
          );
        }
      }
    })
  );

  // 7. Register Debugger Provider
  context.subscriptions.push(
    vscode.debug.registerDebugAdapterDescriptorFactory('bennugd2', new BennuDebugAdapterDescriptorFactory())
  );

  // 8. Auto-record open workspace folder into recent projects
  if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
    for (const folder of vscode.workspace.workspaceFolders) {
      WelcomePanel.addRecentProject(context, folder.uri.fsPath);
    }
  }

  // 9. Auto-open Welcome Screen when opening BennuIDE with an empty workspace
  const showWelcome = vscode.workspace.getConfiguration('bennuide').get<boolean>('showWelcomeOnStartup', true);
  if (showWelcome && (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0)) {
    setTimeout(() => {
      WelcomePanel.createOrShow(context, compiler, 'home');
    }, 450);
  }
}

function createStatusBarButtons(context: vscode.ExtensionContext) {
  const welcomeBtn = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 103);
  welcomeBtn.text = '$(home) BennuIDE Inicio';
  welcomeBtn.tooltip = 'Abrir Asistente de Inicio y Proyectos BennuIDE';
  welcomeBtn.command = 'bennuide.welcome';
  welcomeBtn.show();
  context.subscriptions.push(welcomeBtn);

  const versionSwitcherBtn = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 102);
  versionSwitcherBtn.command = 'bennugd.switchVersion';
  compiler.setStatusBarItem(versionSwitcherBtn);
  context.subscriptions.push(versionSwitcherBtn);

  const compileRunBtn = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 101);
  compileRunBtn.text = '$(run) BennuGD Run';
  compileRunBtn.tooltip = 'Compilar y ejecutar juego BennuGD';
  compileRunBtn.command = 'bennugd.compileAndRun';
  compileRunBtn.show();
  context.subscriptions.push(compileRunBtn);

  const compileBtn = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  compileBtn.text = '$(gear) Compile';
  compileBtn.tooltip = 'Compilar proyecto BennuGD con bgdc';
  compileBtn.command = 'bennugd.compile';
  compileBtn.show();
  context.subscriptions.push(compileBtn);
}

class BennuDebugAdapterDescriptorFactory implements vscode.DebugAdapterDescriptorFactory {
  createDebugAdapterDescriptor(_session: vscode.DebugSession): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
    return new vscode.DebugAdapterInlineImplementation(new BennuDebugSession());
  }
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}

