import * as vscode from 'vscode';
import { FntEditorProvider } from './fntEditorProvider';
import { FntParser } from './fntParser';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(FntEditorProvider.register(context));

  // Command to create a new empty .fnx font file
  context.subscriptions.push(
    vscode.commands.registerCommand('bennugd2.newFont', async () => {
      const uri = await vscode.window.showSaveDialog({
        filters: {
          'BennuGD Modern Font (FNX)': ['fnx'],
          'BennuGD Legacy Font (FNT)': ['fnt']
        },
        saveLabel: 'Crear Archivo de Fuente'
      });

      if (uri) {
        const isFnx = uri.fsPath.toLowerCase().endsWith('.fnx');
        const emptyFont = {
          isFnx,
          charsetType: 0,
          bpp: 32,
          glyphs: new Array(256).fill(null)
        };
        const serialized = FntParser.serialize(emptyFont);
        await vscode.workspace.fs.writeFile(uri, serialized);
        await vscode.commands.executeCommand('vscode.openWith', uri, FntEditorProvider.viewType);
        vscode.window.showInformationMessage(`Nuevo archivo de fuente creado: ${uri.fsPath}`);
      }
    })
  );
}

export function deactivate() {}
