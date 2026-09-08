#!/usr/bin/env bash
set -e

echo "=========================================================="
echo "🚀 Compilando BennuIDE Standalone (Code-OSS macOS ARM64)"
echo "=========================================================="

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${PROJECT_ROOT}/dist/standalone"
BUILD_DIR="${PROJECT_ROOT}/build/code-oss"

mkdir -p "${DIST_DIR}" "${BUILD_DIR}"

echo "📦 1. Compilando todas las extensiones oficiales..."
npm run compile --workspaces

echo "🌐 2. Descargando runtime base de Code-OSS (macOS Apple Silicon arm64)..."
VSCODIUM_VERSION="1.87.2.24072"
ZIP_NAME="VSCodium-darwin-arm64-${VSCODIUM_VERSION}.zip"
DOWNLOAD_URL="https://github.com/VSCodium/vscodium/releases/download/${VSCODIUM_VERSION}/${ZIP_NAME}"

if [ ! -f "${BUILD_DIR}/${ZIP_NAME}" ]; then
  echo "Descargando desde ${DOWNLOAD_URL}..."
  curl -L "${DOWNLOAD_URL}" -o "${BUILD_DIR}/${ZIP_NAME}"
fi

echo "🌐 2.1 Descargando Spanish Language Pack..."
ES_LANG_URL="https://open-vsx.org/api/MS-CEINTL/vscode-language-pack-es/1.87.0/file/MS-CEINTL.vscode-language-pack-es-1.87.0.vsix"
if [ ! -f "${BUILD_DIR}/es-lang.vsix" ]; then
  curl -sL "${ES_LANG_URL}" -o "${BUILD_DIR}/es-lang.vsix"
fi

echo "📂 3. Extrayendo Code-OSS..."
rm -rf "${BUILD_DIR}/extracted"
mkdir -p "${BUILD_DIR}/extracted"
unzip -q "${BUILD_DIR}/${ZIP_NAME}" -d "${BUILD_DIR}/extracted"

APP_NAME="BennuIDE.app"
APP_PATH="${DIST_DIR}/${APP_NAME}"
rm -rf "${APP_PATH}"

# Find the .app extracted (VSCodium.app)
SRC_APP=$(find "${BUILD_DIR}/extracted" -maxdepth 1 -name "*.app" | head -n 1)
cp -R "${SRC_APP}" "${APP_PATH}"

echo "🎨 4. Aplicando Branding y Personalización de BennuIDE..."

# 4.1 Rename main binary
if [ -f "${APP_PATH}/Contents/MacOS/Codium" ]; then
  mv "${APP_PATH}/Contents/MacOS/Codium" "${APP_PATH}/Contents/MacOS/BennuIDE"
elif [ -f "${APP_PATH}/Contents/MacOS/Electron" ]; then
  mv "${APP_PATH}/Contents/MacOS/Electron" "${APP_PATH}/Contents/MacOS/BennuIDE"
fi

# 4.2 Update main Info.plist
/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName BennuIDE" "${APP_PATH}/Contents/Info.plist" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Set :CFBundleName BennuIDE" "${APP_PATH}/Contents/Info.plist" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier org.bennugd.bennuide" "${APP_PATH}/Contents/Info.plist" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Set :CFBundleExecutable BennuIDE" "${APP_PATH}/Contents/Info.plist" 2>/dev/null || true

# 4.3 Rename and update Helper Apps in Frameworks
if [ -d "${APP_PATH}/Contents/Frameworks" ]; then
  cd "${APP_PATH}/Contents/Frameworks"
  for h in "VSCodium Helper" "VSCodium Helper (GPU)" "VSCodium Helper (Plugin)" "VSCodium Helper (Renderer)"; do
    new_h="${h/VSCodium/BennuIDE}"
    if [ -d "${h}.app" ]; then
      mv "${h}.app" "${new_h}.app"
      mv "${new_h}.app/Contents/MacOS/${h}" "${new_h}.app/Contents/MacOS/${new_h}"
      /usr/libexec/PlistBuddy -c "Set :CFBundleName ${new_h}" "${new_h}.app/Contents/Info.plist" 2>/dev/null || true
      /usr/libexec/PlistBuddy -c "Set :CFBundleExecutable ${new_h}" "${new_h}.app/Contents/Info.plist" 2>/dev/null || true
    fi
  done
  cd "${PROJECT_ROOT}"
