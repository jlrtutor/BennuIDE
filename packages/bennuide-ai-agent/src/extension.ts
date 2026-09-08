import * as vscode from 'vscode';

class BennuAIChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'bennuide.aiChatView';

  constructor(private readonly context: vscode.ExtensionContext) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    webviewView.webview.options = {
      enableScripts: true
    };

    webviewView.webview.html = this.getHtmlForWebview();

    webviewView.webview.onDidReceiveMessage(async (message) => {
      if (message.type === 'askAi') {
        const query = message.prompt;
        const reply = this.processBennuPrompt(query);
        webviewView.webview.postMessage({
          type: 'aiResponse',
          reply
        });
      } else if (message.type === 'insertCode') {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          editor.edit(editBuilder => {
            editBuilder.insert(editor.selection.active, message.code);
          });
        }
      }
    });
  }

  private processBennuPrompt(prompt: string): string {
    const lower = prompt.toLowerCase();

    if (lower.includes('proceso') || lower.includes('process') || lower.includes('enemigo') || lower.includes('jugador')) {
      return `Aquí tienes un esqueleto de proceso en BennuGD2 con movimiento y colisión:

\`\`\`bennugd2
process Player(x, y)
private
    int speed = 4;
end

begin
    graph = 1;
    loop
        if (key(_left)) x -= speed; end
        if (key(_right)) x += speed; end
        if (key(_up)) y -= speed; end
        if (key(_down)) y += speed; end

        if (collision(type Enemy))
            signal(id, s_kill);
        end

        frame;
    end
end
\`\`\``;
    }

    if (lower.includes('resolucion') || lower.includes('modo') || lower.includes('pantalla') || lower.includes('set_mode')) {
      return `Para configurar la resolución de pantalla en BennuGD2 se utiliza \`set_mode\`:

\`\`\`bennugd2
import "libmod_gfx";
import "libmod_input";

program MyGame;
begin
    set_mode(1280, 720); // Ancho, Alto a 32 bpp
    set_fps(60, 0);      // 60 FPS
    window_set_title("Mi Videojuego BennuGD2");

    while (!key(_esc))
        frame;
    end
end
\`\`\``;
    }

    return `He analizado tu consulta para **BennuGD2**. Recuerda que en BennuGD2 los procesos funcionan de forma concurrente con el bucle \`loop ... frame; end\`.

¿Deseas que genere un módulo específico (gráficos con \`libmod_gfx\`, audio con \`libmod_sound\`, o entrada con \`libmod_input\`)?`;
  }

  private getHtmlForWebview(): string {
    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-editor-foreground); background: var(--vscode-editor-background); padding: 12px; margin: 0; display: flex; flex-direction: column; height: 100vh; box-sizing: border-box; }
    .messages { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; margin-bottom: 12px; }
    .msg { padding: 8px 12px; border-radius: 6px; font-size: 13px; line-height: 1.4; }
    .msg-user { background: var(--vscode-button-background); color: #fff; align-self: flex-end; max-width: 85%; }
    .msg-ai { background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-widget-border); align-self: flex-start; max-width: 95%; }
    .input-area { display: flex; gap: 6px; }
    input { flex: 1; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); padding: 8px; border-radius: 4px; }
    button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 8px 14px; border-radius: 4px; cursor: pointer; }
    button:hover { background: var(--vscode-button-hoverBackground); }
    pre { background: #111; padding: 8px; border-radius: 4px; overflow-x: auto; font-family: monospace; font-size: 12px; }
  </style>
</head>
<body>
  <div class="messages" id="msgList">
    <div class="msg msg-ai">🤖 ¡Hola! Soy tu asistente de IA para <strong>BennuGD2</strong>. Puedo ayudarte a escribir procesos, depurar errores de <code>bgdc</code> y estructurar tu videojuego.</div>
  </div>
  <div class="input-area">
    <input type="text" id="promptInput" placeholder="Pregunta sobre BennuGD2..." onkeydown="if(event.key==='Enter') sendPrompt()" />
    <button onclick="sendPrompt()">Enviar</button>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    function sendPrompt() {
      const input = document.getElementById('promptInput');
      const val = input.value.trim();
      if (!val) return;

      appendMsg('user', val);
      input.value = '';

      vscode.postMessage({ type: 'askAi', prompt: val });
    }

    window.addEventListener('message', event => {
      if (event.data.type === 'aiResponse') {
        appendMsg('ai', event.data.reply);
      }
    });

    function appendMsg(sender, text) {
      const list = document.getElementById('msgList');
      const div = document.createElement('div');
      div.className = 'msg msg-' + sender;
      div.innerHTML = text.replace(/\\n/g, '<br/>');
      list.appendChild(div);
      list.scrollTop = list.scrollHeight;
    }
  </script>
</body>
</html>`;
  }
}

export function activate(context: vscode.ExtensionContext) {
  const provider = new BennuAIChatViewProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(BennuAIChatViewProvider.viewType, provider)
  );
}

export function deactivate() {}
