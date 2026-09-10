import * as fs from 'fs';
import * as path from 'path';

export interface BennuSymbol {
  name: string;
  kind: 'process' | 'function' | 'method' | 'program' | 'global' | 'local' | 'private' | 'public' | 'const' | 'type' | 'struct' | 'define' | 'param';
  file: string; // absolute filesystem path
  line: number; // 0-indexed
  startCol: number;
  endCol: number;
  signature?: string;
  doc?: string;
  type?: string;
  isDeclare: boolean;
}

export interface BennuInclude {
  rawPath: string;
  line: number;
  startCol: number;
  endCol: number;
  resolvedPath?: string;
}

export interface ParsedBennuFile {
  filePath: string;
  symbols: BennuSymbol[];
  includes: BennuInclude[];
  mtime: number;
}

const fileCache = new Map<string, ParsedBennuFile>();
export const projectRoots = new Set<string>();

export const BENNU_EXTENSIONS = ['.prg', '.inc', '.h', '.bgd', '.PRG', '.INC', '.H', '.BGD'];

/**
 * Discover project root for a given file by walking up directory tree.
 */
export function discoverProjectRoot(filePath: string): string {
  let cur = path.dirname(filePath);
  let bestRoot = cur;

  while (cur && cur !== path.dirname(cur)) {
    if (
      fs.existsSync(path.join(cur, '.git')) ||
      fs.existsSync(path.join(cur, '.vscode')) ||
      fs.existsSync(path.join(cur, '.kateproject')) ||
      fs.existsSync(path.join(cur, 'CMakeLists.txt'))
    ) {
      bestRoot = cur;
      break;
    }

    try {
      const entries = fs.readdirSync(cur);
      const hasMainPrg = entries.some(
        e => /^(main|game|app|[a-zA-Z0-9_-]+)\.prg$/i.test(e) && !['commons', 'common', 'src', 'include', 'includes'].includes(e.toLowerCase())
      );
      if (hasMainPrg) {
        bestRoot = cur;
      }
    } catch {
      // Ignore
    }

    cur = path.dirname(cur);
  }

  projectRoots.add(bestRoot);
  return bestRoot;
}

/**
 * Resolve include path to an absolute filesystem path if it exists on disk.
 */
export function resolveIncludePath(fromFilePath: string, includePath: string): string | undefined {
  try {
    const fromDir = path.dirname(fromFilePath);
    discoverProjectRoot(fromFilePath);

    const candidateBases = new Set<string>();
    candidateBases.add(fromDir);

    for (const root of projectRoots) {
      candidateBases.add(root);
      candidateBases.add(path.join(root, 'src'));
      candidateBases.add(path.join(root, 'include'));
      candidateBases.add(path.join(root, 'includes'));
      candidateBases.add(path.join(root, 'commons'));
    }

    let upDir = fromDir;
    for (let i = 0; i < 4 && upDir && upDir !== path.dirname(upDir); i++) {
      upDir = path.dirname(upDir);
      candidateBases.add(upDir);
    }

    const extensions = ['', '.inc', '.prg', '.h', '.bgd', '.INC', '.PRG', '.H', '.BGD'];

    for (const base of candidateBases) {
      for (const ext of extensions) {
        const fullPath = path.resolve(base, includePath + (includePath.includes('.') && ext === '' ? '' : ext));
        if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
          return fullPath;
        }
      }
    }
  } catch {
    // Ignore
  }
  return undefined;
}

/**
 * Scan directory recursively for all BennuGD files.
 */
export function scanDirectory(dir: string, depth: number = 0, maxDepth: number = 6): void {
  if (depth > maxDepth) return;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.name.startsWith('.') || ent.name === 'node_modules' || ent.name === 'dist' || ent.name === 'out') {
        continue;
      }
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        scanDirectory(full, depth + 1, maxDepth);
      } else if (ent.isFile()) {
        const ext = path.extname(ent.name).toLowerCase();
        if (BENNU_EXTENSIONS.includes(ext)) {
          getOrLoadParsedFile(full);
        }
      }
    }
  } catch {
    // Ignore
  }
}

export function scanAllProjects(): void {
  for (const root of projectRoots) {
    scanDirectory(root, 0, 6);
  }
}

/**
 * Parse a BennuGD file content.
 */
