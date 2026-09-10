import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  CompletionItem,
  CompletionItemKind,
  TextDocumentPositionParams,
  TextDocumentSyncKind,
  InitializeResult,
  Hover,
  MarkupKind,
  Definition,
  Location,
  Range,
  Position,
  DocumentSymbol,
  SymbolKind,
  SignatureHelp,
  SignatureInformation,
  ParameterInformation,
  Diagnostic,
  DiagnosticSeverity,
  TextEdit,
  DocumentLink,
  DocumentLinkParams,
  WorkspaceFolder
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

// Create LSP Connection
const connection = createConnection(ProposedFeatures.all);
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let workspaceFolders: string[] = [];

// BennuGD2 Builtin Functions Database
interface BGDDoc {
  signature: string;
  doc: string;
  params?: string[];
  returnType?: string;
}

const BUILTIN_FUNCTIONS: Record<string, BGDDoc> = {
  set_mode: {
    signature: 'set_mode(int width, int height, int depth = 32)',
    doc: 'Configura la resolución y profundidad de color de la ventana de juego.',
    params: ['width: Ancho en píxeles', 'height: Alto en píxeles', 'depth: Profundidad de color (por defecto 32 bpp)'],
    returnType: 'int'
  },
  set_fps: {
    signature: 'set_fps(int fps, int max_frame_skip = 0)',
    doc: 'Establece la tasa de frames por segundo del bucle de juego.',
    params: ['fps: Frames por segundo deseados (ej. 60)', 'max_frame_skip: Frames máximos a saltar'],
    returnType: 'int'
  },
  window_set_title: {
    signature: 'window_set_title(string title)',
    doc: 'Establece el título de la ventana de la aplicación.',
    params: ['title: Cadena con el nuevo título de la ventana'],
    returnType: 'int'
  },
  load_fpg: {
    signature: 'load_fpg(string filename)',
    doc: 'Carga un archivo de sprites FPG en memoria y devuelve su identificador de archivo (file ID).',
    params: ['filename: Ruta del archivo .fpg a cargar'],
    returnType: 'int (File ID)'
  },
  fpg_load: {
    signature: 'fpg_load(string filename)',
    doc: 'Alias moderno para cargar un archivo FPG en memoria.',
    params: ['filename: Ruta del archivo .fpg a cargar'],
    returnType: 'int (File ID)'
  },
  fpg_unload: {
    signature: 'fpg_unload(int fileId)',
    doc: 'Descarga de memoria un archivo FPG previamente cargado.',
    params: ['fileId: Identificador del archivo FPG devuelto por load_fpg'],
    returnType: 'int'
  },
  load_map: {
    signature: 'load_map(string filename)',
    doc: 'Carga una imagen (PNG, BMP, MAP) como un gráfico en memoria y devuelve su graph ID.',
    params: ['filename: Ruta del archivo de imagen'],
    returnType: 'int (Graph ID)'
  },
  map_load: {
    signature: 'map_load(string filename)',
    doc: 'Alias moderno para cargar una imagen en memoria.',
    params: ['filename: Ruta del archivo de imagen'],
    returnType: 'int (Graph ID)'
  },
  map_unload: {
    signature: 'map_unload(int fileId, int graphId)',
    doc: 'Libera de memoria un gráfico individual.',
    params: ['fileId: ID del archivo contenedor (0 para gráfico en memoria)', 'graphId: ID del gráfico'],
    returnType: 'int'
  },
  map_put: {
    signature: 'map_put(int destFile, int destGraph, int srcFile, int srcGraph, int x, int y)',
    doc: 'Dibuja (blit) un gráfico sobre otro mapa o sobre la pantalla.',
    params: ['destFile: Archivo destino (0 pantalla)', 'destGraph: Gráfico destino (0 pantalla)', 'srcFile: Archivo origen', 'srcGraph: Gráfico origen', 'x: Coordenada X', 'y: Coordenada Y'],
    returnType: 'int'
  },
  write: {
    signature: 'write(int fontId, int x, int y, int align, string text)',
    doc: 'Imprime un texto estático en pantalla.',
    params: ['fontId: ID de fuente (0 para fuente del sistema)', 'x: Coordenada X', 'y: Coordenada Y', 'align: Alineación (ALIGN_TOP_LEFT, ALIGN_CENTER, etc.)', 'text: Texto a dibujar'],
    returnType: 'int (Text ID)'
  },
  write_var: {
    signature: 'write_var(int fontId, int x, int y, int align, pointer varAddress)',
    doc: 'Muestra en pantalla el valor de una variable que se actualiza automáticamente en cada frame.',
    params: ['fontId: ID de fuente', 'x: Coordenada X', 'y: Coordenada Y', 'align: Alineación', 'varAddress: Puntero &variable'],
    returnType: 'int (Text ID)'
  },
  write_delete: {
    signature: 'write_delete(int textId)',
    doc: 'Elimina un texto creado con write o write_var.',
    params: ['textId: ID del texto a borrar (o ALL_TEXT para borrar todos)'],
    returnType: 'int'
  },
  key: {
    signature: 'key(int scanCode)',
    doc: 'Comprueba si una tecla está pulsada en el frame actual.',
    params: ['scanCode: Código de tecla (_esc, _space, _up, _down, _left, _right, _enter, etc.)'],
    returnType: 'int (1 si está pulsada, 0 si no)'
  },
  collision: {
    signature: 'collision(int processType)',
    doc: 'Detecta colisión con otro proceso o tipo de proceso. Devuelve el ID del proceso con el que colisiona o 0.',
    params: ['processType: Tipo de proceso (ej. TYPE enemy) o ID de proceso específico'],
    returnType: 'int (Process ID)'
  },
  signal: {
    signature: 'signal(int processId, int signalType)',
    doc: 'Envía una señal de control a un proceso o grupo de procesos.',
    params: ['processId: ID del proceso o tipo (ej. S_KILL, S_SLEEP, S_FREEZE)'],
    returnType: 'int'
  },
  advance: {
    signature: 'advance(int distance)',
    doc: 'Mueve el proceso actual una distancia en la dirección indicada por su variable angle.',
    params: ['distance: Píxeles a avanzar'],
    returnType: 'int'
  },
  get_angle: {
    signature: 'get_angle(int targetProcessId)',
    doc: 'Calcula el ángulo desde el proceso actual hacia el proceso objetivo.',
    params: ['targetProcessId: ID del proceso objetivo'],
    returnType: 'int (Ángulo en milésimas de grado)'
  },
  get_dist: {
    signature: 'get_dist(int targetProcessId)',
    doc: 'Calcula la distancia euclídea entre el proceso actual y el objetivo.',
    params: ['targetProcessId: ID del proceso objetivo'],
    returnType: 'double'
  },
  rand: {
    signature: 'rand(int min, int max)',
    doc: 'Devuelve un número entero aleatorio comprendido entre min y max (ambos inclusive).',
    params: ['min: Límite inferior', 'max: Límite superior'],
    returnType: 'int'
  },
  sound_play: {
    signature: 'sound_play(int soundId, int volume = 100, int loops = 0)',
    doc: 'Reproduce un efecto de sonido cargado previamente.',
    params: ['soundId: ID devuelto por sound_load', 'volume: Volumen (0-128)', 'loops: Número de repeticiones (0 = una vez, -1 = bucle infinito)'],
    returnType: 'int (Channel ID)'
  },
  let_me_alone: {
    signature: 'let_me_alone()',
    doc: 'Mata a todos los procesos excepto al proceso actual que ejecuta la función.',
    params: [],
    returnType: 'int'
  },
  exit: {
    signature: 'exit()',
    doc: 'Termina inmediatamente la ejecución del juego BennuGD2.',
    params: [],
    returnType: 'void'
  }
};

