import * as vscode from 'vscode';
import * as path from 'path';
import { encodeWav16 } from './wavEncoder';

class AudioDocument implements vscode.CustomDocument {
  public readonly uri: vscode.Uri;
  public initialData: Uint8Array;
  public isDirty: boolean = false;

  constructor(uri: vscode.Uri, initialData: Uint8Array) {
    this.uri = uri;
    this.initialData = initialData;
  }

  dispose(): void {
    // Cleanup resources if necessary
  }
}

export class AudioEditorProvider implements vscode.CustomEditorProvider<AudioDocument> {
  public static readonly viewType = 'bennugd2.audioEditor';

  private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<vscode.CustomDocumentEditEvent<AudioDocument>>();
  public readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

  constructor(private readonly context: vscode.ExtensionContext) {}

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new AudioEditorProvider(context);
    return vscode.window.registerCustomEditorProvider(AudioEditorProvider.viewType, provider, {
      webviewOptions: {
        retainContextWhenHidden: true
      },
      supportsMultipleEditorsPerDocument: false
    });
  }

  async openCustomDocument(
    uri: vscode.Uri,
    _openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken
  ): Promise<AudioDocument> {
    const isSpanish = (vscode.env.language || 'es').toLowerCase().startsWith('es');
    try {
      const data = await vscode.workspace.fs.readFile(uri);
      return new AudioDocument(uri, data);
    } catch (err: any) {
      const errMsg = isSpanish
        ? `Error al leer archivo de audio (${path.basename(uri.fsPath)}): ${err?.message || err}`
        : `Error reading audio file (${path.basename(uri.fsPath)}): ${err?.message || err}`;
      vscode.window.showErrorMessage(errMsg);
      return new AudioDocument(uri, new Uint8Array(0));
    }
  }

  async resolveCustomEditor(
    document: AudioDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    const isSpanish = (vscode.env.language || 'es').toLowerCase().startsWith('es');

    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.file(path.join(this.context.extensionPath, 'media'))
      ]
    };

    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview, document, isSpanish);

    // Send initial audio payload
    const sendInitAudio = () => {
      webviewPanel.webview.postMessage({
        type: 'initAudio',
        filename: path.basename(document.uri.fsPath),
        isSpanish: isSpanish,
        data: Array.from(document.initialData)
      });
    };

    webviewPanel.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'ready':
          sendInitAudio();
          break;

        case 'save': {
          try {
            const wavData = new Uint8Array(message.data);
            await vscode.workspace.fs.writeFile(document.uri, wavData);
            document.initialData = wavData;
            document.isDirty = false;
            const okMsg = isSpanish
              ? `Guardado correctamente: ${path.basename(document.uri.fsPath)}`
              : `Saved successfully: ${path.basename(document.uri.fsPath)}`;
            vscode.window.showInformationMessage(okMsg);
            webviewPanel.webview.postMessage({ type: 'savedSuccess' });
          } catch (err: any) {
            const errMsg = isSpanish
              ? `Error al guardar audio: ${err?.message || err}`
              : `Error saving audio: ${err?.message || err}`;
            vscode.window.showErrorMessage(errMsg);
          }
          break;
        }

        case 'saveAs': {
          try {
            const targetUri = await vscode.window.showSaveDialog({
              defaultUri: document.uri,
              filters: {
                'Audio WAV (*.wav)': ['wav']
              },
              saveLabel: isSpanish ? 'Guardar Como' : 'Save As'
            });

            if (targetUri) {
              const wavData = new Uint8Array(message.data);
              await vscode.workspace.fs.writeFile(targetUri, wavData);
              const expMsg = isSpanish
                ? `Audio exportado a: ${targetUri.fsPath}`
                : `Audio exported to: ${targetUri.fsPath}`;
              vscode.window.showInformationMessage(expMsg);
              await vscode.commands.executeCommand('vscode.openWith', targetUri, AudioEditorProvider.viewType);
            }
          } catch (err: any) {
            const errMsg = isSpanish
              ? `Error al exportar audio: ${err?.message || err}`
              : `Error exporting audio: ${err?.message || err}`;
            vscode.window.showErrorMessage(errMsg);
          }
          break;
        }

        case 'openVisualizer': {
          try {
            const wavData = new Uint8Array(message.data);
            let dir: string;
            if (document.uri.scheme === 'file') {
              dir = path.dirname(document.uri.fsPath);
            } else if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
              dir = vscode.workspace.workspaceFolders[0].uri.fsPath;
            } else {
              dir = path.join(this.context.globalStorageUri.fsPath, 'sfx');
              await vscode.workspace.fs.createDirectory(vscode.Uri.file(dir));
            }

            let randNum = Math.floor(1000 + Math.random() * 9000);
            let sfxFilename = `sfx_${randNum}.wav`;
            let targetUri = vscode.Uri.file(path.join(dir, sfxFilename));

            let attempts = 0;
            while (attempts < 10) {
              try {
                await vscode.workspace.fs.stat(targetUri);
                randNum = Math.floor(1000 + Math.random() * 9000);
                sfxFilename = `sfx_${randNum}.wav`;
                targetUri = vscode.Uri.file(path.join(dir, sfxFilename));
                attempts++;
              } catch {
                break;
              }
            }

            await vscode.workspace.fs.writeFile(targetUri, wavData);
            const openMsg = isSpanish
              ? `Efecto generado: ${sfxFilename}`
              : `Generated effect: ${sfxFilename}`;
            vscode.window.showInformationMessage(openMsg);
            await vscode.commands.executeCommand('vscode.openWith', targetUri, AudioEditorProvider.viewType);
          } catch (err: any) {
            const errMsg = isSpanish
              ? `Error al abrir en visualizador: ${err?.message || err}`
              : `Error opening in visualizer: ${err?.message || err}`;
            vscode.window.showErrorMessage(errMsg);
          }
          break;
        }

        case 'showInfo':
          vscode.window.showInformationMessage(message.message);
          break;

        case 'showError':
          vscode.window.showErrorMessage(message.message);
          break;
      }
    });
  }

  async saveCustomDocument(document: AudioDocument, cancellation: vscode.CancellationToken): Promise<void> {
    // VSCode internal save hook
  }

  async saveCustomDocumentAs(document: AudioDocument, targetResource: vscode.Uri, cancellation: vscode.CancellationToken): Promise<void> {
    await vscode.workspace.fs.copy(document.uri, targetResource, { overwrite: true });
  }

  async revertCustomDocument(document: AudioDocument, cancellation: vscode.CancellationToken): Promise<void> {
    const data = await vscode.workspace.fs.readFile(document.uri);
    document.initialData = data;
  }

  async backupCustomDocument(document: AudioDocument, context: vscode.CustomDocumentBackupContext, cancellation: vscode.CancellationToken): Promise<vscode.CustomDocumentBackup> {
    return {
      id: context.destination.toString(),
      delete: async () => {
        try {
          await vscode.workspace.fs.delete(context.destination);
        } catch {
          // ignore
        }
      }
    };
  }

  private getHtmlForWebview(webview: vscode.Webview, document: AudioDocument, isSpanish: boolean): string {
    const filename = path.basename(document.uri.fsPath);

    // Translations Dictionary
    const t = isSpanish ? {
      title: 'BennuGD Editor de Audio',
      play: 'Play',
      playTip: 'Reproducir (Espacio)',
      pause: 'Pausa',
      pauseTip: 'Pausar',
      stop: 'Stop',
      stopTip: 'Detener y volver al inicio',
      loop: 'Loop',
      loopTip: 'Bucle continuo',
      playSelection: 'Play Rango',
      playSelectionTip: 'Reproducir sólo la selección',
      pos: 'Pos:',
      tot: 'Tot:',
      vuTip: 'Medidor de nivel de pico estéreo',
      chLeftShort: 'I',
      chRightShort: 'D',
      cut: 'Cortar',
      cutTip: 'Cortar selección (Ctrl+X)',
      copy: 'Copiar',
      copyTip: 'Copiar selección (Ctrl+C)',
      paste: 'Pegar',
      pasteTip: 'Pegar desde portapapeles (Ctrl+V)',
      trim: 'Recortar',
      trimTip: 'Recortar: Conservar únicamente la selección',
      delete: 'Borrar',
      deleteTip: 'Eliminar fragmento seleccionado (Supr)',
      silence: 'Silencio',
      silenceTip: 'Silenciar selección',
      undoTip: 'Deshacer (Ctrl+Z)',
      redoTip: 'Rehacer (Ctrl+Y)',
      zoomOutTip: 'Reducir Zoom (-)',
      zoomInTip: 'Aumentar Zoom (+)',
      zoomFit: 'Ajustar',
      zoomFitTip: 'Ajustar toda la onda a la pantalla',
      vol: 'Vol:',
      volTip: 'Volumen maestro',
      speed: 'Velocidad:',
      save: 'Guardar',
      saveTip: 'Guardar cambios a WAV (Ctrl+S)',
      export: 'Exportar',
      exportTip: 'Guardar como nuevo archivo WAV...',
      tabSfxr: '🎮 Generador SFX Retro',
      tabEq: 'Ecualizador 5 Bandas',
      tabFx: 'Rack de Efectos',
      tabInfo: 'Información & Metadatos',
      // SFXR Strings
      sfxrPresetsTitle: 'Presets de Videojuegos:',
      sfxLaser: '🚀 Láser / Disparo',
      sfxExplosion: '💥 Explosión',
      sfxCoin: '🪙 Moneda / Pickup',
      sfxJump: '🦘 Salto',
      sfxHit: '🥊 Golpe / Daño',
      sfxPowerup: '⚡ Power-Up',
      sfxBlip: '👾 Blip / Menú',
      sfxRandom: '🎲 Aleatorio',
      sfxMutate: '🧬 Mutar Actual',
      sfxWaveType: 'Forma de Onda:',
      sfxWaveSquare: 'Cuadrada (Square)',
      sfxWaveSaw: 'Diente de Sierra (Saw)',
      sfxWaveSine: 'Senoidal (Sine)',
      sfxWaveNoise: 'Ruido Blanco (Noise)',
      sfxWaveTriangle: 'Triangular (Triangle)',
      sfxFreq: 'Frecuencia:',
      sfxSlide: 'Deslizamiento (Slide):',
      sfxDecay: 'Duración (Decay):',
      sfxPunch: 'Punch (Impacto):',
      sfxVib: 'Vibrato:',
      sfxLpf: 'Filtro Low-Pass:',
      sfxPlayBtn: '🔊 Probar Sonido',
      sfxInsertBtn: '📥 Abrir en visualizador',
      sfxExportBtn: '💾 Exportar como WAV',
      // EQ Strings
      eqPresets: 'Presets de Ecualización:',
      presetFlat: 'Plano / Desactivado',
      presetBass: 'Graves Potentes (Explosiones)',
      presetVocal: 'Voz / Diálogos Claros',
      presetChiptune: 'Retro Chiptune (8-Bit)',
      presetRadio: 'Radio / Walkie-Talkie',
      liveEq: 'Preescucha EQ en vivo',
      applyEq: 'Aplicar EQ a la Pista',
      applyEqTip: 'Procesa y aplica la ecualización actual permanentemente a la pista',
      applyBtn: 'Aplicar',
      // FX cards
      fxNormalizeTitle: 'Normalizar',
      fxNormalizeDesc: 'Maximiza el volumen a 0 dBFS sin provocar distorsión ni clipping.',
      fxFadeInTitle: 'Fade In (Lineal)',
      fxFadeInDesc: 'Aparición gradual suave lineal de 0% a 100%.',
      fxFadeInLogTitle: 'Fade In (Logarítmico)',
      fxFadeInLogDesc: 'Curva logarítmica/psicoacústica más natural al oído humano.',
      fxFadeOutTitle: 'Fade Out (Lineal)',
      fxFadeOutDesc: 'Desvanecimiento progresivo lineal de 100% a 0%.',
      fxFadeOutLogTitle: 'Fade Out (Logarítmico)',
      fxFadeOutLogDesc: 'Desvanecimiento con rampa logarítmica suave.',
      fxReverseTitle: 'Invertir (Reverse)',
      fxReverseDesc: 'Invierte temporalmente la reproducción de las muestras.',
      fxDelayTitle: 'Eco / Delay',
      fxDelayDesc: 'Añade repetición de eco espacial de 240ms y feedback.',
      fxReverbTitle: 'Reverb Espacial',
      fxReverbDesc: 'Simula acústica ambiental de sala / cueva.',
      fxGainUpTitle: 'Amplificar (+3 dB)',
      fxGainUpDesc: 'Incrementa +3 dB de ganancia en la selección o pista.',
      fxGainDownTitle: 'Atenuar (-3 dB)',
      fxGainDownDesc: 'Reduce el volumen en -3 dB.',
      fxBitcrushTitle: 'Retro 8-Bit Crusher',
      fxBitcrushDesc: 'Cuantización a 8 bits para textura retro / chiptune.',
      fxInvertPhaseTitle: 'Invertir Fase 180°',
      fxInvertPhaseDesc: 'Invierte la polaridad matemática de la forma de onda.',
      // Info Tab
      infoSampleRate: 'Frecuencia de Muestreo',
      infoChannels: 'Canales de Audio',
      infoDuration: 'Duración Exacta',
      infoSamples: 'Muestras Totales',
      // Status
      statusNoSel: 'Sin selección (haz clic y arrastra en la onda)',
      statusDirty: '● Modificado',
      channelLeft: 'CANAL I',
      channelRight: 'CANAL D',
      channelMono: 'MONO'
    } : {
      title: 'BennuGD Audio Editor',
      play: 'Play',
      playTip: 'Play (Space)',
      pause: 'Pause',
      pauseTip: 'Pause',
      stop: 'Stop',
      stopTip: 'Stop and return to start',
      loop: 'Loop',
      loopTip: 'Continuous loop',
      playSelection: 'Play Range',
      playSelectionTip: 'Play selection only',
      pos: 'Pos:',
      tot: 'Tot:',
      vuTip: 'Stereo peak level meter',
      chLeftShort: 'L',
      chRightShort: 'R',
      cut: 'Cut',
      cutTip: 'Cut selection (Ctrl+X)',
      copy: 'Copy',
      copyTip: 'Copy selection (Ctrl+C)',
      paste: 'Paste',
      pasteTip: 'Paste from clipboard (Ctrl+V)',
      trim: 'Trim',
      trimTip: 'Trim: Keep only selected region',
      delete: 'Delete',
      deleteTip: 'Delete selected region (Delete)',
      silence: 'Silence',
      silenceTip: 'Silence selection',
      undoTip: 'Undo (Ctrl+Z)',
      redoTip: 'Redo (Ctrl+Y)',
      zoomOutTip: 'Zoom Out (-)',
      zoomInTip: 'Zoom In (+)',
      zoomFit: 'Fit',
      zoomFitTip: 'Fit entire waveform to screen',
      vol: 'Vol:',
      volTip: 'Master volume',
      speed: 'Speed:',
      save: 'Save',
      saveTip: 'Save changes to WAV (Ctrl+S)',
      export: 'Export',
      exportTip: 'Save as new WAV file...',
      tabSfxr: '🎮 Retro SFX Generator',
      tabEq: '5-Band Equalizer',
      tabFx: 'Effects Rack',
      tabInfo: 'Info & Metadata',
      // SFXR Strings
      sfxrPresetsTitle: 'Game SFX Presets:',
      sfxLaser: '🚀 Laser / Shoot',
      sfxExplosion: '💥 Explosion',
      sfxCoin: '🪙 Coin / Pickup',
      sfxJump: '🦘 Jump',
      sfxHit: '🥊 Hit / Hurt',
      sfxPowerup: '⚡ Power-Up',
      sfxBlip: '👾 Blip / Menu',
      sfxRandom: '🎲 Randomize',
      sfxMutate: '🧬 Mutate Current',
      sfxWaveType: 'Waveform:',
      sfxWaveSquare: 'Square',
      sfxWaveSaw: 'Sawtooth',
      sfxWaveSine: 'Sine',
      sfxWaveNoise: 'Noise',
      sfxWaveTriangle: 'Triangle',
      sfxFreq: 'Frequency:',
      sfxSlide: 'Pitch Slide:',
      sfxDecay: 'Decay Time:',
      sfxPunch: 'Punch:',
      sfxVib: 'Vibrato:',
      sfxLpf: 'Low-Pass Filter:',
      sfxPlayBtn: '🔊 Play Sound',
      sfxInsertBtn: '📥 Open in Visualizer',
      sfxExportBtn: '💾 Export as WAV',
      // EQ Strings
      eqPresets: 'Equalizer Presets:',
      presetFlat: 'Flat / Disabled',
      presetBass: 'Bass Boost (Explosions)',
      presetVocal: 'Clear Voice / Dialogues',
      presetChiptune: 'Retro Chiptune (8-Bit)',
      presetRadio: 'Radio / Walkie-Talkie',
      liveEq: 'Live EQ Preview',
      applyEq: 'Apply EQ to Track',
      applyEqTip: 'Processes and applies current EQ permanently to track',
      applyBtn: 'Apply',
      // FX cards
      fxNormalizeTitle: 'Normalize',
      fxNormalizeDesc: 'Maximizes volume to 0 dBFS without distortion or clipping.',
      fxFadeInTitle: 'Fade In (Linear)',
      fxFadeInDesc: 'Smooth linear volume ramp from 0% to 100%.',
      fxFadeInLogTitle: 'Fade In (Logarithmic)',
      fxFadeInLogDesc: 'Logarithmic / psychoacoustic curve more natural to human ear.',
      fxFadeOutTitle: 'Fade Out (Linear)',
      fxFadeOutDesc: 'Linear volume fade out from 100% to 0%.',
      fxFadeOutLogTitle: 'Fade Out (Logarithmic)',
      fxFadeOutLogDesc: 'Smooth logarithmic volume decay curve.',
      fxReverseTitle: 'Reverse',
      fxReverseDesc: 'Reverses sample playback temporally.',
      fxDelayTitle: 'Echo / Delay',
      fxDelayDesc: 'Adds 240ms spatial echo repetition with feedback.',
      fxReverbTitle: 'Spatial Reverb',
      fxReverbDesc: 'Simulates room / cave environmental acoustic.',
      fxGainUpTitle: 'Amplify (+3 dB)',
      fxGainUpDesc: 'Increases gain by +3 dB in selection or track.',
      fxGainDownTitle: 'Attenuate (-3 dB)',
      fxGainDownDesc: 'Reduces volume by -3 dB.',
      fxBitcrushTitle: 'Retro 8-Bit Crusher',
      fxBitcrushDesc: '8-bit amplitude quantization for retro chiptune textures.',
      fxInvertPhaseTitle: 'Invert Phase 180°',
      fxInvertPhaseDesc: 'Inverts mathematical polarity of the waveform.',
      // Info Tab
      infoSampleRate: 'Sample Rate',
      infoChannels: 'Audio Channels',
      infoDuration: 'Exact Duration',
      infoSamples: 'Total Samples',
      // Status
      statusNoSel: 'No selection (click and drag on waveform)',
      statusDirty: '● Modified',
      channelLeft: 'CANAL L',
      channelRight: 'CANAL R',
      channelMono: 'MONO'
    };

    return /*html*/ `<!DOCTYPE html>
<html lang="${isSpanish ? 'es' : 'en'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${t.title} - ${filename}</title>
  <style>
    :root {
      --bg-darker: #121216;
      --bg-dark: #18181f;
      --bg-card: #1f1f28;
      --bg-card-hover: #262633;
      --border-color: #2e2e3d;
      --text-main: #e2e8f0;
      --text-muted: #8e95a5;
      --primary: #e5a93b;
      --primary-hover: #f5b746;
      --accent: #38bdf8;
      --accent-hover: #60a5fa;
      --danger: #ef4444;
      --danger-hover: #dc2626;
      --success: #22c55e;
      --wave-bg: #0f1015;
      --wave-center: #272733;
      --wave-fill-top: #38bdf8;
      --wave-fill-bottom: #0284c7;
      --wave-fill-r-top: #e5a93b;
      --wave-fill-r-bottom: #b45309;
      --selection-bg: rgba(229, 169, 59, 0.22);
      --selection-border: #e5a93b;
      --playhead: #ef4444;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      user-select: none;
    }

    body {
      background-color: var(--bg-darker);
      color: var(--text-main);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      font-size: 12px;
    }

    /* TOP TOOLBAR */
    .top-toolbar {
      background-color: var(--bg-dark);
      border-bottom: 1px solid var(--border-color);
      padding: 6px 12px;
      display: flex;
      align-items: center;
      gap: 12px;
      flex-shrink: 0;
      flex-wrap: wrap;
    }

    .tool-group {
      display: flex;
      align-items: center;
      gap: 4px;
      background: var(--bg-card);
      padding: 3px 6px;
      border-radius: 6px;
      border: 1px solid var(--border-color);
    }

    .tool-btn {
      background: transparent;
      border: none;
      color: var(--text-main);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      padding: 5px 8px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
      font-weight: 500;
      transition: all 0.15s ease;
    }

    .tool-btn:hover:not(:disabled) {
      background: var(--bg-card-hover);
      color: #fff;
    }

    .tool-btn:active:not(:disabled) {
      transform: scale(0.96);
    }

    .tool-btn:disabled {
      opacity: 0.35;
      cursor: not-allowed;
    }

    .tool-btn.primary {
      background: var(--primary);
      color: #121216;
      font-weight: 600;
    }

    .tool-btn.primary:hover:not(:disabled) {
      background: var(--primary-hover);
    }

    .tool-btn.active {
      background: rgba(229, 169, 59, 0.25);
      color: var(--primary);
      border: 1px solid var(--primary);
    }

    .tool-btn svg {
      width: 15px;
      height: 15px;
      fill: currentColor;
    }

    .separator {
      width: 1px;
      height: 20px;
      background-color: var(--border-color);
      margin: 0 2px;
    }

    /* DIGITAL TIMER DISPLAY */
    .time-display-box {
      display: flex;
      align-items: center;
      gap: 8px;
      background: #090a0f;
      border: 1px solid #2a2b38;
      border-radius: 6px;
      padding: 4px 10px;
      font-family: "SF Mono", "Fira Code", monospace;
      font-size: 13px;
      color: var(--primary);
      letter-spacing: 0.5px;
    }

    .time-display-box span.lbl {
      color: var(--text-muted);
      font-size: 10px;
      font-family: inherit;
      text-transform: uppercase;
    }

    .time-val {
      font-weight: bold;
      color: #fff;
    }

    /* VU METER */
    .vu-container {
      display: flex;
      flex-direction: column;
      gap: 3px;
      width: 110px;
      background: #090a0f;
      border: 1px solid var(--border-color);
      border-radius: 4px;
      padding: 4px 6px;
    }

    .vu-channel {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 9px;
      font-weight: 700;
      color: var(--text-muted);
    }

    .vu-bar-bg {
      flex: 1;
      height: 6px;
      background: #1e1e28;
      border-radius: 2px;
      overflow: hidden;
      position: relative;
    }

    .vu-bar-fill {
      height: 100%;
      width: 0%;
      background: linear-gradient(90deg, #22c55e 0%, #eab308 75%, #ef4444 100%);
      transition: width 0.05s ease;
    }

    /* WAVEFORM SECTION */
    .waveform-workspace {
      flex: 1;
      display: flex;
      flex-direction: column;
      position: relative;
      background: var(--wave-bg);
      overflow: hidden;
    }

    .timeline-bar {
      height: 24px;
      background: #14151b;
      border-bottom: 1px solid var(--border-color);
      position: relative;
      overflow: hidden;
      cursor: pointer;
    }

    #timelineCanvas {
      position: absolute;
      left: 0;
      top: 0;
      height: 100%;
      width: 100%;
    }

    .wave-scroll-container {
      flex: 1;
      position: relative;
      overflow-x: auto;
      overflow-y: hidden;
      background: var(--wave-bg);
      cursor: crosshair;
    }

    .wave-inner-wrapper {
      position: relative;
      height: 100%;
      min-width: 100%;
    }

    #waveCanvas {
      position: absolute;
      left: 0;
      top: 0;
      height: 100%;
      display: block;
    }

    /* PLAYHEAD */
    .playhead-line {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 2px;
      background-color: var(--playhead);
      pointer-events: none;
      z-index: 10;
      box-shadow: 0 0 8px rgba(239, 68, 68, 0.7);
      display: none;
    }

    .playhead-head {
      position: absolute;
      top: 0;
      left: -5px;
      width: 0;
      height: 0;
      border-left: 6px solid transparent;
      border-right: 6px solid transparent;
      border-top: 8px solid var(--playhead);
    }

    /* SELECTION OVERLAY */
    .selection-box {
      position: absolute;
      top: 0;
      bottom: 0;
      background: var(--selection-bg);
      border-left: 2px solid var(--selection-border);
      border-right: 2px solid var(--selection-border);
      pointer-events: auto;
      cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23e5a93b' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='11' cy='11' r='7'/%3E%3Cline x1='21' y1='21' x2='16.65' y2='16.65'/%3E%3Cline x1='11' y1='8' x2='11' y2='14'/%3E%3Cline x1='8' y1='11' x2='14' y2='11'/%3E%3C/svg%3E") 11 11, zoom-in;
      z-index: 5;
      display: none;
      transition: background 0.15s ease;
    }

    .selection-box:hover {
      background: rgba(229, 169, 59, 0.28);
    }

    .selection-box.zoom-out-mode {
      cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%2338bdf8' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='11' cy='11' r='7'/%3E%3Cline x1='21' y1='21' x2='16.65' y2='16.65'/%3E%3Cline x1='8' y1='11' x2='14' y2='11'/%3E%3C/svg%3E") 11 11, zoom-out;
    }

    /* BOTTOM PANELS / TABS */
    .bottom-panel {
      height: 200px;
      background: var(--bg-dark);
      border-top: 1px solid var(--border-color);
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
    }

    .tabs-header {
      display: flex;
      align-items: center;
      background: #14141a;
      border-bottom: 1px solid var(--border-color);
      padding: 0 10px;
      gap: 4px;
    }

    .tab-btn {
      background: transparent;
      border: none;
      color: var(--text-muted);
      padding: 6px 14px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      transition: all 0.15s ease;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .tab-btn:hover {
      color: var(--text-main);
    }

    .tab-btn.active {
      color: var(--primary);
      border-bottom-color: var(--primary);
      background: rgba(229, 169, 59, 0.05);
    }

    .tab-content {
      flex: 1;
      overflow-y: auto;
      padding: 10px 16px;
      display: none;
    }

    .tab-content.active {
      display: flex;
      align-items: center;
      gap: 20px;
    }

    /* SFXR TAB STYLES */
    .sfxr-container {
      display: flex;
      align-items: stretch;
      gap: 16px;
      width: 100%;
      height: 100%;
    }

    .sfxr-presets-col {
      display: flex;
      flex-direction: column;
      gap: 6px;
      width: 265px;
      background: var(--bg-card);
      padding: 8px 10px;
      border-radius: 6px;
      border: 1px solid var(--border-color);
      justify-content: center;
    }

    .sfxr-presets-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 4px;
    }

    .sfxr-preset-btn {
      background: #252636;
      border: 1px solid #3c3e56;
      color: #e2e8f0;
      padding: 4px 6px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 4px;
      transition: all 0.15s ease;
      text-align: left;
    }

    .sfxr-preset-btn:hover {
      background: #35384f;
      border-color: var(--primary);
      color: #fff;
    }

    .sfxr-sliders-col {
      flex: 1;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px 12px;
      background: var(--bg-card);
      padding: 8px 12px;
      border-radius: 6px;
      border: 1px solid var(--border-color);
    }

    .sfxr-control-item {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .sfxr-control-item label {
      font-size: 9.5px;
      color: var(--text-muted);
      font-weight: bold;
      display: flex;
      justify-content: space-between;
    }

    .sfxr-control-item label span.val {
      font-family: monospace;
      color: var(--accent);
    }

    .sfxr-control-item input[type="range"] {
      width: 100%;
      height: 4px;
      accent-color: var(--accent);
      cursor: pointer;
    }

    .sfxr-actions-col {
      display: flex;
      flex-direction: column;
      gap: 5px;
      justify-content: center;
      width: 175px;
    }

    /* EQUALIZER STYLES */
    .eq-container {
      display: flex;
      align-items: center;
      gap: 20px;
      width: 100%;
    }

    .eq-sliders-wrapper {
      display: flex;
      align-items: flex-end;
      gap: 16px;
      background: var(--bg-card);
      padding: 10px 18px;
      border-radius: 8px;
      border: 1px solid var(--border-color);
    }

    .eq-band {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
    }

    .eq-band label {
      font-size: 10px;
      color: var(--text-muted);
      font-weight: 600;
    }

    .eq-band span.val {
      font-size: 10px;
      font-family: monospace;
      color: var(--primary);
    }

    .eq-slider-vertical {
      -webkit-appearance: slider-vertical;
      writing-mode: bt-lr;
      width: 18px;
      height: 80px;
      cursor: pointer;
      accent-color: var(--primary);
    }

    .eq-presets-box {
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: 180px;
    }

    .select-styled {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      color: var(--text-main);
      padding: 6px 10px;
      border-radius: 6px;
      font-size: 11px;
      outline: none;
      cursor: pointer;
    }

    .select-styled:focus {
      border-color: var(--primary);
    }

    /* EFFECTS STYLES */
    .effects-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      gap: 8px;
      width: 100%;
    }

    .fx-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 8px 10px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      align-items: stretch;
      transition: all 0.15s ease;
    }

    .fx-card:hover {
      border-color: var(--primary);
      background: var(--bg-card-hover);
    }

    .fx-card .fx-title {
      font-size: 11px;
      font-weight: bold;
      color: var(--text-main);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
    }

    .fx-card .fx-desc {
      font-size: 9.5px;
      color: var(--text-muted);
      line-height: 1.25;
    }

    .fx-apply-btn {
      background: linear-gradient(180deg, #2e3040 0%, #1e202d 100%);
      border: 1px solid #4a4d66;
      color: #f8fafc;
      padding: 3px 9px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
      transition: all 0.15s ease;
      flex-shrink: 0;
    }

    .fx-apply-btn:hover {
      background: linear-gradient(180deg, #3e4258 0%, #2a2d3e 100%);
      border-color: var(--primary);
      color: #fff;
      box-shadow: 0 2px 8px rgba(229, 169, 59, 0.3);
      transform: translateY(-1px);
    }

    .fx-apply-btn:active {
      transform: translateY(0);
      background: #14151e;
      box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.6);
    }

    .fx-apply-btn svg {
      width: 10px;
      height: 10px;
      fill: currentColor;
    }

    /* METADATA / INFO STYLES */
    .info-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 14px;
      width: 100%;
    }

    .info-item {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 8px 12px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .info-item .info-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-muted);
    }

    .info-item .info-val {
      font-size: 13px;
      font-weight: 700;
      color: #fff;
      font-family: monospace;
    }

    /* FOOTER STATUS BAR */
    .status-bar {
      height: 22px;
      background: #0d0e13;
      border-top: 1px solid var(--border-color);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 12px;
      font-size: 10.5px;
      color: var(--text-muted);
      flex-shrink: 0;
    }

    .status-bar .file-name {
      font-weight: 600;
      color: var(--text-main);
    }

    .status-bar .dirty-indicator {
      color: var(--primary);
      font-weight: bold;
      margin-left: 4px;
      display: none;
    }

    /* TOAST ALERT */
    .toast-msg {
      position: fixed;
      bottom: 30px;
      right: 20px;
      background: #1f2029;
      color: #fff;
      border: 1px solid var(--primary);
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5);
      border-radius: 6px;
      padding: 8px 14px;
      font-size: 11.5px;
      display: flex;
      align-items: center;
      gap: 8px;
      z-index: 1000;
      transform: translateY(100px);
      opacity: 0;
      transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .toast-msg.show {
      transform: translateY(0);
      opacity: 1;
    }
  </style>
</head>
<body>

  <!-- TOP TOOLBAR -->
  <div class="top-toolbar">
    <!-- Playback Controls -->
    <div class="tool-group">
      <button class="tool-btn primary" id="btnPlay" title="${t.playTip}">
        <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        <span>${t.play}</span>
      </button>
      <button class="tool-btn" id="btnPause" title="${t.pauseTip}">
        <svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
        <span>${t.pause}</span>
      </button>
      <button class="tool-btn" id="btnStop" title="${t.stopTip}">
        <svg viewBox="0 0 24 24"><path d="M6 6h12v12H6z"/></svg>
        <span>${t.stop}</span>
      </button>
      <button class="tool-btn" id="btnLoop" title="${t.loopTip}">
        <svg viewBox="0 0 24 24"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0020 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 004 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>
        <span>${t.loop}</span>
      </button>
      <button class="tool-btn" id="btnPlaySelection" title="${t.playSelectionTip}" disabled>
        <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>
        <span>${t.playSelection}</span>
      </button>
    </div>

    <!-- Time Counters -->
    <div class="time-display-box">
      <span class="lbl">${t.pos}</span>
      <span class="time-val" id="timeCurrent">00:00.000</span>
      <span class="lbl" style="margin-left:6px;">${t.tot}</span>
      <span class="time-val" id="timeTotal" style="color:var(--text-muted)">00:00.000</span>
    </div>

    <!-- VU Meter Stereo -->
    <div class="vu-container" title="${t.vuTip}">
      <div class="vu-channel">
        <span id="vuLblL">${t.chLeftShort}</span>
        <div class="vu-bar-bg"><div class="vu-bar-fill" id="vuL"></div></div>
      </div>
      <div class="vu-channel">
        <span id="vuLblR">${t.chRightShort}</span>
        <div class="vu-bar-bg"><div class="vu-bar-fill" id="vuR"></div></div>
      </div>
    </div>

    <div class="separator"></div>

    <!-- Editing operations -->
    <div class="tool-group">
      <button class="tool-btn" id="btnCut" title="${t.cutTip}" disabled>
        <svg viewBox="0 0 24 24"><path d="M9.64 7.64c.23-.5.36-1.05.36-1.64 0-2.21-1.79-4-4-4S2 3.79 2 6s1.79 4 4 4c.59 0 1.14-.13 1.64-.36L10 12l-2.36 2.36C7.14 14.13 6.59 14 6 14c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4c0-.59-.13-1.14-.36-1.64L12 14l7 7h3v-1L9.64 7.64zM6 8c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm0 12c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm6-7.5c-.28 0-.5-.22-.5-.5s.22-.5.5-.5.5.22.5.5-.22.5-.5.5zM19 3l-6 6 2 2 7-7V3h-3z"/></svg>
        <span>${t.cut}</span>
      </button>
      <button class="tool-btn" id="btnCopy" title="${t.copyTip}" disabled>
        <svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
        <span>${t.copy}</span>
      </button>
      <button class="tool-btn" id="btnPaste" title="${t.pasteTip}" disabled>
        <svg viewBox="0 0 24 24"><path d="M19 2h-4.18C14.4 .84 13.3 0 12 0c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm7 18H5V4h2v3h10V4h2v16z"/></svg>
        <span>${t.paste}</span>
      </button>
      <button class="tool-btn" id="btnTrim" title="${t.trimTip}" disabled>
        <svg viewBox="0 0 24 24"><path d="M17 15h2V7c0-1.1-.9-2-2-2H9v2h8v8zM7 17V1H5v4H1v2h4v10c0 1.1.9 2 2 2h10v4h2v-4h4v-2H7z"/></svg>
        <span>${t.trim}</span>
      </button>
      <button class="tool-btn" id="btnDelete" title="${t.deleteTip}" disabled>
        <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        <span>${t.delete}</span>
      </button>
      <button class="tool-btn" id="btnSilence" title="${t.silenceTip}" disabled>
        <svg viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>
        <span>${t.silence}</span>
      </button>
    </div>

    <!-- Undo / Redo -->
    <div class="tool-group">
      <button class="tool-btn" id="btnUndo" title="${t.undoTip}" disabled>
        <svg viewBox="0 0 24 24"><path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/></svg>
      </button>
      <button class="tool-btn" id="btnRedo" title="${t.redoTip}" disabled>
        <svg viewBox="0 0 24 24"><path d="M18.4 10.6C16.55 8.99 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 16c1.05-3.19 4.05-5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z"/></svg>
      </button>
    </div>

    <!-- Zoom Tools -->
    <div class="tool-group">
      <button class="tool-btn" id="btnZoomOut" title="${t.zoomOutTip}">
        <svg viewBox="0 0 24 24"><path d="M19 13H5v-2h14v2z"/></svg>
      </button>
      <button class="tool-btn" id="btnZoomIn" title="${t.zoomInTip}">
        <svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
      </button>
      <button class="tool-btn" id="btnZoomFit" title="${t.zoomFitTip}">
        <svg viewBox="0 0 24 24"><path d="M4 6H2v12h2V6zm18 0h-2v12h2V6zM8 11h8V9l3 3-3 3v-2H8v2l-3-3 3-3v2z"/></svg>
        <span>${t.zoomFit}</span>
      </button>
    </div>

    <!-- Master Volume & Speed -->
    <div class="tool-group" style="padding: 2px 10px;">
      <span style="font-size:10px; color:var(--text-muted); font-weight:600;">${t.vol}</span>
      <input type="range" id="sliderVolume" min="0" max="1.5" step="0.05" value="1.0" style="width:70px; cursor:pointer; accent-color:var(--primary);" title="${t.volTip}">
      <span id="txtVolume" style="font-size:10px; font-family:monospace; min-width:32px;">100%</span>

      <span style="font-size:10px; color:var(--text-muted); font-weight:600; margin-left:6px;">${t.speed}</span>
      <select id="selectSpeed" class="select-styled" style="padding:2px 4px; font-size:10px;">
        <option value="0.5">0.5x</option>
        <option value="0.75">0.75x</option>
        <option value="1.0" selected>1.0x</option>
        <option value="1.25">1.25x</option>
        <option value="1.5">1.5x</option>
        <option value="2.0">2.0x</option>
      </select>
    </div>

    <!-- Save Buttons -->
    <div class="tool-group" style="margin-left:auto;">
      <button class="tool-btn primary" id="btnSave" title="${t.saveTip}">
        <svg viewBox="0 0 24 24"><path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/></svg>
        <span>${t.save}</span>
      </button>
      <button class="tool-btn" id="btnSaveAs" title="${t.exportTip}">
        <svg viewBox="0 0 24 24"><path d="M19 12v7H5v-7H3v7c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zm-6 .67l2.59-2.58L17 11.5l-5 5-5-5 1.41-1.41L11 12.67V3h2v9.67z"/></svg>
        <span>${t.export}</span>
      </button>
    </div>
  </div>

  <!-- WAVEFORM MAIN WORKSPACE -->
  <div class="waveform-workspace">
    <!-- TIMELINE RULER -->
    <div class="timeline-bar" id="timelineBar">
      <canvas id="timelineCanvas"></canvas>
    </div>

    <!-- WAVEFORM SCROLL CONTAINER -->
    <div class="wave-scroll-container" id="waveScrollContainer">
      <div class="wave-inner-wrapper" id="waveInnerWrapper">
        <canvas id="waveCanvas"></canvas>

        <!-- SELECTION OVERLAY -->
        <div class="selection-box" id="selectionBox"></div>

        <!-- PLAYHEAD -->
        <div class="playhead-line" id="playheadLine">
          <div class="playhead-head"></div>
        </div>
      </div>
    </div>
  </div>

  <!-- BOTTOM PANELS / TABS -->
  <div class="bottom-panel">
    <div class="tabs-header">
      <button class="tab-btn active" data-tab="tab-eq">
        <svg viewBox="0 0 24 24" style="width:13px;height:13px;fill:currentColor;"><path d="M10 20h4V4h-4v16zm-6 0h4v-8H4v8zM16 9v11h4V9h-4z"/></svg>
        <span>${t.tabEq}</span>
      </button>
      <button class="tab-btn" data-tab="tab-fx">
        <svg viewBox="0 0 24 24" style="width:13px;height:13px;fill:currentColor;"><path d="M7.5 5.6L5 7l1.4-2.5L5 2l2.5 1.4L10 2 8.6 4.5 10 7 7.5 5.6zm12 9.8L17 14l1.4 2.5L17 19l2.5-1.4L22 19l-1.4-2.5L22 14l-2.5 1.4zM22 2l-2.5 1.4L17 2l1.4 2.5L17 7l2.5-1.4L22 7l-1.4-2.5L22 2zm-7.63 5.29c-.39-.39-1.02-.39-1.41 0L1.29 18.96c-.39.39-.39 1.02 0 1.41l2.34 2.34c.39.39 1.02.39 1.41 0L16.7 11.05c.39-.39.39-1.02 0-1.41l-2.33-2.35zm-1.03 5.49l-2.12-2.12 2.44-2.44 2.12 2.12-2.44 2.44z"/></svg>
        <span>${t.tabFx}</span>
      </button>
      <button class="tab-btn" data-tab="tab-info">
        <svg viewBox="0 0 24 24" style="width:13px;height:13px;fill:currentColor;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
        <span>${t.tabInfo}</span>
      </button>
      <button class="tab-btn" data-tab="tab-sfxr">
        <svg viewBox="0 0 24 24" style="width:13px;height:13px;fill:currentColor;"><path d="M21.58 16.09l-1.09-7.66C20.21 6.46 18.52 5 16.53 5H7.47C5.48 5 3.79 6.46 3.51 8.43l-1.09 7.66C2.2 17.63 3.39 19 4.94 19c.68 0 1.32-.27 1.8-.75L9 16h6l2.25 2.25c.48.48 1.13.75 1.8.75 1.56 0 2.75-1.37 2.53-2.91zM11 11H9v2H8v-2H6v-1h2V8h1v2h2v1zm4-1c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm2 3c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z"/></svg>
        <span>${t.tabSfxr}</span>
      </button>
    </div>

    <!-- TAB 1: EQUALIZER -->
    <div class="tab-content active" id="tab-eq">
      <div class="eq-container">
        <div class="eq-sliders-wrapper">
          <div class="eq-band">
            <span class="val" id="valEq0">0dB</span>
            <input type="range" class="eq-slider-vertical" id="eqBand0" min="-15" max="15" value="0" step="1">
            <label>60 Hz</label>
          </div>
          <div class="eq-band">
            <span class="val" id="valEq1">0dB</span>
            <input type="range" class="eq-slider-vertical" id="eqBand1" min="-15" max="15" value="0" step="1">
            <label>250 Hz</label>
          </div>
          <div class="eq-band">
            <span class="val" id="valEq2">0dB</span>
            <input type="range" class="eq-slider-vertical" id="eqBand2" min="-15" max="15" value="0" step="1">
            <label>1.0 kHz</label>
          </div>
          <div class="eq-band">
            <span class="val" id="valEq3">0dB</span>
            <input type="range" class="eq-slider-vertical" id="eqBand3" min="-15" max="15" value="0" step="1">
            <label>4.0 kHz</label>
          </div>
          <div class="eq-band">
            <span class="val" id="valEq4">0dB</span>
            <input type="range" class="eq-slider-vertical" id="eqBand4" min="-15" max="15" value="0" step="1">
            <label>12 kHz</label>
          </div>
        </div>

        <div class="eq-presets-box">
          <label style="font-size:10.5px; color:var(--text-muted); font-weight:600;">${t.eqPresets}</label>
          <select id="selectEqPreset" class="select-styled">
            <option value="flat">${t.presetFlat}</option>
            <option value="bass">${t.presetBass}</option>
            <option value="vocal">${t.presetVocal}</option>
            <option value="chiptune">${t.presetChiptune}</option>
            <option value="radio">${t.presetRadio}</option>
          </select>

          <div style="display:flex; align-items:center; gap:8px; margin-top:6px;">
            <input type="checkbox" id="chkEqRealtime" checked style="accent-color:var(--primary); cursor:pointer;">
            <label for="chkEqRealtime" style="font-size:10.5px; cursor:pointer;">${t.liveEq}</label>
          </div>

          <button class="tool-btn primary" id="btnApplyEq" style="margin-top:6px;" title="${t.applyEqTip}">
            <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
            <span>${t.applyEq}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- TAB 2: EFFECTS RACK -->
    <div class="tab-content" id="tab-fx">
      <div class="effects-grid">
        <div class="fx-card">
          <div class="fx-title">
            <span>${t.fxNormalizeTitle}</span>
            <button class="fx-apply-btn" id="btnFxNormalize">
              <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
              <span>${t.applyBtn}</span>
            </button>
          </div>
          <div class="fx-desc">${t.fxNormalizeDesc}</div>
        </div>

        <div class="fx-card">
          <div class="fx-title">
            <span>${t.fxFadeInTitle}</span>
            <button class="fx-apply-btn" id="btnFxFadeIn">
              <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
              <span>${t.applyBtn}</span>
            </button>
          </div>
          <div class="fx-desc">${t.fxFadeInDesc}</div>
        </div>

        <div class="fx-card">
          <div class="fx-title">
            <span>${t.fxFadeInLogTitle}</span>
            <button class="fx-apply-btn" id="btnFxFadeInLog">
              <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
              <span>${t.applyBtn}</span>
            </button>
          </div>
          <div class="fx-desc">${t.fxFadeInLogDesc}</div>
        </div>

        <div class="fx-card">
          <div class="fx-title">
            <span>${t.fxFadeOutTitle}</span>
            <button class="fx-apply-btn" id="btnFxFadeOut">
              <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
              <span>${t.applyBtn}</span>
            </button>
          </div>
          <div class="fx-desc">${t.fxFadeOutDesc}</div>
        </div>

        <div class="fx-card">
          <div class="fx-title">
            <span>${t.fxFadeOutLogTitle}</span>
            <button class="fx-apply-btn" id="btnFxFadeOutLog">
              <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
              <span>${t.applyBtn}</span>
            </button>
          </div>
          <div class="fx-desc">${t.fxFadeOutLogDesc}</div>
        </div>

        <div class="fx-card">
          <div class="fx-title">
            <span>${t.fxReverseTitle}</span>
            <button class="fx-apply-btn" id="btnFxReverse">
              <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
              <span>${t.applyBtn}</span>
            </button>
          </div>
          <div class="fx-desc">${t.fxReverseDesc}</div>
        </div>

        <div class="fx-card">
          <div class="fx-title">
            <span>${t.fxDelayTitle}</span>
            <button class="fx-apply-btn" id="btnFxDelay">
              <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
              <span>${t.applyBtn}</span>
            </button>
          </div>
          <div class="fx-desc">${t.fxDelayDesc}</div>
        </div>

        <div class="fx-card">
          <div class="fx-title">
            <span>${t.fxReverbTitle}</span>
            <button class="fx-apply-btn" id="btnFxReverb">
              <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
              <span>${t.applyBtn}</span>
            </button>
          </div>
          <div class="fx-desc">${t.fxReverbDesc}</div>
        </div>

        <div class="fx-card">
          <div class="fx-title">
            <span>${t.fxGainUpTitle}</span>
            <button class="fx-apply-btn" id="btnFxGainUp">
              <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
              <span>${t.applyBtn}</span>
            </button>
          </div>
          <div class="fx-desc">${t.fxGainUpDesc}</div>
        </div>

        <div class="fx-card">
          <div class="fx-title">
            <span>${t.fxGainDownTitle}</span>
            <button class="fx-apply-btn" id="btnFxGainDown">
              <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
              <span>${t.applyBtn}</span>
            </button>
          </div>
          <div class="fx-desc">${t.fxGainDownDesc}</div>
        </div>

        <div class="fx-card">
          <div class="fx-title">
            <span>${t.fxBitcrushTitle}</span>
            <button class="fx-apply-btn" id="btnFxBitcrush">
              <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
              <span>${t.applyBtn}</span>
            </button>
          </div>
          <div class="fx-desc">${t.fxBitcrushDesc}</div>
        </div>

        <div class="fx-card">
          <div class="fx-title">
            <span>${t.fxInvertPhaseTitle}</span>
            <button class="fx-apply-btn" id="btnFxInvertPhase">
              <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
              <span>${t.applyBtn}</span>
            </button>
          </div>
          <div class="fx-desc">${t.fxInvertPhaseDesc}</div>
        </div>
      </div>
    </div>

    <!-- TAB 3: METADATA & INFO -->
    <div class="tab-content" id="tab-info">
      <div class="info-grid">
        <div class="info-item">
          <span class="info-label">${t.infoSampleRate}</span>
          <span class="info-val" id="infoSampleRate">-- Hz</span>
        </div>
        <div class="info-item">
          <span class="info-label">${t.infoChannels}</span>
          <span class="info-val" id="infoChannels">--</span>
        </div>
        <div class="info-item">
          <span class="info-label">${t.infoDuration}</span>
          <span class="info-val" id="infoDuration">-- s</span>
        </div>
        <div class="info-item">
          <span class="info-label">${t.infoSamples}</span>
          <span class="info-val" id="infoSamples">--</span>
        </div>
      </div>
    </div>

    <!-- TAB 4: RETRO SFX GENERATOR -->
    <div class="tab-content" id="tab-sfxr">
      <div class="sfxr-container">
        <!-- Presets Column -->
        <div class="sfxr-presets-col">
          <span style="font-size:10px; font-weight:bold; color:var(--text-muted);">${t.sfxrPresetsTitle}</span>
          <div class="sfxr-presets-grid">
            <button class="sfxr-preset-btn" onclick="sfxrGenerate('laser')">${t.sfxLaser}</button>
            <button class="sfxr-preset-btn" onclick="sfxrGenerate('explosion')">${t.sfxExplosion}</button>
            <button class="sfxr-preset-btn" onclick="sfxrGenerate('coin')">${t.sfxCoin}</button>
            <button class="sfxr-preset-btn" onclick="sfxrGenerate('jump')">${t.sfxJump}</button>
            <button class="sfxr-preset-btn" onclick="sfxrGenerate('hit')">${t.sfxHit}</button>
            <button class="sfxr-preset-btn" onclick="sfxrGenerate('powerup')">${t.sfxPowerup}</button>
            <button class="sfxr-preset-btn" onclick="sfxrGenerate('blip')">${t.sfxBlip}</button>
            <button class="sfxr-preset-btn" onclick="sfxrGenerate('random')">${t.sfxRandom}</button>
          </div>
        </div>

        <!-- Sliders & Synthesis Controls -->
        <div class="sfxr-sliders-col">
          <div class="sfxr-control-item" style="grid-column: span 3; display:flex; flex-direction:row; align-items:center; justify-content:space-between;">
            <label style="margin:0;">${t.sfxWaveType}</label>
            <select id="sfxrWaveType" class="select-styled" style="padding:2px 6px; font-size:10px;" onchange="onSfxrParamChange()">
              <option value="0">${t.sfxWaveSquare}</option>
              <option value="1">${t.sfxWaveSaw}</option>
              <option value="2">${t.sfxWaveSine}</option>
              <option value="3">${t.sfxWaveNoise}</option>
              <option value="4">${t.sfxWaveTriangle}</option>
            </select>
          </div>

          <div class="sfxr-control-item">
            <label>${t.sfxFreq} <span class="val" id="sfxrValFreq">0.30</span></label>
            <input type="range" id="sfxrFreq" min="0" max="1" step="0.01" value="0.3" oninput="onSfxrParamChange()">
          </div>

          <div class="sfxr-control-item">
            <label>${t.sfxSlide} <span class="val" id="sfxrValSlide">0.00</span></label>
            <input type="range" id="sfxrSlide" min="-1" max="1" step="0.02" value="0.0" oninput="onSfxrParamChange()">
          </div>

          <div class="sfxr-control-item">
            <label>${t.sfxDecay} <span class="val" id="sfxrValDecay">0.25</span></label>
            <input type="range" id="sfxrDecay" min="0" max="1" step="0.01" value="0.25" oninput="onSfxrParamChange()">
          </div>

          <div class="sfxr-control-item">
            <label>${t.sfxPunch} <span class="val" id="sfxrValPunch">0.00</span></label>
            <input type="range" id="sfxrPunch" min="0" max="1" step="0.01" value="0.0" oninput="onSfxrParamChange()">
          </div>

          <div class="sfxr-control-item">
            <label>${t.sfxVib} <span class="val" id="sfxrValVib">0.00</span></label>
            <input type="range" id="sfxrVib" min="0" max="1" step="0.01" value="0.0" oninput="onSfxrParamChange()">
          </div>

          <div class="sfxr-control-item">
            <label>${t.sfxLpf} <span class="val" id="sfxrValLpf">1.00</span></label>
            <input type="range" id="sfxrLpf" min="0" max="1" step="0.01" value="1.0" oninput="onSfxrParamChange()">
          </div>
        </div>

        <!-- Actions Column -->
        <div class="sfxr-actions-col">
          <button class="tool-btn primary" id="btnSfxrPlay" style="padding:6px 10px; font-weight:bold; font-size:11px;" onclick="sfxrPlayPreview()">
            <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            <span>${t.sfxPlayBtn}</span>
          </button>
          <button class="tool-btn" id="btnSfxrMutate" style="padding:6px 10px; background:#292738; border:1px solid #e5a93b; color:#fff; font-size:11px;" onclick="sfxrGenerate('mutate')">
            <svg viewBox="0 0 24 24"><path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/></svg>
            <span>${t.sfxMutate}</span>
          </button>
          <button class="tool-btn" id="btnSfxrOpenInEditor" style="padding:6px 10px; background:#1e293b; border:1px solid #475569; font-size:11px;" onclick="sfxrOpenInVisualizer()">
            <svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
            <span>${t.sfxInsertBtn}</span>
          </button>
          <button class="tool-btn" id="btnSfxrExport" style="padding:6px 10px; background:#1e293b; border:1px solid #475569; font-size:11px;" onclick="sfxrExportWav()">
            <svg viewBox="0 0 24 24"><path d="M19 12v7H5v-7H3v7c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zm-6 .67l2.59-2.58L17 11.5l-5 5-5-5 1.41-1.41L11 12.67V3h2v9.67z"/></svg>
            <span>${t.sfxExportBtn}</span>
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- STATUS BAR -->
  <div class="status-bar">
    <div>
      <span class="file-name" id="statusFilename">${filename}</span>
      <span class="dirty-indicator" id="dirtyIndicator">${t.statusDirty}</span>
    </div>
    <div id="statusSelection" style="font-family:monospace;">
      ${t.statusNoSel}
    </div>
  </div>

  <!-- TOAST MESSAGE -->
  <div class="toast-msg" id="toastMsg">
    <svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:var(--primary);"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
    <span id="toastText">OK</span>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const isSpanish = ${isSpanish ? 'true' : 'false'};

    // Dictionary for Client Side JS
    const STRINGS = {
      noSelection: isSpanish ? 'Sin selección (haz clic y arrastra en la onda)' : 'No selection (click and drag on waveform)',
      selectionLabel: isSpanish ? 'Selección: ' : 'Selection: ',
      durationLabel: isSpanish ? ' (Duración: ' : ' (Duration: ',
      monoLabel: isSpanish ? 'Mono (1 Canal)' : 'Mono (1 Channel)',
      stereoLabel: isSpanish ? 'Estéreo (2 Canales)' : 'Stereo (2 Channels)',
      samplesSuffix: isSpanish ? ' muestras' : ' samples',
      cutToast: isSpanish ? 'Fragmento cortado al portapapeles' : 'Segment cut to clipboard',
      copyToast: isSpanish ? 'Fragmento copiado al portapapeles' : 'Segment copied to clipboard',
      pasteToast: isSpanish ? 'Audio pegado desde el portapapeles' : 'Audio pasted from clipboard',
      trimToast: isSpanish ? 'Pista recortada a la selección' : 'Track cropped to selection',
      deleteToast: isSpanish ? 'Fragmento eliminado' : 'Segment deleted',
      silenceToast: isSpanish ? 'Selección silenciada' : 'Selection silenced',
      undoToast: isSpanish ? 'Deshacer aplicado' : 'Undo applied',
      redoToast: isSpanish ? 'Rehacer aplicado' : 'Redo applied',
      processingEq: isSpanish ? 'Procesando ecualización...' : 'Processing equalization...',
      eqApplied: isSpanish ? '¡Ecualización aplicada exitosamente!' : 'Equalization applied successfully!',
      alreadyNormalized: isSpanish ? 'La pista ya se encuentra normalizada' : 'Track is already normalized',
      normalizedToast: isSpanish ? 'Pista normalizada (+' : 'Track normalized (+',
      fadeInLinear: isSpanish ? 'Fade In lineal aplicado' : 'Linear Fade In applied',
      fadeInLog: isSpanish ? 'Fade In logarítmico aplicado' : 'Logarithmic Fade In applied',
      fadeOutLinear: isSpanish ? 'Fade Out lineal aplicado' : 'Linear Fade Out applied',
      fadeOutLog: isSpanish ? 'Fade Out logarítmico aplicado' : 'Logarithmic Fade Out applied',
      reversed: isSpanish ? 'Audio invertido (Reverse)' : 'Audio reversed',
      delayToast: isSpanish ? 'Efecto de Eco/Delay aplicado' : 'Echo/Delay effect applied',
      generatingDelay: isSpanish ? 'Generando eco...' : 'Generating echo...',
      reverbToast: isSpanish ? 'Reverberación espacial aplicada' : 'Spatial reverb applied',
      generatingReverb: isSpanish ? 'Generando reverberación...' : 'Generating reverb...',
      gainUpToast: isSpanish ? 'Ganancia de +3 dB aplicada' : '+3 dB gain applied',
      gainDownToast: isSpanish ? 'Atenuación de -3 dB aplicada' : '-3 dB attenuation applied',
      bitcrushToast: isSpanish ? 'Efecto Retro 8-Bit Crusher aplicado' : 'Retro 8-Bit Crusher effect applied',
      invertPhaseToast: isSpanish ? 'Fase invertida 180°' : 'Phase inverted 180°',
      savedToast: isSpanish ? 'Archivo guardado correctamente' : 'File saved successfully',
      encodingToast: isSpanish ? 'Codificando WAV...' : 'Encoding WAV...',
      sfxrOpenedInEditor: isSpanish ? 'Efecto abierto en nueva pista' : 'Effect opened in new track',
      sfxrGenerated: isSpanish ? 'SFX generado' : 'SFX generated',
      chLeft: isSpanish ? 'CANAL I' : 'CANAL L',
      chRight: isSpanish ? 'CANAL D' : 'CANAL R',
      chMono: 'MONO'
    };

    // Core Audio variables
    let audioCtx = null;
    let masterBuffer = null;
    let historyStack = [];
    let historyIdx = -1;
    let clipboardBuffer = null;
    let currentSfxrBuffer = null; // Buffer generated by SFXR engine

    // Playback state
    let isPlaying = false;
    let isPaused = false;
    let isLooping = false;
    let playbackStartTime = 0;
    let pauseOffset = 0;
    let playRate = 1.0;
    let currentSource = null;
    let masterGain = null;
    let analyser = null;
    let eqFilters = [];
    let animFrameId = null;

    // Selection & Zoom state
    let zoomLevel = 1.0;
    let selStartSec = null;
    let selEndSec = null;
    let isDraggingSelection = false;
    let dragAnchorSec = 0;
    let isModified = false;

    // DOM Elements
    const waveScrollContainer = document.getElementById('waveScrollContainer');
    const waveInnerWrapper = document.getElementById('waveInnerWrapper');
    const waveCanvas = document.getElementById('waveCanvas');
    const timelineCanvas = document.getElementById('timelineCanvas');
    const playheadLine = document.getElementById('playheadLine');
    const selectionBox = document.getElementById('selectionBox');
    const dirtyIndicator = document.getElementById('dirtyIndicator');
    const statusSelection = document.getElementById('statusSelection');

    const btnPlay = document.getElementById('btnPlay');
    const btnPause = document.getElementById('btnPause');
    const btnStop = document.getElementById('btnStop');
    const btnLoop = document.getElementById('btnLoop');
    const btnPlaySelection = document.getElementById('btnPlaySelection');

    const btnCut = document.getElementById('btnCut');
    const btnCopy = document.getElementById('btnCopy');
    const btnPaste = document.getElementById('btnPaste');
    const btnTrim = document.getElementById('btnTrim');
    const btnDelete = document.getElementById('btnDelete');
    const btnSilence = document.getElementById('btnSilence');
    const btnUndo = document.getElementById('btnUndo');
    const btnRedo = document.getElementById('btnRedo');

    const btnZoomIn = document.getElementById('btnZoomIn');
    const btnZoomOut = document.getElementById('btnZoomOut');
    const btnZoomFit = document.getElementById('btnZoomFit');

    const sliderVolume = document.getElementById('sliderVolume');
    const txtVolume = document.getElementById('txtVolume');
    const selectSpeed = document.getElementById('selectSpeed');
    const btnSave = document.getElementById('btnSave');
    const btnSaveAs = document.getElementById('btnSaveAs');

    const timeCurrent = document.getElementById('timeCurrent');
    const timeTotal = document.getElementById('timeTotal');
    const vuL = document.getElementById('vuL');
    const vuR = document.getElementById('vuR');

    // Tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        const tabId = btn.getAttribute('data-tab');
        document.getElementById(tabId).classList.add('active');
      });
    });

    function showToast(msg) {
      const toast = document.getElementById('toastMsg');
      document.getElementById('toastText').textContent = msg;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 2500);
    }

    function formatTime(sec) {
      if (isNaN(sec) || sec < 0) sec = 0;
      const m = Math.floor(sec / 60);
      const s = Math.floor(sec % 60);
      const ms = Math.floor((sec % 1) * 1000);
      return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') + '.' + String(ms).padStart(3, '0');
    }

    function markDirty() {
      isModified = true;
      dirtyIndicator.style.display = 'inline';
    }

    function markClean() {
      isModified = false;
      dirtyIndicator.style.display = 'none';
    }

    // Audio Context Init
    function ensureAudioContext() {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        masterGain = audioCtx.createGain();
        masterGain.gain.value = parseFloat(sliderVolume.value);

        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;

        const freqs = [60, 250, 1000, 4000, 12000];
        const types = ['lowshelf', 'peaking', 'peaking', 'peaking', 'highshelf'];

        eqFilters = freqs.map((f, idx) => {
          const filter = audioCtx.createBiquadFilter();
          filter.type = types[idx];
          filter.frequency.value = f;
          filter.gain.value = 0;
          return filter;
        });

        for (let i = 0; i < eqFilters.length - 1; i++) {
          eqFilters[i].connect(eqFilters[i + 1]);
        }
        eqFilters[eqFilters.length - 1].connect(masterGain);
        masterGain.connect(analyser);
        analyser.connect(audioCtx.destination);
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
    }

    // History handling (Undo / Redo)
    function pushHistory(buffer) {
      const clone = cloneAudioBuffer(buffer);
      historyStack = historyStack.slice(0, historyIdx + 1);
      historyStack.push(clone);
      if (historyStack.length > 20) {
        historyStack.shift();
      }
      historyIdx = historyStack.length - 1;
      updateUndoRedoUI();
    }

    function updateUndoRedoUI() {
      btnUndo.disabled = historyIdx <= 0;
      btnRedo.disabled = historyIdx >= historyStack.length - 1;
    }

    function cloneAudioBuffer(src) {
      const dst = audioCtx.createBuffer(src.numberOfChannels, src.length, src.sampleRate);
      for (let ch = 0; ch < src.numberOfChannels; ch++) {
        dst.copyToChannel(src.getChannelData(ch), ch);
      }
      return dst;
    }

    function setMasterBuffer(newBuf, recordHistory = true) {
      masterBuffer = newBuf;
      if (recordHistory) {
        pushHistory(newBuf);
      }
      pauseOffset = 0;
      updateMetadataDisplay();
      renderWaveform();
      renderTimeline();
    }

    function updateMetadataDisplay() {
      if (!masterBuffer) return;
      document.getElementById('infoSampleRate').textContent = masterBuffer.sampleRate + ' Hz';
      document.getElementById('infoChannels').textContent = masterBuffer.numberOfChannels === 1 ? STRINGS.monoLabel : STRINGS.stereoLabel;
      document.getElementById('infoDuration').textContent = masterBuffer.duration.toFixed(3) + ' s';
      document.getElementById('infoSamples').textContent = masterBuffer.length.toLocaleString() + STRINGS.samplesSuffix;
      timeTotal.textContent = formatTime(masterBuffer.duration);
    }

    // Playback logic
    function play(startFrom = null, playOnlySelection = false) {
      if (!masterBuffer) return;
      ensureAudioContext();

      if (isPlaying) {
        stopPlayback(false);
      }

      currentSource = audioCtx.createBufferSource();
      currentSource.buffer = masterBuffer;
      currentSource.playbackRate.value = playRate;

      const realtimeEq = document.getElementById('chkEqRealtime').checked;
      if (realtimeEq && eqFilters.length > 0) {
        currentSource.connect(eqFilters[0]);
      } else {
        currentSource.connect(masterGain);
      }

      let offset = 0;
      let durationToPlay = undefined;

      if (playOnlySelection && selStartSec !== null && selEndSec !== null) {
        offset = Math.min(selStartSec, selEndSec);
        durationToPlay = Math.abs(selEndSec - selStartSec);
      } else if (startFrom !== null) {
        offset = startFrom;
      } else if (isPaused) {
        offset = pauseOffset;
      }

      if (offset >= masterBuffer.duration) {
        offset = 0;
      }

      currentSource.loop = isLooping;
      if (isLooping && playOnlySelection && selStartSec !== null && selEndSec !== null) {
        currentSource.loopStart = Math.min(selStartSec, selEndSec);
        currentSource.loopEnd = Math.max(selStartSec, selEndSec);
      }

      currentSource.onended = () => {
        if (isPlaying && !currentSource.loop) {
          stopPlayback(true);
        }
      };

      playbackStartTime = audioCtx.currentTime - (offset / playRate);
      if (durationToPlay !== undefined && !isLooping) {
        currentSource.start(0, offset, durationToPlay);
      } else {
        currentSource.start(0, offset);
      }

      isPlaying = true;
      isPaused = false;
      playheadLine.style.display = 'block';
      startMeterAndPlayhead();
    }

    function pause() {
      if (!isPlaying) return;
      pauseOffset = (audioCtx.currentTime - playbackStartTime) * playRate;
      if (pauseOffset > masterBuffer.duration) pauseOffset = masterBuffer.duration;
      stopPlayback(false);
      isPaused = true;
    }

    function stopPlayback(resetToStart = true) {
      if (currentSource) {
        try { currentSource.stop(); } catch (e) {}
        currentSource.disconnect();
        currentSource = null;
      }
      isPlaying = false;
      if (resetToStart) {
        isPaused = false;
        pauseOffset = 0;
        updatePlayheadPosition(0);
        timeCurrent.textContent = formatTime(0);
        vuL.style.width = '0%';
        vuR.style.width = '0%';
      }
      if (animFrameId) {
        cancelAnimationFrame(animFrameId);
        animFrameId = null;
      }
    }

    function startMeterAndPlayhead() {
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      function loop() {
        if (!isPlaying) return;

        const currentSec = (audioCtx.currentTime - playbackStartTime) * playRate;
        updatePlayheadPosition(currentSec);
        timeCurrent.textContent = formatTime(currentSec);

        analyser.getByteTimeDomainData(dataArray);
        let maxVal = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const val = Math.abs(dataArray[i] - 128);
          if (val > maxVal) maxVal = val;
        }
        const pct = Math.min(100, Math.round((maxVal / 128) * 115));
        vuL.style.width = pct + '%';
        vuR.style.width = Math.max(0, pct - 3) + '%';

        animFrameId = requestAnimationFrame(loop);
      }
      animFrameId = requestAnimationFrame(loop);
    }

    function updatePlayheadPosition(sec) {
      if (!masterBuffer) return;
      const totalSec = masterBuffer.duration;
      const totalWidth = waveCanvas.width / (window.devicePixelRatio || 1);
      const pxPerSec = totalWidth / totalSec;
      const x = sec * pxPerSec;
      playheadLine.style.transform = 'translateX(' + x + 'px)';
    }

    // Waveform Rendering (Strict Channel Boundary Clipping + Spanish/English Channel labels)
    function renderWaveform() {
      if (!masterBuffer) return;

      const dpr = window.devicePixelRatio || 1;
      const baseWidth = waveScrollContainer.clientWidth;
      const displayWidth = Math.max(baseWidth, Math.round(baseWidth * zoomLevel));
      const displayHeight = waveScrollContainer.clientHeight;

      waveInnerWrapper.style.width = displayWidth + 'px';
      waveCanvas.width = displayWidth * dpr;
      waveCanvas.height = displayHeight * dpr;
      waveCanvas.style.width = displayWidth + 'px';
      waveCanvas.style.height = displayHeight + 'px';

      const ctx = waveCanvas.getContext('2d');
      ctx.scale(dpr, dpr);

      ctx.fillStyle = '#0f1015';
      ctx.fillRect(0, 0, displayWidth, displayHeight);

      const numChannels = masterBuffer.numberOfChannels;
      const channelHeight = displayHeight / numChannels;

      for (let ch = 0; ch < numChannels; ch++) {
        const chData = masterBuffer.getChannelData(ch);
        const topY = ch * channelHeight;
        const midY = topY + (channelHeight / 2);

        ctx.save();

        // 1. Strict clipping to prevent lines from ever invading another channel
        ctx.beginPath();
        ctx.rect(0, topY, displayWidth, channelHeight);
        ctx.clip();

        // 2. Channel background alternating tint
        ctx.fillStyle = ch % 2 === 0 ? '#0f1015' : '#111218';
        ctx.fillRect(0, topY, displayWidth, channelHeight);

        // 3. Center line
        ctx.strokeStyle = '#232530';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, midY);
        ctx.lineTo(displayWidth, midY);
        ctx.stroke();

        // 4. Stereo divider line between Channel 0 and 1
        if (ch > 0) {
          ctx.strokeStyle = '#2d2f3d';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(0, topY);
          ctx.lineTo(displayWidth, topY);
          ctx.stroke();
        }

        // 5. Draw waveform peaks
        const step = Math.ceil(chData.length / displayWidth);
        const channelPadding = 4;
        const amp = Math.max(1, (channelHeight / 2) - channelPadding);

        const grad = ctx.createLinearGradient(0, topY + channelPadding, 0, topY + channelHeight - channelPadding);
        if (ch === 0) {
          grad.addColorStop(0, '#38bdf8');
          grad.addColorStop(0.5, '#0284c7');
          grad.addColorStop(1, '#38bdf8');
        } else {
          grad.addColorStop(0, '#e5a93b');
          grad.addColorStop(0.5, '#b45309');
          grad.addColorStop(1, '#e5a93b');
        }

        ctx.fillStyle = grad;

        for (let x = 0; x < displayWidth; x++) {
          const sampleStart = x * step;
          let min = 1.0;
          let max = -1.0;

          for (let j = 0; j < step && (sampleStart + j) < chData.length; j++) {
            const val = chData[sampleStart + j];
            if (val < min) min = val;
            if (val > max) max = val;
          }

          if (max < min) { min = 0; max = 0; }

          // Clamp peak values to [-1.0, 1.0]
          const clampedMax = Math.min(1.0, Math.max(0.0, max));
          const clampedMin = Math.max(-1.0, Math.min(0.0, min));

          const yTop = midY - (clampedMax * amp);
          const yBottom = midY - (clampedMin * amp);
          const barHeight = Math.max(1, yBottom - yTop);

          ctx.fillRect(x, yTop, 1, barHeight);
        }

        // 6. Channel Label: CANAL I / CANAL D in Spanish, CANAL L / CANAL R in English
        ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, sans-serif';
        let channelLabel = STRINGS.chMono;
        if (numChannels > 1) {
          channelLabel = ch === 0 ? STRINGS.chLeft : STRINGS.chRight;
        }
        ctx.fillText(channelLabel, 10, topY + 16);

        ctx.restore();
      }

      updateSelectionVisual();
    }

    // Timeline Rendering
    function renderTimeline() {
      if (!masterBuffer) return;

      const dpr = window.devicePixelRatio || 1;
      const displayWidth = waveCanvas.width / dpr;
      const displayHeight = 24;

      timelineCanvas.width = displayWidth * dpr;
      timelineCanvas.height = displayHeight * dpr;
      timelineCanvas.style.width = displayWidth + 'px';
      timelineCanvas.style.height = displayHeight + 'px';

      const ctx = timelineCanvas.getContext('2d');
      ctx.scale(dpr, dpr);

      ctx.fillStyle = '#14151b';
      ctx.fillRect(0, 0, displayWidth, displayHeight);

      const totalSec = masterBuffer.duration;
      const pxPerSec = displayWidth / totalSec;

      let tickInterval = 1.0;
      if (pxPerSec < 20) tickInterval = 10.0;
      else if (pxPerSec < 50) tickInterval = 5.0;
      else if (pxPerSec > 200) tickInterval = 0.5;
      else if (pxPerSec > 500) tickInterval = 0.1;

      ctx.strokeStyle = '#2e303e';
      ctx.fillStyle = '#8e95a5';
      ctx.font = '9px monospace';

      for (let sec = 0; sec <= totalSec; sec += tickInterval) {
        const x = sec * pxPerSec;
        ctx.beginPath();
        ctx.moveTo(x, 14);
        ctx.lineTo(x, 24);
        ctx.stroke();

        ctx.fillText(sec.toFixed(tickInterval < 1 ? 1 : 0) + 's', x + 3, 11);
      }
    }

    // Selection Handling & Zoom On Click
    function getSecondsFromX(clientX) {
      const rect = waveScrollContainer.getBoundingClientRect();
      const scrollX = waveScrollContainer.scrollLeft;
      const x = (clientX - rect.left) + scrollX;
      const displayWidth = waveCanvas.width / (window.devicePixelRatio || 1);
      const pct = Math.max(0, Math.min(1, x / displayWidth));
      return pct * masterBuffer.duration;
    }

    waveScrollContainer.addEventListener('mousedown', (e) => {
      if (!masterBuffer) return;
      isDraggingSelection = true;
      dragAnchorSec = getSecondsFromX(e.clientX);
      selStartSec = dragAnchorSec;
      selEndSec = dragAnchorSec;
      pauseOffset = dragAnchorSec;
      updatePlayheadPosition(dragAnchorSec);
      timeCurrent.textContent = formatTime(dragAnchorSec);
      updateSelectionVisual();
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDraggingSelection || !masterBuffer) return;
      const currentSec = getSecondsFromX(e.clientX);
      selStartSec = Math.min(dragAnchorSec, currentSec);
      selEndSec = Math.max(dragAnchorSec, currentSec);
      updateSelectionVisual();
    });

    window.addEventListener('mouseup', () => {
      if (isDraggingSelection) {
        isDraggingSelection = false;
        if (selStartSec !== null && selEndSec !== null && Math.abs(selEndSec - selStartSec) < 0.02) {
          clearSelection();
        } else {
          enableSelectionTools(true);
        }
      }
    });

    function updateSelectionCursor(isCmdOrCtrl) {
      if (isCmdOrCtrl) {
        selectionBox.classList.add('zoom-out-mode');
      } else {
        selectionBox.classList.remove('zoom-out-mode');
      }
    }

    selectionBox.addEventListener('mouseenter', (e) => {
      updateSelectionCursor(e.ctrlKey || e.metaKey);
    });

    selectionBox.addEventListener('mousemove', (e) => {
      updateSelectionCursor(e.ctrlKey || e.metaKey);
    });

    selectionBox.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });

    selectionBox.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (!masterBuffer || selStartSec === null || selEndSec === null) return;

      const isZoomOut = e.ctrlKey || e.metaKey;
      const s = Math.min(selStartSec, selEndSec);
      const eSec = Math.max(selStartSec, selEndSec);
      const centerSec = (s + eSec) / 2;

      if (isZoomOut) {
        zoomLevel = Math.max(1.0, zoomLevel / 1.7);
      } else {
        const selDuration = eSec - s;
        const baseWidth = waveScrollContainer.clientWidth;
        const neededZoom = (masterBuffer.duration / Math.max(0.05, selDuration)) * 0.85;
        zoomLevel = Math.min(30.0, Math.max(zoomLevel * 1.8, neededZoom));
      }

      renderWaveform();
      renderTimeline();

      const dpr = window.devicePixelRatio || 1;
      const displayWidth = waveCanvas.width / dpr;
      const pxPerSec = displayWidth / masterBuffer.duration;
      const centerPx = centerSec * pxPerSec;
      const containerWidth = waveScrollContainer.clientWidth;
      waveScrollContainer.scrollLeft = Math.max(0, centerPx - (containerWidth / 2));
    });

    function updateSelectionVisual() {
      if (!masterBuffer || selStartSec === null || selEndSec === null || selStartSec === selEndSec) {
        selectionBox.style.display = 'none';
        return;
      }

      const totalSec = masterBuffer.duration;
      const displayWidth = waveCanvas.width / (window.devicePixelRatio || 1);
      const pxPerSec = displayWidth / totalSec;

      const s = Math.min(selStartSec, selEndSec);
      const e = Math.max(selStartSec, selEndSec);
      const left = s * pxPerSec;
      const width = (e - s) * pxPerSec;

      selectionBox.style.display = 'block';
      selectionBox.style.left = left + 'px';
      selectionBox.style.width = width + 'px';

      const dur = e - s;
      statusSelection.textContent = STRINGS.selectionLabel + formatTime(s) + ' → ' + formatTime(e) + STRINGS.durationLabel + dur.toFixed(3) + 's)';
    }

    function clearSelection() {
      selStartSec = null;
      selEndSec = null;
      selectionBox.style.display = 'none';
      statusSelection.textContent = STRINGS.noSelection;
      enableSelectionTools(false);
    }

    function enableSelectionTools(enabled) {
      btnCut.disabled = !enabled;
      btnCopy.disabled = !enabled;
      btnTrim.disabled = !enabled;
      btnDelete.disabled = !enabled;
      btnSilence.disabled = !enabled;
      btnPlaySelection.disabled = !enabled;
    }

    // Audio Edit Operations
    btnCut.addEventListener('click', () => {
      if (!masterBuffer || selStartSec === null || selEndSec === null) return;
      copySelectionToClipboard();
      deleteSelection(false);
      markDirty();
      showToast(STRINGS.cutToast);
    });

    btnCopy.addEventListener('click', () => {
      copySelectionToClipboard();
      showToast(STRINGS.copyToast);
    });

    btnPaste.addEventListener('click', () => {
      if (!masterBuffer || !clipboardBuffer) return;

      const insertSec = selStartSec !== null ? selStartSec : pauseOffset;
      const insertSample = Math.floor(insertSec * masterBuffer.sampleRate);
      const clipSamples = clipboardBuffer.length;
      const newTotalLength = masterBuffer.length + clipSamples;

      const newBuf = audioCtx.createBuffer(masterBuffer.numberOfChannels, newTotalLength, masterBuffer.sampleRate);

      for (let ch = 0; ch < masterBuffer.numberOfChannels; ch++) {
        const srcData = masterBuffer.getChannelData(ch);
        const clipData = clipboardBuffer.getChannelData(Math.min(ch, clipboardBuffer.numberOfChannels - 1));
        const dstData = newBuf.getChannelData(ch);

        dstData.set(srcData.subarray(0, insertSample), 0);
        dstData.set(clipData, insertSample);
        dstData.set(srcData.subarray(insertSample), insertSample + clipSamples);
      }

      setMasterBuffer(newBuf);
      clearSelection();
      markDirty();
      showToast(STRINGS.pasteToast);
    });

    btnTrim.addEventListener('click', () => {
      if (!masterBuffer || selStartSec === null || selEndSec === null) return;
      const sSec = Math.min(selStartSec, selEndSec);
      const eSec = Math.max(selStartSec, selEndSec);
      const startSample = Math.floor(sSec * masterBuffer.sampleRate);
      const endSample = Math.floor(eSec * masterBuffer.sampleRate);
      const newLength = endSample - startSample;

      if (newLength <= 0) return;

      const newBuf = audioCtx.createBuffer(masterBuffer.numberOfChannels, newLength, masterBuffer.sampleRate);
      for (let ch = 0; ch < masterBuffer.numberOfChannels; ch++) {
        const srcData = masterBuffer.getChannelData(ch);
        const dstData = newBuf.getChannelData(ch);
        dstData.set(srcData.subarray(startSample, endSample), 0);
      }

      setMasterBuffer(newBuf);
      clearSelection();
      markDirty();
      showToast(STRINGS.trimToast);
    });

    btnDelete.addEventListener('click', () => {
      deleteSelection(true);
    });

    function deleteSelection(notify = true) {
      if (!masterBuffer || selStartSec === null || selEndSec === null) return;
      const sSec = Math.min(selStartSec, selEndSec);
      const eSec = Math.max(selStartSec, selEndSec);
      const startSample = Math.floor(sSec * masterBuffer.sampleRate);
      const endSample = Math.floor(eSec * masterBuffer.sampleRate);
      const delLength = endSample - startSample;
      const newLength = masterBuffer.length - delLength;

      if (newLength <= 0) return;

      const newBuf = audioCtx.createBuffer(masterBuffer.numberOfChannels, newLength, masterBuffer.sampleRate);
      for (let ch = 0; ch < masterBuffer.numberOfChannels; ch++) {
        const srcData = masterBuffer.getChannelData(ch);
        const dstData = newBuf.getChannelData(ch);
        dstData.set(srcData.subarray(0, startSample), 0);
        dstData.set(srcData.subarray(endSample), startSample);
      }

      setMasterBuffer(newBuf);
      clearSelection();
      markDirty();
      if (notify) showToast(STRINGS.deleteToast);
    }

    btnSilence.addEventListener('click', () => {
      if (!masterBuffer || selStartSec === null || selEndSec === null) return;
      const sSec = Math.min(selStartSec, selEndSec);
      const eSec = Math.max(selStartSec, selEndSec);
      const startSample = Math.floor(sSec * masterBuffer.sampleRate);
      const endSample = Math.floor(eSec * masterBuffer.sampleRate);

      const clone = cloneAudioBuffer(masterBuffer);
      for (let ch = 0; ch < clone.numberOfChannels; ch++) {
        const data = clone.getChannelData(ch);
        data.fill(0, startSample, endSample);
      }

      setMasterBuffer(clone);
      markDirty();
      showToast(STRINGS.silenceToast);
    });

    function copySelectionToClipboard() {
      if (!masterBuffer || selStartSec === null || selEndSec === null) return;
      const sSec = Math.min(selStartSec, selEndSec);
      const eSec = Math.max(selStartSec, selEndSec);
      const startSample = Math.floor(sSec * masterBuffer.sampleRate);
      const endSample = Math.floor(eSec * masterBuffer.sampleRate);
      const length = endSample - startSample;

      clipboardBuffer = audioCtx.createBuffer(masterBuffer.numberOfChannels, length, masterBuffer.sampleRate);
      for (let ch = 0; ch < masterBuffer.numberOfChannels; ch++) {
        const srcData = masterBuffer.getChannelData(ch);
        const clipData = clipboardBuffer.getChannelData(ch);
        clipData.set(srcData.subarray(startSample, endSample), 0);
      }
      btnPaste.disabled = false;
    }

    // Undo / Redo buttons
    btnUndo.addEventListener('click', () => {
      if (historyIdx > 0) {
        historyIdx--;
        masterBuffer = cloneAudioBuffer(historyStack[historyIdx]);
        updateUndoRedoUI();
        updateMetadataDisplay();
        renderWaveform();
        renderTimeline();
        markDirty();
        showToast(STRINGS.undoToast);
      }
    });

    btnRedo.addEventListener('click', () => {
      if (historyIdx < historyStack.length - 1) {
        historyIdx++;
        masterBuffer = cloneAudioBuffer(historyStack[historyIdx]);
        updateUndoRedoUI();
        updateMetadataDisplay();
        renderWaveform();
        renderTimeline();
        markDirty();
        showToast(STRINGS.redoToast);
      }
    });

    // Zoom Controls
    btnZoomIn.addEventListener('click', () => {
      zoomLevel = Math.min(30.0, zoomLevel * 1.4);
      renderWaveform();
      renderTimeline();
    });

    btnZoomOut.addEventListener('click', () => {
      zoomLevel = Math.max(1.0, zoomLevel / 1.4);
      renderWaveform();
      renderTimeline();
    });

    btnZoomFit.addEventListener('click', () => {
      zoomLevel = 1.0;
      waveScrollContainer.scrollLeft = 0;
      renderWaveform();
      renderTimeline();
    });

    // Master volume & Speed
    sliderVolume.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      txtVolume.textContent = Math.round(val * 100) + '%';
      if (masterGain) masterGain.gain.value = val;
    });

    selectSpeed.addEventListener('change', (e) => {
      playRate = parseFloat(e.target.value);
      if (currentSource) {
        currentSource.playbackRate.value = playRate;
      }
    });

    // Transport buttons
    btnPlay.addEventListener('click', () => play());
    btnPause.addEventListener('click', () => pause());
    btnStop.addEventListener('click', () => stopPlayback(true));
    btnPlaySelection.addEventListener('click', () => play(null, true));

    btnLoop.addEventListener('click', () => {
      isLooping = !isLooping;
      btnLoop.classList.toggle('active', isLooping);
      if (currentSource) currentSource.loop = isLooping;
    });

    // ==========================================
    // PROCEDURAL RETRO SFX (SFXR ENGINE)
    // ==========================================
    let sfxrParams = {
      wave_type: 0,
      p_env_attack: 0.0,
      p_env_sustain: 0.25,
      p_env_punch: 0.0,
      p_env_decay: 0.2,
      p_base_freq: 0.3,
      p_freq_limit: 0.0,
      p_freq_ramp: 0.0,
      p_freq_dramp: 0.0,
      p_vib_strength: 0.0,
      p_vib_speed: 0.0,
      p_arp_mod: 0.0,
      p_arp_speed: 0.0,
      p_duty: 0.5,
      p_duty_ramp: 0.0,
      p_lpf_freq: 1.0,
      p_lpf_ramp: 0.0,
      p_lpf_resonance: 0.0,
      p_hpf_freq: 0.0,
      p_hpf_ramp: 0.0
    };

    function rnd(max = 1) { return Math.random() * max; }
    function frnd(range = 1) { return (Math.random() * 2 - 1) * range; }

    function sfxrGenerate(preset) {
      ensureAudioContext();
      // Reset defaults
      sfxrParams.p_env_attack = 0.0;
      sfxrParams.p_env_sustain = 0.2;
      sfxrParams.p_env_punch = 0.0;
      sfxrParams.p_env_decay = 0.2;
      sfxrParams.p_freq_ramp = 0.0;
      sfxrParams.p_freq_dramp = 0.0;
      sfxrParams.p_vib_strength = 0.0;
      sfxrParams.p_vib_speed = 0.0;
      sfxrParams.p_arp_mod = 0.0;
      sfxrParams.p_arp_speed = 0.0;
      sfxrParams.p_lpf_freq = 1.0;
      sfxrParams.p_lpf_ramp = 0.0;
      sfxrParams.p_lpf_resonance = 0.0;
      sfxrParams.p_hpf_freq = 0.0;

      switch (preset) {
        case 'laser':
          sfxrParams.wave_type = Math.floor(rnd(2)); // Square or Saw
          sfxrParams.p_base_freq = 0.5 + rnd(0.4);
          sfxrParams.p_freq_limit = 0.1;
          sfxrParams.p_freq_ramp = -0.35 - rnd(0.3);
          sfxrParams.p_env_attack = 0.0;
          sfxrParams.p_env_sustain = 0.1 + rnd(0.1);
          sfxrParams.p_env_decay = 0.1 + rnd(0.15);
          sfxrParams.p_env_punch = rnd(0.3);
          break;

        case 'explosion':
          sfxrParams.wave_type = 3; // Noise
          sfxrParams.p_base_freq = 0.1 + rnd(0.3);
          sfxrParams.p_freq_ramp = -0.1 + frnd(0.1);
          sfxrParams.p_env_attack = 0.0;
          sfxrParams.p_env_sustain = 0.1 + rnd(0.3);
          sfxrParams.p_env_decay = 0.25 + rnd(0.4);
          sfxrParams.p_env_punch = 0.2 + rnd(0.4);
          break;

        case 'coin':
          sfxrParams.wave_type = 0; // Square
          sfxrParams.p_base_freq = 0.4 + rnd(0.4);
          sfxrParams.p_env_attack = 0.0;
          sfxrParams.p_env_sustain = 0.08 + rnd(0.08);
          sfxrParams.p_env_decay = 0.15 + rnd(0.2);
          sfxrParams.p_arp_mod = 0.3 + rnd(0.3);
          sfxrParams.p_arp_speed = 0.4 + rnd(0.2);
          break;

        case 'jump':
          sfxrParams.wave_type = 0; // Square
          sfxrParams.p_base_freq = 0.3 + rnd(0.3);
          sfxrParams.p_freq_ramp = 0.2 + rnd(0.25);
          sfxrParams.p_env_attack = 0.0;
          sfxrParams.p_env_sustain = 0.15 + rnd(0.15);
          sfxrParams.p_env_decay = 0.1 + rnd(0.2);
          break;

        case 'hit':
          sfxrParams.wave_type = Math.floor(rnd(3)) === 0 ? 3 : 1; // Noise or Saw
          sfxrParams.p_base_freq = 0.3 + rnd(0.5);
          sfxrParams.p_freq_ramp = -0.35 - rnd(0.3);
          sfxrParams.p_env_attack = 0.0;
          sfxrParams.p_env_sustain = 0.05 + rnd(0.1);
          sfxrParams.p_env_decay = 0.1 + rnd(0.2);
          break;

        case 'powerup':
          sfxrParams.wave_type = Math.floor(rnd(2)); // Square or Saw
          sfxrParams.p_base_freq = 0.2 + rnd(0.3);
          sfxrParams.p_freq_ramp = 0.3 + rnd(0.3);
          sfxrParams.p_env_sustain = 0.2 + rnd(0.2);
          sfxrParams.p_env_decay = 0.2 + rnd(0.3);
          sfxrParams.p_vib_strength = 0.2 + rnd(0.3);
          sfxrParams.p_vib_speed = 0.4 + rnd(0.3);
          break;

        case 'blip':
          sfxrParams.wave_type = Math.floor(rnd(2)) === 0 ? 0 : 2; // Square or Sine
          sfxrParams.p_base_freq = 0.3 + rnd(0.5);
          sfxrParams.p_env_attack = 0.0;
          sfxrParams.p_env_sustain = 0.05 + rnd(0.05);
          sfxrParams.p_env_decay = 0.05 + rnd(0.1);
          break;

        case 'random':
          sfxrParams.wave_type = Math.floor(rnd(5));
          sfxrParams.p_base_freq = rnd(0.9);
          sfxrParams.p_freq_ramp = frnd(0.7);
          sfxrParams.p_env_attack = rnd(0.2);
          sfxrParams.p_env_sustain = rnd(0.4);
          sfxrParams.p_env_decay = 0.1 + rnd(0.5);
          sfxrParams.p_env_punch = rnd(0.4);
          sfxrParams.p_vib_strength = rnd(0.5);
          sfxrParams.p_vib_speed = rnd(0.5);
          break;

        case 'mutate':
          sfxrParams.p_base_freq = Math.max(0, Math.min(1, sfxrParams.p_base_freq + frnd(0.08)));
          sfxrParams.p_freq_ramp = Math.max(-1, Math.min(1, sfxrParams.p_freq_ramp + frnd(0.08)));
          sfxrParams.p_env_sustain = Math.max(0, Math.min(1, sfxrParams.p_env_sustain + frnd(0.08)));
          sfxrParams.p_env_decay = Math.max(0, Math.min(1, sfxrParams.p_env_decay + frnd(0.08)));
          break;
      }

      syncSfxrUIFromParams();
      synthesizeSfxrBuffer();
      sfxrPlayPreview();
      showToast(STRINGS.sfxrGenerated);
    }

    function syncSfxrUIFromParams() {
      document.getElementById('sfxrWaveType').value = sfxrParams.wave_type;
      document.getElementById('sfxrFreq').value = sfxrParams.p_base_freq.toFixed(2);
      document.getElementById('sfxrSlide').value = sfxrParams.p_freq_ramp.toFixed(2);
      document.getElementById('sfxrDecay').value = sfxrParams.p_env_decay.toFixed(2);
      document.getElementById('sfxrPunch').value = sfxrParams.p_env_punch.toFixed(2);
      document.getElementById('sfxrVib').value = sfxrParams.p_vib_strength.toFixed(2);
      document.getElementById('sfxrLpf').value = sfxrParams.p_lpf_freq.toFixed(2);

      document.getElementById('sfxrValFreq').textContent = sfxrParams.p_base_freq.toFixed(2);
      document.getElementById('sfxrValSlide').textContent = sfxrParams.p_freq_ramp.toFixed(2);
      document.getElementById('sfxrValDecay').textContent = sfxrParams.p_env_decay.toFixed(2);
      document.getElementById('sfxrValPunch').textContent = sfxrParams.p_env_punch.toFixed(2);
      document.getElementById('sfxrValVib').textContent = sfxrParams.p_vib_strength.toFixed(2);
      document.getElementById('sfxrValLpf').textContent = sfxrParams.p_lpf_freq.toFixed(2);
    }

    function onSfxrParamChange() {
      sfxrParams.wave_type = parseInt(document.getElementById('sfxrWaveType').value, 10);
      sfxrParams.p_base_freq = parseFloat(document.getElementById('sfxrFreq').value);
      sfxrParams.p_freq_ramp = parseFloat(document.getElementById('sfxrSlide').value);
      sfxrParams.p_env_decay = parseFloat(document.getElementById('sfxrDecay').value);
      sfxrParams.p_env_punch = parseFloat(document.getElementById('sfxrPunch').value);
      sfxrParams.p_vib_strength = parseFloat(document.getElementById('sfxrVib').value);
      sfxrParams.p_lpf_freq = parseFloat(document.getElementById('sfxrLpf').value);

      document.getElementById('sfxrValFreq').textContent = sfxrParams.p_base_freq.toFixed(2);
      document.getElementById('sfxrValSlide').textContent = sfxrParams.p_freq_ramp.toFixed(2);
      document.getElementById('sfxrValDecay').textContent = sfxrParams.p_env_decay.toFixed(2);
      document.getElementById('sfxrValPunch').textContent = sfxrParams.p_env_punch.toFixed(2);
      document.getElementById('sfxrValVib').textContent = sfxrParams.p_vib_strength.toFixed(2);
      document.getElementById('sfxrValLpf').textContent = sfxrParams.p_lpf_freq.toFixed(2);

      synthesizeSfxrBuffer();
    }

    function synthesizeSfxrBuffer() {
      ensureAudioContext();
      const sampleRate = 44100;

      // Calculate envelope stages in samples
      const attackSamples = Math.floor(sfxrParams.p_env_attack * sfxrParams.p_env_attack * 100000);
      const sustainSamples = Math.floor(sfxrParams.p_env_sustain * sfxrParams.p_env_sustain * 100000);
      const decaySamples = Math.floor(sfxrParams.p_env_decay * sfxrParams.p_env_decay * 100000);
      const totalSamples = Math.max(100, attackSamples + sustainSamples + decaySamples);

      const buffer = audioCtx.createBuffer(2, totalSamples, sampleRate);
      const chL = buffer.getChannelData(0);
      const chR = buffer.getChannelData(1);

      let fperiod = 100.0 / (sfxrParams.p_base_freq * sfxrParams.p_base_freq + 0.001);
      let fmaxperiod = 100.0 / (sfxrParams.p_freq_limit * sfxrParams.p_freq_limit + 0.001);
      let fslide = 1.0 - Math.pow(sfxrParams.p_freq_ramp, 3.0) * 0.01;

      let square_duty = 0.5;
      let phase = 0;
      let env_stage = 0;
      let env_time = 0;
      let env_length = attackSamples;
      let env_vol = 0.0;

      // Noise buffer setup
      const noiseBuffer = new Float32Array(32);
      for (let i = 0; i < 32; i++) noiseBuffer[i] = Math.random() * 2 - 1;

      let lpf_pos = 0;
      let lpf_val = sfxrParams.p_lpf_freq * sfxrParams.p_lpf_freq * sfxrParams.p_lpf_freq * 0.1;

      for (let i = 0; i < totalSamples; i++) {
        // Frequency update
        fperiod *= fslide;
        if (fperiod > fmaxperiod) fperiod = fmaxperiod;
        let period = Math.floor(fperiod);
        if (period < 8) period = 8;

        // Vibrato
        let vib_phase = i * sfxrParams.p_vib_speed * 0.05;
        let vib = Math.sin(vib_phase) * sfxrParams.p_vib_strength * 0.5;
        period = Math.floor(period * (1.0 + vib));

        // Arpeggio
        if (sfxrParams.p_arp_mod !== 0 && i > (totalSamples * (1.0 - sfxrParams.p_arp_speed))) {
          period = Math.floor(period * (1.0 - sfxrParams.p_arp_mod * 0.5));
        }

        // Envelope ADSR
        env_time++;
        if (env_time > env_length) {
          env_time = 0;
          env_stage++;
          if (env_stage === 1) env_length = sustainSamples;
          else if (env_stage === 2) env_length = decaySamples;
        }

        if (env_stage === 0) {
          env_vol = attackSamples > 0 ? (env_time / attackSamples) : 1.0;
        } else if (env_stage === 1) {
          env_vol = 1.0 + (sustainSamples > 0 ? Math.pow(1.0 - (env_time / sustainSamples), 1.0) * 2.0 * sfxrParams.p_env_punch : 0);
        } else if (env_stage === 2) {
          env_vol = decaySamples > 0 ? (1.0 - (env_time / decaySamples)) : 0.0;
        } else {
          env_vol = 0.0;
        }

        // Oscillator wave generation
        phase++;
        if (phase >= period) phase %= period;
        const fp = phase / period;
        let sample = 0.0;

        switch (sfxrParams.wave_type) {
          case 0: // Square
            sample = fp < square_duty ? 0.75 : -0.75;
            break;
          case 1: // Sawtooth
            sample = 1.0 - fp * 2.0;
            break;
          case 2: // Sine
            sample = Math.sin(fp * Math.PI * 2);
            break;
          case 3: // Noise
            sample = noiseBuffer[Math.floor(fp * 32) % 32];
            break;
          case 4: // Triangle
            sample = fp < 0.5 ? (fp * 4.0 - 1.0) : (3.0 - fp * 4.0);
            break;
        }

        // Low-pass filter
        lpf_pos += (sample - lpf_pos) * lpf_val;
        sample = lpf_pos;

        // Apply volume envelope and master attenuation
        sample *= env_vol * 0.75;
        if (sample < -1) sample = -1;
        if (sample > 1) sample = 1;

        chL[i] = sample;
        chR[i] = sample;
      }

      currentSfxrBuffer = buffer;
    }

    function sfxrPlayPreview() {
      if (!currentSfxrBuffer) synthesizeSfxrBuffer();
      ensureAudioContext();

      const src = audioCtx.createBufferSource();
      src.buffer = currentSfxrBuffer;
      src.connect(masterGain);
      src.start();
    }

    function sfxrOpenInVisualizer() {
      if (!currentSfxrBuffer) synthesizeSfxrBuffer();
      const wavBytes = encodeToWavBytes(currentSfxrBuffer);
      vscode.postMessage({
        type: 'openVisualizer',
        data: wavBytes
      });
      showToast(STRINGS.sfxrOpenedInEditor);
    }

    function sfxrExportWav() {
      if (!currentSfxrBuffer) synthesizeSfxrBuffer();
      const wavBytes = encodeToWavBytes(currentSfxrBuffer);
      vscode.postMessage({
        type: 'saveAs',
        data: wavBytes
      });
    }

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Control' || e.key === 'Meta') {
        updateSelectionCursor(true);
      }

      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

      if (e.code === 'Space') {
        e.preventDefault();
        if (isPlaying) pause();
        else play();
      } else if (e.code === 'Delete') {
        if (selStartSec !== null && selEndSec !== null) deleteSelection(true);
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        btnUndo.click();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        btnRedo.click();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        if (selStartSec !== null && selEndSec !== null) btnCopy.click();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'x') {
        if (selStartSec !== null && selEndSec !== null) btnCut.click();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        if (clipboardBuffer) btnPaste.click();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveAudio(false);
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.key === 'Control' || e.key === 'Meta' || (!e.ctrlKey && !e.metaKey)) {
        updateSelectionCursor(false);
      }
    });

    // Equalizer sliders
    const eqSliders = [
      document.getElementById('eqBand0'),
      document.getElementById('eqBand1'),
      document.getElementById('eqBand2'),
      document.getElementById('eqBand3'),
      document.getElementById('eqBand4')
    ];
    const eqLabels = [
      document.getElementById('valEq0'),
      document.getElementById('valEq1'),
      document.getElementById('valEq2'),
      document.getElementById('valEq3'),
      document.getElementById('valEq4')
    ];

    eqSliders.forEach((sl, idx) => {
      sl.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        eqLabels[idx].textContent = (val > 0 ? '+' : '') + val + 'dB';
        if (eqFilters[idx]) {
          eqFilters[idx].gain.value = val;
        }
      });
    });

    // Presets
    const eqPresets = {
      flat: [0, 0, 0, 0, 0],
      bass: [7, 5, 0, -2, -1],
      vocal: [-3, 0, 3, 5, 2],
      chiptune: [-12, -4, 4, 6, -10],
      radio: [-15, -10, 8, 4, -14]
    };

    document.getElementById('selectEqPreset').addEventListener('change', (e) => {
      const preset = eqPresets[e.target.value] || eqPresets.flat;
      preset.forEach((val, i) => {
        eqSliders[i].value = val;
        eqLabels[i].textContent = (val > 0 ? '+' : '') + val + 'dB';
        if (eqFilters[i]) eqFilters[i].gain.value = val;
      });
    });

    // Apply EQ
    document.getElementById('btnApplyEq').addEventListener('click', async () => {
      if (!masterBuffer) return;
      ensureAudioContext();

      showToast(STRINGS.processingEq);

      const offlineCtx = new OfflineAudioContext(
        masterBuffer.numberOfChannels,
        masterBuffer.length,
        masterBuffer.sampleRate
      );

      const src = offlineCtx.createBufferSource();
      src.buffer = masterBuffer;

      const freqs = [60, 250, 1000, 4000, 12000];
      const types = ['lowshelf', 'peaking', 'peaking', 'peaking', 'highshelf'];

      const offFilters = freqs.map((f, i) => {
        const filter = offlineCtx.createBiquadFilter();
        filter.type = types[i];
        filter.frequency.value = f;
        filter.gain.value = parseFloat(eqSliders[i].value);
        return filter;
      });

      for (let i = 0; i < offFilters.length - 1; i++) {
        offFilters[i].connect(offFilters[i + 1]);
      }
      offFilters[offFilters.length - 1].connect(offlineCtx.destination);
      src.connect(offFilters[0]);
      src.start();

      const renderedBuffer = await offlineCtx.startRendering();
      setMasterBuffer(renderedBuffer);
      markDirty();
      showToast(STRINGS.eqApplied);
    });

    // EFFECTS IMPLEMENTATIONS
    // 1. Normalize
    document.getElementById('btnFxNormalize').addEventListener('click', () => {
      if (!masterBuffer) return;
      let maxPeak = 0;
      for (let ch = 0; ch < masterBuffer.numberOfChannels; ch++) {
        const data = masterBuffer.getChannelData(ch);
        for (let i = 0; i < data.length; i++) {
          const abs = Math.abs(data[i]);
          if (abs > maxPeak) maxPeak = abs;
        }
      }

      if (maxPeak === 0 || maxPeak >= 0.999) {
        showToast(STRINGS.alreadyNormalized);
        return;
      }

      const mult = 0.999 / maxPeak;
      const clone = cloneAudioBuffer(masterBuffer);
      for (let ch = 0; ch < clone.numberOfChannels; ch++) {
        const data = clone.getChannelData(ch);
        for (let i = 0; i < data.length; i++) {
          data[i] *= mult;
        }
      }

      setMasterBuffer(clone);
      markDirty();
      showToast(STRINGS.normalizedToast + (20 * Math.log10(mult)).toFixed(1) + ' dB)');
    });

    // 2. Fade In (Linear)
    document.getElementById('btnFxFadeIn').addEventListener('click', () => {
      if (!masterBuffer) return;
      const sSec = selStartSec !== null ? Math.min(selStartSec, selEndSec) : 0;
      const eSec = selEndSec !== null ? Math.max(selStartSec, selEndSec) : Math.min(2.0, masterBuffer.duration);
      const startSample = Math.floor(sSec * masterBuffer.sampleRate);
      const endSample = Math.floor(eSec * masterBuffer.sampleRate);
      const length = endSample - startSample;

      if (length <= 0) return;

      const clone = cloneAudioBuffer(masterBuffer);
      for (let ch = 0; ch < clone.numberOfChannels; ch++) {
        const data = clone.getChannelData(ch);
        for (let i = 0; i < length; i++) {
          const factor = i / length;
          data[startSample + i] *= factor;
        }
      }

      setMasterBuffer(clone);
      markDirty();
      showToast(STRINGS.fadeInLinear);
    });

    // 2.1 Fade In (Logarithmic)
    document.getElementById('btnFxFadeInLog').addEventListener('click', () => {
      if (!masterBuffer) return;
      const sSec = selStartSec !== null ? Math.min(selStartSec, selEndSec) : 0;
      const eSec = selEndSec !== null ? Math.max(selStartSec, selEndSec) : Math.min(2.0, masterBuffer.duration);
      const startSample = Math.floor(sSec * masterBuffer.sampleRate);
      const endSample = Math.floor(eSec * masterBuffer.sampleRate);
      const length = endSample - startSample;

      if (length <= 0) return;

      const clone = cloneAudioBuffer(masterBuffer);
      for (let ch = 0; ch < clone.numberOfChannels; ch++) {
        const data = clone.getChannelData(ch);
        for (let i = 0; i < length; i++) {
          const t = i / length;
          const factor = Math.log10(1 + 9 * t);
          data[startSample + i] *= factor;
        }
      }

      setMasterBuffer(clone);
      markDirty();
      showToast(STRINGS.fadeInLog);
    });

    // 3. Fade Out (Linear)
    document.getElementById('btnFxFadeOut').addEventListener('click', () => {
      if (!masterBuffer) return;
      const sSec = selStartSec !== null ? Math.min(selStartSec, selEndSec) : Math.max(0, masterBuffer.duration - 2.0);
      const eSec = selEndSec !== null ? Math.max(selStartSec, selEndSec) : masterBuffer.duration;
      const startSample = Math.floor(sSec * masterBuffer.sampleRate);
      const endSample = Math.floor(eSec * masterBuffer.sampleRate);
      const length = endSample - startSample;

      if (length <= 0) return;

      const clone = cloneAudioBuffer(masterBuffer);
      for (let ch = 0; ch < clone.numberOfChannels; ch++) {
        const data = clone.getChannelData(ch);
        for (let i = 0; i < length; i++) {
          const factor = 1.0 - (i / length);
          data[startSample + i] *= factor;
        }
      }

      setMasterBuffer(clone);
      markDirty();
      showToast(STRINGS.fadeOutLinear);
    });

    // 3.1 Fade Out (Logarithmic)
    document.getElementById('btnFxFadeOutLog').addEventListener('click', () => {
      if (!masterBuffer) return;
      const sSec = selStartSec !== null ? Math.min(selStartSec, selEndSec) : Math.max(0, masterBuffer.duration - 2.0);
      const eSec = selEndSec !== null ? Math.max(selStartSec, selEndSec) : masterBuffer.duration;
      const startSample = Math.floor(sSec * masterBuffer.sampleRate);
      const endSample = Math.floor(eSec * masterBuffer.sampleRate);
      const length = endSample - startSample;

      if (length <= 0) return;

      const clone = cloneAudioBuffer(masterBuffer);
      for (let ch = 0; ch < clone.numberOfChannels; ch++) {
        const data = clone.getChannelData(ch);
        for (let i = 0; i < length; i++) {
          const t = 1.0 - (i / length);
          const factor = Math.log10(1 + 9 * t);
          data[startSample + i] *= factor;
        }
      }

      setMasterBuffer(clone);
      markDirty();
      showToast(STRINGS.fadeOutLog);
    });

    // 4. Reverse
    document.getElementById('btnFxReverse').addEventListener('click', () => {
      if (!masterBuffer) return;
      const sSec = selStartSec !== null ? Math.min(selStartSec, selEndSec) : 0;
      const eSec = selEndSec !== null ? Math.max(selStartSec, selEndSec) : masterBuffer.duration;
      const startSample = Math.floor(sSec * masterBuffer.sampleRate);
      const endSample = Math.floor(eSec * masterBuffer.sampleRate);

      const clone = cloneAudioBuffer(masterBuffer);
      for (let ch = 0; ch < clone.numberOfChannels; ch++) {
        const data = clone.getChannelData(ch);
        const sub = data.subarray(startSample, endSample);
        sub.reverse();
      }

      setMasterBuffer(clone);
      markDirty();
      showToast(STRINGS.reversed);
    });

    // 5. Delay / Eco
    document.getElementById('btnFxDelay').addEventListener('click', async () => {
      if (!masterBuffer) return;
      showToast(STRINGS.generatingDelay);

      const delaySec = 0.24;
      const feedback = 0.45;
      const extraSec = 1.2;
      const totalLen = masterBuffer.length + Math.floor(extraSec * masterBuffer.sampleRate);

      const offlineCtx = new OfflineAudioContext(
        masterBuffer.numberOfChannels,
        totalLen,
        masterBuffer.sampleRate
      );

      const src = offlineCtx.createBufferSource();
      src.buffer = masterBuffer;

      const delay = offlineCtx.createDelay(2.0);
      delay.delayTime.value = delaySec;

      const fbGain = offlineCtx.createGain();
      fbGain.gain.value = feedback;

      src.connect(delay);
      delay.connect(fbGain);
      fbGain.connect(delay);

      src.connect(offlineCtx.destination);
      delay.connect(offlineCtx.destination);

      src.start();
      const rendered = await offlineCtx.startRendering();
      setMasterBuffer(rendered);
      markDirty();
      showToast(STRINGS.delayToast);
    });

    // 6. Reverb
    document.getElementById('btnFxReverb').addEventListener('click', async () => {
      if (!masterBuffer) return;
      showToast(STRINGS.generatingReverb);

      const reverbLen = 1.5;
      const totalLen = masterBuffer.length + Math.floor(reverbLen * masterBuffer.sampleRate);

      const offlineCtx = new OfflineAudioContext(
        masterBuffer.numberOfChannels,
        totalLen,
        masterBuffer.sampleRate
      );

      const irLen = Math.floor(reverbLen * masterBuffer.sampleRate);
      const impulseBuf = offlineCtx.createBuffer(2, irLen, masterBuffer.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const irData = impulseBuf.getChannelData(ch);
        for (let i = 0; i < irLen; i++) {
          irData[i] = (Math.random() * 2 - 1) * Math.pow(1 - (i / irLen), 2.5);
        }
      }

      const convolver = offlineCtx.createConvolver();
      convolver.buffer = impulseBuf;

      const wetGain = offlineCtx.createGain();
      wetGain.gain.value = 0.35;
      const dryGain = offlineCtx.createGain();
      dryGain.gain.value = 0.85;

      const src = offlineCtx.createBufferSource();
      src.buffer = masterBuffer;

      src.connect(convolver);
      convolver.connect(wetGain);
      wetGain.connect(offlineCtx.destination);

      src.connect(dryGain);
      dryGain.connect(offlineCtx.destination);

      src.start();
      const rendered = await offlineCtx.startRendering();
      setMasterBuffer(rendered);
      markDirty();
      showToast(STRINGS.reverbToast);
    });

    // 7. Amplificar (+3 dB)
    document.getElementById('btnFxGainUp').addEventListener('click', () => {
      if (!masterBuffer) return;
      const mult = Math.pow(10, 3.0 / 20);
      const sSec = selStartSec !== null ? Math.min(selStartSec, selEndSec) : 0;
      const eSec = selEndSec !== null ? Math.max(selStartSec, selEndSec) : masterBuffer.duration;
      const startSample = Math.floor(sSec * masterBuffer.sampleRate);
      const endSample = Math.floor(eSec * masterBuffer.sampleRate);

      const clone = cloneAudioBuffer(masterBuffer);
      for (let ch = 0; ch < clone.numberOfChannels; ch++) {
        const data = clone.getChannelData(ch);
        for (let i = startSample; i < endSample; i++) {
          data[i] = Math.max(-1.0, Math.min(1.0, data[i] * mult));
        }
      }

      setMasterBuffer(clone);
      markDirty();
      showToast(STRINGS.gainUpToast);
    });

    // 8. Atenuar (-3 dB)
    document.getElementById('btnFxGainDown').addEventListener('click', () => {
      if (!masterBuffer) return;
      const mult = Math.pow(10, -3.0 / 20);
      const sSec = selStartSec !== null ? Math.min(selStartSec, selEndSec) : 0;
      const eSec = selEndSec !== null ? Math.max(selStartSec, selEndSec) : masterBuffer.duration;
      const startSample = Math.floor(sSec * masterBuffer.sampleRate);
      const endSample = Math.floor(eSec * masterBuffer.sampleRate);

      const clone = cloneAudioBuffer(masterBuffer);
      for (let ch = 0; ch < clone.numberOfChannels; ch++) {
        const data = clone.getChannelData(ch);
        for (let i = startSample; i < endSample; i++) {
          data[i] *= mult;
        }
      }

      setMasterBuffer(clone);
      markDirty();
      showToast(STRINGS.gainDownToast);
    });

    // 9. Retro Bitcrusher (8-Bit)
    document.getElementById('btnFxBitcrush').addEventListener('click', () => {
      if (!masterBuffer) return;
      const sSec = selStartSec !== null ? Math.min(selStartSec, selEndSec) : 0;
      const eSec = selEndSec !== null ? Math.max(selStartSec, selEndSec) : masterBuffer.duration;
      const startSample = Math.floor(sSec * masterBuffer.sampleRate);
      const endSample = Math.floor(eSec * masterBuffer.sampleRate);
      const step = 1.0 / 128.0;

      const clone = cloneAudioBuffer(masterBuffer);
      for (let ch = 0; ch < clone.numberOfChannels; ch++) {
        const data = clone.getChannelData(ch);
        for (let i = startSample; i < endSample; i++) {
          data[i] = Math.round(data[i] / step) * step;
        }
      }

      setMasterBuffer(clone);
      markDirty();
      showToast(STRINGS.bitcrushToast);
    });

    // 10. Invertir Fase 180°
    document.getElementById('btnFxInvertPhase').addEventListener('click', () => {
      if (!masterBuffer) return;
      const sSec = selStartSec !== null ? Math.min(selStartSec, selEndSec) : 0;
      const eSec = selEndSec !== null ? Math.max(selStartSec, selEndSec) : masterBuffer.duration;
      const startSample = Math.floor(sSec * masterBuffer.sampleRate);
      const endSample = Math.floor(eSec * masterBuffer.sampleRate);

      const clone = cloneAudioBuffer(masterBuffer);
      for (let ch = 0; ch < clone.numberOfChannels; ch++) {
        const data = clone.getChannelData(ch);
        for (let i = startSample; i < endSample; i++) {
          data[i] = -data[i];
        }
      }

      setMasterBuffer(clone);
      markDirty();
      showToast(STRINGS.invertPhaseToast);
    });

    // WAV 16-bit PCM Encoder for Saving
    function encodeToWavBytes(audioBuf) {
      const numChannels = audioBuf.numberOfChannels;
      const numSamples = audioBuf.length;
      const sampleRate = audioBuf.sampleRate;
      const bytesPerSample = 2;
      const blockAlign = numChannels * bytesPerSample;
      const byteRate = sampleRate * blockAlign;
      const dataSize = numSamples * blockAlign;
      const bufferSize = 44 + dataSize;

      const buffer = new ArrayBuffer(bufferSize);
      const view = new DataView(buffer);

      function writeString(offset, str) {
        for (let i = 0; i < str.length; i++) {
          view.setUint8(offset + i, str.charCodeAt(i));
        }
      }

      writeString(0, 'RIFF');
      view.setUint32(4, 36 + dataSize, true);
      writeString(8, 'WAVE');

      writeString(12, 'fmt ');
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, numChannels, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, byteRate, true);
      view.setUint16(32, blockAlign, true);
      view.setUint16(34, 16, true);

      writeString(36, 'data');
      view.setUint32(40, dataSize, true);

      let offset = 44;
      for (let i = 0; i < numSamples; i++) {
        for (let ch = 0; ch < numChannels; ch++) {
          let s = audioBuf.getChannelData(ch)[i];
          if (s < -1) s = -1;
          else if (s > 1) s = 1;
          const int16 = s < 0 ? s * 32768 : s * 32767;
          view.setInt16(offset, Math.round(int16), true);
          offset += 2;
        }
      }

      return Array.from(new Uint8Array(buffer));
    }

    function saveAudio(isSaveAs = false) {
      if (!masterBuffer) return;
      showToast(STRINGS.encodingToast);
      const wavBytes = encodeToWavBytes(masterBuffer);
      vscode.postMessage({
        type: isSaveAs ? 'saveAs' : 'save',
        data: wavBytes
      });
    }

    btnSave.addEventListener('click', () => saveAudio(false));
    btnSaveAs.addEventListener('click', () => saveAudio(true));

    // Handle incoming messages from Host Extension
    window.addEventListener('message', async (event) => {
      const msg = event.data;
      switch (msg.type) {
        case 'initAudio': {
          ensureAudioContext();
          const uint8Array = new Uint8Array(msg.data);
          try {
            const decoded = await audioCtx.decodeAudioData(uint8Array.buffer.slice(0));
            setMasterBuffer(decoded, true);
            markClean();
          } catch (err) {
            vscode.postMessage({
              type: 'showError',
              message: (isSpanish ? 'Error al decodificar audio: ' : 'Error decoding audio: ') + (err.message || err)
            });
          }
          break;
        }

        case 'savedSuccess':
          markClean();
          showToast(STRINGS.savedToast);
          break;
      }
    });

    vscode.postMessage({ type: 'ready' });

    window.addEventListener('resize', () => {
      renderWaveform();
      renderTimeline();
    });
  </script>
</body>
</html>`;
  }
}
