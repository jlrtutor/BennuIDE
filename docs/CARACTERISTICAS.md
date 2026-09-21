# 🌟 Características Completas de BennuIDE

**BennuIDE** es una suite de desarrollo profesional, integral y multiplataforma diseñada para la creación, edición y depuración de videojuegos con **BennuGD2** y **BennuGD 1**.

---

## 📋 Índice de Módulos y Herramientas

1. [Asistente de Inicio y Dashboard Profesional](#1-asistente-de-inicio-y-dashboard-profesional)
2. [Explorador de Recursos del Juego (Game Resource Explorer)](#2-explorador-de-recursos-del-juego-game-resource-explorer)
3. [Soporte de Lenguaje y Servidor LSP Avanzado](#3-soporte-de-lenguaje-y-servidor-lsp-avanzado)
4. [Snippets y Patrones de Código para Videojuegos](#4-snippets-y-patrones-de-código-para-videojuegos)
5. [Sistema Dual de Compilación y Atajos de Teclado (v1 / v2)](#5-sistema-dual-de-compilación-y-atajos-de-teclado-v1--v2)
6. [Integración Git Visual y Control de Versiones](#6-integración-git-visual-y-control-de-versiones)
7. [Depurador Interactivo Integrado (DAP)](#7-depurador-interactivo-integrado-dap)
8. [Editor Visual de Paquetes de Sprites FPG](#8-editor-visual-de-paquetes-de-sprites-fpg)
9. [Editor y Rasterizador de Fuentes BGDFntEditor (FNT / FNX)](#9-editor-y-rasterizador-de-fuentes-bgdfnteditor-fnt--fnx)
10. [Editor de Audio y Generador SFX Chiptune Retro](#10-editor-de-audio-y-generador-sfx-chiptune-retro)
11. [Interfaz, Temas Visuales y Soporte Bilingüe](#11-interfaz-temas-visuales-y-soporte-bilingüe)

---

## 1. Asistente de Inicio y Dashboard Profesional

- **Pantalla de Bienvenida Inteligente (`WelcomePanel`):**
  - Se abre automáticamente al arrancar BennuIDE sin un espacio de trabajo abierto o mediante el botón `$(home) BennuIDE Inicio` en la barra de estado.
  - Indicador de estado del compilador en tiempo real (`🟢 BennuGD2 Listo` o `⚠️ Configuración requerida`).
  - **Historial de Proyectos Recientes:** Lista interactiva con indicador de motor (`V2`/`V1`), fecha de último acceso, buscador/filtro en vivo y opción para abrir con 1 clic o eliminar del historial.
  - **Acceso rápido a Demos:** Botón para explorar y ejecutar al instante el juego de demostración completo *Star Shooter 2D*.
  - **Configurador Rápido de Rutas:** Permite verificar y modificar las rutas de `bgdc` y `bgdi` con selector nativo de archivos sin editar archivos JSON manualmente.

- **Asistente de Nuevo Proyecto (Project Wizard):**
  - Formulario guiado con selector nativo de carpetas y previsualización de ruta en vivo.
  - Elección de versión de motor: **BennuGD 2 (Recomendado)** o **BennuGD 1 (Clásico)**.
  - **4 Plantillas completas de videojuegos:**
    1. 🚀 **Arcade 2D — Star Shooter:** Nave espacial, control por teclado, disparo continuo, oleadas de enemigos (`spawner`), colisiones (`collision()`), marcador y vidas.
    2. 🏃 **Plataformas 2D — Side Scroller:** Física de salto, gravedad, plataformas sólidas, scroll de cámara horizontal con `scroll_start()` y monedas coleccionables.
    3. 🧩 **Arquitectura Modular:** Máquina de estados (Título, Juego, Game Over), gestión de includes y estructuras escalables.
    4. 🎯 **Plantilla Mínima (Limpia):** Inicialización limpia con `set_mode()`, bucle sincronizado de frames y salida con ESC.
  - Selector de resolución (`1080p`, `720p`, `800x600`, `640x480`, `320x240`) y tasa de cuadros (`60`, `30`, `120 FPS`).
  - Generación automática de carpetas (`src/`, `data/fpg/`, `data/fnt/`, `data/audio/`, `.vscode/settings.json`, `.gitignore`, `README.md`) y apertura automática en el editor.

---

## 2. Explorador de Recursos del Juego (Game Resource Explorer)

- **Panel dedicado en la Barra de Actividades:**
  - Árbol clasificado de recursos para evitar navegar por carpetas genéricas del sistema operativo.
  - **Categorías automáticas:**
    - 🖼️ **Paquetes de Sprites (FPG):** Muestra todos los `.fpg` del proyecto con su tamaño; doble clic abre directamente el *FPG Editor*.
    - 🔤 **Fuentes Tipográficas (FNT / FNX):** Muestra fuentes `.fnt`, `.fnx` y `.fnt.gz`; doble clic abre el *FNT Editor*.
    - 🎵 **Efectos y Música (Audio):** Lista archivos `.wav`, `.ogg`, `.mp3`, `.flac`; doble clic abre el *Audio Editor*.
    - 🗺️ **Mapas e Imágenes:** Lista archivos `.map`, `.png`, `.bmp`.
    - 📄 **Código Fuente:** Lista archivos `.prg`, `.inc`, `.h`.
  - Botones de acción en la barra de título: `🔄 Actualizar`, `🏠 Inicio / Dashboard`, `➕ Nuevo Proyecto`.

---

## 3. Soporte de Lenguaje y Servidor LSP Avanzado

- **Resaltado de Sintaxis Completo:** Gramática TextMate optimizada para todas las palabras clave, declaraciones de procesos, funciones, estructuras (`STRUCT`), constantes, directivas de preprocesador (`#include`, `import`) y operadores de BennuGD2.
- **Autocompletado Inteligente:** Sugerencias contextuales de funciones nativas de todos los módulos (`mod_video`, `mod_map`, `mod_sound`, `mod_key`, etc.), variables de proceso predefinidas (`x`, `y`, `z`, `graph`, `flags`, `angle`, `alpha`, etc.) y constantes (`S_KILL`, `ALIGN_CENTER`, etc.).
- **Navegación y Búsqueda de Símbolos:**
  - *Ir a Definición* con `F12` o `Cmd/Ctrl + Clic`.
  - *Buscar Referencias* en todo el proyecto con `Shift + F12`.
  - *Renombrar Símbolo* en todo el proyecto con `F2` (con validación para proteger palabras clave reservadas).
- **Code Lens Interactivo:**
  - Muestra encima de cada `process`, `function` y `method` el número de referencias en el proyecto (`🔍 X referencias`) con navegación directa al hacer clic.
  - Muestra un botón `▶ Ejecutar Juego` encima de la declaración principal para compilar y lanzar el juego directamente.
- **Inlay Hints (Pistas Inline):**
  - Etiquetas visuales inline (`param:`) en los argumentos de llamadas a funciones nativas y procesos de usuario para clarificar el significado de cada parámetro.
- **Refactoring Automático de `#include`:**
  - Al renombrar o mover archivos `.inc`, `.prg` o `.h`, el IDE actualiza automáticamente todas las directivas `include` e `import` correspondientes en el espacio de trabajo.
- **Diagnósticos y Validación en Tiempo Real:**
  - Detección de llamadas a procesos o funciones no declarados.
  - Detección de identificadores y procesos duplicados en el mismo archivo.
  - Verificación de correspondencia de bloques `begin / end`.
  - Detección de cadenas de texto no cerradas.
  - Detección de código inalcanzable tras sentencias `return`.
- **Formateador de Documentos:** Indentación automática según las estructuras de control de BennuGD.

---

## 4. Snippets y Patrones de Código para Videojuegos

BennuIDE incluye una biblioteca de plantillas y snippets (`bennugd2.json`) para acelerar el desarrollo:
- `program`: Esqueleto completo de programa con imports y bucle principal.
- `process`: Definición de proceso con bloque private y bucle `loop frame; end`.
- `proc_player`: Actor jugador con movimiento en 4 direcciones por teclado y disparo con cooldown.
- `proc_enemy`: Actor enemigo con velocidad, movimiento y detección de colisión con proyectiles.
- `spawner`: Generador periódico de enemigos con temporizador aleatorio.
- `statemachine`: Estructura completa de máquina de estados de juego (`STATE_MENU`, `STATE_GAME`, `STATE_GAMEOVER`).
- `scroll_init`: Inicialización de viewport de scroll 2D con `scroll_start()`.
- `hud_score`: Marcador en pantalla con texto fijo y variable sincronizada con `write_var()`.
- `fpg_anim`: Bucle de ciclo de frames para animar sprites secuenciales.
- `struct`, `function`, `while`, `for`, `repeat`, `switch`, `global`, `local`, `private`, `const`.

---

## 5. Sistema Dual de Compilación y Atajos de Teclado (v1 / v2)

- **Soporte Multi-Versión:**
  - Perfil configurable para **BennuGD 2** (`bgdc` / `bgd2`, `bgdi`).
  - Perfil configurable para **BennuGD 1** (`bgdc v1`, `bgdi v1`).
- **Atajos de Teclado Oficiales:**
  - **`F5`** o **`Cmd/Ctrl + R`**: Compilar y Ejecutar el juego activo.
  - **`Shift + Cmd/Ctrl + B`**: Compilar archivo / proyecto.
  - **`F2`**: Renombrar símbolo en todo el proyecto.
  - **`Shift + F12`**: Buscar todas las referencias de un símbolo.
  - **`F12`**: Ir a la definición.
  - **`Cmd/Ctrl + Shift + H`**: Abrir Asistente de Inicio / Dashboard de BennuIDE.
- **Botones en la Barra de Estado (*Status Bar*):**
  - `$(home) BennuIDE Inicio`: Abre la pantalla de bienvenida y el asistente de proyectos.
  - `$(tools) BennuGD V2`: Muestra la versión activa y permite cambiarla con un clic.
  - `$(run) BennuGD Run`: Compilar y ejecutar juego.
  - `$(gear) Compile`: Compilar código con `bgdc`.
- **Captura Inteligente de Errores (*Problem Matcher*):**
  - La consola **`BennuGD Output`** captura errores y advertencias de compilación y los enlaza con el panel de *Problemas*, permitiendo saltar a la línea exacta con un clic.
- **Gestión de Procesos:**
  - Cierre automático de instancias previas antes de recompilar (`killPreviousOnRun`).

---

## 6. Integración Git Visual y Control de Versiones

- **Indicadores en la Barra de Estado (*Status Bar*):**
  - **Indicador de Rama y Estado (`$(git-branch) master*`):** Muestra la rama activa actual y añade un asterisco con el número de archivos modificados si hay cambios pendientes de confirmación.
  - **Indicador de Sincronización (`$(sync) 1↑ 0↓`):** Muestra el número de commits pendientes de subir (*Push*) y de descargar (*Pull*).
  - **Tooltip Informativo:** Muestra la rama, hash y mensaje del último commit, autor, fecha y estado de sincronización.
- **Menú Interactivo de Git:**
  - Al hacer clic en el botón de rama, se despliega un menú rápido con las acciones esenciales:
    - 🔄 **Sincronizar Cambios (*Pull & Push*):** Descarga los últimos cambios remotos y sube los commits locales con barra de progreso.
    - ⬇️ **Hacer Pull (*Descargar*):** Incorpora los commits remotos a la rama actual.
    - ⬆️ **Hacer Push (*Subir*):** Envía los commits locales al repositorio remoto.
    - 💾 **Commit Rápido...:** Solicita un mensaje de commit, agrega automáticamente los archivos modificados (`git add -A`) y genera el commit.
    - 🌿 **Cambiar o Crear Rama...:** Permite cambiar a cualquier rama local o remota existente o crear una nueva rama de desarrollo con nombre personalizado.
    - 📋 **Ver Historial de Commits:** Muestra los últimos commits con autor y fecha, permitiendo copiar el hash SHA al portapapeles con un clic.
- **Observador Automático:** Detecta en tiempo real los cambios generados por Git o modificaciones de archivos en el disco para mantener la interfaz siempre actualizada.

---

## 7. Depurador Interactivo Integrado (DAP)

- Compatible con el protocolo estándar de depuración de VSCode (**Debug Adapter Protocol**).
- Soporte para:
  - Puntos de interrupción (*Breakpoints*) y puntos de interrupción condicionales.
  - Ejecución paso a paso (*Step Over*, *Step Into*, *Step Out*, *Continue*).
  - Inspección de variables locales, globales y propiedades del proceso actual.
  - Pila de llamadas (*Call Stack*) y visualización de procesos activos.

---

## 8. Editor Visual de Paquetes de Sprites FPG

- **Inspección de Archivos `.fpg`:**
  - Visualización en cuadrícula de todos los gráficos contenidos con su código de gráfico (ID), dimensiones y profundidad de color (8, 16 o 32 bpp).
- **Gestión de Puntos de Control (*Control Points*):**
  - Edición visual mediante puntero del punto central (0) y puntos de anclaje (1..999).
- **Importación y Exportación:**
  - Inserción y reemplazo de sprites individuales desde archivos PNG y BMP con preservación de canal alfa y paletas.
  - Exportación de sprites individuales o paquetes completos.
- **Previsualización de Animaciones:**
  - Reproducción secuencial en bucle de secuencias de frames con control de FPS.

---

## 9. Editor y Rasterizador de Fuentes BGDFntEditor (FNT / FNX)

- **Compatibilidad de Formatos:**
  - Soporte de lectura y escritura para fuentes modernas **FNX** de 32 bits y fuentes clásicas **FNT** de 8 bits (DIV / BennuGD con paleta y gamma), 16 bits (RGB565) y 32 bits (XRGB8888).
  - Soporte automático para archivos comprimidos con **Gzip** (`.fnt.gz`).
- **Conversor y Rasterizador de TrueType (`.ttf` / `.otf`):**
  - Selección de familias tipográficas del sistema o archivos TrueType locales.
  - Control de tamaño en píxeles (`px`) y tabla de métricas (*Ascendente, Descendente, Altura de línea*).
- **Efectos Avanzados en Tiempo Real:**
  - **Antialiasing:** Modo *Sin AA* (precisión pixel-art con binarización nítida), *Normal* y *Fuerte*.
  - **Color y Transparencia:** Sliders y selectores RGB sincronizados para color de fuente y nivel de opacidad (*alpha*).
  - **Reborde (*Stroke*):** Control de activación `[x] Activar`, grosor en píxeles, color RGB y nivel de alpha.
  - **Sombra (*Shadow*):** Control de activación `[x] Activar`, **Matriz de Dirección 3x3** (9 direcciones cardinales y diagonales), slider de distancia en píxeles, selector RGB y opacidad.
- **Vista Previa en Vivo y Atlas de Glifos:**
  - Cuadro de texto multilínea editable con selector de color de fondo y zoom interactivo.
  - Atlas de 256 slots con cuadrícula de espacio garantizado para fuentes de cualquier resolución.

---

## 10. Editor de Audio y Generador SFX Chiptune Retro

- **Visualizador y Editor de Formas de Onda:**
  - Soporte multi-canal estéreo/mono para archivos de audio (`.wav`, `.ogg`, `.mp3`, `.flac`).
  - Renderizado con *clipping* estricto por canal y separación visual (`CANAL I / CANAL D`).
  - Vúmetro dinámico y visualización de tiempo en formato `MM:SS.mmm`.
  - Zoom interactivo inteligente: Clic para Zoom IN, `Ctrl/Cmd + Clic` para Zoom OUT.
- **Rack de Efectos y Procesamiento de Señal:**
  - Normalización a 0 dB, -1 dB y -3 dB.
  - Atenuación y Amplificación (+3 dB / -3 dB).
  - *Fade In* y *Fade Out* lineal y logarítmico (curvas exponenciales de caída suave).
  - Inversión de fase (180°) e inversión temporal (*Reverse*).
  - *Bitcrusher Retro de 8 bits* (cuantización y reducción de resolución digital).
  - Ecualizador gráfico de 5 bandas (60 Hz, 250 Hz, 1 kHz, 4 kHz, 12 kHz).
- **Generador Procedural SFX Retro (Sintetizador Chiptune / SFXR):**
  - **Presets instantáneos:** Láser, Explosión, Moneda, Salto, Golpe, Power-Up, Blip y Aleatorio.
  - **Formas de Onda:** Cuadrada (*Square*), Triangular (*Triangle*), Diente de sierra (*Sawtooth*) y Ruido blanco (*Noise*).
  - **Controles de Síntesis:** Envolvente ADSR de precisión, Pitch inicial, Pitch sweep, saltos de frecuencia, ciclo de modulación PWM y filtro paso-bajo.
  - **Botón Mutar Actual:** Variaciones controladas sobre el efecto sonoro activo.
  - **Exportar a WAV:** Guardado directo a disco con selector nativo de archivos.

---

## 11. Interfaz, Temas Visuales y Soporte Bilingüe

- **Temas Oficiales de BennuIDE:**
  - **BennuIDE Dark:** Paleta oscura elegante basada en *One Dark Pro* con contrastes optimizados.
  - **BennuIDE Light:** Tema claro de alto contraste.
- **Iconografía Oficial BennuIDE:** Iconos personalizados para archivos `.prg`, `.inc`, `.fpg`, `.fnt`, `.fnx`, `.dcb` y `.map`.
- **Soporte Bilingüe Automático (Español / Inglés):**
  - Detección automática del idioma del sistema operativo.
  - Traducción completa de barras de menús, paneles de control, botones, editores visuales y herramientas de desarrollo.

