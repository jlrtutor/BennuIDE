import * as vscode from 'vscode';
import { AudioEditorProvider } from './audioEditorProvider';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(AudioEditorProvider.register(context));

  // Command to open audio file in the custom audio editor
  context.subscriptions.push(
    vscode.commands.registerCommand('bennugd2.openAudioEditor', async (uri?: vscode.Uri) => {
      let targetUri = uri;
      if (!targetUri) {
        const uris = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectFolders: false,
          canSelectMany: false,
          filters: {
            'Archivos de Audio': ['wav', 'ogg', 'mp3', 'flac']
          },
          openLabel: 'Abrir en Editor de Audio'
        });
        if (uris && uris.length > 0) {
          targetUri = uris[0];
        }
      }

      if (targetUri) {
        await vscode.commands.executeCommand('vscode.openWith', targetUri, AudioEditorProvider.viewType);
      }
    })
  );
}

export function deactivate() {}