const PROCESS_VARIABLES: Record<string, string> = {
  x: 'Coordenada X horizontal del proceso en el mundo/pantalla.',
  y: 'Coordenada Y vertical del proceso en el mundo/pantalla.',
  z: 'Profundidad de dibujado (eje Z). Menor valor se dibuja por encima.',
  graph: 'Número de gráfico o sprite asociado al proceso.',
  file: 'Identificador del archivo FPG donde se encuentra el gráfico.',
  size: 'Escalado del proceso en porcentaje (100 = 100% tamaño normal).',
  size_x: 'Escalado horizontal individual en porcentaje.',
  size_y: 'Escalado vertical individual en porcentaje.',
  angle: 'Ángulo de rotación del sprite en milésimas de grado (0 - 360000).',
  flags: 'Efectos de renderizado (0 = normal, 1 = espejo horizontal, 2 = espejo vertical, 4 = transparencia).',
  alpha: 'Nivel de opacidad / transparencia (0 = totalmente transparente, 255 = opaco).',
  color_r: 'Componente rojo de tintado (0 - 255).',
  color_g: 'Componente verde de tintado (0 - 255).',
  color_b: 'Componente azul de tintado (0 - 255).',
  region: 'ID de la región de recorte visual donde se dibuja el proceso (0 = pantalla completa).',
  resolution: 'Multiplicador de resolución submétrica para coordenadas finas.',
  id: 'Identificador único de la instancia de este proceso en la VM.',
  father: 'ID del proceso padre que creó a este proceso.',
  son: 'ID del último proceso hijo creado por este proceso.',
  brother: 'ID del siguiente proceso hermano en la jerarquía.'
};

