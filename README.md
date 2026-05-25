# 學貸還款 vs 0050 投資試算

比較「盡快還清學貸」與「採最長分期、把每月差額投入元大台灣50（0050）」的試算工具。適合部署於 GitHub Pages。

## 功能

- 輸入貸款金額、開始還款日、年利率、積極還款期數、貸款學期數
- **方案 A**：在指定期數內平均攤還（年金法）
- **方案 B**：最長分期（學期數 × 12 個月），每月還款較低
- **0050 試算**：在積極還款期間，將「方案 A 每月還款 − 方案 B 每月還款」投入 0050
- **已發生 / 預估未來分離**：
  - **已發生**：開始還款日至當月以前，使用 [Yahoo Finance](https://query1.finance.yahoo.com/v8/finance/chart/0050.TW) 實際月報酬
  - **預估未來**：當月及之後，使用過去 10 年 0050 歷史 CAGR 推算月化報酬

## 0050 資料來源

```
GET https://query1.finance.yahoo.com/v8/finance/chart/0050.TW?period1={unix}&period2={unix}&interval=1d
```

- 瀏覽器可能因 CORS 無法直連 Yahoo，此時自動改用內建 `public/data/0050-monthly.json`
- 每週 GitHub Action 以 Node 腳本從 Yahoo 更新內建 JSON（無需 API Token）

## 本機開發

```bash
npm install
npm run dev
```

## 建置

```bash
npm run build
npm run preview
```

手動更新 0050 資料：

```bash
npm run update-0050
```

## 部署到 GitHub Pages

1. 將專案推送到 GitHub（`main` 分支）。
2. 在 repo **Settings → Pages → Build and deployment** 選擇 **GitHub Actions**。
3. 推送後會執行 [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)，網址為：

   `https://<username>.github.io/student_loan/`

## 試算範例（驗證用）

| 欄位 | 值 |
|------|-----|
| 本金 | 500,000 |
| 年利率 | 2% |
| 積極期數 | 60 |
| 學期數 | 8（最長 96 期） |

若開始還款日設在數年前，應看到「已發生」與「預估未來」兩段結果；設在下個月則僅有預估未來區塊。

## 免責聲明

本工具僅供教育與試算，不構成投資、稅務或貸款建議。0050 過去績效不代表未來結果；未來區間為歷史 CAGR 估算，非保證報酬。實際條件請以承貸銀行與就學貸款辦法為準。
