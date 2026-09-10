import * as vscode from 'vscode';
import { findDefinitionAt, resolveAssetOrFilePath, discoverProjectRoot } from './bennuSymbolParser';

export class BennuDefinitionProvider implements vscode.DefinitionProvider {
  provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Definition | vscode.LocationLink[]> {
    const filePath = document.uri.fsPath;
    const result = findDefinitionAt(filePath, position.line, position.character, document.getText());
    if (!result) return null;

    const targetUri = vscode.Uri.file(result.file);
    const targetPos = new vscode.Position(result.line, result.startCol);
    const endPos = new vscode.Position(result.line, Math.max(result.startCol, result.endCol));

    return new vscode.Location(targetUri, new vscode.Range(targetPos, endPos));
  }
}

export class BennuDocumentLinkProvider implements vscode.DocumentLinkProvider {
  provideDocumentLinks(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.DocumentLink[]> {
    const filePath = document.uri.fsPath;
    discoverProjectRoot(filePath);

    const links: vscode.DocumentLink[] = [];
    const text = document.getText();
    const lines = text.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 1. Check Include / Import
      const incMatch = line.match(/^\s*#?\s*(?:include|import)\s*["']([^"']+)["']/i);
      if (incMatch) {
        const incPath = incMatch[1];
        const startCol = line.indexOf(incPath);
        const endCol = startCol + incPath.length;
        const resolved = resolveAssetOrFilePath(filePath, incPath);
        if (resolved) {
          const range = new vscode.Range(new vscode.Position(i, startCol), new vscode.Position(i, endCol));
          links.push(new vscode.DocumentLink(range, vscode.Uri.file(resolved)));
        }
        continue;
      }

      // 2. Check any quoted strings (e.g. "graphics/general.fpg", "/screens/screens.fpg", "music/song.ogg")
      const quoteRegex = /"([^"]+)"|'([^']+)'/g;
      let qMatch: RegExpExecArray | null;
      while ((qMatch = quoteRegex.exec(line)) !== null) {
        const qStr = qMatch[1] || qMatch[2];
        const qStart = qMatch.index + 1; // inner string start
        const qEnd = qStart + qStr.length;
        const resolved = resolveAssetOrFilePath(filePath, qStr);
        if (resolved) {
          const range = new vscode.Range(new vscode.Position(i, qStart), new vscode.Position(i, qEnd));
          links.push(new vscode.DocumentLink(range, vscode.Uri.file(resolved)));
        }
      }
    }

    return links;
  }
}
