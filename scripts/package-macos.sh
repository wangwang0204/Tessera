#!/bin/zsh
set -euo pipefail

source_dir="${0:A:h:h}"
app_path="$source_dir/dist/Tessera.app"
zip_path="$source_dir/dist/Tessera-mac-arm64.zip"
electron_app="$source_dir/node_modules/electron/dist/Electron.app"
icon_source="$source_dir/assets/icon.png"

if [[ ! -d "$electron_app" ]]; then
  print -u2 "找不到 Electron.app；請先執行 npm install。"
  exit 1
fi
if [[ ! -f "$icon_source" ]]; then
  print -u2 "找不到圖示檔：$icon_source"
  exit 1
fi
if [[ -e "$app_path" || -e "$zip_path" ]]; then
  print -u2 "輸出已存在，請先移走 $app_path 與 $zip_path。"
  exit 1
fi

cd "$source_dir"
npm run build:editor
mkdir -p "$source_dir/dist"
ditto "$electron_app" "$app_path"
resources="$app_path/Contents/Resources/app"
mkdir -p "$resources" "$source_dir/work"

for file in package.json main.cjs preload.cjs index.html renderer.js web-adapter.js style.css \
  editor.bundle.js store.cjs model.cjs canvas-align.js master-groups.js \
  note-header.js timeline-layout.js sync-client.cjs sync-merge.cjs; do
  ditto "$source_dir/$file" "$resources/$file"
done
ditto "$icon_source" "$app_path/Contents/Resources/Tessera.png"

plist="$app_path/Contents/Info.plist"
/usr/libexec/PlistBuddy -c 'Set :CFBundleName Tessera' "$plist"
/usr/libexec/PlistBuddy -c 'Set :CFBundleDisplayName Tessera' "$plist"
/usr/libexec/PlistBuddy -c 'Set :CFBundleIdentifier com.tessera.desktop' "$plist"
/usr/libexec/PlistBuddy -c 'Set :CFBundleIconFile Tessera.png' "$plist"
/usr/libexec/PlistBuddy -c 'Set :CFBundleShortVersionString 0.1.0' "$plist"
/usr/libexec/PlistBuddy -c 'Set :CFBundleVersion 0.1.0' "$plist"
/usr/libexec/PlistBuddy -c 'Set :LSApplicationCategoryType public.app-category.productivity' "$plist"

codesign --force --deep --sign - "$app_path"
ditto -c -k --keepParent "$app_path" "$zip_path"
print "Tessera 打包完成：$zip_path"
