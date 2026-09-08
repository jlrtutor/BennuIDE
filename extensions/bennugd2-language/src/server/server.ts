import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  DidChangeConfigurationNotification,
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
  TextEdit
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';

// Create LSP Connection
const connection = createConnection(ProposedFeatures.all);
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;

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

interface SymbolDef {
  name: string;
  kind: SymbolKind;
  line: number;
  character: number;
  containerName?: string;
  signature?: string;
  doc?: string;
}

function parseDocumentSymbols(doc: TextDocument): SymbolDef[] {
  const text = doc.getText();
  const lines = text.split(/\r?\n/);
  const symbols: SymbolDef[] = [];

  const processRegex = /^\s*(process|function)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*(\(.*?\))?/i;
  const structRegex = /^\s*struct\s+([a-zA-Z_][a-zA-Z0-9_]*)/i;
  const varBlockRegex = /^\s*(global|local|private|public|const)\b/i;

  let currentBlock: string | undefined = undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const procMatch = line.match(processRegex);
    if (procMatch) {
      const kind = procMatch[1].toLowerCase() === 'process' ? SymbolKind.Class : SymbolKind.Function;
      symbols.push({
        name: procMatch[2],
        kind: kind,
        line: i,
        character: line.indexOf(procMatch[2]),
        signature: `${procMatch[1]} ${procMatch[2]}${procMatch[3] || '()'}`,
        doc: `Definición de ${procMatch[1]} '${procMatch[2]}'`
      });
      continue;
    }

    const structMatch = line.match(structRegex);
    if (structMatch) {
      symbols.push({
        name: structMatch[1],
        kind: SymbolKind.Struct,
        line: i,
        character: line.indexOf(structMatch[1]),
        doc: `Estructura '${structMatch[1]}'`
      });
      continue;
    }
  }

  return symbols;
}

connection.onInitialize((params: InitializeParams) => {
  const capabilities = params.capabilities;
  hasConfigurationCapability = !!(capabilities.workspace && !!capabilities.workspace.configuration);
  hasWorkspaceFolderCapability = !!(capabilities.workspace && !!capabilities.workspace.workspaceFolders);

  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        resolveProvider: true,
        triggerCharacters: ['.', '(', '&']
      },
      hoverProvider: true,
      definitionProvider: true,
      documentSymbolProvider: true,
      signatureHelpProvider: {
        triggerCharacters: ['(', ',']
      },
      documentFormattingProvider: true
    }
  };

  return result;
});

// Autocompletion
connection.onCompletion((textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
  const doc = documents.get(textDocumentPosition.textDocument.uri);
  const items: CompletionItem[] = [];

  // 1. Builtin functions
  for (const [name, info] of Object.entries(BUILTIN_FUNCTIONS)) {
    items.push({
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
    items.push({
      label: name,
      kind: CompletionItemKind.Property,
      detail: `(Process Variable) ${name}`,
      documentation: docStr
    });
  }

  // 3. Constants
  for (const [name, docStr] of Object.entries(CONSTANTS)) {
    items.push({
      label: name,
      kind: CompletionItemKind.Constant,
      detail: `(Constant) ${name}`,
      documentation: docStr
    });
  }

  // 4. User symbols in the current document
  if (doc) {
    const userSymbols = parseDocumentSymbols(doc);
    for (const sym of userSymbols) {
      items.push({
        label: sym.name,
        kind: sym.kind === SymbolKind.Class ? CompletionItemKind.Class : CompletionItemKind.Function,
        detail: sym.signature || sym.name,
        documentation: sym.doc
      });
    }
  }

  // 5. Keywords
  const keywords = [
    'program', 'process', 'function', 'begin', 'end', 'global', 'local', 'private', 'public',
    'const', 'type', 'struct', 'if', 'else', 'elseif', 'switch', 'case', 'default',
    'while', 'loop', 'repeat', 'until', 'for', 'from', 'to', 'step', 'break', 'continue',
    'return', 'frame', 'signal', 'clone', 'import', 'include', 'declare', 'int', 'string',
    'float', 'byte', 'word', 'dword', 'char'
  ];

  for (const kw of keywords) {
    items.push({
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
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return null;

  const position = params.position;
  const text = doc.getText();
  const offset = doc.offsetAt(position);

  // Extract word under cursor
  let start = offset;
  while (start > 0 && /[a-zA-Z0-9_]/.test(text[start - 1])) {
    start--;
  }
  let end = offset;
  while (end < text.length && /[a-zA-Z0-9_]/.test(text[end])) {
    end++;
  }

  const word = text.substring(start, end).toLowerCase();
  if (!word) return null;

  // Check Builtin Functions
  if (BUILTIN_FUNCTIONS[word]) {
    const fn = BUILTIN_FUNCTIONS[word];
    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: `### 🎮 \`${fn.signature}\`\n\n${fn.doc}\n\n${fn.params ? fn.params.map(p => `- \`${p}\``).join('\n') : ''}`
      }
    };
  }

  // Check Process Variables
  if (PROCESS_VARIABLES[word]) {
    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: `### 📌 Variable de Proceso: \`${word}\`\n\n${PROCESS_VARIABLES[word]}`
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

  // Check User Defined Symbols
  const symbols = parseDocumentSymbols(doc);
  const found = symbols.find(s => s.name.toLowerCase() === word);
  if (found) {
    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: `### 🧩 \`${found.signature || found.name}\`\n\n${found.doc || ''}`
      }
    };
  }

  return null;
});

// Go to Definition
connection.onDefinition((params: TextDocumentPositionParams): Definition | null => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return null;

  const position = params.position;
  const text = doc.getText();
  const offset = doc.offsetAt(position);

  let start = offset;
  while (start > 0 && /[a-zA-Z0-9_]/.test(text[start - 1])) start--;
  let end = offset;
  while (end < text.length && /[a-zA-Z0-9_]/.test(text[end])) end++;

  const word = text.substring(start, end);
  if (!word) return null;

  const symbols = parseDocumentSymbols(doc);
  const found = symbols.find(s => s.name.toLowerCase() === word.toLowerCase());
  if (found) {
    return Location.create(
      params.textDocument.uri,
      Range.create(
        Position.create(found.line, found.character),
        Position.create(found.line, found.character + found.name.length)
      )
    );
  }

  return null;
});

// Document Symbols (Outline View)
connection.onDocumentSymbol((params): DocumentSymbol[] => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];

  const symbols = parseDocumentSymbols(doc);
  return symbols.map(s => ({
    name: s.name,
    detail: s.signature || '',
    kind: s.kind,
    range: Range.create(Position.create(s.line, 0), Position.create(s.line, 100)),
    selectionRange: Range.create(Position.create(s.line, s.character), Position.create(s.line, s.character + s.name.length))
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
  const fnInfo = BUILTIN_FUNCTIONS[fnName];
  if (!fnInfo) return null;

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
});

// Live Document Validation (Diagnostics)
documents.onDidChangeContent(change => {
  validateDocument(change.document);
});

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
  const edits: TextEdit[] = [];

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

    if (/^(program|process|function|global|local|private|public|type|struct|begin|if|else|elseif|while|loop|repeat|for|switch)\b/i.test(trimmed)) {
      indentLevel++;
    }
  }

  const fullRange = Range.create(Position.create(0, 0), Position.create(lines.length, 0));
  return [TextEdit.replace(fullRange, newLines.join('\n'))];
});

// Start document listening
documents.listen(connection);
connection.listen();
