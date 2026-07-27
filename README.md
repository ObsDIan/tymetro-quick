# 機捷快選

手機上快速判斷桃園機場捷運「全程普通車、全程直達/跳站車、普通轉直達、直達轉普通」哪個最快的靜態 PWA。

> 這一版已使用你上傳的 `StationTimeTable.xml` 轉成 `data/stations.csv` 與 `data/timetable.csv`。  
> 但該 XML 內的來源更新時間為 `2018-05-15T00:00:00+08:00`，只包含 A1～A21 與 A14a，沒有 A22 / A23。正式通勤前請確認這份 XML 是否就是你要發布的最新資料。

## 專案特色

- 純靜態：HTML / CSS / JavaScript，不需要後端。
- 可直接上 GitHub Pages。
- 手機 RWD，並支援加入主畫面。
- 前端只讀 CSV，負載小。
- 支援最多一次轉乘：
  - 全程普通車
  - 全程直達/跳站車
  - 普通車 → 直達/跳站車
  - 直達/跳站車 → 普通車
- 資料檔採 network-first 快取：平常會抓最新版，離線時可用快取。
- 內附 XML 轉 CSV 工具，可重新匯入官方資料。

## 專案文件導覽

- 📊 **[STATUS.md](STATUS.md)**：專案進度、完成功能清單與目錄結構。
- 🔄 **[DATA_UPDATE.md](DATA_UPDATE.md)**：桃園捷運最新 XML 班表轉換與資料更新操作指南。
- 🤖 **[AI_HANDOVER.md](AI_HANDOVER.md)**：AI Agent 接手開發、維護規範與測試指令。


## 目錄


```text
index.html
styles.css
app.js
manifest.webmanifest
service-worker.js
src/
  csv.js
  router.js
data/
  stations.csv
  timetable.csv
  version.json
tools/
  convert_tymetro_xml.py
  validate_data.py
tests/
  router.test.mjs
```

## 部署到 GitHub Pages

1. 建立 GitHub Repository。
2. 把本專案所有檔案推上去。
3. 到 Repository Settings → Pages。
4. Source 選 `Deploy from a branch`。
5. Branch 選 `main`，Folder 選 `/root`。
6. 發布後用手機開 Pages 網址，瀏覽器選「加入主畫面」。

## 班表資料更新流程

### 1. 放入官方 XML

把 `StationTimeTable.xml` 放到專案內，例如：

```text
raw/StationTimeTable.xml
```

### 2. 轉換成前端使用的 CSV

```bash
python tools/convert_tymetro_xml.py raw/StationTimeTable.xml \
  --stations data/stations.csv \
  --out data/timetable.csv \
  --version data/version.json \
  --data-version StationTimeTable.xml-YYYY-MM-DD
```

轉換器會處理桃捷站別時刻表的特性：原始 XML 是「站別時刻表」，通常沒有真正的 `TripID` / `TrainNo`。工具會用服務日、方向、目的站、車種與時間順序重建可供前端計算的列車行程，並補上終點站到站時間。

### 3. 驗證資料

```bash
python tools/validate_data.py data/stations.csv data/timetable.csv
```

成功時應該看到類似：

```text
Stations: 21
Timetable rows: 4430
Train runs: 428
Services: daily, weekday, weekend
Directions: north, south
Train types: express, local
```

### 4. 跑演算法測試

```bash
node tests/router.test.mjs
```

成功時會看到：

```text
router tests passed
```

### 5. 抽查

正式發布前，請用桃園捷運官方「票價與時刻表查詢」抽查幾組：

- A1 → A13
- A1 → A18
- A18 → A1
- 你的上班路線
- 你的下班路線

確認出發/抵達時間合理後再發布。

## CSV 格式

### `data/stations.csv`

```csv
station_id,station_name,seq,is_express_stop
A1,台北車站,1,true
A2,三重,2,false
```

### `data/timetable.csv`

```csv
service_type,direction,train_id,train_type,station_id,time
weekday,south,weekday-south-A13-express-001,express,A1,06:00
weekday,south,weekday-south-A13-express-001,express,A8,06:19
weekday,south,weekday-south-A13-express-001,express,A12,06:34
weekday,south,weekday-south-A13-express-001,express,A13,06:37
```

欄位說明：

- `service_type`：`weekday`、`weekend`、`daily`
- `direction`：`south` 表示 A1 往機場/環北方向，`north` 表示往 A1 台北車站方向
- `train_id`：同一班車在不同站使用相同 ID，由轉換工具重建
- `train_type`：`local` 或 `express`
- `station_id`：例如 `A1`、`A14a`
- `time`：`HH:mm`，凌晨跨日可使用 `00:xx`，系統會自動視為營業日後段

## 本機測試

不需要 npm install。

```bash
node tests/router.test.mjs
python tools/validate_data.py data/stations.csv data/timetable.csv
```

或直接開本機靜態伺服器：

```bash
python -m http.server 8080
```

然後開：

```text
http://localhost:8080
```

## 注意事項

- App 不處理即時誤點、臨時班距調整、事故、公告停駛。
- 國定假日目前會依日期週末判斷，沒有串政府國定假日 API；遇到國定假日請用假日資料自行確認。
- 如果桃捷班表或新增站點有變更，重新下載 XML、轉換、驗證、發布即可。
- 若你提供 API 端點，之後可以再加一支更新腳本，讓資料更新流程從「手動下載 XML」改成「一鍵抓取 API → 轉換 → 驗證」。