const CONSTANTS: Record<string, string> = {
  true: 'Constante booleana verdadera (1)',
  false: 'Constante booleana falsa (0)',
  null: 'Puntero o referencia nula (0)',
  NIL: 'Referencia nula en BennuGD',
  S_KILL: 'Señal para terminar y destruir un proceso.',
  S_SLEEP: 'Señal para pausar un proceso (deja de ejecutarse pero sigue dibujándose).',
  S_FREEZE: 'Señal para congelar un proceso (deja de ejecutarse y de dibujarse).',
  S_WAKEUP: 'Señal para reactivar un proceso dormido o congelado.',
  ALIGN_TOP_LEFT: 'Alineación de texto arriba a la izquierda.',
  ALIGN_CENTER: 'Alineación de texto centrada.',
  ALIGN_BOTTOM_RIGHT: 'Alineación de texto abajo a la derecha.',
  B_CLEAR: 'Borrado automático del fondo de pantalla en cada frame.'
};

// Types and data structures for symbols and includes
export interface SymbolDef {
  name: string;
  kind: SymbolKind;
  uri: string;
  range: Range;
  selectionRange: Range;
  containerName?: string;
  signature?: string;
  doc?: string;
  type?: string;
}

export interface IncludeRef {
  rawPath: string;
  range: Range;
  selectionRange: Range;
  resolvedUri?: string;
}

export interface ParsedDocument {
  uri: string;
  symbols: SymbolDef[];
  includes: IncludeRef[];
  mtime: number;
}

// In-memory cache for parsed documents (both open and disk-read)
const parsedDocsCache = new Map<string, ParsedDocument>();

/**
 * Resolve include path to a file URI if it exists on disk.
 */
function resolveIncludePath(fromUri: string, includePath: string): string | undefined {
  try {
    let fromDir = '';
    if (fromUri.startsWith('file://')) {
      fromDir = path.dirname(fileURLToPath(fromUri));
    }

    const candidateBases: string[] = [];
    if (fromDir) {
      candidateBases.push(fromDir);
    }
    for (const ws of workspaceFolders) {
      candidateBases.push(ws);
      candidateBases.push(path.join(ws, 'src'));
      candidateBases.push(path.join(ws, 'include'));
      candidateBases.push(path.join(ws, 'includes'));
    }

    const extensions = ['', '.inc', '.prg', '.bgd', '.INC', '.PRG', '.BGD'];

    for (const base of candidateBases) {
      for (const ext of extensions) {
        const fullPath = path.resolve(base, includePath + (includePath.includes('.') && ext === '' ? '' : ext));
        if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
          return pathToFileURL(fullPath).toString();
        }
      }
    }
  } catch {
    // Ignore resolution errors
  }
  return undefined;
}

/**
 * Parse full BennuGD symbols and includes from document text.
 */
