# 機捷快選 - AI 接手維護與開發指南 (AI_HANDOVER.md)

本文件專為 AI Agent（如 Antigravity, Claude, ChatGPT, Cursor 等）設計，以便未來任何 AI 能快速理解本專案之架構、設計規範、測試指令與接手維護流程。

---

## 🤖 專案概況簡介 (Quick Context)

- **專案名稱**：機捷快選 (Taoyuan Airport MRT Quick Router)
- **定位**：手機 Mobile-first PWA 靜態網頁，無需後端，專為解答「普通車先來，要不要上？」的轉乘決策工具。
- **技術棧**：原生 HTML5 / Vanilla CSS (現代 HSL 系統 + 毛玻璃 Glassmorphism) / Vanilla JavaScript (ES Modules + `window.TYMETRO_STATIC_DATA` Fallback)。
- **部署平台**：GitHub Pages (`github.io`) / 本機靜態 Web Server (`http://localhost:8080`)。

---

## 🛠️ AI 開發與修改規範 (Rules for AI)

### 1. 無後端與相對路徑原則
- **禁止導入後端依賴或外部大型 Framework**（保持純靜態零編譯特性）。
- 任何靜態資源（CSS, JS, CSV, Manifest, Service Worker）一律使用**相對路徑** (如 `./styles.css` 或 `data/stations.csv`)，確保部署在 GitHub Pages 子路徑時不會損壞。

### 2. 雙重資料載入策略 (Dual-Loading Strategy)
- 本專案採用 `fetch()` 與 [data/bundle.js](data/bundle.js) 雙重備援：
  - HTTP(S) 環境下：優先使用 `fetch('data/stations.csv')`。
  - `file://` 或 fetch 失敗時：在 [src/csv.js](src/csv.js) 自動回退至 `window.TYMETRO_STATIC_DATA`。
- **重要**：每當修改或更新 `data/stations.csv` 或 `data/timetable.csv` 後，必須執行 `python tools/build_bundle.py` 重新產生 `bundle.js`。

### 3. 核心演算法維護 ([src/router.js](src/router.js))
- `TRANSFER_BUFFER_MINUTES = 1`：同站/同月台轉乘的基本最小等待時間緩衝。
- `AFTER_MIDNIGHT_CUTOFF = 4 * 60`：跨夜營業日時間標準化（00:xx ~ 03:xx 自動換算為 `+1440` 分鐘）。
- `planRoutes()`：綜合直達車與最多一次轉乘（普通轉直達、直達轉普通）方案，排序權重：**最早抵達 > 最少轉乘 > 最早出發 > 總花費時間**。
- `calculateFare()`：單程全票估算（全線起步價 NT$ 30，最高上限 NT$ 160）。

---

## 🧪 驗證與測試命令 (Verification Commands)

修改任何代碼或資料後，AI Agent 應主動執行以下指令驗證：

```bash
# 1. 驗證資料 CSV 與車站完整度
python tools/validate_data.py data/stations.csv data/timetable.csv

# 2. 執行 Router 演算法與單元測試
python tools/test_router.py

# 3. 若有更新 CSV，重新打包靜態 bundle.js
python tools/build_bundle.py
```

---

## 📌 接手任務 Checklist

當使用者提出新需求時，AI 請依序檢查：

1. **若為更新資料/站點** ➔ 參考 [DATA_UPDATE.md](DATA_UPDATE.md)。
2. **若為修改 UI 視覺/樣式** ➔ 修改 [styles.css](styles.css) 與 [index.html](index.html)，維持質感 HSL 色彩與響應式排版。
3. **若為調整轉乘邏輯/票價** ➔ 修改 [src/router.js](src/router.js) 並跑通 `python tools/test_router.py`。
