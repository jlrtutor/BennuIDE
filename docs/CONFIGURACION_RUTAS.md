# 🛠️ Guía de Configuración de Rutas de Compiladores y Ejecutores en BennuIDE

BennuIDE cuenta con un sistema integrado de compilación y ejecución que permite trabajar tanto con **BennuGD versión 2 (moderno)** como con **BennuGD versión 1 (clásico)** en un mismo entorno, seleccionando la versión adecuada para cada proyecto o archivo `.prg`.

---

## 📌 1. Configuración desde la Interfaz Gráfica (Ajustes de BennuIDE)

Para configurar las rutas de los ejecutables desde los menús de BennuIDE:

1. Abre los **Ajustes**:
   - En macOS: `Cmd + ,` (o menú *BennuIDE* → *Ajustes* → *Ajustes*).
   - En Windows / Linux: `Ctrl + ,` (o menú *Archivo* → *Preferencias* → *Ajustes*).
2. En la barra de búsqueda de Ajustes, escribe: **`BennuGD`**.
3. Verás las siguientes secciones configurables:

### 🔹 Selector de Versión Activa
- **`Bennugd: Version`** (`bennugd.version`):
  - `v2` (*Por defecto*): Utiliza las herramientas y motor de BennuGD 2.
  - `v1`: Utiliza el compilador y runtime clásico de BennuGD 1.

---

### 🔹 Sección BennuGD v2 (bgdc / bgd2)
- **`Bennugd > V2: Compiler Path`** (`bennugd.v2.compilerPath`):
  - Ruta absoluta o comando en el `PATH` para el compilador de BennuGD 2.
  - *Valor por defecto:* `bgdc`
  - *Ejemplo en macOS/Linux:* `/usr/local/bin/bgdc` o `/Users/tu_usuario/BennuGD2/bin/bgdc`
  - *Ejemplo en Windows:* `C:\BennuGD2\bin\bgdc.exe`
- **`Bennugd > V2: Runtime Path`** (`bennugd.v2.runtimePath`):
  - Ruta absoluta o comando en el `PATH` para el intérprete/runner de BennuGD 2.
  - *Valor por defecto:* `bgdi`
  - *Ejemplo en macOS/Linux:* `/usr/local/bin/bgdi`
  - *Ejemplo en Windows:* `C:\BennuGD2\bin\bgdi.exe`
- **`Bennugd > V2: Compiler Args`** (`bennugd.v2.compilerArgs`):
  - Argumentos adicionales de línea de comandos para la compilación (ej. `-g`, `-DDEBUG`).
- **`Bennugd > V2: Runtime Args`** (`bennugd.v2.runtimeArgs`):
  - Argumentos adicionales pasados al runner `bgdi`.
- **`Bennugd > V2: Include Paths`** (`bennugd.v2.includePaths`):
  - Lista de carpetas adicionales donde buscar módulos e includes (`-i`).

---

### 🔹 Sección BennuGD v1 (bgdc v1 clásico)
- **`Bennugd > V1: Compiler Path`** (`bennugd.v1.compilerPath`):
  - Ruta al ejecutable de `bgdc` versión 1.
  - *Valor por defecto:* `bgdc`
  - *Ejemplo en macOS/Linux:* `/opt/bennugd_v1/bin/bgdc`
  - *Ejemplo en Windows:* `C:\BennuGD_v1\bgdc.exe`
- **`Bennugd > V1: Runtime Path`** (`bennugd.v1.runtimePath`):
  - Ruta al ejecutable de `bgdi` versión 1.
  - *Valor por defecto:* `bgdi`
  - *Ejemplo en macOS/Linux:* `/opt/bennugd_v1/bin/bgdi`
  - *Ejemplo en Windows:* `C:\BennuGD_v1\bgdi.exe`
- **`Bennugd > V1: Compiler Args`** (`bennugd.v1.compilerArgs`):
  - Argumentos adicionales para v1 (ej. `-p` para modo compatible).
- **`Bennugd > V1: Runtime Args`** (`bennugd.v1.runtimeArgs`):
  - Argumentos adicionales para `bgdi` v1.
- **`Bennugd > V1: Include Paths`** (`bennugd.v1.includePaths`):
  - Carpetas de includes para v1.

---

### 🔹 Opciones Generales de Proyecto
- **`Bennugd: Main File`** (`bennugd.mainFile`):
  - Archivo `.prg` principal del proyecto (ej. `main.prg`, `antiriad.prg`).
  - Si se deja en blanco, BennuIDE compilará automáticamente el archivo `.prg` que tengas abierto en el editor.
- **`Bennugd: Kill Previous On Run`** (`bennugd.killPreviousOnRun`):
  - `true` (*Por defecto*): Cierra automáticamente cualquier instancia previa del juego antes de volver a compilar y ejecutar.
- **`Bennugd: Clear Output Before Compile`** (`bennugd.clearOutputBeforeCompile`):
  - `true` (*Por defecto*): Limpia la consola de salida de BennuGD antes de iniciar una nueva compilación.

---

## 💻 2. Configuración mediante archivo `.vscode/settings.json` (por Proyecto)

Puedes definir la configuración específica para cada repositorio o proyecto creando o editando el archivo `.vscode/settings.json` en la raíz de tu proyecto:

```json
{
  "bennugd.version": "v2",
  "bennugd.mainFile": "main.prg",
  "bennugd.killPreviousOnRun": true,
  "bennugd.clearOutputBeforeCompile": true,

  "bennugd.v2.compilerPath": "/usr/local/bin/bgdc",
  "bennugd.v2.runtimePath": "/usr/local/bin/bgdi",
  "bennugd.v2.compilerArgs": ["-g"],
  "bennugd.v2.includePaths": [
    "${workspaceFolder}/modules",
    "${workspaceFolder}/include"
  ],

  "bennugd.v1.compilerPath": "/opt/bennugd_v1/bin/bgdc",
  "bennugd.v1.runtimePath": "/opt/bennugd_v1/bin/bgdi",
  "bennugd.v1.compilerArgs": [],
  "bennugd.v1.includePaths": [
    "/opt/bennugd_v1/include"
  ]
}
```

---

## ⚡ 3. Cambio Rápido de Versión desde la Barra de Estado (*Status Bar*)

En la esquina inferior izquierda de BennuIDE encontrarás el indicador de versión:
- **`$(tools) BennuGD v2`** o **`$(tools) BennuGD v1`**.

Al hacer clic sobre él, se desplegará el selector interactivo para cambiar instantáneamente la versión activa del proyecto entre v1 y v2 sin necesidad de abrir la configuración manual.

---

## 🚀 4. Botones de Compilación y Ejecución

Al abrir cualquier archivo `.prg`, `.inc` o `.bgd`, en la barra superior del editor tendrás disponibles:
1. **`▶` (Compilar y Ejecutar)**: Compila el código fuente y, si no hay errores, lanza inmediatamente el juego.
2. **`⚙` (Compilar)**: Realiza únicamente la compilación y genera el archivo binario `.dcb`.
3. **`🛠` (Selector de Versión)**: Permite alternar la versión de compilador.

La salida y los errores se reportan con colores en el canal **`BennuGD Output`** y en el panel **`Problemas`** (*Problems*), permitiendo hacer clic en cualquier advertencia o error para saltar a la línea exacta del código fuente.