export function parseDocumentFull(uri: string, text: string, mtime: number = Date.now()): ParsedDocument {
  const lines = text.split(/\r?\n/);
  const symbols: SymbolDef[] = [];
  const includes: IncludeRef[] = [];

  const includeRegex = /^\s*(?:include|import)\s*["']([^"']+)["']/i;
  const programRegex = /^\s*program\s+([a-zA-Z_][a-zA-Z0-9_]*)/i;
  const procRegex = /^\s*(process|function|method)\s+(?:(?:int|string|float|byte|word|dword|char|short|long|pointer|[a-zA-Z_][a-zA-Z0-9_]*)\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s*(\(.*?\))?/i;
  const structRegex = /^\s*(type|struct)\s+([a-zA-Z_][a-zA-Z0-9_]*)/i;
  const blockStartRegex = /^\s*(global|local|private|public|const)\b/i;

  let currentContainer: string | undefined = undefined;
  let currentBlockType: 'global' | 'local' | 'private' | 'public' | 'const' | undefined = undefined;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    // Remove comments for statement parsing, keeping position index
    const commentIdx = rawLine.indexOf('//');
    const line = commentIdx >= 0 ? rawLine.substring(0, commentIdx) : rawLine;
    const trimmed = line.trim();

    if (!trimmed) continue;

    // 1. Check Include / Import
    const incMatch = line.match(includeRegex);
    if (incMatch) {
      const incPath = incMatch[1];
      const startCol = rawLine.indexOf(incPath);
      const endCol = startCol + incPath.length;
      const range = Range.create(Position.create(i, 0), Position.create(i, rawLine.length));
      const selectionRange = Range.create(Position.create(i, Math.max(0, startCol)), Position.create(i, Math.max(0, endCol)));
      const resolvedUri = resolveIncludePath(uri, incPath);

      includes.push({
        rawPath: incPath,
        range,
        selectionRange,
        resolvedUri
      });
      continue;
    }

    // 2. Program declaration
    const progMatch = line.match(programRegex);
    if (progMatch) {
      const name = progMatch[1];
      const startCol = line.indexOf(name);
      currentContainer = name;
      symbols.push({
        name,
        kind: SymbolKind.Package,
        uri,
        range: Range.create(Position.create(i, 0), Position.create(i, rawLine.length)),
        selectionRange: Range.create(Position.create(i, startCol), Position.create(i, startCol + name.length)),
        signature: `program ${name}`,
        doc: `Programa principal: ${name}`
      });
      continue;
    }

    // 3. Process / Function / Method declaration
    const procMatch = line.match(procRegex);
    if (procMatch) {
      const kindKeyword = procMatch[1].toLowerCase();
      const name = procMatch[2];
      const params = procMatch[3] || '()';
      const kind = kindKeyword === 'process' ? SymbolKind.Class : SymbolKind.Function;
      const startCol = line.indexOf(name);
      currentContainer = name;

      symbols.push({
        name,
        kind,
        uri,
        range: Range.create(Position.create(i, 0), Position.create(i, rawLine.length)),
        selectionRange: Range.create(Position.create(i, startCol), Position.create(i, startCol + name.length)),
        signature: `${procMatch[1]} ${name}${params}`,
        doc: `Definición de ${procMatch[1]} '${name}'`
      });

      // Parse parameters as local variables of this process/function
      if (procMatch[3]) {
        const paramStr = procMatch[3].replace(/^\(|\)$/g, '');
        const paramParts = paramStr.split(',');
        for (const p of paramParts) {
          const pTrim = p.trim();
          if (pTrim) {
            const pMatch = pTrim.match(/(?:[a-zA-Z0-9_*]+\s+)?([a-zA-Z_][a-zA-Z0-9_]*)/);
            if (pMatch) {
              const pName = pMatch[1];
              const pStart = rawLine.indexOf(pName, startCol);
              if (pStart >= 0) {
                symbols.push({
                  name: pName,
                  kind: SymbolKind.Variable,
                  uri,
                  containerName: currentContainer,
                  range: Range.create(Position.create(i, pStart), Position.create(i, pStart + pName.length)),
                  selectionRange: Range.create(Position.create(i, pStart), Position.create(i, pStart + pName.length)),
                  signature: `(Parámetro) ${pTrim}`,
                  doc: `Parámetro '${pName}' de ${name}`
                });
              }
            }
          }
        }
      }
      continue;
    }

    // 4. Struct / Type declaration
    const structMatch = line.match(structRegex);
    if (structMatch) {
      const structName = structMatch[2];
      const startCol = line.indexOf(structName);
      symbols.push({
        name: structName,
        kind: SymbolKind.Struct,
        uri,
        containerName: currentContainer,
        range: Range.create(Position.create(i, 0), Position.create(i, rawLine.length)),
        selectionRange: Range.create(Position.create(i, startCol), Position.create(i, startCol + structName.length)),
        signature: `${structMatch[1]} ${structName}`,
        doc: `Estructura o tipo de datos '${structName}'`
      });
      continue;
    }

    // 5. Block headers (global, local, private, public, const)
    const blockMatch = line.match(blockStartRegex);
    if (blockMatch) {
      currentBlockType = blockMatch[1].toLowerCase() as any;
      // Check if it's an inline single declaration like: global int foo = 1; or const PI = 3.14;
      const rest = line.substring(line.indexOf(blockMatch[1]) + blockMatch[1].length).trim();
      if (rest.length > 0 && !rest.startsWith('//')) {
        parseBlockLine(rest, i, rawLine, currentBlockType, currentContainer, uri, symbols);
        currentBlockType = undefined;
      }
      continue;
    }

    // 6. Block closure or statement transitions
    if (/^\s*(end|begin)\b/i.test(trimmed)) {
      if (currentBlockType) {
        currentBlockType = undefined;
      }
      if (/^\s*end\b/i.test(trimmed) && !currentBlockType) {
        // May close process / function / struct
      }
      continue;
    }

    // 7. Parse lines inside variable or constant blocks
    if (currentBlockType) {
      parseBlockLine(trimmed, i, rawLine, currentBlockType, currentContainer, uri, symbols);
    }
  }

  const result: ParsedDocument = { uri, symbols, includes, mtime };
  parsedDocsCache.set(uri, result);
  return result;
}

/**
 * Parse variable or constant declarations in a block line.
 */
