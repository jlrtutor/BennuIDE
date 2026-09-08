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

# 4.1 Rename binary
if [ -f "${APP_PATH}/Contents/MacOS/Codium" ]; then
  mv "${APP_PATH}/Contents/MacOS/Codium" "${APP_PATH}/Contents/MacOS/BennuIDE"
elif [ -f "${APP_PATH}/Contents/MacOS/Electron" ]; then
  mv "${APP_PATH}/Contents/MacOS/Electron" "${APP_PATH}/Contents/MacOS/BennuIDE"
fi

# 4.2 Update Info.plist
/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName BennuIDE" "${APP_PATH}/Contents/Info.plist" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Set :CFBundleName BennuIDE" "${APP_PATH}/Contents/Info.plist" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier org.bennugd.bennuide" "${APP_PATH}/Contents/Info.plist" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Set :CFBundleExecutable BennuIDE" "${APP_PATH}/Contents/Info.plist" 2>/dev/null || true

# 4.3 Inject product.json customization
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
    fs.writeFileSync(p, JSON.stringify(data, null, 2));
  "
fi

echo "🔌 5. Inyectando extensiones de BennuGD2 en el core del IDE..."
EXT_DIR="${APP_PATH}/Contents/Resources/app/extensions"
mkdir -p "${EXT_DIR}"

# Copy built extensions
cp -R "${PROJECT_ROOT}/extensions/bennugd2-language" "${EXT_DIR}/"
cp -R "${PROJECT_ROOT}/extensions/bennugd2-fpg-editor" "${EXT_DIR}/"
cp -R "${PROJECT_ROOT}/extensions/bennugd2-fnt-editor" "${EXT_DIR}/"
cp -R "${PROJECT_ROOT}/packages/bennuide-ai-agent" "${EXT_DIR}/"

# Clean unwanted dev files inside app extensions
rm -rf "${EXT_DIR}"/*/src "${EXT_DIR}"/*/.vscode*

echo "🔏 6. Re-firmando binario ad-hoc para macOS Apple Silicon..."
codesign --force --deep -s - "${APP_PATH}" 2>/dev/null || true
xattr -cr "${APP_PATH}" 2>/dev/null || true

echo "📀 7. Creando instalador DMG..."
DMG_PATH="${DIST_DIR}/BennuIDE-macOS-AppleSilicon.dmg"
rm -f "${DMG_PATH}"
hdiutil create -volname "BennuIDE" -srcfolder "${APP_PATH}" -ov -format UDZO "${DMG_PATH}"

echo "=========================================================="
echo "✅ ¡BennuIDE.app generado con ÉXITO!"
echo "📍 Aplicación: ${APP_PATH}"
echo "📍 Instalador DMG: ${DMG_PATH}"
echo "=========================================================="
