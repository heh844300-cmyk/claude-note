# 用 Google Gemini 免費金鑰安裝

給「沒有 Claude 或 ChatGPT 訂閱、但有 Google 帳號」的人。全程不用付錢。

> **為什麼不能用 Gemini 訂閱（Google AI Plus／Pro）？**
> 訂閱的額度只能在 Google 自己的 App 和 Antigravity CLI 裡用，沒有給其他程式呼叫的管道；這套系統會在背景自動跑 AI，拿訂閱去跑有被 Google 判定違規、停用帳號的風險。所以改用 Google 官方給程式用的 **Gemini API 金鑰**，它有免費額度，用同一個 Google 帳號就能申請。

## 要花錢嗎？

| 項目 | 費用 |
|---|---|
| Gemini API 金鑰 | **免費額度**（只要不綁定付款帳戶就不會被收費，用完當天的額度就暫停，隔天恢復） |
| Tavily 搜尋金鑰（Agent 查資料用，選填） | **免費方案**每月 1,000 次額度，不用信用卡 |
| Obsidian、Node.js、Tailscale（手機用，選填） | 免費 |

注意：

- **不要在 Google AI Studio／Google Cloud 綁定付款方式（Billing）**。一旦綁定，就會變成付費方案、超過免費額度開始計費。
- **免費額度的隱私條件**：依 [Gemini API 條款](https://ai.google.dev/gemini-api/terms)，免費額度送出的內容，Google 可以用來改進產品，也可能由人工審閱。筆記會送去給 Gemini 整理，所以**不要把密碼、身分證字號、病歷這類敏感資料寫進要整理的筆記**。
- 免費額度只能用 **Flash** 系列模型（名字裡有 `flash` 的），每天能用幾次以 [AI Studio](https://aistudio.google.com/) 裡顯示的為準，Google 會不定期調整。

## 步驟

### 1. 申請 Gemini API 金鑰（約 2 分鐘）

1. 打開 https://aistudio.google.com/apikey ，用 Google 帳號登入，第一次會要你同意條款。
2. 按「建立 API 金鑰」（Create API key）。
3. 複製那串金鑰，先貼在記事本裡（等一下安裝精靈會用到）。**不要傳給任何人**，別人拿到就能用你的額度。

### 2. 申請 Tavily 搜尋金鑰（選填，約 2 分鐘）

想讓 Agent 上網查資料、自動補寫名詞筆記才需要；只要「整理筆記」可以跳過。

1. 打開 https://tavily.com ，註冊帳號（可以用 Google 帳號）。
2. 登入後在 Dashboard 會看到 API Key（`tvly-` 開頭），複製起來。

### 3. 下載程式並執行安裝精靈

照 [README](../README.md) 的「安裝」0～3 步：接受 GitHub 邀請 → 安裝 Git → 下載專案 → 雙擊 `setup.cmd`。安裝精靈裡這樣選：

| 步驟 | 怎麼選 |
|---|---|
| 1/8 Node.js | 照提示，沒有的話它會幫你裝 |
| 2/8 筆記庫 | 選你 Obsidian 打開的那個資料夾 |
| 3/8 選擇 AI | 輸入 **`4`**（Google Gemini（API 金鑰）），貼上第 1 步的金鑰（畫面不會顯示，貼上直接按 Enter） |
| 　整理筆記用的模型 | 從清單選一個名字有 **`flash`** 的（不要選 `pro`，免費額度通常不能用） |
| 　Agent 用的模型 | 直接按 Enter，用同一個 |
| 　模型能讀圖片嗎 | 按 **Y**（Flash 模型可以看照片） |
| 4/8 網路搜尋 | 有 Tavily 金鑰就選 **1** 並貼上；沒有就選 **3**（先不要） |
| 5/8 測試 AI 連線 | 自動測試，看到成功再繼續；失敗通常是金鑰貼錯，或選到不能免費用的模型 |
| 6/8 手機和外出 | 選填，要在手機上用再設定 |
| 7/8 Agent 沙盒 | Gemini 金鑰不支援，精靈會自動略過 |
| 8/8 啟動 | 完成後瀏覽器打開 http://127.0.0.1:8787 |

## 常見問題

- **整理到一半出現錯誤、說超過額度（429）**：今天的免費額度用完了，等隔天，或少用 Agent（每次查資料會用掉好幾次）。上傳草稿時可以取消勾選「讓 Agent 查資料」。
- **想換模型或換金鑰**：重新雙擊 `setup.cmd`。
- **之後想改用訂閱**：如果有 Claude 或 ChatGPT 訂閱，重新執行 `setup.cmd`，第 3 步改選 1 或 2。
