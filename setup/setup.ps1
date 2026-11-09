<#
  Claude 筆記 安裝精靈（Windows PowerShell 5.1）
  由 setup.cmd 啟動。所有設定寫到 mobile\config.json（只存在這台電腦，不會上傳）。

  測試用參數：
    -Answers <json 檔>   預先填好的答案（不互動）
    -ConfigOut <路徑>    設定檔寫到別處（不動到正式設定）
    -NoStartup           不建立開機啟動捷徑
    -NoLaunch            最後不啟動伺服器、不開瀏覽器
#>
param(
    [string]$Answers = "",
    [string]$ConfigOut = "",
    [switch]$NoStartup,
    [switch]$NoLaunch
)
$ErrorActionPreference = "Stop"
$utf8 = New-Object System.Text.UTF8Encoding $false
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8

$Root = Split-Path -Parent $PSScriptRoot
$Mobile = Join-Path $Root "mobile"
if (-not $ConfigOut) { $ConfigOut = Join-Path $Mobile "config.json" }
$Pre = @{}
if ($Answers) { (Get-Content -LiteralPath $Answers -Raw -Encoding UTF8 | ConvertFrom-Json).PSObject.Properties | ForEach-Object { $Pre[$_.Name] = $_.Value } }

function Say($t, $c = "Gray") { Write-Host $t -ForegroundColor $c }
# run a program and capture stdout+stderr as text (PowerShell 5.1 turns stderr into errors under "Stop")
function Run-Capture($exe, [string[]]$argv) {
    $old = $ErrorActionPreference; $ErrorActionPreference = "Continue"
    try { return ((& $exe @argv 2>&1 | ForEach-Object { "$_" }) -join "`n") } finally { $ErrorActionPreference = $old }
}
function Title($t) { Write-Host ""; Write-Host "==== $t ====" -ForegroundColor Cyan }
function Ask($key, $prompt, $default = "") {
    if ($Pre.ContainsKey($key)) { $v = [string]$Pre[$key]; Say "$prompt $v" DarkGray; return $v }
    $d = if ($default) { " [$default]" } else { "" }
    $v = Read-Host "$prompt$d"
    if (-not $v) { $v = $default }
    return $v.Trim()
}
function AskSecret($key, $prompt) {
    if ($Pre.ContainsKey($key)) { Say "$prompt （已提供）" DarkGray; return [string]$Pre[$key] }
    $s = Read-Host $prompt -AsSecureString
    $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
    try { return ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($b)).Trim() } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
}
function YesNo($key, $prompt, $defaultYes = $true) {
    $d = if ($defaultYes) { "Y" } else { "N" }
    $v = Ask $key "$prompt (Y/N)" $d
    return ($v -match '^[Yy]')
}
function Choose($key, $prompt, $items, $default = 1) {
    if (-not $Pre.ContainsKey($key)) { for ($i = 0; $i -lt $items.Count; $i++) { Say ("  {0}) {1}" -f ($i + 1), $items[$i]) White } }
    while ($true) {
        $v = Ask $key $prompt "$default"
        $n = 0
        if ([int]::TryParse($v, [ref]$n) -and $n -ge 1 -and $n -le $items.Count) { return $n }
        if ($Pre.ContainsKey($key)) { throw "答案檔的 $key 不正確：$v" }
        Say "請輸入 1～$($items.Count) 的數字" Yellow
    }
}

Say ""
Say "  Claude 筆記 安裝精靈" Cyan
Say "  把想法、照片交給 AI 整理成 Obsidian 筆記。設定只會存在這台電腦。" Gray

# ---------- 1. Node.js ----------
Title "1/6 檢查 Node.js"
$node = Get-Command node -ErrorAction SilentlyContinue
$nodeOk = $false
if ($node) { $ver = (& node --version) -replace '^v', ''; $nodeOk = ([int]($ver.Split('.')[0]) -ge 20); Say "找到 Node.js $ver" }
if (-not $nodeOk) {
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) { Say "找不到 Node.js 20 以上，也沒有 winget。請到 https://nodejs.org 下載安裝 LTS 版，再重新執行 setup.cmd。" Red; exit 1 }
    if (YesNo "installNode" "需要 Node.js 20 以上。要用 winget 自動安裝 Node.js LTS 嗎？") {
        winget install --id OpenJS.NodeJS.LTS --exact --accept-package-agreements --accept-source-agreements
        $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
        if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Say "安裝完成但還找不到 node，請關掉這個視窗、重新執行 setup.cmd。" Yellow; exit 1 }
    } else { Say "沒有 Node.js 無法執行，結束。" Red; exit 1 }
}

