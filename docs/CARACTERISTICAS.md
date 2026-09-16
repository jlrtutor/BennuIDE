# 🌟 Características Completas de BennuIDE

**BennuIDE** es una suite de desarrollo profesional, integral y multiplataforma diseñada para la creación, edición y depuración de videojuegos con **BennuGD2** y **BennuGD 1**.

---

## 📋 Índice de Módulos y Herramientas

1. [Soporte de Lenguaje y Servidor LSP](#1-soporte-de-lenguaje-y-servidor-lsp)
2. [Sistema Dual de Compilación y Ejecución (v1 / v2)](#2-sistema-dual-de-compilación-y-ejecución-v1--v2)
3. [Depurador Interactivo Integrado (DAP)](#3-depurador-interactivo-integrado-dap)
4. [Editor Visual de Paquetes de Sprites FPG](#4-editor-visual-de-paquetes-de-sprites-fpg)
5. [Editor y Rasterizador de Fuentes BGDFntEditor (FNT / FNX)](#5-editor-y-rasterizador-de-fuentes-bgdfnteditor-fnt--fnx)
6. [Editor de Audio y Generador SFX Chiptune Retro](#6-editor-de-audio-y-generador-sfx-chiptune-retro)
7. [Interfaz, Temas Visuales y Soporte Bilingüe](#7-interfaz-temas-visuales-y-soporte-bilingüe)

---

## 1. Soporte de Lenguaje y Servidor LSP

- **Resaltado de Sintaxis Completo:** Gramática TextMate optimizada para todas las palabras clave, declaraciones de procesos, funciones, estructuras (`STRUCT`), constantes, directivas de preprocesador (`#include`, `import`) y operadores de BennuGD2.
- **Servidor de Lenguaje (LSP):**
  - Autocompletado inteligente de funciones nativas de todos los módulos (`mod_video`, `mod_map`, `mod_sound`, `mod_key`, etc.).
  - Definiciones e hipervínculos de código (*Go to Definition* con `F12` o `Cmd/Ctrl + Clic`).
  - Detección de símbolos y estructura de documentos en el panel *Esquema* (*Outline*).
  - Plegado de código (*Code Folding*) para bloques de procesos, funciones y estructuras.

---

## 2. Sistema Dual de Compilación y Ejecución (v1 / v2)

- **Soporte Multi-Versión:**
  - Perfil configurable para **BennuGD 2** (`bgdc` / `bgd2`, `bgdi`).
  - Perfil configurable para **BennuGD 1** (`bgdc v1`, `bgdi v1`).
- **Botones en el Editor:**
  - Al editar cualquier archivo `.prg`, `.inc` o `.bgd`, la barra superior incluye botones directos para **Compilar**, **Compilar y Ejecutar** y **Cambiar Versión**.
- **Selector de Versión en la Barra de Estado (*Status Bar*):**
  - Muestra la versión actual (`$(tools) BennuGD v2` o `$(tools) BennuGD v1`) y permite cambiar la versión activa del proyecto con un solo clic.
- **Captura Inteligente de Errores (*Problem Matcher*):**
  - La consola **`BennuGD Output`** captura advertencias y errores de compilación y los enlaza automáticamente con el panel de *Problemas* de BennuIDE, permitiendo saltar a la línea y archivo causante del error.
- **Gestión de Procesos:**
  - Cierre automático de instancias en ejecución antes de volver a compilar y ejecutar (`killPreviousOnRun`).

---

## 3. Depurador Interactivo Integrado (DAP)

- Compatible con el protocolo estándar de depuración de VSCode (**Debug Adapter Protocol**).
- Soporte para:
  - Puntos de interrupción (*Breakpoints*) y puntos de interrupción condicionales.
  - Ejecución paso a paso (*Step Over*, *Step Into*, *Step Out*, *Continue*).
  - Inspección de variables locales, globales y propiedades del proceso actual.
  - Pila de llamadas (*Call Stack*) y visualización de procesos activos.

---

## 4. Editor Visual de Paquetes de Sprites FPG

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

## 5. Editor y Rasterizador de Fuentes BGDFntEditor (FNT / FNX)

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
  - Cuadro de texto multilínea editable con selector de color de fondo (sólido o patrón damero transparente) y zoom interactivo (Ajustar, 1:1, slider porcentual).
  - Atlas de 256 slots con cuadrícula de espacio garantizado para fuentes de cualquier resolución y modo de alternancia para visualizar el glifo o su código hexadecimal/decimal.

---

## 6. Editor de Audio y Generador SFX Chiptune Retro

- **Visualizador y Editor de Formas de Onda:**
  - Soporte multi-canal estéreo/mono para archivos de audio (`.wav`, `.ogg`, `.mp3`, `.flac`).
  - Renderizado con *clipping* estricto por canal y separación visual (`CANAL I / CANAL D` en español, `CANAL L / CANAL R` en inglés).
  - Vúmetro dinámico y visualización de tiempo en formato `MM:SS.mmm`.
  - Zoom interactivo inteligente: Clic para Zoom IN, `Ctrl/Cmd + Clic` para Zoom OUT.
- **Rack de Efectos y Procesamiento de Señal:**
  - Normalización a 0 dB, -1 dB y -3 dB.
  - Atenuación y Amplificación (+3 dB / -3 dB).
  - *Fade In* y *Fade Out* lineal y logarítmico (curvas exponenciales de caída suave).
  - Inversión de fase (180°) e inversión temporal (*Reverse*).
  - *Bitcrusher Retro de 8 bits* (cuantización y reducción de resolución digital).
  - Ecualizador gráfico de 5 bandas (60 Hz, 250 Hz, 1 kHz, 4 kHz, 12 kHz) con previsualización en tiempo real.
- **Generador Procedural SFX Retro (Sintetizador Chiptune / SFXR):**
  - **Presets instantáneos de videojuegos:** Láser, Explosión, Moneda, Salto, Golpe, Power-Up, Blip y Aleatorio.
  - **Formas de Onda:** Cuadrada (*Square*), Triangular (*Triangle*), Diente de sierra (*Sawtooth*) y Ruido blanco (*Noise*).
  - **Controles de Síntesis:** Envolvente ADSR de precisión (Ataque, Sostenido, Decaimiento), Pitch inicial, Pitch sweep, saltos de frecuencia, ciclo de modulación PWM y filtro paso-bajo.
  - **Botón Mutar Actual:** Introduce variaciones aleatorias controladas sobre el efecto sonoro activo.
  - **Botón Abrir en visualizador:** Genera al instante un documento `.wav` independiente con nombre aleatorio (`sfx_XXXX.wav`) y lo abre en su propia pestaña sin sobreescribir la pista original.
  - **Exportar a WAV:** Guardado directo a disco con selector nativo de archivos.

---

## 7. Interfaz, Temas Visuales y Soporte Bilingüe

- **Temas Oficiales de BennuIDE:**
  - **BennuIDE Dark:** Paleta oscura elegante basada en *One Dark Pro* con contrastes ajustados para desarrollo de videojuegos.
  - **BennuIDE Light:** Tema claro de alto contraste inspirado en entornos de scripting clásicos.
- **Soporte Bilingüe Automático (Español / Inglés):**
  - Detección automática del idioma del sistema operativo y entorno.
  - Traducción completa de barras de menús, paneles de control, botones, diálogos flotantes (*toasts*), editores visuales y herramientas de síntesis.
