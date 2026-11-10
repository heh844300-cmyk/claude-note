# Claude 筆記

把隨手的想法、照片交給 AI 整理成有結構的 Obsidian 筆記，還有一個會上網查資料的 Agent 幫你處理筆記裡的待辦和疑問。

- 在瀏覽器（或手機）貼上文字、照片 → AI 整理成草稿 → 你修改、或請 AI 重改 → 上傳到 Obsidian
- 草稿可以設定**到期自動刪除**、**提醒推播**
- **Agent**：上網查資料，回答筆記裡的「待釐清問題」、完成能查的「待辦事項」，並把查到的知識分成獨立的研究筆記
- **灰色連結自動補**：在 Obsidian 點一個還沒有筆記的 `[[名詞]]`，1 分鐘後 AI 會自動把它寫成完整筆記
- **瀏覽整個筆記庫**：在網頁上看所有 Obsidian 筆記（唯讀），可以搜尋、點 [[連結]]、看圖片
- 筆記和設定都只存在你自己的電腦

## 需要什麼

- 一台**常開**的 Windows 10／11 電腦，裝好 [Obsidian](https://obsidian.md)
- 一種 AI（安裝時選）：
  - **Claude 訂閱**（Pro／Max）：用 Claude Code 登入，不用另外付費
  - **ChatGPT 訂閱**：用 OpenAI 的 Codex CLI 登入 ChatGPT 帳號，用的是方案內含的 Codex 額度，不用另外付費（安裝精靈會幫你裝 Codex CLI）
  - **API 金鑰，用多少付多少**：OpenAI、Google Gemini、OpenRouter、DeepSeek 等任何「OpenAI 相容」服務
  - **Ollama 本機模型**：完全免費，在自己電腦上跑（需要夠力的電腦）
- 用 API 金鑰或 Ollama、又想用 Agent 查資料的話：一個搜尋服務金鑰（[Tavily](https://tavily.com) 或 [Brave Search API](https://brave.com/search/api/)。是否有免費額度、價格多少，請看各家官網）。Claude 和 ChatGPT 訂閱都內建搜尋，不需要
- 訂閱方案都有使用上限，Agent 用得多時可能暫時用完，要等額度恢復；每個人都要用**自己的**帳號，不能共用

## 安裝

0. 先接受邀請：這是私人專案，請到你的 email 或 GitHub 通知裡，按下專案擁有者寄給你的邀請連結並接受
1. 安裝 Git：在 PowerShell 執行 `winget install --id Git.Git -e`（或到 https://git-scm.com 下載），裝好後關掉再重開 PowerShell
2. 下載這個專案（第一次會跳出 GitHub 登入視窗，用受邀的 GitHub 帳號登入）：
   ```
   cd $HOME
   git clone https://github.com/heh844300-cmyk/claude-note.git ClaudeNote
   ```
3. 打開 `ClaudeNote` 資料夾，**雙擊 `setup.cmd`**，照中文提示一步步完成
4. 瀏覽器打開 http://127.0.0.1:8787 開始使用（`127.0.0.1` 是這台電腦自己，連線不會離開電腦，所以用 http 就安全；從手機或公用電腦連進來時一律是 https）

## 更新

雙擊 `update.cmd`。要改 AI、金鑰、筆記庫等設定，重新執行 `setup.cmd`。

## 解除安裝

雙擊 `uninstall.cmd`，照中文提示操作：停止伺服器、刪除開機自動啟動、關掉這套程式開的 Tailscale 入口（不會動到你其他的 Tailscale 設定），最後在視窗關閉後自動刪除整個程式資料夾（包含設定、金鑰、草稿）。

- **你的筆記一律保留**：Obsidian 筆記庫裡的 Claude-Notes、研究筆記都不會被刪
- 還沒上傳的草稿會提醒你，刪除後就找不回來
- 安裝精靈幫你裝的 Node.js、Tailscale、Codex CLI 等軟體不會自動移除，最後會列出移除指令

## 手機

選配。需要 Tailscale（免費）讓手機安全地連回家裡的電腦。安裝精靈第 6 步「手機和外出使用」會幫你安裝、設定，最後在畫面上顯示 QR code 讓手機一掃就打開；也可以開啟「公用電腦登入」，在外面沒裝 Tailscale 的電腦上用手機掃碼核准後瀏覽、新增筆記。手動設定與細節請看 [docs/手機設定.md](docs/手機設定.md)。

## 隱私與費用

- 你的筆記、草稿、金鑰都只存在你的電腦（`mobile\config.json`、`mobile\data\`），不會上傳到 GitHub
- 整理筆記、Agent 查資料時，相關內容會送到你選的 AI 服務；用 API 金鑰的話依該服務計費。Agent 每次查詢都會用到額度，可以在草稿裡取消勾選「讓 Agent 查資料」
- Agent 只能上網搜尋和讀公開網頁，讀不到你電腦上的檔案；它也無法連到你的電腦或內部網路

## 功能差異

| | Claude 訂閱 | ChatGPT 訂閱（Codex） | API 金鑰／Ollama |
|---|---|---|---|
| 整理筆記、照片 | ✔ | ✔ | ✔（模型要能看圖片） |
| Agent 查資料、灰色連結自動補 | ✔ 內建搜尋 | ✔ 內建搜尋 | ✔ 需要搜尋服務金鑰＋支援工具呼叫的模型 |
| 錄音轉文字 | 進階，需自行安裝 | — | — |
| Agent 沙盒（裝程式測試） | 進階，需自行安裝 | — | — |

技術細節：[docs/技術說明.md](docs/技術說明.md)
