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
    vscode.commands.registerCommand('bennugd.switchVersion', executeSwitchVersion)
  );

  // 6. Register Debugger Provider
  context.subscriptions.push(
    vscode.debug.registerDebugAdapterDescriptorFactory('bennugd2', new BennuDebugAdapterDescriptorFactory())
  );
}

function createStatusBarButtons(context: vscode.ExtensionContext) {
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

