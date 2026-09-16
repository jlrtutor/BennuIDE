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

## ⚙️ Configuración Rápida de Rutas

Para configurar las rutas de tus compiladores:
1. Abre los **Ajustes** (`Cmd + ,` en macOS / `Ctrl + ,` en Windows y Linux).
2. Busca **`BennuGD`**.
3. Especifica las rutas de tus binarios:
   - **BennuGD v2:** `bennugd.v2.compilerPath` (`bgdc`) y `bennugd.v2.runtimePath` (`bgdi`).
   - **BennuGD v1:** `bennugd.v1.compilerPath` (`bgdc`) y `bennugd.v1.runtimePath` (`bgdi`).

También puedes configurarlo por proyecto en `.vscode/settings.json`:

```json
{
  "bennugd.version": "v2",
  "bennugd.mainFile": "main.prg",
  "bennugd.v2.compilerPath": "/usr/local/bin/bgdc",
  "bennugd.v2.runtimePath": "/usr/local/bin/bgdi"
}
```

---

## 💻 Plataformas Soportadas

- **macOS** (Apple Silicon arm64 y procesadores Intel x64)
- **Windows** (x64, arm64)
- **Linux** (x64)

---

## 📄 Licencia

Este proyecto está distribuido bajo la licencia **MIT** con atribución.  
© 2026 Juan Luis Ramírez Tutor.

