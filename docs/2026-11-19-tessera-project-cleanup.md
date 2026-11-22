# Tessera 專案整理與改名摘要

日期：2026-11-19

## 摘要

本次將原本的 My Notes Electron code base 正式整理並改名為 Tessera，移除不再使用的 Mind Flow／Mind HUD 整合內容，並重新產生可安裝的 macOS App。

## 專案結構

- 原始碼目錄由 `my-notes/` 改名為 `Tessera/`。
- 根目錄現在只保留 Tessera 專案與 Git 資料。
- 舊的 Mind Flow、Observer、決策服務與 Swift 版本已從專案根目錄移出。
- 舊內容暫存於 `/private/tmp/my-notes-legacy-20261119`，以便需要時回溯，不再作為 Tessera 的依賴。

## 程式與設定變更

- package 名稱改為 `tessera`。
- Electron 打包入口改為 `Tessera/main.cjs`。
- App 顯示名稱、視窗標題與選單名稱改為 `Tessera`。
- 資料目錄改為：

  ```text
  ~/Library/Application Support/Tessera/notebook.json
  ```

- 打包腳本改用 `Tessera/` 路徑，產物改為：

  ```text
  Tessera/dist/Tessera.app
  Tessera/dist/Tessera-mac-arm64.zip
  ```

- 打包內容不再包含 Mind Flow Electron、macOS Observer 或決策服務。

## 資料遷移

舊版資料已由：

```text
~/Library/Application Support/MyNotes/notebook.json
```

導入 Tessera。導入結果：

- 20 張未刪除便利貼
- 39 個主題
- 96 筆刪除紀錄
- 畫布位置與懸浮便利貼位置一併保留

導入前的 Tessera 空資料檔備份為：

```text
~/Library/Application Support/Tessera/notebook.json.before-import-20261118-235805
```

## 圖示與打包

- 使用紫羅蘭拼貼筆記 PNG 作為 Tessera 圖示資源。
- App bundle 內包含 `Contents/Resources/Tessera.png`。
- App 使用本機臨時簽章，未進行 Apple 公證。

## 驗證

- Node.js 測試：8 項全部通過。
- `main.cjs`、`preload.cjs`、`renderer.js` 語法檢查通過。
- 打包腳本 `zsh -n` 檢查通過。
- 重新打包成功，產出 Tessera App 與 macOS arm64 zip。
- 打包後 manifest 的入口確認為 `Tessera/main.cjs`。

## 後續維護規則

- Tessera 的原始碼只放在 `Tessera/`。
- 更新 App 時直接覆蓋或替換 `/Applications/Tessera.app`，不要在 `/Applications` 內建立 `.before-*` App 備份。
- 若需要備份，將備份放在專案外的明確 backup 目錄，不要讓 macOS 把備份識別成額外的應用程式。
- Mind HUD 是獨立專案，不再放回 `Projects/my-notes/`。
