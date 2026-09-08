import * as vscode from 'vscode';
import { FpgEditorProvider } from './fpgEditorProvider';
import { FpgParser } from './fpgParser';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(FpgEditorProvider.register(context));

  // Command to create a new empty .fpg file
  context.subscriptions.push(
    vscode.commands.registerCommand('bennugd2.newFpg', async () => {
      const uri = await vscode.window.showSaveDialog({
        filters: {
          'BennuGD FPG': ['fpg']
        },
        saveLabel: 'Crear Archivo FPG'
      });

      if (uri) {
        const emptyFpg = {
          bpp: 32,
          sprites: []
        };
        const serialized = FpgParser.serialize(emptyFpg);
        await vscode.workspace.fs.writeFile(uri, serialized);
        await vscode.commands.executeCommand('vscode.openWith', uri, FpgEditorProvider.viewType);
        vscode.window.showInformationMessage(`Nuevo archivo FPG creado: ${uri.fsPath}`);
      }
    })
  );
}

export function deactivate() {}