export function parseBennuText(filePath: string, text: string, mtime: number = Date.now()): ParsedBennuFile {
  const lines = text.split(/\r?\n/);
  const symbols: BennuSymbol[] = [];
  const includes: BennuInclude[] = [];

  const includeRegex = /^\s*#?\s*(?:include|import)\s*["']([^"']+)["']/i;
  const defineRegex = /^\s*#\s*define\s+([a-zA-Z_][a-zA-Z0-9_]*)(?:\s+(.*))?$/i;
  const programRegex = /^\s*program\s+([a-zA-Z_][a-zA-Z0-9_]*)/i;
  const procRegex = /^\s*(?:declare\s+)?(process|function|method)\s+(?:(?:int|string|float|double|byte|word|dword|char|short|long|pointer|[a-zA-Z_][a-zA-Z0-9_*]*)\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s*(\(.*?\))?/i;
  const structRegex = /^\s*(type|struct)\s+([a-zA-Z_][a-zA-Z0-9_]*)/i;
  const blockStartRegex = /^\s*(global|local|private|public|const)\b/i;

  let currentBlockType: 'global' | 'local' | 'private' | 'public' | 'const' | undefined = undefined;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const commentIdx = rawLine.indexOf('//');
    const line = commentIdx >= 0 ? rawLine.substring(0, commentIdx) : rawLine;
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('/*')) continue;

    // 1. Include / Import
    const incMatch = line.match(includeRegex);
    if (incMatch) {
      const incPath = incMatch[1];
      const startCol = rawLine.indexOf(incPath);
      const endCol = startCol + incPath.length;
      const resolvedPath = resolveIncludePath(filePath, incPath);

      includes.push({
        rawPath: incPath,
        line: i,
        startCol: Math.max(0, startCol),
        endCol: Math.max(0, endCol),
        resolvedPath
      });
      continue;
    }

    // 2. #define
    const defMatch = line.match(defineRegex);
    if (defMatch) {
      const defName = defMatch[1];
      const startCol = rawLine.indexOf(defName);
      symbols.push({
        name: defName,
        kind: 'define',
        file: filePath,
        line: i,
        startCol,
        endCol: startCol + defName.length,
        signature: `#define ${defName} ${defMatch[2] || ''}`,
        doc: `Macro / Constante: ${defName}`,
        isDeclare: false
      });
      continue;
    }

    // 3. Program
    const progMatch = line.match(programRegex);
    if (progMatch) {
      const name = progMatch[1];
      const startCol = rawLine.indexOf(name);
      symbols.push({
        name,
        kind: 'program',
        file: filePath,
        line: i,
        startCol,
        endCol: startCol + name.length,
        signature: `program ${name}`,
        doc: `Programa principal: ${name}`,
        isDeclare: false
      });
      continue;
    }

    // 4. Process / Function / Method
    const procMatch = line.match(procRegex);
    if (procMatch) {
      const isDeclare = /^\s*declare\b/i.test(line);
      const kind = procMatch[1].toLowerCase() as any;
      const name = procMatch[2];
      const params = procMatch[3] || '()';
      const startCol = rawLine.indexOf(name);

      symbols.push({
        name,
        kind,
        file: filePath,
        line: i,
        startCol,
        endCol: startCol + name.length,
        signature: `${isDeclare ? 'declare ' : ''}${procMatch[1]} ${name}${params}`,
        doc: `${isDeclare ? 'Declaración de' : 'Definición de'} ${procMatch[1]} '${name}'`,
        isDeclare
      });

      if (procMatch[3]) {
        const paramStr = procMatch[3].replace(/^\(|\)$/g, '');
        for (const p of paramStr.split(',')) {
          const pTrim = p.trim();
          if (pTrim) {
            const pMatch = pTrim.match(/(?:[a-zA-Z0-9_*]+\s+)?([a-zA-Z_][a-zA-Z0-9_]*)/);
            if (pMatch) {
              const pName = pMatch[1];
              const pStart = rawLine.indexOf(pName, startCol);
              if (pStart >= 0) {
                symbols.push({
                  name: pName,
                  kind: 'param',
                  file: filePath,
                  line: i,
                  startCol: pStart,
                  endCol: pStart + pName.length,
                  signature: `(Parámetro) ${pTrim}`,
                  doc: `Parámetro '${pName}' de ${name}`,
                  isDeclare
                });
              }
            }
          }
        }
      }
      continue;
    }

    // 5. Struct / Type
    const structMatch = line.match(structRegex);
    if (structMatch) {
      const structName = structMatch[2];
      const startCol = rawLine.indexOf(structName);
      symbols.push({
        name: structName,
        kind: structMatch[1].toLowerCase() as any,
        file: filePath,
        line: i,
        startCol,
        endCol: startCol + structName.length,
        signature: `${structMatch[1]} ${structName}`,
        doc: `Estructura o tipo '${structName}'`,
        isDeclare: false
      });
      continue;
    }

    // 6. Block starts
    const blockMatch = line.match(blockStartRegex);
    if (blockMatch) {
      currentBlockType = blockMatch[1].toLowerCase() as any;
      const rest = line.substring(line.indexOf(blockMatch[1]) + blockMatch[1].length).trim();
      if (rest.length > 0 && !rest.startsWith('//')) {
        parseBlockLine(rest, i, rawLine, currentBlockType, filePath, symbols);
        currentBlockType = undefined;
      }
      continue;
    }

    // 7. Block ends
    if (/^\s*(end|begin)\b/i.test(trimmed)) {
      if (currentBlockType) {
        currentBlockType = undefined;
      }
      continue;
    }

    // 8. Lines inside variable or constant blocks
    if (currentBlockType) {
      parseBlockLine(trimmed, i, rawLine, currentBlockType, filePath, symbols);
    }
  }

  const parsed: ParsedBennuFile = { filePath, symbols, includes, mtime };
  fileCache.set(filePath, parsed);
  return parsed;
}

