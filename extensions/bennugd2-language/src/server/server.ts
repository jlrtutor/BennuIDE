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
  Diagnostic,
  DiagnosticSeverity,
  TextEdit,
  DocumentLink,
  DocumentLinkParams
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

// Create LSP Connection
const connection = createConnection(ProposedFeatures.all);
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

const projectRoots = new Set<string>();
const BENNU_EXTENSIONS = ['.prg', '.inc', '.h', '.bgd', '.PRG', '.INC', '.H', '.BGD'];

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
  isDeclare?: boolean;
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

// In-memory document parse cache
const parsedDocsCache = new Map<string, ParsedDocument>();

/**
 * Discover project root for a given file by walking up directory tree.
 */
function discoverProjectRoot(filePath: string): string {
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
      // Ignore read errors
    }

    cur = path.dirname(cur);
  }

  projectRoots.add(bestRoot);
  return bestRoot;
}

/**
 * Resolve include path to a file URI if it exists on disk.
 */
function resolveIncludePath(fromUri: string, includePath: string): string | undefined {
  try {
    let fromDir = '';
    if (fromUri.startsWith('file://')) {
      const filePath = fileURLToPath(fromUri);
      fromDir = path.dirname(filePath);
      discoverProjectRoot(filePath);
    }

    const candidateBases = new Set<string>();
    if (fromDir) {
      candidateBases.add(fromDir);
    }

    for (const root of projectRoots) {
      candidateBases.add(root);
      candidateBases.add(path.join(root, 'src'));
      candidateBases.add(path.join(root, 'include'));
      candidateBases.add(path.join(root, 'includes'));
      candidateBases.add(path.join(root, 'commons'));
    }

    // Also climb up from fromDir
    let upDir = fromDir;
    for (let i = 0; i < 3 && upDir && upDir !== path.dirname(upDir); i++) {
      upDir = path.dirname(upDir);
      candidateBases.add(upDir);
    }

    const extensions = ['', '.inc', '.prg', '.h', '.bgd', '.INC', '.PRG', '.H', '.BGD'];

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

  const includeRegex = /^\s*#?\s*(?:include|import)\s*["']([^"']+)["']/i;
  const defineRegex = /^\s*#\s*define\s+([a-zA-Z_][a-zA-Z0-9_]*)(?:\s+(.*))?$/i;
  const programRegex = /^\s*program\s+([a-zA-Z_][a-zA-Z0-9_]*)/i;
  const procRegex = /^\s*(?:declare\s+)?(process|function|method)\s+(?:(?:int|string|float|double|byte|word|dword|char|short|long|pointer|[a-zA-Z_][a-zA-Z0-9_*]*)\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s*(\(.*?\))?/i;
  const structRegex = /^\s*(type|struct)\s+([a-zA-Z_][a-zA-Z0-9_]*)/i;
  const blockStartRegex = /^\s*(global|local|private|public|const)\b/i;

  let currentContainer: string | undefined = undefined;
  let currentBlockType: 'global' | 'local' | 'private' | 'public' | 'const' | undefined = undefined;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const commentIdx = rawLine.indexOf('//');
    const line = commentIdx >= 0 ? rawLine.substring(0, commentIdx) : rawLine;
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('/*')) continue;

    // 1. Check Include / Import
    const incMatch = line.match(includeRegex);
    if (incMatch) {
      const incPath = incMatch[1];
      const startCol = rawLine.indexOf(incPath);
      const endCol = startCol + incPath.length;
      const range = Range.create(Position.create(i, 0), Position.create(i, rawLine.length));
      const selectionRange = Range.create(
        Position.create(i, Math.max(0, startCol)),
        Position.create(i, Math.max(0, endCol))
      );
      const resolvedUri = resolveIncludePath(uri, incPath);

      includes.push({
        rawPath: incPath,
        range,
        selectionRange,
        resolvedUri
      });
      continue;
    }

    // 2. Preprocessor #define macros / constants
    const defMatch = line.match(defineRegex);
    if (defMatch) {
      const defName = defMatch[1];
      const defVal = defMatch[2] ? defMatch[2].trim() : '';
      const startCol = rawLine.indexOf(defName);
      symbols.push({
        name: defName,
        kind: SymbolKind.Constant,
        uri,
        containerName: currentContainer,
        range: Range.create(Position.create(i, 0), Position.create(i, rawLine.length)),
        selectionRange: Range.create(Position.create(i, startCol), Position.create(i, startCol + defName.length)),
        signature: `#define ${defName} ${defVal}`,
        doc: `Macro / Constante: \`${defName}\`${defVal ? ' = `' + defVal + '`' : ''}`,
        isDeclare: false
      });
      continue;
    }

    // 3. Program declaration
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
        doc: `Programa principal: ${name}`,
        isDeclare: false
      });
      continue;
    }

    // 4. Process / Function / Method declaration
    const procMatch = line.match(procRegex);
    if (procMatch) {
      const isDeclare = /^\s*declare\b/i.test(line);
      const kindKeyword = procMatch[1].toLowerCase();
      const name = procMatch[2];
      const params = procMatch[3] || '()';
      const kind = kindKeyword === 'process' ? SymbolKind.Class : SymbolKind.Function;
      const startCol = line.indexOf(name);
      if (!isDeclare) {
        currentContainer = name;
      }

      symbols.push({
        name,
        kind,
        uri,
        range: Range.create(Position.create(i, 0), Position.create(i, rawLine.length)),
        selectionRange: Range.create(Position.create(i, startCol), Position.create(i, startCol + name.length)),
        signature: `${isDeclare ? 'declare ' : ''}${procMatch[1]} ${name}${params}`,
        doc: `${isDeclare ? 'Declaración de' : 'Definición de'} ${procMatch[1]} '${name}'`,
        isDeclare
      });

      // Parse parameters
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
                  containerName: name,
                  range: Range.create(Position.create(i, pStart), Position.create(i, pStart + pName.length)),
                  selectionRange: Range.create(Position.create(i, pStart), Position.create(i, pStart + pName.length)),
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

    // 5. Struct / Type declaration
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
        doc: `Estructura o tipo de datos '${structName}'`,
        isDeclare: false
      });
      continue;
    }

    // 6. Block headers (global, local, private, public, const)
    const blockMatch = line.match(blockStartRegex);
    if (blockMatch) {
      currentBlockType = blockMatch[1].toLowerCase() as any;
      const rest = line.substring(line.indexOf(blockMatch[1]) + blockMatch[1].length).trim();
      if (rest.length > 0 && !rest.startsWith('//')) {
        parseBlockLine(rest, i, rawLine, currentBlockType, currentContainer, uri, symbols);
        currentBlockType = undefined;
      }
      continue;
    }

    // 7. Block closure
    if (/^\s*(end|begin)\b/i.test(trimmed)) {
      if (currentBlockType) {
        currentBlockType = undefined;
      }
      continue;
    }

    // 8. Parse lines inside variable or constant blocks
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
          kind: SymbolKind.Constant,
          uri,
          containerName,
          range: Range.create(Position.create(lineNum, 0), Position.create(lineNum, rawLine.length)),
          selectionRange: Range.create(Position.create(lineNum, startCol), Position.create(lineNum, startCol + name.length)),
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
            doc: `Variable (${blockType}) \`${varType} ${vName}\`${containerName ? ` en ${containerName}` : ''}`,
            isDeclare: false
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

  if (uri.startsWith('file://')) {
    try {
      const filePath = fileURLToPath(uri);
      if (fs.existsSync(filePath)) {
        const stat = fs.statSync(filePath);
        const cached = parsedDocsCache.get(uri);
        if (cached && cached.mtime >= stat.mtimeMs) {
          return cached;
        }
        if (stat.size < 3 * 1024 * 1024) {
          const text = fs.readFileSync(filePath, 'utf-8');
          return parseDocumentFull(uri, text, stat.mtimeMs);
        }
      }
    } catch {
      // Ignore disk read error
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
 * Scan directory recursively for all BennuGD files.
 */
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
        if (BENNU_EXTENSIONS.includes(ext)) {
          const fileUri = pathToFileURL(full).toString();
          getOrLoadParsedDocument(fileUri);
        }
      }
    }
  } catch {
    // Ignore read errors
  }
}