# ---------- 2. vault ----------
Title "2/6 選擇 Obsidian 筆記庫"
Say "筆記庫就是 Obsidian 打開的那個資料夾。整理好的筆記會放在它底下的 Claude-Notes 資料夾。"
$vault = ""
while (-not $vault) {
    $v = Ask "vault" "筆記庫資料夾路徑（直接按 Enter 會跳出選擇視窗）"
    if (-not $v -and $Pre.ContainsKey("vault")) { throw "答案檔沒有填 vault" }
    if (-not $v) {
        Add-Type -AssemblyName System.Windows.Forms
        $dlg = New-Object System.Windows.Forms.FolderBrowserDialog
        $dlg.Description = "選擇 Obsidian 筆記庫資料夾"
        if ($dlg.ShowDialog() -eq 'OK') { $v = $dlg.SelectedPath }
    }
    $v = $v.Trim('"')
    if ($v -and (Test-Path -LiteralPath $v -PathType Container)) { $vault = (Resolve-Path -LiteralPath $v).Path }
    elseif ($Pre.ContainsKey("vault")) { throw "答案檔的資料夾不存在：$v" }
    else { Say "找不到這個資料夾，請再試一次。" Yellow }
}
if (-not (Test-Path -LiteralPath (Join-Path $vault ".obsidian"))) { Say "提醒：這個資料夾還沒被 Obsidian 開過（沒有 .obsidian），確定是筆記庫嗎？之後也可以重新執行精靈修改。" Yellow }

# ---------- 3. AI ----------
Title "3/6 選擇 AI"
$providers = @(
    "Claude 訂閱（用 Claude Code 登入，不需要 API 金鑰）",
    "ChatGPT 訂閱（用 Codex CLI 登入，不需要 API 金鑰）",
    "OpenAI（API 金鑰）",
    "Google Gemini（API 金鑰）",
    "Ollama 本機模型（免費，在這台電腦上跑，需要先安裝 Ollama 並下載模型）",
    "其他 OpenAI 相容服務（OpenRouter、DeepSeek、LM Studio…）"
)
$p = Choose "provider" "請選擇" $providers 1
$cfg = [ordered]@{ vault = $vault }

function Get-Models($base, $key) {
    try {
        $h = @{}; if ($key) { $h["Authorization"] = "Bearer $key" }
        $r = Invoke-RestMethod -Uri ($base.TrimEnd('/') + "/models") -Headers $h -TimeoutSec 30
        return @($r.data | ForEach-Object { $_.id } | Where-Object { $_ } | Sort-Object)
    } catch { Say ("讀取模型清單失敗：" + $_.Exception.Message) Yellow; return @() }
}
function Pick-Model($key, $prompt, $models, $default) {
    if ($models.Count -gt 0 -and $models.Count -le 60) {
        if (-not $Pre.ContainsKey($key)) { for ($i = 0; $i -lt $models.Count; $i++) { Say ("  {0}) {1}" -f ($i + 1), $models[$i]) White } }
        $v = Ask $key "$prompt（輸入編號或模型名稱）" $default
        $n = 0; if ([int]::TryParse($v, [ref]$n) -and $n -ge 1 -and $n -le $models.Count) { return $models[$n - 1] }
        return $v
    }
    if ($models.Count -gt 60) { Say ("這個服務有 {0} 個模型，請直接輸入名稱（可在服務的網站上查）。" -f $models.Count) }
    return (Ask $key "$prompt（模型名稱）" $default)
}