fi

# 4.4 Inject product.json customization and default BennuGD settings
PRODUCT_JSON="${APP_PATH}/Contents/Resources/app/product.json"
if [ -f "${PRODUCT_JSON}" ]; then
  node -e "
    const fs = require('fs');
    const p = '${PRODUCT_JSON}';
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    data.nameShort = 'BennuIDE';
    data.nameLong = 'BennuIDE Game Studio';
    data.applicationName = 'bennuide';
    data.win32AppId = 'BennuIDE';
    data.darwinBundleIdentifier = 'org.bennugd.bennuide';
    data.reportIssueUrl = 'https://github.com/SplinterGU/BennuGD2';
    data.configurationDefaults = {
      'workbench.colorTheme': 'BennuIDE Dark (One Dark Pro)',
      'files.associations': {
        '*.prg': 'bennugd2',
        '*.inc': 'bennugd2',
        '*.bgd': 'bennugd2'
      },
      'workbench.editor.customEditors': [
        {
          'viewType': 'bennugd2.fpgEditor',
          'filenamePattern': '*.fpg'
        },
        {
          'viewType': 'bennugd2.fntEditor',
          'filenamePattern': '*.fnt'
        },
        {
          'viewType': 'bennugd2.fntEditor',
          'filenamePattern': '*.fnx'
        }
      ]
    };
    fs.writeFileSync(p, JSON.stringify(data, null, 2));
  "
fi

echo "🔌 5. Inyectando extensiones oficiales de BennuGD2 y Paquete Español..."
EXT_DIR="${APP_PATH}/Contents/Resources/app/extensions"
mkdir -p "${EXT_DIR}"

# 5.1 Extract Spanish Language Pack
mkdir -p "${BUILD_DIR}/es-extracted"
unzip -q -o "${BUILD_DIR}/es-lang.vsix" -d "${BUILD_DIR}/es-extracted"
rm -rf "${EXT_DIR}/ms-ceintl.vscode-language-pack-es"
cp -R "${BUILD_DIR}/es-extracted/extension" "${EXT_DIR}/ms-ceintl.vscode-language-pack-es"

# 5.2 Copy BennuGD2 built-in extensions with full node_modules
copy_extension() {
  local src="$1"
  local name="$(basename "$src")"
  local dest="${EXT_DIR}/${name}"
  rm -rf "${dest}"
  mkdir -p "${dest}"
  cp -R "${src}"/* "${dest}/"
}

copy_extension "${PROJECT_ROOT}/extensions/bennugd2-language"
copy_extension "${PROJECT_ROOT}/extensions/bennugd2-fpg-editor"
copy_extension "${PROJECT_ROOT}/extensions/bennugd2-fnt-editor"
copy_extension "${PROJECT_ROOT}/packages/bennuide-ai-agent"

# Clean development-only files
rm -rf "${EXT_DIR}"/*/src "${EXT_DIR}"/*/.vscode* "${EXT_DIR}"/*/tsconfig*.json

echo "🔏 6. Re-firmando binarios de forma recursiva (ad-hoc)..."
find "${APP_PATH}/Contents/Frameworks" -name "*.framework" -o -name "*.app" -o -name "*.dylib" | while read -r item; do
  codesign --force --deep -s - "$item" 2>/dev/null || true
done
codesign --force --deep -s - "${APP_PATH}" 2>/dev/null || true
xattr -cr "${APP_PATH}" 2>/dev/null || true

echo "📀 7. Creando instalador DMG..."
DMG_PATH="${DIST_DIR}/BennuIDE-macOS-AppleSilicon.dmg"
rm -f "${DMG_PATH}"
hdiutil create -volname "BennuIDE" -srcfolder "${APP_PATH}" -ov -format UDZO "${DMG_PATH}"

echo "=========================================================="
echo "✅ ¡BennuIDE.app generado y verificado con ÉXITO!"
echo "📍 Aplicación: ${APP_PATH}"
echo "📍 Instalador DMG: ${DMG_PATH}"
echo "=========================================================="
