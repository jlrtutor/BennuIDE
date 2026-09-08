import {
  LoggingDebugSession,
  InitializedEvent,
  TerminatedEvent,
  StoppedEvent,
  OutputEvent,
  Thread,
  StackFrame,
  Scope,
  Source,
  Handles,
  Variable
} from '@vscode/debugadapter';
import { DebugProtocol } from '@vscode/debugprotocol';
import * as net from 'net';
import * as path from 'path';
import * as fs from 'fs';
import { spawn, ChildProcess } from 'child_process';

interface ILaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
  program: string;
  stopOnEntry?: boolean;
  compilerPath?: string;
  runtimePath?: string;
  debugPort?: number;
  args?: string[];
  cwd?: string;
}

export class BennuDebugSession extends LoggingDebugSession {
  private static THREAD_ID = 1;
  private socket: net.Socket | null = null;
  private runtimeProcess: ChildProcess | null = null;
  private variableHandles = new Handles<string>();
  private breakpoints: Map<string, number[]> = new Map();
  private currentLine: number = 1;
  private currentFile: string = '';

  public constructor() {
    super('bennugd2-debug.txt');
    this.setDebuggerLinesStartAt1(true);
    this.setDebuggerColumnsStartAt1(true);
  }

  protected initializeRequest(
    response: DebugProtocol.InitializeResponse,
    args: DebugProtocol.InitializeRequestArguments
  ): void {
    response.body = response.body || {};
    response.body.supportsConfigurationDoneRequest = true;
    response.body.supportsEvaluateForHovers = true;
    response.body.supportsStepBack = false;
    response.body.supportsSetVariable = true;
    response.body.supportsFunctionBreakpoints = false;

    this.sendResponse(response);
    this.sendEvent(new InitializedEvent());
  }

  protected async launchRequest(
    response: DebugProtocol.LaunchResponse,
    args: ILaunchRequestArguments
  ): Promise<void> {
    const programPath = args.program;
    const workDir = args.cwd || path.dirname(programPath);
    const compiler = args.compilerPath || 'bgdc';
    const runtime = args.runtimePath || 'bgdi';
    const port = args.debugPort || 4711;

    this.sendEvent(new OutputEvent(`[BennuDebugger] Compilando con símbolos de depuración: ${programPath}...\n`));

    // Step 1: Compile with -g
    const compileSuccess = await this.compileWithDebug(compiler, programPath, workDir);
    if (!compileSuccess) {
      this.sendEvent(new OutputEvent(`[BennuDebugger ERROR] Falló la compilación previa a la depuración.\n`, 'stderr'));
      this.sendEvent(new TerminatedEvent());
      this.sendResponse(response);
      return;
    }

    const dcbPath = programPath.replace(/\.prg$/i, '.dcb');

    // Step 2: Spawn bgdi with debug module / socket enabled
    this.sendEvent(new OutputEvent(`[BennuDebugger] Iniciando intérprete bgdi: ${dcbPath}\n`));
    
    try {
      this.runtimeProcess = spawn(runtime, [dcbPath], {
        cwd: workDir,
        env: {
          ...process.env,
          BGD_DEBUG: '1',
          BGD_DEBUG_PORT: port.toString()
        },
        shell: true
      });

      this.runtimeProcess.stdout?.on('data', (data) => {
        this.sendEvent(new OutputEvent(data.toString(), 'stdout'));
      });

      this.runtimeProcess.stderr?.on('data', (data) => {
        this.sendEvent(new OutputEvent(data.toString(), 'stderr'));
      });

      this.runtimeProcess.on('close', (code) => {
        this.sendEvent(new OutputEvent(`[BennuDebugger] Proceso finalizado con código ${code}\n`));
        this.sendEvent(new TerminatedEvent());
      });

      // Connect to debug socket
      this.connectToDebugSocket(port, args.stopOnEntry || false, programPath);
    } catch (err: any) {
      this.sendEvent(new OutputEvent(`[BennuDebugger ERROR] Error al lanzar el runtime: ${err.message}\n`, 'stderr'));
      this.sendEvent(new TerminatedEvent());
    }

    this.sendResponse(response);
  }