function parseBlockLine(
  line: string,
  lineNum: number,
  rawLine: string,
  blockType: 'global' | 'local' | 'private' | 'public' | 'const',
  containerName: string | undefined,
  uri: string,
  symbols: SymbolDef[]
): void {
  // Strip trailing semicolon
  let cleanLine = line.replace(/;+$/, '').trim();
  if (!cleanLine) return;

  if (blockType === 'const') {
    // Examples: CONST_NAME = 10, int CONST_NAME = 10, MSG = "Hello"
    const constMatch = cleanLine.match(/^(?:[a-zA-Z0-9_*]+\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.*)$/);
    if (constMatch) {
      const name = constMatch[1];
      const val = constMatch[2];
      const startCol = rawLine.indexOf(name);
      if (startCol >= 0) {
        symbols.push({
          name,
          kind: SymbolKind.Constant,
          uri,
          containerName,
          range: Range.create(Position.create(lineNum, 0), Position.create(lineNum, rawLine.length)),
          selectionRange: Range.create(Position.create(lineNum, startCol), Position.create(lineNum, startCol + name.length)),
          signature: `const ${name} = ${val}`,
          doc: `Constante: ${name} = ${val}`
        });
      }
    }
  } else {
    // Variable block (global, local, private, public)
    // Examples:
    // int score = 0, high_score = 1000
    // string name
    // Actor player
    // speed = 5
    let varType = 'int';
    let declBody = cleanLine;

    // Detect optional leading type: int, string, float, byte, word, dword, char, short, long, pointer, struct, or CustomType
    const typeMatch = cleanLine.match(/^([a-zA-Z_][a-zA-Z0-9_*]*)\s+([a-zA-Z_].*)$/);
    if (typeMatch && !typeMatch[1].includes('=')) {
      varType = typeMatch[1];
      declBody = typeMatch[2];
    }

    // Split multiple declarations: a = 1, b = 2, c
    const vars = declBody.split(',');
    for (const v of vars) {
      const vMatch = v.trim().match(/^([a-zA-Z_][a-zA-Z0-9_]*)(?:\s*=\s*(.*))?$/);
      if (vMatch) {
        const vName = vMatch[1];
        const initialVal = vMatch[2];
        const startCol = rawLine.indexOf(vName);
        if (startCol >= 0) {
          const kind = blockType === 'global' ? SymbolKind.Variable : SymbolKind.Field;
          symbols.push({
            name: vName,
            kind,
            uri,
            type: varType,
            containerName,
            range: Range.create(Position.create(lineNum, 0), Position.create(lineNum, rawLine.length)),
            selectionRange: Range.create(Position.create(lineNum, startCol), Position.create(lineNum, startCol + vName.length)),
            signature: `${blockType} ${varType} ${vName}${initialVal ? ' = ' + initialVal : ''}`,
            doc: `Variable (${blockType}) \`${varType} ${vName}\`${containerName ? ` en ${containerName}` : ''}`
          });
        }
      }
    }
  }
}

/**
 * Get or load parsed document (from memory cache, open LSP documents, or disk).
 */
function getOrLoadParsedDocument(uri: string): ParsedDocument | null {
  const openDoc = documents.get(uri);
  if (openDoc) {
    const cached = parsedDocsCache.get(uri);
    if (cached) return cached;
    return parseDocumentFull(uri, openDoc.getText());
  }

  // Load from disk if file URI
  if (uri.startsWith('file://')) {
    try {
      const filePath = fileURLToPath(uri);
      if (fs.existsSync(filePath)) {
        const stat = fs.statSync(filePath);
        const cached = parsedDocsCache.get(uri);
        if (cached && cached.mtime >= stat.mtimeMs) {
          return cached;
        }
        if (stat.size < 2 * 1024 * 1024) {
          const text = fs.readFileSync(filePath, 'utf-8');
          return parseDocumentFull(uri, text, stat.mtimeMs);
        }
      }
    } catch {
      // Disk load failure ignored
    }
  }

  return null;
}

/**
 * Recursively collect all symbols from a document and its included files.
 */
function getAllSymbolsForDocument(rootUri: string, visited: Set<string> = new Set()): SymbolDef[] {
  if (visited.has(rootUri)) return [];
  visited.add(rootUri);

  const doc = getOrLoadParsedDocument(rootUri);
  if (!doc) return [];

  let result: SymbolDef[] = [...doc.symbols];

  for (const inc of doc.includes) {
    if (inc.resolvedUri && !visited.has(inc.resolvedUri)) {
      result = result.concat(getAllSymbolsForDocument(inc.resolvedUri, visited));
    }
  }

  return result;
}

/**
 * Scan workspace files to ensure cross-project index is populated.
 */
function scanWorkspace(): void {
  for (const root of workspaceFolders) {
    scanDirectory(root, 0, 5);
  }
}

function scanDirectory(dir: string, depth: number, maxDepth: number): void {
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
        if (['.prg', '.inc', '.bgd'].includes(ext)) {
          const fileUri = pathToFileURL(full).toString();
          getOrLoadParsedDocument(fileUri);
        }
      }
    }
  } catch {
    // Ignore read errors
  }
}