if ($p -eq 1) {
    $cfg.provider = "claude"
    $claudeExe = Join-Path $env:USERPROFILE ".local\bin\claude.exe"
    if (-not (Test-Path $claudeExe)) { $c = Get-Command claude -ErrorAction SilentlyContinue; if ($c) { $claudeExe = $c.Source } else { $claudeExe = "" } }
    if (-not $claudeExe) {
        Say "這台電腦還沒有 Claude Code。"
        if (YesNo "installClaude" "要用官方安裝指令（irm https://claude.ai/install.ps1 | iex）安裝嗎？") {
            Invoke-RestMethod https://claude.ai/install.ps1 | Invoke-Expression
            $claudeExe = Join-Path $env:USERPROFILE ".local\bin\claude.exe"
        }
        if (-not (Test-Path $claudeExe)) { Say "找不到 claude.exe。請安裝 Claude Code 後重新執行 setup.cmd。" Red; exit 1 }
    }
    $cfg.claude = $claudeExe
    Say "如果還沒登入：請另外開一個 PowerShell 視窗，輸入 claude 並照畫面登入你的 Claude 帳號，完成後回到這裡。" Yellow
    [void](Ask "claudeLoggedIn" "已經登入就按 Enter 繼續")
    $cfg.smallModel = "haiku"; $cfg.bigModel = "sonnet"; $cfg.agentModel = "sonnet"; $cfg.librarianModel = "haiku"
} elseif ($p -eq 2) {
    $cfg.provider = "codex"
    $codexJs = Join-Path $env:APPDATA "npm\node_modules\@openai\codex\bin\codex.js"
    if (-not (Test-Path $codexJs)) {
        Say "這台電腦還沒有 Codex CLI。"
        if (YesNo "installCodex" "要用 npm 安裝 OpenAI 官方的 Codex CLI（npm install -g @openai/codex）嗎？") {
            & npm install -g @openai/codex
        }
        if (-not (Test-Path $codexJs)) { Say "找不到 Codex CLI。請安裝後重新執行 setup.cmd。" Red; exit 1 }
    }
    $cfg.codex = $codexJs
    $st = (Run-Capture node @($codexJs, "login", "status"))
    while ($st -notmatch 'Logged in') {
        Say "Codex 還沒登入。請另外開一個 PowerShell 視窗，輸入 codex login，選擇用 ChatGPT 帳號登入（會開瀏覽器），完成後回到這裡。" Yellow
        [void](Ask "codexLoggedIn" "登入完成後按 Enter 繼續")
        $st = (Run-Capture node @($codexJs, "login", "status"))
        if ($Pre.ContainsKey("codexLoggedIn") -and $st -notmatch 'Logged in') { throw "Codex 沒有登入" }
    }
    Say ("Codex：" + $st.Trim()) Green
    # blank model = Codex's default model for your plan
    $cfg.smallModel = ""; $cfg.bigModel = ""; $cfg.agentModel = ""; $cfg.librarianModel = ""; $cfg.vision = $true
} else {
    $cfg.provider = "openai"
    switch ($p) {
        3 { $base = "https://api.openai.com/v1"; $needKey = $true; Say "金鑰在 https://platform.openai.com/api-keys 建立（需要先儲值）。" }
        4 { $base = "https://generativelanguage.googleapis.com/v1beta/openai/"; $needKey = $true; Say "金鑰在 https://aistudio.google.com/apikey 建立。" }
        5 { $base = "http://127.0.0.1:11434/v1"; $needKey = $false; Say "請先安裝 Ollama（https://ollama.com），並用 ollama pull <模型> 下載模型，例如支援工具呼叫的 qwen3 或 llama3.1。" }
        6 { $base = Ask "apiBaseUrl" "服務的 API 網址（例如 https://openrouter.ai/api/v1）"; $needKey = $true }
    }
    $key = ""
    if ($needKey) { while (-not $key) { $key = AskSecret "apiKey" "請貼上 API 金鑰（畫面不會顯示）" } }
    $cfg.apiBaseUrl = $base; $cfg.apiKey = $key
    Say "讀取可用的模型…"
    $models = Get-Models $base $key
    $m1 = Pick-Model "model" "整理筆記用的模型（建議便宜、快的）" $models ""
    while (-not $m1) { $m1 = Ask "model" "請輸入模型名稱" }
    $m2 = Pick-Model "agentModel" "Agent 查資料用的模型（要支援工具呼叫，直接按 Enter 用同一個）" $models $m1
    $cfg.smallModel = $m1; $cfg.bigModel = $m1; $cfg.librarianModel = $m1; $cfg.agentModel = $m2
    $cfg.vision = (YesNo "vision" "整理用的模型能讀圖片嗎？（不確定就選 Y，不行的話照片仍會附在筆記裡）")

    # ---------- 4. search ----------
    Title "4/6 Agent 的網路搜尋（選填）"
    Say "Agent 會幫你查筆記裡的待辦與問題、自動補寫名詞筆記。這需要一個搜尋服務的金鑰（費用與免費額度請看各家官網）。"
    $s = Choose "search" "請選擇" @("Tavily（https://tavily.com）", "Brave Search（https://brave.com/search/api/）", "先不要（不使用 Agent）") 1
    if ($s -le 2) {
        $sk = ""; while (-not $sk) { $sk = AskSecret "searchKey" "請貼上搜尋服務的金鑰（畫面不會顯示）" }
        $cfg.search = [ordered]@{ provider = $(if ($s -eq 1) { "tavily" } else { "brave" }); apiKey = $sk }
    } else { $cfg.search = [ordered]@{ provider = ""; apiKey = "" } }
}
if ($p -eq 1) { Title "4/6 Agent 的網路搜尋"; Say "Claude Code 內建網路搜尋，不用另外設定。" }
if ($p -eq 2) { Title "4/6 Agent 的網路搜尋"; Say "Codex 內建網路搜尋（在 OpenAI 的伺服器上執行），不用另外設定。" }