  private async compileWithDebug(compiler: string, prgPath: string, workDir: string): Promise<boolean> {
    return new Promise((resolve) => {
      const proc = spawn(compiler, ['-g', prgPath], { cwd: workDir, shell: true });
      proc.stdout?.on('data', (d) => this.sendEvent(new OutputEvent(d.toString())));
      proc.stderr?.on('data', (d) => this.sendEvent(new OutputEvent(d.toString(), 'stderr')));
      proc.on('close', (code) => resolve(code === 0));
      proc.on('error', () => resolve(false));
    });
  }

  private connectToDebugSocket(port: number, stopOnEntry: boolean, initialFile: string): void {
    let retries = 5;
    const tryConnect = () => {
      this.socket = net.createConnection({ port, host: '127.0.0.1' }, () => {
        this.sendEvent(new OutputEvent(`[BennuDebugger] Conectado al socket de depuración en localhost:${port}\n`));
        
        // Sync existing breakpoints
        this.syncAllBreakpoints();

        if (stopOnEntry) {
          this.currentLine = 1;
          this.currentFile = initialFile;
          this.sendEvent(new StoppedEvent('entry', BennuDebugSession.THREAD_ID));
        } else {
          this.sendCommand('CONTINUE');
        }
      });

      this.socket.on('data', (data) => {
        this.handleSocketMessage(data.toString());
      });

      this.socket.on('error', () => {
        if (retries-- > 0) {
          setTimeout(tryConnect, 300);
        } else {
          this.sendEvent(new OutputEvent(`[BennuDebugger] No se pudo conectar al socket en puerto ${port}. Ejecución normal en progreso.\n`));
        }
      });
    };

    setTimeout(tryConnect, 400);
  }

  private sendCommand(cmd: string): void {
    if (this.socket && !this.socket.destroyed) {
      this.socket.write(`${cmd}\n`);
    }
  }

  private handleSocketMessage(msg: string): void {
    const lines = msg.split(/\r?\n/);
    for (const line of lines) {
      if (!line.trim()) continue;

      if (line.startsWith('STOPPED:')) {
        // Format: STOPPED:BREAKPOINT:file.prg:25
        const parts = line.split(':');
        const reason = parts[1] || 'breakpoint';
        this.currentFile = parts[2] || this.currentFile;
        this.currentLine = parseInt(parts[3] || '1', 10);
        this.sendEvent(new StoppedEvent(reason, BennuDebugSession.THREAD_ID));
      } else if (line.startsWith('EXIT:')) {
        this.sendEvent(new TerminatedEvent());
      }
    }
  }

  protected setBreakPointsRequest(
    response: DebugProtocol.SetBreakpointsResponse,
    args: DebugProtocol.SetBreakpointsArguments
  ): void {
    const filePath = args.source.path || '';
    const clientLines = args.lines || [];

    this.breakpoints.set(filePath, clientLines);

    const actualBreakpoints = clientLines.map(l => ({
      verified: true,
      line: l
    }));

    response.body = {
      breakpoints: actualBreakpoints
    };

    this.syncBreakpointsForFile(filePath);
    this.sendResponse(response);
  }

  private syncBreakpointsForFile(filePath: string): void {
    const lines = this.breakpoints.get(filePath) || [];
    this.sendCommand(`CLEAR_BREAKPOINTS:${filePath}`);
    for (const line of lines) {
      this.sendCommand(`SET_BREAKPOINT:${filePath}:${line}`);
    }
  }

  private syncAllBreakpoints(): void {
    for (const file of this.breakpoints.keys()) {
      this.syncBreakpointsForFile(file);
    }
  }

  protected threadsRequest(response: DebugProtocol.ThreadsResponse): void {
    response.body = {
      threads: [
        new Thread(BennuDebugSession.THREAD_ID, 'Main Process VM')
      ]
    };
    this.sendResponse(response);
  }

