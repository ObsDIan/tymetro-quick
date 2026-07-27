# 機捷快選 - 專案進度與狀態 (STATUS.md)

最後更新日期：2026-07-27  
目前版本：`v0.1.1` (支援 A1~A22 全線站點 + SEO 完全優化)

---

## 專案目前進度 (Completed Roadmap)

### ✅ 第一階段：班表與站點資料完整度強化
- [x] 站點名單擴充：[data/stations.csv](data/stations.csv) 成功新增 `A22 老街溪站` (共 22 個站點)。
- [x] 演算法相容：驗證 [src/router.js](src/router.js) 支援延伸線搜尋與雙向路徑規劃。
- [x] 零配置離線資料包：產出 [data/bundle.js](data/bundle.js)，支援 `file://` 協議離線開啟。

### ✅ 第二階段：UI/UX 現代化質感與視覺升級
- [x] 主題美化：重構 [styles.css](styles.css)，導入桃捷紫/藍質感漸層、毛玻璃卡片（Glassmorphism）與微動畫。
- [x] 現代字型：導入 Google Fonts (`Inter` & `Noto Sans TC`)。
- [x] 熱門起點 Chips：[index.html](index.html) 新增台北車站 A1、長庚醫院 A8、一航廈 A12、二航廈 A13、高鐵桃園 A18 熱門站點快選按鈕。
- [x] 標籤與時間軸：直達車（紫藍）、普通車（綠色）、轉乘（金黃）視覺化標籤與垂直時間軸。

### ✅ 第三階段：新增進階功能
- [x] 單程票價計算：在 [src/router.js](src/router.js) 新增 `calculateFare()`（最低 NT$ 30，最高 NT$ 160）並在路線卡片顯示。
- [x] 發車動態倒數：目前時刻搜尋時自動標示 `⚡ 離發車剩 X 分鐘` 或 `🟢 班車進站中/即將發車`。
- [x] 智慧轉乘與搭乘提示：自動產生 A8 同月台轉乘、A1 預辦登機與機場區段免費搭乘提示。

### ✅ 第四階段：自動化測試與發布準備
- [x] 測試腳本：建立 [tools/test_router.py](tools/test_router.py) 與 [tools/validate_data.py](tools/validate_data.py) 通過 100% 測試。
- [x] 本機 Web 伺服器腳本：新增 [run_server.bat](run_server.bat) 方便雙擊開啟。
- [x] GitHub Pages 相容：完全使用相對路徑與相容設定，部署於 `https://obsdian.github.io/tymetro-quick/`。

### ✅ 第五階段：SEO 搜尋引擎最佳化與 Google 站長驗證
- [x] 車種專用名詞統一：全站與說明文件統一為「普通車」與「直達車」兩種，移除非標準名稱（跳站車）。
- [x] SEO 元資料強化：完成 Open Graph (Facebook/Line)、Twitter Cards 與 Canonical URLs 標準網址設定。
- [x] Google Search Console 驗證：在 [index.html](index.html) 配置 `<meta name="google-site-verification" content="Pb7y1RagN7gtxO5tG8lEg1lOkCJnfWqFOKokPPE2CXw" />`。
- [x] Schema.org 結構化數據：導入 `WebApplication` 與 `FAQPage` JSON-LD，提高搜尋引擎 Rich Snippets 曝光率。
- [x] Sitemap & Robots 部署：建立根目錄 [sitemap.xml](sitemap.xml) 與 [robots.txt](robots.txt)。
- [x] 語意化乘車指南卡片：在 [index.html](index.html) 新增 SEO 指南區塊與配對 CSS 卡片樣式。

---

## 核心檔案架構地圖

```text
tymetro-quick/
├── index.html              # 主介面 HTML (含 GSC 驗證、SEO JSON-LD & 乘車指南)
├── styles.css              # 主樣式檔 (Modern Design System + SEO 卡片樣式)
├── app.js                  # 前端互動邏輯、發車倒數與 PWA 註冊
├── manifest.webmanifest    # PWA 安裝設定檔
├── service-worker.js       # PWA 離線快取控制檔
├── robots.txt              # 搜尋引擎爬蟲設定檔
├── sitemap.xml             # 網站導覽 Sitemap 檔
├── googlebb1681d98eb884b5.html # Google Search Console 檔案驗證檔
├── run_server.bat          # Windows 一鍵啟動本機伺服器腳本
├── STATUS.md               # 專案進度與狀態 (本檔案)
├── DATA_UPDATE.md          # 班表資料更新操作指南
├── AI_HANDOVER.md          # AI 接手維護與開發說明文件
├── README.md               # 專案說明文件
├── src/
│   ├── csv.js              # CSV 解析與 fetch/fallback 讀取器
│   └── router.js           # 轉乘演算法、票價計算與路徑規劃引擎
├── data/
│   ├── stations.csv        # 車站資料表 (A1~A22)
│   ├── timetable.csv       # 車次時刻資料明細 (4,430 筆)
│   ├── version.json        # 班表版本資訊
│   └── bundle.js           # 靜態資料打包檔 (離線及 file:// fallback)
└── tools/
    ├── convert_tymetro_xml.py  # 官方 XML 轉 CSV 工具
    ├── validate_data.py        # 資料結構驗證工具
    ├── build_bundle.py         # 資料打包工具
    └── test_router.py          # 單元與整合測試腳本
```