# keep settings this wizard doesn't ask about (e.g. phone / public entrance) when re-running
if (Test-Path -LiteralPath $ConfigOut) {
    try {
        $old = Get-Content -LiteralPath $ConfigOut -Raw -Encoding UTF8 | ConvertFrom-Json
        foreach ($prop in $old.PSObject.Properties) { if (-not $cfg.Contains($prop.Name)) { $cfg[$prop.Name] = $prop.Value } }
    } catch {}
}
[IO.File]::WriteAllText($ConfigOut, ($cfg | ConvertTo-Json -Depth 5), $utf8)
Say "設定已寫入 $ConfigOut" Green

# ---------- 5. test ----------
Title "5/6 測試 AI 連線"
$env:CN_CONFIG = $ConfigOut; $env:CN_SELFTEST = "1"
$out = Run-Capture node @((Join-Path $Mobile "server.js"))
Remove-Item Env:CN_SELFTEST; Remove-Item Env:CN_CONFIG
$res = $null; try { $res = ($out.Trim().Split("`n")[-1]) | ConvertFrom-Json } catch {}
if (-not $res -or -not $res.ok) {
    Say "連線失敗：" Red; Say $out Red
    Say "請檢查金鑰、網址或模型名稱，然後重新執行 setup.cmd。" Yellow
    exit 1
}
Say "整理筆記：可以使用 ✔" Green
if ($cfg.provider -eq "openai") {
    if (-not $res.agent) { Say "Agent：未設定搜尋服務，已關閉（之後可重新執行精靈開啟）。" Yellow }
    elseif ($res.tools) { Say "Agent：模型支援工具呼叫 ✔" Green }
    else { Say "Agent：這個模型似乎不支援工具呼叫，Agent 可能無法正常查資料。建議換一個 Agent 模型。" Yellow }
}

# ---------- 6. start ----------
Title "6/6 啟動"
$vbs = Join-Path $Mobile "start-hidden.vbs"
if (-not $NoStartup) {
    if (YesNo "startup" "要開機時自動在背景啟動嗎？（建議）") {
        $lnk = Join-Path ([Environment]::GetFolderPath('Startup')) "Claude 筆記伺服器.lnk"
        $w = New-Object -ComObject WScript.Shell; $sc = $w.CreateShortcut($lnk)
        $sc.TargetPath = "wscript.exe"; $sc.Arguments = '"' + $vbs + '"'; $sc.WorkingDirectory = $Mobile; $sc.Save()
        Say "已建立開機啟動捷徑。" Green
    }
}
if (-not $NoLaunch) {
    & (Join-Path $Mobile "stop-server.cmd") | Out-Null
    Start-Process wscript.exe -ArgumentList ('"' + $vbs + '"')
    Start-Sleep -Seconds 4
    Start-Process "http://127.0.0.1:8787"
}

Title "完成"
Say "在瀏覽器打開 http://127.0.0.1:8787 就能使用。" Green
Say "想在手機上用：請看 docs\手機設定.md（選配，需要 Tailscale）。" Gray
Say "之後要更新程式：執行 update.cmd。要改設定：重新執行 setup.cmd。" Gray