function parseBlockLine(
  line: string,
  lineNum: number,
  rawLine: string,
  blockType: 'global' | 'local' | 'private' | 'public' | 'const',
  filePath: string,
  symbols: BennuSymbol[]
): void {
  const cleanLine = line.replace(/;+$/, '').trim();
  if (!cleanLine) return;

  if (blockType === 'const') {
    const constMatch = cleanLine.match(/^(?:[a-zA-Z0-9_*]+\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.*)$/);
    if (constMatch) {
      const name = constMatch[1];
      const val = constMatch[2];
      const startCol = rawLine.indexOf(name);
      if (startCol >= 0) {
        symbols.push({
          name,
          kind: 'const',
          file: filePath,
          line: lineNum,
          startCol,
          endCol: startCol + name.length,
          signature: `const ${name} = ${val}`,
          doc: `Constante: ${name} = ${val}`,
          isDeclare: false
        });
      }
    }
  } else {
    let varType = 'int';
    let declBody = cleanLine;

    const typeMatch = cleanLine.match(/^([a-zA-Z_][a-zA-Z0-9_*]*)\s+([a-zA-Z_].*)$/);
    if (typeMatch && !typeMatch[1].includes('=')) {
      varType = typeMatch[1];
      declBody = typeMatch[2];
    }

    const vars = declBody.split(',');
    for (const v of vars) {
      const vMatch = v.trim().match(/^([a-zA-Z_][a-zA-Z0-9_]*)(?:\[[^\]]*\])?(?:\s*=\s*(.*))?$/);
      if (vMatch) {
        const vName = vMatch[1];
        const initialVal = vMatch[2];
        const startCol = rawLine.indexOf(vName);
        if (startCol >= 0) {
          symbols.push({
            name: vName,
            kind: blockType,
            file: filePath,
            line: lineNum,
            startCol,
            endCol: startCol + vName.length,
            type: varType,
            signature: `${blockType} ${varType} ${vName}${initialVal ? ' = ' + initialVal : ''}`,
            doc: `Variable (${blockType}) \`${varType} ${vName}\``,
            isDeclare: false
          });
        }
      }
    }
  }
}

export function getOrLoadParsedFile(filePath: string): ParsedBennuFile | null {
  if (fileCache.has(filePath)) {
    try {
      const stat = fs.statSync(filePath);
      const cached = fileCache.get(filePath)!;
      if (cached.mtime >= stat.mtimeMs) {
        return cached;
      }
    } catch {
      return fileCache.get(filePath) || null;
    }
  }

  try {
    if (fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath);
      if (stat.size < 4 * 1024 * 1024) {
        const text = fs.readFileSync(filePath, 'utf-8');
        return parseBennuText(filePath, text, stat.mtimeMs);
      }
    }
  } catch {
    // Ignore
  }

  return null;
}

