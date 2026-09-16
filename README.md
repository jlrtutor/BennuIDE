# BennuIDE — Game Studio

**BennuIDE** es un entorno de desarrollo integrado (IDE) profesional y multiplataforma diseñado específicamente para la creación de videojuegos con los lenguajes **BennuGD2** y **BennuGD 1**.

Basado en el motor de código abierto **Code-OSS**, BennuIDE integra en una única aplicación todas las herramientas esenciales para el desarrollo de videojuegos: edición de código inteligente, compilación y ejecución multi-versión, depuración interactiva, editores visuales de sprites FPG, fuentes bitmap FNT/FNX y estudio de audio con sintetizador chiptune retro.

---

## 🌟 Características Principales

- 🎮 **Compilación y Ejecución Integrada (BennuGD v1 & v2)**:
  - Botones dedicados en la barra superior del editor: **`▶ Compilar y Ejecutar`**, **`⚙ Compilar`** y **`🛠 Selector de Versión`**.
  - Selector rápido de versión en la barra de estado: cambia entre **BennuGD v2** y **BennuGD v1** con un solo clic.
  - Secciones de configuración independientes en Ajustes para rutas de compiladores (`bgdc`), intérpretes (`bgdi`), argumentos e includes.
  - Consola **`BennuGD Output`** con captura automática de errores vinculados al panel de *Problemas*.
- 📝 **Soporte Oficial de Lenguaje & LSP**:
  - Resaltado de sintaxis TextMate optimizado.
  - Servidor de Lenguaje (**LSP**) con autocompletado inteligente, ir a definición (`F12`), inspección de tipos y esquema de símbolos.
- 🐞 **Depurador Interactivo (DAP)**:
  - Puntos de interrupción (*breakpoints*), ejecución paso a paso e inspección de variables en memoria y pila de llamadas.
- 🖼️ **Editor Visual de Paquetes de Sprites FPG**:
  - Inspección, edición de puntos de control (*Control Points*), previsualización de animaciones e importación/exportación de PNG/BMP.
- 🔤 **Editor y Rasterizador de Fuentes BGDFntEditor (FNT / FNX)**:
  - Generación de fuentes bitmap a partir de archivos TrueType (`.ttf`/`.otf`).
  - Soporte completo para fuentes modernas **FNX** de 32 bits y clásicas **FNT** de 8 bits (con paleta y gamma), 16 y 32 bits.
  - Antialiasing pixel-art (*Sin AA*, *Normal*, *Fuerte*), control de reborde y matriz de sombra 3x3.
- 🔊 **Editor de Audio y Generador SFX Chiptune Retro**:
  - Visualizador de formas de onda mono/estéreo con zoom interactivo.
  - Rack de efectos: Fade In/Out (lineal y logarítmico), Normalización, Bitcrusher 8-bit, Inversión de fase y Ecualizador de 5 bandas.
  - Sintetizador procedimental chiptune con 8 presets de videojuegos (Láser, Explosión, Moneda, Salto, Golpe, Power-Up, Blip) y botón de mutación.
- 🎨 **Temas Oficiales y Soporte Bilingüe**:
  - **BennuIDE Dark** (*One Dark Pro*) y **BennuIDE Light** (*PowerShell ISE*).
  - Interfaz totalmente bilingüe (Español e Inglés con autodetección).

---

## 📚 Documentación Detallada

- 🛠️ [**Guía de Configuración de Rutas (BennuGD v1 y v2)**](file:///Users/jlrtutor/Projects/BennuIDE/docs/CONFIGURACION_RUTAS.md)
- 📖 [**Documentación Completa de Características y Módulos**](file:///Users/jlrtutor/Projects/BennuIDE/docs/CARACTERISTICAS.md)

---

---

## ⚙️ Cómo Configurar los Compiladores y Rutas de Ejecución

BennuIDE viene configurado por defecto para buscar `bgdc` y `bgdi` en el `PATH` del sistema. Si tienes tus ejecutables en una ruta personalizada o deseas configurar versiones específicas (BennuGD v1 o v2), sigue cualquiera de los siguientes dos métodos:

### 🔹 Método 1: Desde la Interfaz Gráfica (Ajustes Globales de BennuIDE)

1. Abre los **Ajustes**:
   - **macOS:** Presiona <kbd>Cmd</kbd> + <kbd>,</kbd> (o menú *BennuIDE* → *Ajustes* → *Ajustes*).
   - **Windows / Linux:** Presiona <kbd>Ctrl</kbd> + <kbd>,</kbd> (o menú *Archivo* → *Preferencias* → *Ajustes*).
2. En la barra de búsqueda superior, escribe **`BennuGD`**.
3. Rellena los campos correspondientes a la versión que uses:

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
  "bennugd.mainFile": "main.prg",
  "bennugd.killPreviousOnRun": true,
  "bennugd.clearOutputBeforeCompile": true,

  "bennugd.v2.compilerPath": "${workspaceFolder}/tools/bin/bgdc",
  "bennugd.v2.runtimePath": "${workspaceFolder}/tools/bin/bgdi",
  "bennugd.v2.compilerArgs": [],
  "bennugd.v2.includePaths": [
    "${workspaceFolder}/modules",
    "${workspaceFolder}/include"
  ]
}
```

---

### 🚀 Cómo Compilar y Ejecutar tu Juego

Una vez configuradas las rutas, abre cualquier archivo `.prg`, `.inc` o `.bgd`:

1. **Botón `▶ Compilar y Ejecutar`** en la esquina superior derecha del editor (o atajo predeterminado).
2. **Botón `⚙ Compilar`** para generar el archivo binario `.dcb` sin lanzar el juego.
3. **Selector de Versión `🛠 BennuGD v2`** en la barra de estado inferior para alternar entre BennuGD 1 y BennuGD 2 en cualquier momento.

Si ocurre algún error de sintaxis durante la compilación, la consola **BennuGD Output** mostrará el detalle con enlaces directos y el panel de **Problemas** (*Problems*) te permitirá saltar a la línea exacta del código haciendo clic.

---

## 💻 Plataformas Soportadas

- **macOS** (Apple Silicon arm64 y procesadores Intel x64)
- **Windows** (x64, arm64)
- **Linux** (x64)

---

## 📄 Licencia

Este proyecto está distribuido bajo la licencia **MIT** con atribución.  
© 2026 Juan Luis Ramírez Tutor.

