# 🚆 機捷快選 (Taoyuan Airport MRT Quick Router)

[![CI](https://github.com/ObsDIan/tymetro-quick/actions/workflows/ci.yml/badge.svg)](https://github.com/ObsDIan/tymetro-quick/actions/workflows/ci.yml)
[![Live Demo](https://img.shields.io/badge/線上使用-GitHub%20Pages-4f46e5)](https://obsdian.github.io/tymetro-quick/)

## [立即使用機捷快選](https://obsdian.github.io/tymetro-quick/)

**手機上快速判斷桃園機場捷運「普通車先來要不要搭？」、「直達車何時轉乘最快」的極速 PWA 工具。**

> 📱 支援手機 RWD 響應式排版、離線 PWA 加入主畫面、SEO 搜尋引擎最佳化與全線 A1 ~ A22 站點票價與時刻精算。

---

## 🌟 核心特色

- ⚡ **極速零後端**：純前端原生 HTML5 / Vanilla CSS / ES Modules，載入毫秒級完成。
- 🔍 **SEO 搜尋引擎優化**：完整配置 Schema.org JSON-LD 結構化資料、Open Graph 社群卡片、Semantic HTML 語意標籤與搭乘指南。
- 🚆 **專用車種簡化**：明確歸納桃捷兩種車種 —— **普通車** 與 **直達車**。
- 🔄 **智慧轉乘決策**：自動比對「直達車」、「普通車」與「轉乘組合（普通車 ↔ 直達車）」，提供秒懂的搭乘建議（例如：A8 長庚醫院站同月台轉乘）。
- 💰 **票價與發車倒數**：標示單程全票金額（NT$ 30 ~ 160）與班車進站/發車剩餘分鐘數。
- 📦 **離線 PWA 雙重備援**：支援 `fetch()` 與內建 `bundle.js` 快取，即使離線或無網路狀態下仍可正常查詢。
- 🛠️ **自動化工具鏈**：內建官方 XML 轉換器、資料驗證腳本與單元測試套件。

---

## 🚆 車種說明 (Train Types)

桃園機場捷運列車車種僅有以下 **兩種**：

1. **普通車 (Local Train)**：
   - 每站皆停靠（A1 台北車站 ↔ A22 老街溪站）。
   - 全線 22 個車站均有停靠，適合區域通勤與非大站乘客。
2. **直達車 (Express Train)**：
   - 僅停靠主要樞紐大站（如 A1 台北車站、A3 新北產業園區、A8 長庚醫院、A12 第一航廈、A13 第二航廈、A18 高鐵桃園站、A21 環北站）。
   - 提供快速穿梭台北市區、桃園機場與高鐵桃園站之乘車選擇。

---

## 🎯 最快路線規劃類型

系統在毫秒間試算並為您提供最多一次轉乘的最佳方案：

1. **全程普通車**
2. **全程直達車**
3. **普通車 → 直達車**（先搭普通車，於 A8 長庚醫院等站換乘直達車）
4. **直達車 → 普通車**（先搭直達車至核心大站，再換乘普通車前往目標站）

---

## 📂 專案目錄結構

```text
tymetro-quick/
├── index.html              # 主介面 HTML (含 JSON-LD SEO 結構化資料 & SEO 指南)
├── styles.css              # 現代 Design System 樣式檔 (HSL 色彩 + 毛玻璃)
├── app.js                  # 前端互動邏輯、發車倒數與 PWA 註冊
├── manifest.webmanifest    # PWA 安裝與圖標設定檔
├── service-worker.js       # PWA 離線 Cache 控制器
├── robots.txt              # 搜尋引擎爬蟲設定檔
├── sitemap.xml             # 網站導覽 Sitemap 檔
├── run_server.bat          # Windows 一鍵啟動本機伺服器腳本
├── README.md               # 專案說明文件 (本文件)
├── STATUS.md               # 專案進度與開發狀態
├── DATA_UPDATE.md          # 班表資料更新指南
├── AI_HANDOVER.md          # AI Agent 接手維護與測試規範
├── src/
│   ├── csv.js              # CSV 解析器與 fetch/fallback 讀取模組
│   └── router.js           # 轉乘演算法、路徑規劃引擎與票價計算器
├── data/
│   ├── stations.csv        # 車站清單 (A1~A22)
│   ├── timetable.csv       # 班表時刻明細 (4,430 筆)
│   ├── version.json        # 班表版本號
│   └── bundle.js           # 離線與 file:// 專用資料包
├── tools/
│   ├── convert_tymetro_xml.py  # 官方 XML 轉 CSV 重構工具
│   ├── validate_data.py        # 資料結構與 Integrity 驗證工具
│   ├── build_bundle.py         # 靜態 bundle.js 打包工具
│   └── test_router.py          # 單元與整合測試套件
└── tests/
    └── router.test.mjs         # JavaScript 測試檔案
```

---

## 🚀 本機開啟與測試 (Local Development)

### 1. 開啟本機 Web 伺服器

因為瀏覽器安全性規範（ES Modules CORS），請勿直接點擊 HTML。請在專案目錄執行：

```bash
# 使用 Python 啟動本機伺服器
python -m http.server 8080
```

或在 Windows 環境下雙擊執行 `run_server.bat`。  
接著開啟瀏覽器訪問：[http://localhost:8080](http://localhost:8080)

### 2. 執行自動化測試

```bash
# 驗證 CSV 資料完整度
python tools/validate_data.py data/stations.csv data/timetable.csv

# 執行 Router 演算法與單元測試
python tools/test_router.py
```

---

## 🔄 班表資料更新流程

當官方發布新版時刻表 XML 檔（如 `StationTimeTable.xml`）時，請依以下步驟更新：

```bash
# 1. 將 XML 轉為 CSV
python tools/convert_tymetro_xml.py StationTimeTable.xml \
  --stations data/stations.csv \
  --out data/timetable.csv \
  --version data/version.json \
  --data-version StationTimeTable.xml-YYYY-MM-DD

# 2. 重新打包離線 bundle.js
python tools/build_bundle.py

# 3. 驗證資料與測試
python tools/validate_data.py data/stations.csv data/timetable.csv
python tools/test_router.py
```

更詳細的操作手冊請參閱 **[DATA_UPDATE.md](DATA_UPDATE.md)**。

---

## 🌐 線上版本

正式網站已部署於 [https://obsdian.github.io/tymetro-quick/](https://obsdian.github.io/tymetro-quick/)。

網站由 GitHub Pages 提供，使用者可在支援 PWA 的瀏覽器中加入主畫面。每次更新班表時，請同步更新 `data/version.json`，並執行完整測試與資料驗證。

---

## 📄 授權與聲明

- 本工具使用靜態班表資料，頁面會顯示資料來源日期；若資料超過 180 天未更新，系統會主動警示。
- 本工具僅供乘車規劃參考，實際發車時間、臨時調度、誤點或特殊節假日營運調整，仍以 **桃園大眾捷運股份有限公司** 官方現場公告為準。
- 問題與資料錯誤可透過 [GitHub Issues](https://github.com/ObsDIan/tymetro-quick/issues) 回報。
