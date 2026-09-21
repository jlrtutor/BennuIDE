# 📋 BennuIDE — TODO / Pendientes

> Lista de mejoras y funcionalidades pendientes para alcanzar nivel de IDE profesional completo.
> Actualizado: Septiembre 2026

---

## 🔴 CRÍTICO — Depurador Interactivo (DAP)

- [ ] **Variables reales desde socket de debug**: Actualmente las variables (x, y, fps…) son ficticias (hardcoded). Implementar lectura real mediante protocolo `GET_VAR:processId:varName` → `VAR:name:value:type` cuando `bgdi` lo soporte.
- [ ] **Stack Trace dinámico**: La pila de llamadas solo muestra un frame (`Main Loop`). Recibir frames reales desde `bgdi` vía socket (`STACK:frame1|file:line|...`).
- [ ] **Watch Expressions**: Implementar `evaluateRequest` en el DAP para que el panel Watch funcione.
- [ ] **Conditional Breakpoints**: Los breakpoints son incondicionales. Añadir soporte de condición (`IF x > 100`).
- [ ] **Inspector de procesos activos en tiempo real**: Panel que muestre todos los procesos activos del juego (ID, tipo, posición, estado) mientras se ejecuta, sin pausar.

> ⚠️ Todo esto depende de que `bgdi` (BennuGD2 runtime) implemente el protocolo de socket de debug `BGD_DEBUG=1`.

---

## 🟠 IMPORTANTE — LSP (Funcionalidades de Desarrollador)

- [x] **Autocompletado** (funciones, variables, procesos, includes) — ✅ Implementado
- [x] **Hover / Documentación inline** — ✅ Implementado
- [x] **Ir a Definición (F12)** — ✅ Implementado
- [x] **Signature Help** (parámetros de funciones) — ✅ Implementado
- [x] **Document Symbols** (vista Outline) — ✅ Implementado
- [x] **Document Links** (includes clickables) — ✅ Implementado
- [x] **Diagnósticos básicos en tiempo real** (begin/end, comillas) — ✅ Implementado
- [x] **Renombrar Símbolo (F2)** — ✅ Implementado (Sep 2026)
- [x] **Buscar Referencias (Shift+F12)** — ✅ Implementado (Sep 2026)
- [x] **Mejora de diagnósticos en tiempo real** — ✅ Mejorado (Sep 2026)
- [x] **Diagnósticos LSP avanzados**: Detección de llamadas a procesos/funciones no declaradas, símbolos duplicados y validación léxica en tiempo real — ✅ Implementado (Sep 2026)
- [x] **Code Lens**: Conteo interactivo de referencias encima de cada `process`/`function`/`method` y botón `▶ Ejecutar Juego` — ✅ Implementado (Sep 2026)
- [x] **Refactoring de `#include`**: Actualización automática de directivas `include` e `import` al renombrar o mover archivos `.inc`, `.prg` o `.h` — ✅ Implementado (Sep 2026)
- [x] **Inlay Hints**: Nombres de parámetros inline (`param:`) en llamadas a funciones y procesos — ✅ Implementado (Sep 2026)

---

## 🟡 MEJORAS DE PRODUCTO (UX / DX)

- [x] **Pantalla de Bienvenida / Dashboard**: Panel inicial profesional con proyectos recientes, acceso rápido a demos, documentación, comprobación del estado del compilador y botón "Nuevo Proyecto" — ✅ Implementado (Sep 2026)
- [x] **Asistente de Nuevo Proyecto**: Wizard guiado con selector visual de plantillas (Arcade Shooter 2D, Plataformas 2D, Modular, Mínimo), selección de resolución, versión v1/v2, generación de carpetas base (`src/`, `data/fpg/`, `data/fnt/`, `data/audio/`, `.vscode/settings.json`, `.gitignore`, `README.md`) y apertura automática en el IDE — ✅ Implementado (Sep 2026)
- [x] **Explorador de Recursos del Juego**: Panel lateral en la barra de actividades con árbol clasificado de assets (FPG, FNT/FNX, Audio, Mapas, Código) con apertura directa en sus editores visuales correspondientes — ✅ Implementado (Sep 2026)
- [ ] **Integración Git Visual básica**: Indicador de rama actual, último commit y botón de push/pull en la barra de estado.
- [x] **Snippets avanzados y plantillas de código**: Plantillas de código enriquecidas para actor jugador, enemigos, spawner, máquina de estados, scroll 2D, HUD y animaciones FPG (`snippets/bennugd2.json`) — ✅ Implementado (Sep 2026)
- [x] **Configuración de atajos de teclado específicos de BennuGD**: Atajos nativos integrados para <kbd>F5</kbd> / <kbd>Cmd+R</kbd> (Compilar y Ejecutar), <kbd>Shift+Cmd+B</kbd> (Compilar), <kbd>Cmd+Shift+H</kbd> (Inicio) — ✅ Implementado (Sep 2026)

---

## 🟢 DIFERENCIADORES PREMIUM (Futuro)

- [ ] **Editor de Mapas de Tiles**: Editor visual de scroll maps con soporte para el formato `.map` de BennuGD (selección de tileset, pintura de tiles, capas, exportación).
- [ ] **Exportación Multiplataforma Automática**: Botón "Exportar Juego" que compile para Windows, Linux y macOS y empaquete binarios + datos del juego en `.zip` o instalador distribuible.
- [ ] **Vista Previa del Juego en Tiempo Real**: Panel integrado que renderice la salida gráfica del juego dentro del propio IDE (requiere integración SDL + Electron/Webview).
- [ ] **Integración con BennuGD Package Manager**: Si existe o se crea un gestor de módulos/librerías para BennuGD, integrar instalación de módulos con un clic desde el IDE.
- [ ] **BennuIDE para Windows y Linux**: Compilar y distribuir versión oficial del IDE para otras plataformas (actualmente solo macOS ARM64).

---

## 📖 DOCUMENTACIÓN

- [x] README.md principal — ✅ Completo
- [x] docs/CONFIGURACION_RUTAS.md — ✅ Completo (con troubleshooting)
- [x] docs/CARACTERISTICAS.md — ✅ Completo
- [ ] Tutorial de primeros pasos ("Hello World" con BennuGD2 desde BennuIDE)
- [ ] Video demo de las funcionalidades principales
- [ ] Wiki del proyecto en GitHub

---

_Añade nuevas ideas o mejoras directamente en este archivo._
