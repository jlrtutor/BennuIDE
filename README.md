# BennuIDE — Game Studio

**BennuIDE** es un entorno de desarrollo integrado (IDE) profesional y multiplataforma diseñado específicamente para la creación de videojuegos con los lenguajes **BennuGD2** y **BennuGD 1**.

Basado en el motor de código abierto **Code-OSS**, BennuIDE integra en una única aplicación todas las herramientas esenciales para el desarrollo de videojuegos: asistente de inicio con plantillas, explorador visual de recursos, edición de código inteligente con LSP avanzado, compilación y ejecución multi-versión, depuración interactiva, editores visuales de sprites FPG, fuentes bitmap FNT/FNX y estudio de audio con sintetizador chiptune retro.

---

## 🌟 Características Principales

- 🏠 **Asistente de Inicio y Dashboard Profesional (`WelcomePanel`)**:
  - Pantalla de bienvenida con comprobación en vivo del compilador (`🟢 BennuGD2 Listo` / `⚠️ Configuración requerida`).
  - **Historial de Proyectos Recientes**: Apertura rápida con 1 clic, motor activo y buscador integrado.
  - **Asistente de Nuevo Proyecto (Project Wizard)**: Generador guiado con 4 plantillas de juegos (Arcade 2D Star Shooter, Plataformas 2D Side-Scroller, Arquitectura Modular y Plantilla Mínima), selección de resolución, versión v1/v2 y estructura automática de carpetas (`src/`, `data/fpg/`, `data/fnt/`, `data/audio/`, `.vscode/settings.json`, `.gitignore`, `README.md`).
  - Botón de acceso directo en la barra de estado: `$(home) BennuIDE Inicio`.
- 📁 **Explorador de Recursos del Juego (Game Resource Explorer)**:
  - Panel lateral dedicado en la barra de actividades con árbol clasificado de assets (Sprites FPG, Fuentes FNT/FNX, Audio & Música, Mapas e Imágenes, Código Fuente).
  - Apertura automática en sus respectivos editores visuales integrados con doble clic.
- 📝 **Soporte Oficial de Lenguaje & LSP Avanzado**:
  - Resaltado de sintaxis TextMate optimizado.
  - **Code Lens**: Conteo interactivo de referencias encima de cada proceso (`🔍 X referencias`) y botón `▶ Ejecutar Juego`.
  - **Inlay Hints**: Etiquetas visuales de parámetros inline (`param:`) en llamadas a funciones y procesos.
  - **Refactorización Inteligente**: Renombrar símbolo en todo el proyecto (<kbd>F2</kbd>), buscar referencias (<kbd>Shift</kbd> + <kbd>F12</kbd>), ir a definición (<kbd>F12</kbd>) y actualización automática de directivas `include` e `import` al renombrar o mover archivos.
  - **Diagnósticos en Tiempo Real**: Detección de procesos/funciones no declarados, símbolos duplicados, bloques `begin/end` no balanceados, cadenas no cerradas y código inalcanzable.
  - **Biblioteca de Snippets**: Plantillas para patrones comunes de videojuegos (jugador, enemigos, spawner, máquina de estados, scroll 2D, HUD).
- 🎮 **Compilación y Ejecución Integrada (BennuGD v1 & v2)**:
  - Atajos rápidos: <kbd>F5</kbd> o <kbd>Cmd/Ctrl</kbd> + <kbd>R</kbd> para compilar y ejecutar, <kbd>Shift</kbd> + <kbd>Cmd/Ctrl</kbd> + <kbd>B</kbd> para compilar.
  - Botones dedicados en la barra superior del editor y selector rápido de versión en la barra de estado (`$(tools) BennuGD V2`).
  - Consola **`BennuGD Output`** con captura automática de errores vinculados al panel de *Problemas*.
- 🐞 **Depurador Interactivo (DAP)**:
  - Puntos de interrupción (*breakpoints*), ejecución paso a paso e inspección de variables en memoria y pila de llamadas.
- 🖼️ **Editor Visual de Paquetes de Sprites FPG**:
  - Inspección en cuadrícula, edición de puntos de control (*Control Points*), previsualización de animaciones e importación/exportación de PNG/BMP.
- 🔤 **Editor y Rasterizador de Fuentes BGDFntEditor (FNT / FNX)**:
  - Generación de fuentes bitmap a partir de archivos TrueType (`.ttf`/`.otf`).
  - Soporte para fuentes modernas **FNX** de 32 bits y clásicas **FNT** de 8 bits (con paleta y gamma), 16 y 32 bits.
  - Antialiasing pixel-art (*Sin AA*, *Normal*, *Fuerte*), control de reborde y matriz de sombra 3x3.
- 🔊 **Editor de Audio y Generador SFX Chiptune Retro**:
  - Visualizador de formas de onda mono/estéreo con zoom interactivo.
  - Rack de efectos: Fade In/Out (lineal y logarítmico), Normalización, Bitcrusher 8-bit, Inversión de fase y Ecualizador de 5 bandas.
  - Sintetizador procedimental chiptune con 8 presets de videojuegos (Láser, Explosión, Moneda, Salto, Golpe, Power-Up, Blip) y botón de mutación.