/**
 * Scan all known project roots.
 */
function scanProjectRoots(): void {
  for (const root of projectRoots) {
    scanDirectory(root, 0, 6);
  }
}

connection.onInitialize((params: InitializeParams): InitializeResult => {
  if (params.workspaceFolders && params.workspaceFolders.length > 0) {
    for (const wf of params.workspaceFolders) {
      const p = wf.uri.startsWith('file://') ? fileURLToPath(wf.uri) : wf.uri;
      if (p) projectRoots.add(p);
    }
  } else if (params.rootUri && params.rootUri.startsWith('file://')) {
    projectRoots.add(fileURLToPath(params.rootUri));
  } else if (params.rootPath) {
    projectRoots.add(params.rootPath);
  }

  setTimeout(() => scanProjectRoots(), 300);

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

// Document Links for include "..." and import "..."
connection.onDocumentLink((params: DocumentLinkParams): DocumentLink[] => {
  const uri = params.textDocument.uri;
  const doc = documents.get(uri);
  if (!doc) return [];

  if (uri.startsWith('file://')) {
    discoverProjectRoot(fileURLToPath(uri));
  }

  const text = doc.getText();
  const lines = text.split(/\r?\n/);
  const links: DocumentLink[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const incMatch = line.match(/^\s*#?\s*(?:include|import)\s*["']([^"']+)["']/i);
    if (incMatch) {
      const incPath = incMatch[1];
      const startCol = line.indexOf(incPath);
      const endCol = startCol + incPath.length;
      const targetUri = resolveIncludePath(uri, incPath);
      if (targetUri) {
        links.push(
          DocumentLink.create(
            Range.create(Position.create(i, Math.max(0, startCol)), Position.create(i, Math.max(0, endCol))),
            targetUri
          )
        );
      }
    }
  }
  return links;
});

// Autocompletion
connection.onCompletion((textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
  const uri = textDocumentPosition.textDocument.uri;
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

  // 4. Project & Include symbols
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
    'float', 'double', 'byte', 'word', 'dword', 'char', 'short', 'long', 'pointer'
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
  const lines = text.split(/\r?\n/);
  const currentLine = lines[position.line] || '';
  const offset = doc.offsetAt(position);

  // Check if hovering over an include statement or quoted file path
  const incMatch = currentLine.match(/^\s*#?\s*(?:include|import)\s*["']([^"']+)["']/i);
  if (incMatch) {
    const incPath = incMatch[1];
    const resolvedUri = resolveIncludePath(uri, incPath);
    const fileTarget = resolvedUri ? fileURLToPath(resolvedUri) : 'Archivo no encontrado';
    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: `### 📁 Include / Import\n\`${incPath}\`\n\n**Ruta resuelta:** \`${fileTarget}\``
      }
    };
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

  // Check User Defined Symbols across Document, Includes & Project Cache
  const candidates: SymbolDef[] = [];
  const docSymbols = getAllSymbolsForDocument(uri);
  for (const s of docSymbols) {
    if (s.name.toLowerCase() === wordLower) candidates.push(s);
  }

  if (candidates.length === 0) {
    for (const cachedDoc of parsedDocsCache.values()) {
      for (const s of cachedDoc.symbols) {
        if (s.name.toLowerCase() === wordLower) candidates.push(s);
      }
    }
  }

  candidates.sort((a, b) => (a.isDeclare === b.isDeclare ? 0 : a.isDeclare ? 1 : -1));

  if (candidates.length > 0) {
    const found = candidates[0];
    const fromOtherFile =
      found.uri !== uri ? `\n\n*Definido en: \`${path.basename(fileURLToPath(found.uri))}\`*` : '';
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

  if (uri.startsWith('file://')) {
    discoverProjectRoot(fileURLToPath(uri));
  }

  const position = params.position;
  const text = doc.getText();
  const lines = text.split(/\r?\n/);
  const currentLine = lines[position.line] || '';
  const offset = doc.offsetAt(position);

  // 1. Direct check: Is current line an include / import?
  const incMatch = currentLine.match(/^\s*#?\s*(?:include|import)\s*["']([^"']+)["']/i);
  if (incMatch) {
    const incPath = incMatch[1];
    const resolvedUri = resolveIncludePath(uri, incPath);
    if (resolvedUri) {
      return Location.create(
        resolvedUri,
        Range.create(Position.create(0, 0), Position.create(0, 0))
      );
    }
  }

  // 1b. Check if cursor is inside a quoted string referencing a file
  const quoteRegex = /"([^"]+)"|'([^']+)'/g;
  let qMatch: RegExpExecArray | null;
  while ((qMatch = quoteRegex.exec(currentLine)) !== null) {
    const qStr = qMatch[1] || qMatch[2];
    const qStart = qMatch.index;
    const qEnd = qMatch.index + qMatch[0].length;
    if (position.character >= qStart && position.character <= qEnd) {
      const resolved = resolveIncludePath(uri, qStr);
      if (resolved) {
        return Location.create(
          resolved,
          Range.create(Position.create(0, 0), Position.create(0, 0))
        );
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

  const parsedDoc = getOrLoadParsedDocument(uri);
  const candidates: SymbolDef[] = [];

  // 3. Search in current document
  if (parsedDoc) {
    for (const s of parsedDoc.symbols) {
      if (s.name.toLowerCase() === wordLower) {
        candidates.push(s);
      }
    }
  }

  // 4. Search in included files
  if (candidates.length === 0 || candidates.every(c => c.isDeclare)) {
    const includedSymbols = getAllSymbolsForDocument(uri);
    for (const s of includedSymbols) {
      if (s.name.toLowerCase() === wordLower) {
        candidates.push(s);
      }
    }
  }

  // 5. If not found or only declared, scan and search all project documents
  if (candidates.length === 0 || candidates.every(c => c.isDeclare)) {
    scanProjectRoots();
    for (const cachedDoc of parsedDocsCache.values()) {
      for (const s of cachedDoc.symbols) {
        if (s.name.toLowerCase() === wordLower) {
          candidates.push(s);
        }
      }
    }
  }

  // Prioritize implementation definitions over declarations (declare)
  candidates.sort((a, b) => (a.isDeclare === b.isDeclare ? 0 : a.isDeclare ? 1 : -1));

  if (candidates.length > 0) {
    const match = candidates[0];
    return Location.create(match.uri, match.selectionRange);
  }

  return null;
});

// Document Symbols (Outline View)
connection.onDocumentSymbol((params): DocumentSymbol[] => {
  const uri = params.textDocument.uri;
  const doc = getOrLoadParsedDocument(uri);
  if (!doc) return [];

  return doc.symbols
    .filter(s => !s.isDeclare)
    .map(s => ({
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
  const userSym = allSymbols.find(
    s => s.name.toLowerCase() === fnName && (s.kind === SymbolKind.Class || s.kind === SymbolKind.Function)
  );
  if (userSym && userSym.signature) {
    const paramIndex = match[2].split(',').length - 1;
    return {
      signatures: [
        {
          label: userSym.signature,
          documentation: userSym.doc,
          parameters: []
        }
      ],
      activeSignature: 0,
      activeParameter: Math.max(0, paramIndex)
    };
  }

  return null;
});

// Document Change Listener
documents.onDidChangeContent(change => {
  const uri = change.document.uri;
  if (uri.startsWith('file://')) {
    discoverProjectRoot(fileURLToPath(uri));
  }
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

    const begins = (line.match(/\bbegin\b/gi) || []).length;
    const ends = (line.match(/\bend\b/gi) || []).length;
    beginCount += begins;
    endCount += ends;

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

    if (
      /^(program|process|function|method|global|local|private|public|const|type|struct|begin|if|else|elseif|while|loop|repeat|for|switch)\b/i.test(
        trimmed
      )
    ) {
      indentLevel++;
    }
  }

  const fullRange = Range.create(Position.create(0, 0), Position.create(lines.length, 0));
  return [TextEdit.replace(fullRange, newLines.join('\n'))];
});

// Start document listening
documents.listen(connection);
connection.listen();