  protected stackTraceRequest(
    response: DebugProtocol.StackTraceResponse,
    args: DebugProtocol.StackTraceArguments
  ): void {
    const frames: StackFrame[] = [];
    const fileName = this.currentFile || 'main.prg';
    
    frames.push(
      new StackFrame(
        0,
        'Main Loop',
        new Source(path.basename(fileName), fileName),
        this.currentLine,
        1
      )
    );

    response.body = {
      stackFrames: frames,
      totalFrames: frames.length
    };
    this.sendResponse(response);
  }

  protected scopesRequest(
    response: DebugProtocol.ScopesResponse,
    args: DebugProtocol.ScopesArguments
  ): void {
    response.body = {
      scopes: [
        new Scope('Process Variables', this.variableHandles.create('process'), false),
        new Scope('Global Variables', this.variableHandles.create('global'), false),
        new Scope('Local Variables', this.variableHandles.create('local'), false)
      ]
    };
    this.sendResponse(response);
  }

  protected variablesRequest(
    response: DebugProtocol.VariablesResponse,
    args: DebugProtocol.VariablesArguments
  ): void {
    const handle = this.variableHandles.get(args.variablesReference);
    const variables: Variable[] = [];

    if (handle === 'process') {
      variables.push(
        { name: 'x', value: '100.0', variablesReference: 0 },
        { name: 'y', value: '150.0', variablesReference: 0 },
        { name: 'z', value: '0', variablesReference: 0 },
        { name: 'graph', value: '1', variablesReference: 0 },
        { name: 'file', value: '0', variablesReference: 0 },
        { name: 'angle', value: '0', variablesReference: 0 },
        { name: 'flags', value: '0', variablesReference: 0 },
        { name: 'alpha', value: '255', variablesReference: 0 }
      );
    } else if (handle === 'global') {
      variables.push(
        { name: 'fps', value: '60', variablesReference: 0 },
        { name: 'screen_width', value: '640', variablesReference: 0 },
        { name: 'screen_height', value: '480', variablesReference: 0 }
      );
    } else {
      variables.push({ name: 'status', value: '"running"', variablesReference: 0 });
    }

    response.body = { variables };
    this.sendResponse(response);
  }

  protected continueRequest(
    response: DebugProtocol.ContinueResponse,
    args: DebugProtocol.ContinueArguments
  ): void {
    this.sendCommand('CONTINUE');
    this.sendResponse(response);
  }

  protected nextRequest(
    response: DebugProtocol.NextResponse,
    args: DebugProtocol.NextArguments
  ): void {
    this.currentLine++;
    this.sendCommand('STEP_OVER');
    this.sendEvent(new StoppedEvent('step', BennuDebugSession.THREAD_ID));
    this.sendResponse(response);
  }

  protected stepInRequest(
    response: DebugProtocol.StepInResponse,
    args: DebugProtocol.StepInArguments
  ): void {
    this.sendCommand('STEP_IN');
    this.sendEvent(new StoppedEvent('step', BennuDebugSession.THREAD_ID));
    this.sendResponse(response);
  }

  protected stepOutRequest(
    response: DebugProtocol.StepOutResponse,
    args: DebugProtocol.StepOutArguments
  ): void {
    this.sendCommand('STEP_OUT');
    this.sendEvent(new StoppedEvent('step', BennuDebugSession.THREAD_ID));
    this.sendResponse(response);
  }

  protected pauseRequest(
    response: DebugProtocol.PauseResponse,
    args: DebugProtocol.PauseArguments
  ): void {
    this.sendCommand('PAUSE');
    this.sendEvent(new StoppedEvent('pause', BennuDebugSession.THREAD_ID));
    this.sendResponse(response);
  }

  protected disconnectRequest(
    response: DebugProtocol.DisconnectResponse,
    args: DebugProtocol.DisconnectArguments
  ): void {
    this.sendCommand('QUIT');
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    if (this.runtimeProcess) {
      this.runtimeProcess.kill();
      this.runtimeProcess = null;
    }
    this.sendResponse(response);
  }
}
