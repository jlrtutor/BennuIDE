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

let client: LanguageClient;
let compiler: BennuCompiler;

export function activate(context: vscode.ExtensionContext) {
  // 0. Auto-enforce BennuGD2 language mode on .prg / .inc / .bgd files
  const enforceBennuLanguage = (doc: vscode.TextDocument) => {
    if (!doc || !doc.fileName) return;
    const ext = path.extname(doc.fileName).toLowerCase();
    if (['.prg', '.inc', '.bgd'].includes(ext) && doc.languageId !== 'bennugd2') {
      vscode.languages.setTextDocumentLanguage(doc, 'bennugd2');
    }
  };

  vscode.workspace.textDocuments.forEach(enforceBennuLanguage);
  context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(enforceBennuLanguage));
  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(editor => {
    if (editor?.document) enforceBennuLanguage(editor.document);
  }));

  const outputChannel = vscode.window.createOutputChannel('BennuGD2');
  const diagnosticCollection = vscode.languages.createDiagnosticCollection('bennugd2');
  compiler = new BennuCompiler(outputChannel, diagnosticCollection);

  context.subscriptions.push(outputChannel, diagnosticCollection);

  // 1. Language Server Setup
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
    documentSelector: [{ scheme: 'file', language: 'bennugd2' }],
    synchronize: {
      fileEvents: vscode.workspace.createFileSystemWatcher('**/*.prg')
    }
  };

  client = new LanguageClient(
    'bennugd2Lsp',
    'BennuGD2 Language Server',
    serverOptions,
    clientOptions
  );

  client.start();

  // 2. Status Bar Buttons
  createStatusBarButtons(context);

  // 3. Register Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('bennugd2.compile', async () => {
      const target = await compiler.getTargetFile(vscode.window.activeTextEditor);
      if (target) {
        await compiler.compile(target);
      }
    }),

    vscode.commands.registerCommand('bennugd2.run', async () => {
      const target = await compiler.getTargetFile(vscode.window.activeTextEditor);
      if (target) {
        await compiler.run(target);
      }
    }),

    vscode.commands.registerCommand('bennugd2.compileAndRun', async () => {
      const target = await compiler.getTargetFile(vscode.window.activeTextEditor);
      if (target) {
        const compiled = await compiler.compile(target);
        if (compiled) {
          await compiler.run(target);
        }
      }
    }),

    vscode.commands.registerCommand('bennugd2.clean', async () => {
      const target = await compiler.getTargetFile(vscode.window.activeTextEditor);
      if (target) {
        await compiler.clean(target);
      }
    })
  );

  // 4. Register Debugger Provider
  context.subscriptions.push(
    vscode.debug.registerDebugAdapterDescriptorFactory('bennugd2', new BennuDebugAdapterDescriptorFactory())
  );
}

function createStatusBarButtons(context: vscode.ExtensionContext) {
  // Compile & Run Button
  const compileRunBtn = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  compileRunBtn.text = '$(run-all) BennuGD2 Run';
  compileRunBtn.tooltip = 'Compilar y ejecutar juego BennuGD2';
  compileRunBtn.command = 'bennugd2.compileAndRun';
  compileRunBtn.show();
  context.subscriptions.push(compileRunBtn);

  // Compile Only Button
  const compileBtn = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
  compileBtn.text = '$(gear) Compile';
  compileBtn.tooltip = 'Compilar proyecto BennuGD2 con bgdc';
  compileBtn.command = 'bennugd2.compile';
  compileBtn.show();
  context.subscriptions.push(compileBtn);
}

class BennuDebugAdapterDescriptorFactory implements vscode.DebugAdapterDescriptorFactory {
  createDebugAdapterDescriptor(
    _session: vscode.DebugSession
  ): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
    return new vscode.DebugAdapterInlineImplementation(new BennuDebugSession());
  }
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