connection.onInitialize((params: InitializeParams): InitializeResult => {
  if (params.workspaceFolders && params.workspaceFolders.length > 0) {
    workspaceFolders = params.workspaceFolders
      .map(wf => (wf.uri.startsWith('file://') ? fileURLToPath(wf.uri) : wf.uri))
      .filter(p => !!p);
  } else if (params.rootUri && params.rootUri.startsWith('file://')) {
    workspaceFolders = [fileURLToPath(params.rootUri)];
  } else if (params.rootPath) {
    workspaceFolders = [params.rootPath];
  }

  // Scan workspace files in background
  setTimeout(() => scanWorkspace(), 500);

  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        resolveProvider: true,
        triggerCharacters: ['.', '(', '&', '"', "'", '/']
      },
      hoverProvider: true,
      definitionProvider: true,
      documentSymbolProvider: true,
      documentLinkProvider: {
        resolveProvider: false
      },
      signatureHelpProvider: {
        triggerCharacters: ['(', ',']
      },
      documentFormattingProvider: true
    }
  };

  return result;
});

// Document links for include "..." and import "..."
connection.onDocumentLink((params: DocumentLinkParams): DocumentLink[] => {
  const doc = getOrLoadParsedDocument(params.textDocument.uri);
  if (!doc) return [];

  const links: DocumentLink[] = [];
  for (const inc of doc.includes) {
    if (inc.resolvedUri) {
      links.push(DocumentLink.create(inc.selectionRange, inc.resolvedUri));
    }
  }
  return links;
});

// Autocompletion
connection.onCompletion((textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
  const uri = textDocumentPosition.textDocument.uri;
  const doc = getOrLoadParsedDocument(uri);
  const items: CompletionItem[] = [];
  const seenLabels = new Set<string>();

  const addItem = (item: CompletionItem) => {
    if (!seenLabels.has(item.label.toLowerCase())) {
      seenLabels.add(item.label.toLowerCase());
      items.push(item);
    }
  };

  // 1. Builtin functions
  for (const [name, info] of Object.entries(BUILTIN_FUNCTIONS)) {
    addItem({
      label: name,
      kind: CompletionItemKind.Function,
      detail: info.signature,
      documentation: {
        kind: MarkupKind.Markdown,
        value: `${info.doc}\n\n**Retorno:** \`${info.returnType || 'void'}\``
      },
      insertText: `${name}($0)`
    });
  }

  // 2. Process variables
  for (const [name, docStr] of Object.entries(PROCESS_VARIABLES)) {
    addItem({
      label: name,
      kind: CompletionItemKind.Property,
      detail: `(Process Variable) ${name}`,
      documentation: docStr
    });
  }

  // 3. Builtin Constants
  for (const [name, docStr] of Object.entries(CONSTANTS)) {
    addItem({
      label: name,
      kind: CompletionItemKind.Constant,
      detail: `(Constant) ${name}`,
      documentation: docStr
    });
  }

  // 4. User symbols from document and all resolved includes
  const allSymbols = getAllSymbolsForDocument(uri);
  for (const sym of allSymbols) {
    let kind = CompletionItemKind.Variable;
    if (sym.kind === SymbolKind.Class) kind = CompletionItemKind.Class;
    else if (sym.kind === SymbolKind.Function) kind = CompletionItemKind.Function;
    else if (sym.kind === SymbolKind.Constant) kind = CompletionItemKind.Constant;
    else if (sym.kind === SymbolKind.Struct) kind = CompletionItemKind.Struct;

    addItem({
      label: sym.name,
      kind,
      detail: sym.signature || sym.name,
      documentation: sym.doc
    });
  }

  // 5. Keywords
  const keywords = [
    'program', 'process', 'function', 'method', 'begin', 'end', 'global', 'local', 'private', 'public',
    'const', 'type', 'struct', 'if', 'else', 'elseif', 'switch', 'case', 'default',
    'while', 'loop', 'repeat', 'until', 'for', 'from', 'to', 'step', 'break', 'continue',
    'return', 'frame', 'signal', 'clone', 'import', 'include', 'declare', 'int', 'string',
    'float', 'byte', 'word', 'dword', 'char', 'short', 'long', 'pointer'
  ];

  for (const kw of keywords) {
    addItem({
      label: kw,
      kind: CompletionItemKind.Keyword
    });
  }

  return items;
});

connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
  return item;
});