- 🎨 **Temas Oficiales y Soporte Bilingüe**:
  - **BennuIDE Dark** (*One Dark Pro*) y **BennuIDE Light**.
  - Interfaz totalmente bilingüe (Español e Inglés con autodetección).

---

## 📚 Documentación Detallada

- 🛠️ [**Guía de Configuración de Rutas (BennuGD v1 y v2)**](file:///Users/jlrtutor/Projects/BennuIDE/docs/CONFIGURACION_RUTAS.md)
- 📖 [**Documentación Completa de Características y Módulos**](file:///Users/jlrtutor/Projects/BennuIDE/docs/CARACTERISTICAS.md)
- 📋 [**Hoja de Ruta y Estado de Desarrollo (TODO)**](file:///Users/jlrtutor/Projects/BennuIDE/TODO.md)

---

## ⚙️ Cómo Configurar los Compiladores y Rutas de Ejecución

BennuIDE viene configurado por defecto para buscar `bgdc` y `bgdi` en el `PATH` del sistema. Si tienes tus ejecutables en una ruta personalizada o deseas configurar versiones específicas (BennuGD v1 o v2), sigue cualquiera de los siguientes dos métodos:

### 🔹 Método 1: Desde el Asistente de Inicio / Ajustes de BennuIDE

1. Haz clic en **`$(home) BennuIDE Inicio`** en la barra de estado y ve a la pestaña **`Compilador y Rutas`** (o presiona <kbd>Cmd/Ctrl</kbd> + <kbd>,</kbd> y busca **`BennuGD`**).
2. Selecciona la versión que usas y especifica las rutas:

| Ajuste | Descripción | Ejemplo Windows | Ejemplo macOS / Linux |
| :--- | :--- | :--- | :--- |
| **`bennugd.version`** | Versión activa por defecto (`v2` o `v1`) | `v2` | `v2` |
| **`bennugd.v2.compilerPath`** | Ruta al compilador de BennuGD 2 | `C:\BennuGD2\bin\bgdc.exe` | `/opt/bennugd2/bin/bgdc` o `~/bennugd2/build/bin/bgdc` |
| **`bennugd.v2.runtimePath`** | Ruta al intérprete/runner de BennuGD 2 | `C:\BennuGD2\bin\bgdi.exe` | `/opt/bennugd2/bin/bgdi` o `~/bennugd2/build/bin/bgdi` |
| **`bennugd.v1.compilerPath`** | Ruta al compilador de BennuGD 1 clásico | `C:\BennuGD_v1\bgdc.exe` | `/usr/local/bennugd1/bin/bgdc` |
| **`bennugd.v1.runtimePath`** | Ruta al intérprete de BennuGD 1 clásico | `C:\BennuGD_v1\bgdi.exe` | `/usr/local/bennugd1/bin/bgdi` |

> 💡 **Nota Multiplataforma:** BennuIDE detecta e inyecta automáticamente las variables de entorno necesarias (`PATH`, `DYLD_LIBRARY_PATH`, `LD_LIBRARY_PATH` y `BGD2DEV`), resolviendo dependencias dinámicas como `mod_*.dylib`, `mod_*.so` o `mod_*.dll` sin que tengas que configurar scripts adicionales.

---

### 🔹 Método 2: Por Proyecto Mediante `.vscode/settings.json` *(Recomendado para Equipos)*

Si trabajas en un proyecto o repositorio compartido, puedes incluir un archivo `.vscode/settings.json` en la raíz de tu proyecto. BennuIDE soporta variables dinámicas como `${workspaceFolder}` y `~`:

```json
{
  "bennugd.version": "v2",
  "bennugd.mainFile": "src/main.prg",
  "bennugd.killPreviousOnRun": true,
  "bennugd.clearOutputBeforeCompile": true,

  "bennugd.v2.compilerPath": "${workspaceFolder}/tools/bin/bgdc",
  "bennugd.v2.runtimePath": "${workspaceFolder}/tools/bin/bgdi",
  "bennugd.v2.compilerArgs": [],
  "bennugd.v2.includePaths": [
    "${workspaceFolder}/modules",
    "${workspaceFolder}/src"
  ]
}
```

---

### 🚀 Cómo Compilar y Ejecutar tu Juego

Una vez configuradas las rutas, abre cualquier archivo `.prg`, `.inc` o `.bgd`:

1. **Atajo <kbd>F5</kbd> o <kbd>Cmd/Ctrl</kbd> + <kbd>R</kbd>** (o botón `▶ BennuGD Run` en la barra de estado / editor).
2. **Atajo <kbd>Shift</kbd> + <kbd>Cmd/Ctrl</kbd> + <kbd>B</kbd>** (o botón `⚙ Compile`) para generar el archivo binario `.dcb` sin lanzar el juego.
3. **Selector de Versión `🛠 BennuGD V2`** en la barra de estado inferior para alternar entre BennuGD 1 y BennuGD 2 en cualquier momento.
