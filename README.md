# Tessera

Tessera 是一款專注於思考流與自由排版的雙模筆記應用程式（支援 macOS 桌面版與 Web 自託管版）。

---

## 特色功能

- **自由拼貼畫布 (Infinite Canvas)**：卡片支援自由拖曳放置、平滑縮放、微吸附對齊、多種柔和底色與即時收合。
- **純 Markdown 核心**：底層始終以乾淨的 Markdown 儲存，即時解析 `# 主題` 與 `## 條目`，無專有資料格式綁定。
- **時間軸投影 (Timeline)**：由筆記中的日期自動投影生成時間軸，同日與相近事件智慧分列，支援點擊穿透回來源便利貼。
- **Master Notes 全景視圖**：在一張頁面中依主題與條目分類呈現，可直接連續編輯並寫回原始便籤。
- **簡約終端 CLI**：提供 `tessera list`、`tessera search`、`tessera todo` 與 `tessera add`，並支援 zsh 動態補全。
- **雙模支援 (Desktop & Web)**：本機以 Electron 提供極致桌面體驗（置頂懸浮便籤）；亦可透過輕量 Docker 容器部署至個人伺服器。

---

## 快速開始

### 1. 桌面版 (Electron)

```bash
git clone https://github.com/your-username/Tessera.git
cd Tessera
npm install
npm run build:editor
npm start
```

### 2. 網頁版 (Web Server)

```bash
npm run start:web
# 服務預設啟動於 http://localhost:3000/
```

### 3. Docker 容器部署

```bash
docker compose up -d --build
```
預設將資料檔案持久化儲存於 `./data/notebook.json`。

---

## CLI 工具

在專案目錄執行：

```bash
npm link
```

即可全域使用 `tessera` 指令：

```bash
tessera list
tessera search "關鍵字"
tessera todo
tessera add --topic "工作" --content "整理系統架構提案"
```

---

## 測試與驗證

```bash
npm test
```

---

## macOS 打包

```bash
zsh scripts/package-macos.sh
```
產物將輸出至 `dist/Tessera.app` 與 `dist/Tessera-mac-arm64.zip`。

---

## 授權

MIT License