// Hover Information
connection.onHover((params: TextDocumentPositionParams): Hover | null => {
  const uri = params.textDocument.uri;
  const doc = documents.get(uri);
  if (!doc) return null;

  const position = params.position;
  const text = doc.getText();
  const offset = doc.offsetAt(position);
  const parsedDoc = getOrLoadParsedDocument(uri);

  // Check if hovering over an include path
  if (parsedDoc) {
    for (const inc of parsedDoc.includes) {
      if (
        position.line === inc.range.start.line &&
        position.character >= inc.range.start.character &&
        position.character <= inc.range.end.character
      ) {
        const fileTarget = inc.resolvedUri ? fileURLToPath(inc.resolvedUri) : 'Archivo no encontrado';
        return {
          contents: {
            kind: MarkupKind.Markdown,
            value: `### 📁 Include / Import\n\`${inc.rawPath}\`\n\n**Ruta resuelta:** \`${fileTarget}\``
          }
        };
      }
    }
  }

  // Extract word under cursor
  let start = offset;
  while (start > 0 && /[a-zA-Z0-9_]/.test(text[start - 1])) start--;
  let end = offset;
  while (end < text.length && /[a-zA-Z0-9_]/.test(text[end])) end++;

  const word = text.substring(start, end);
  if (!word) return null;
  const wordLower = word.toLowerCase();

  // Check Builtin Functions
  if (BUILTIN_FUNCTIONS[wordLower]) {
    const fn = BUILTIN_FUNCTIONS[wordLower];
    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: `### 🎮 \`${fn.signature}\`\n\n${fn.doc}\n\n${fn.params ? fn.params.map(p => `- \`${p}\``).join('\n') : ''}`
      }
    };
  }

  // Check Process Variables
  if (PROCESS_VARIABLES[wordLower]) {
    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: `### 📌 Variable de Proceso: \`${wordLower}\`\n\n${PROCESS_VARIABLES[wordLower]}`
      }
    };
  }

  // Check Constants
  if (CONSTANTS[word.toUpperCase()] || CONSTANTS[word]) {
    const key = CONSTANTS[word.toUpperCase()] ? word.toUpperCase() : word;
    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: `### 💎 Constante: \`${key}\`\n\n${CONSTANTS[key]}`
      }
    };
  }

  // Check User Defined Symbols across Document and Includes
  const allSymbols = getAllSymbolsForDocument(uri);
  const found = allSymbols.find(s => s.name.toLowerCase() === wordLower);
  if (found) {
    const fromOtherFile = found.uri !== uri ? `\n\n*Definido en: \`${path.basename(fileURLToPath(found.uri))}\`*` : '';
    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: `### 🧩 \`${found.signature || found.name}\`\n\n${found.doc || ''}${fromOtherFile}`
      }
    };
  }

  return null;
});

// Go to Definition (Ir a definición)
connection.onDefinition((params: TextDocumentPositionParams): Definition | null => {
  const uri = params.textDocument.uri;
  const doc = documents.get(uri);
  if (!doc) return null;

  const position = params.position;
  const text = doc.getText();
  const offset = doc.offsetAt(position);
  const parsedDoc = getOrLoadParsedDocument(uri);

  // 1. Check if clicking on an Include / Import statement
  if (parsedDoc) {
    for (const inc of parsedDoc.includes) {
      if (
        position.line === inc.range.start.line &&
        position.character >= inc.range.start.character &&
        position.character <= inc.range.end.character
      ) {
        if (inc.resolvedUri) {
          return Location.create(
            inc.resolvedUri,
            Range.create(Position.create(0, 0), Position.create(0, 0))
          );
        }
      }
    }
  }

  // 2. Extract word under cursor
  let start = offset;
  while (start > 0 && /[a-zA-Z0-9_]/.test(text[start - 1])) start--;
  let end = offset;
  while (end < text.length && /[a-zA-Z0-9_]/.test(text[end])) end++;

  const word = text.substring(start, end);
  if (!word) return null;
  const wordLower = word.toLowerCase();

  // 3. Search in current document first (matching local/private scopes first)
  if (parsedDoc) {
    // Find closest container around cursor line if any
    const localMatches = parsedDoc.symbols.filter(s => s.name.toLowerCase() === wordLower);
    if (localMatches.length > 0) {
      // Prioritize symbols near or within the same container
      const exactMatch = localMatches[0];
      return Location.create(exactMatch.uri, exactMatch.selectionRange);
    }
  }

  // 4. Search in included files recursively
  const allSymbols = getAllSymbolsForDocument(uri);
  const foundInIncludes = allSymbols.find(s => s.name.toLowerCase() === wordLower);
  if (foundInIncludes) {
    return Location.create(foundInIncludes.uri, foundInIncludes.selectionRange);
  }

  // 5. Fallback: Search all parsed documents in the workspace cache
  for (const [cachedUri, cachedDoc] of parsedDocsCache.entries()) {
    if (cachedUri === uri) continue;
    const foundInWorkspace = cachedDoc.symbols.find(s => s.name.toLowerCase() === wordLower);
    if (foundInWorkspace) {
      return Location.create(foundInWorkspace.uri, foundInWorkspace.selectionRange);
    }
  }

  return null;
});