/**
 * Recursively collect all symbols from a file and its included files.
 */
export function getAllSymbolsForFile(filePath: string, visited: Set<string> = new Set()): BennuSymbol[] {
  if (visited.has(filePath)) return [];
  visited.add(filePath);

  const doc = getOrLoadParsedFile(filePath);
  if (!doc) return [];

  let result: BennuSymbol[] = [...doc.symbols];

  for (const inc of doc.includes) {
    if (inc.resolvedPath && !visited.has(inc.resolvedPath)) {
      result = result.concat(getAllSymbolsForFile(inc.resolvedPath, visited));
    }
  }

  return result;
}

export interface DefinitionMatch {
  file: string;
  line: number;
  startCol: number;
  endCol: number;
  isInclude: boolean;
  symbol?: BennuSymbol;
}

/**
 * Find definition for a given file and cursor position.
 */
export function findDefinitionAt(filePath: string, lineNum: number, charNum: number, currentText?: string): DefinitionMatch | null {
  discoverProjectRoot(filePath);

  let parsed: ParsedBennuFile | null = null;
  if (currentText !== undefined) {
    parsed = parseBennuText(filePath, currentText);
  } else {
    parsed = getOrLoadParsedFile(filePath);
  }

  let currentLine = '';
  if (currentText !== undefined) {
    const lines = currentText.split(/\r?\n/);
    currentLine = lines[lineNum] || '';
  } else {
    try {
      const lines = fs.readFileSync(filePath, 'utf-8').split(/\r?\n/);
      currentLine = lines[lineNum] || '';
    } catch {}
  }

  // 1. Check if line contains an Include / Import
  const incMatch = currentLine.match(/^\s*#?\s*(?:include|import)\s*["']([^"']+)["']/i);
  if (incMatch) {
    const resolved = resolveIncludePath(filePath, incMatch[1]);
    if (resolved) {
      return { file: resolved, line: 0, startCol: 0, endCol: 0, isInclude: true };
    }
  }

  // 1b. Check quoted string
  const quoteRegex = /"([^"]+)"|'([^']+)'/g;
  let qMatch: RegExpExecArray | null;
  while ((qMatch = quoteRegex.exec(currentLine)) !== null) {
    const qStr = qMatch[1] || qMatch[2];
    const qStart = qMatch.index;
    const qEnd = qMatch.index + qMatch[0].length;
    if (charNum >= qStart && charNum <= qEnd) {
      const resolved = resolveIncludePath(filePath, qStr);
      if (resolved) {
        return { file: resolved, line: 0, startCol: 0, endCol: 0, isInclude: true };
      }
    }
  }

  // 2. Extract word under cursor
  let start = charNum;
  while (start > 0 && /[a-zA-Z0-9_]/.test(currentLine[start - 1])) start--;
  let end = charNum;
  while (end < currentLine.length && /[a-zA-Z0-9_]/.test(currentLine[end])) end++;

  const word = currentLine.substring(start, end);
  if (!word) return null;
  const wordLower = word.toLowerCase();

  const candidates: BennuSymbol[] = [];

  // Search in current file
  if (parsed) {
    for (const s of parsed.symbols) {
      if (s.name.toLowerCase() === wordLower) {
        candidates.push(s);
      }
    }
  }

  // Search in direct and indirect includes
  if (candidates.length === 0 || candidates.every(c => c.isDeclare)) {
    const incSymbols = getAllSymbolsForFile(filePath);
    for (const s of incSymbols) {
      if (s.name.toLowerCase() === wordLower) {
        candidates.push(s);
      }
    }
  }

  // Search across whole project
  if (candidates.length === 0 || candidates.every(c => c.isDeclare)) {
    scanAllProjects();
    for (const cached of fileCache.values()) {
      for (const s of cached.symbols) {
        if (s.name.toLowerCase() === wordLower) {
          candidates.push(s);
        }
      }
    }
  }

  // Prioritize real definitions over declare forward declarations
  candidates.sort((a, b) => (a.isDeclare === b.isDeclare ? 0 : a.isDeclare ? 1 : -1));

  if (candidates.length > 0) {
    const match = candidates[0];
    return {
      file: match.file,
      line: match.line,
      startCol: match.startCol,
      endCol: match.endCol,
      isInclude: false,
      symbol: match
    };
  }

  return null;
}
