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
- [ ] **Diagnósticos LSP avanzados**: Detección de variables no declaradas, llamadas a procesos inexistentes, tipos incompatibles.
- [ ] **Code Lens**: Mostrar encima de cada `process`/`function` el número de referencias o un enlace `▶ Ejecutar Este Proceso`.
- [ ] **Refactoring de `#include`**: Al renombrar o mover un archivo `.inc`, actualizar automáticamente todos los `#include` que lo referencian.
- [ ] **Inlay Hints**: Mostrar inline el tipo de retorno o los nombres de parámetros en llamadas a funciones.

---

## 🟡 MEJORAS DE PRODUCTO (UX / DX)

- [ ] **Pantalla de Bienvenida / Dashboard**: Panel inicial con proyectos recientes, acceso rápido a documentación y botón "Nuevo Proyecto". Actualmente el usuario ve el editor vacío de Code-OSS.
- [ ] **Asistente de Nuevo Proyecto**: Wizard que genere la estructura de carpetas base (`src/`, `data/fpg/`, `data/fnt/`, `data/audio/`, `.vscode/settings.json`) y un archivo `main.prg` de ejemplo según la versión de BennuGD elegida (v1 o v2).
- [ ] **Explorador de Recursos del Juego**: Panel lateral que muestre los FPG, FNT, mapas y audio del proyecto con previsualizaciones en miniatura, sin tener que navegar por el árbol genérico de archivos.
- [ ] **Integración Git Visual básica**: Indicador de rama actual, último commit y botón de push/pull en la barra de estado.
- [ ] **Snippets avanzados y plantillas de código**: Plantillas para patrones frecuentes en BennuGD (máquina de estados, scroll de tiles, menú principal, sistema de puntuación, etc.).
- [ ] **Configuración de atajos de teclado específicos de BennuGD**: Teclas personalizadas para `Compilar`, `Compilar y Ejecutar` y `Cambiar Versión`.

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