// Document Symbols (Outline View)
connection.onDocumentSymbol((params): DocumentSymbol[] => {
  const uri = params.textDocument.uri;
  const doc = getOrLoadParsedDocument(uri);
  if (!doc) return [];

  return doc.symbols.map(s => ({
    name: s.name,
    detail: s.signature || '',
    kind: s.kind,
    range: s.range,
    selectionRange: s.selectionRange
  }));
});

// Signature Help
connection.onSignatureHelp((params: TextDocumentPositionParams): SignatureHelp | null => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return null;

  const text = doc.getText();
  const offset = doc.offsetAt(params.position);

  // Look backwards for function name
  const lineBefore = text.substring(0, offset);
  const match = lineBefore.match(/([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)$/);
  if (!match) return null;

  const fnName = match[1].toLowerCase();

  // Check builtin function
  const fnInfo = BUILTIN_FUNCTIONS[fnName];
  if (fnInfo) {
    const paramIndex = match[2].split(',').length - 1;
    const sigInfo: SignatureInformation = {
      label: fnInfo.signature,
      documentation: fnInfo.doc,
      parameters: fnInfo.params ? fnInfo.params.map(p => ({ label: p })) : []
    };
    return {
      signatures: [sigInfo],
      activeSignature: 0,
      activeParameter: Math.max(0, paramIndex)
    };
  }

  // Check user defined process / function
  const allSymbols = getAllSymbolsForDocument(params.textDocument.uri);
  const userSym = allSymbols.find(s => s.name.toLowerCase() === fnName && (s.kind === SymbolKind.Class || s.kind === SymbolKind.Function));
  if (userSym && userSym.signature) {
    const paramIndex = match[2].split(',').length - 1;
    return {
      signatures: [{
        label: userSym.signature,
        documentation: userSym.doc,
        parameters: []
      }],
      activeSignature: 0,
      activeParameter: Math.max(0, paramIndex)
    };
  }

  return null;
});

// Document Change Listener
documents.onDidChangeContent(change => {
  const uri = change.document.uri;
  parseDocumentFull(uri, change.document.getText());
  validateDocument(change.document);
});

// Live Document Validation (Diagnostics)
function validateDocument(doc: TextDocument): void {
  const text = doc.getText();
  const lines = text.split(/\r?\n/);
  const diagnostics: Diagnostic[] = [];

  let beginCount = 0;
  let endCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check begin / end match
    const begins = (line.match(/\bbegin\b/gi) || []).length;
    const ends = (line.match(/\bend\b/gi) || []).length;
    beginCount += begins;
    endCount += ends;

    // Check for unclosed double quotes
    let quoteCount = 0;
    for (let char of line) {
      if (char === '"') quoteCount++;
    }
    if (quoteCount % 2 !== 0 && !line.includes('//')) {
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: Range.create(Position.create(i, 0), Position.create(i, line.length)),
        message: 'Posible cadena de texto no cerrada con comillas dobles',
        source: 'BennuGD2 LSP'
      });
    }
  }

  if (beginCount > endCount) {
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: Range.create(Position.create(lines.length - 1, 0), Position.create(lines.length - 1, 10)),
      message: `Bloque sin cerrar: Se encontraron ${beginCount} 'begin' y solo ${endCount} 'end'.`,
      source: 'BennuGD2 LSP'
    });
  }

  connection.sendDiagnostics({ uri: doc.uri, diagnostics });
}

// Document Formatter
connection.onDocumentFormatting((params): TextEdit[] => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];

  const text = doc.getText();
  const lines = text.split(/\r?\n/);

  let indentLevel = 0;
  const indentSize = params.options.tabSize || 4;
  const indentStr = params.options.insertSpaces ? ' '.repeat(indentSize) : '\t';

  const newLines: string[] = [];

  for (let line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      newLines.push('');
      continue;
    }

    if (/^(end|else|elseif|until)\b/i.test(trimmed)) {
      indentLevel = Math.max(0, indentLevel - 1);
    }

    newLines.push(indentStr.repeat(indentLevel) + trimmed);

    if (/^(program|process|function|method|global|local|private|public|const|type|struct|begin|if|else|elseif|while|loop|repeat|for|switch)\b/i.test(trimmed)) {
      indentLevel++;
    }
  }

  const fullRange = Range.create(Position.create(0, 0), Position.create(lines.length, 0));
  return [TextEdit.replace(fullRange, newLines.join('\n'))];
});

// Start document listening
documents.listen(connection);
connection.listen();
