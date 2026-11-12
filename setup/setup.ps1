<#
  Claude 筆記 安裝精靈（Windows PowerShell 5.1）
  由 setup.cmd 啟動。所有設定寫到 mobile\config.json（只存在這台電腦，不會上傳）。

  測試用參數：
    -Answers <json 檔>   預先填好的答案（不互動）
    -ConfigOut <路徑>    設定檔寫到別處（不動到正式設定）
    -NoStartup           不建立開機啟動捷徑
    -NoLaunch            最後不啟動伺服器、不開瀏覽器
    -DryRunTailscale     只顯示要執行的 tailscale serve／funnel 指令，不真的執行
#>
param(
    [string]$Answers = "",
    [string]$ConfigOut = "",
    [switch]$NoStartup,
    [switch]$NoLaunch,
    [switch]$DryRunTailscale,
    [string]$SandboxName = "ClaudeSandbox",   # test runs use another name so the real sandbox is never touched
    [string]$SandboxDir = ""
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
Title "1/8 檢查 Node.js"
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
Title "2/8 選擇 Obsidian 筆記庫"
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
Title "3/8 選擇 AI"
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
    Title "4/8 Agent 的網路搜尋（選填）"
    Say "Agent 會幫你查筆記裡的待辦與問題、自動補寫名詞筆記。這需要一個搜尋服務的金鑰（費用與免費額度請看各家官網）。"
    $s = Choose "search" "請選擇" @("Tavily（https://tavily.com）", "Brave Search（https://brave.com/search/api/）", "先不要（不使用 Agent）") 1
    if ($s -le 2) {
        $sk = ""; while (-not $sk) { $sk = AskSecret "searchKey" "請貼上搜尋服務的金鑰（畫面不會顯示）" }
        $cfg.search = [ordered]@{ provider = $(if ($s -eq 1) { "tavily" } else { "brave" }); apiKey = $sk }
    } else { $cfg.search = [ordered]@{ provider = ""; apiKey = "" } }
}
if ($p -eq 1) { Title "4/8 Agent 的網路搜尋"; Say "Claude Code 內建網路搜尋，不用另外設定。" }
if ($p -eq 2) { Title "4/8 Agent 的網路搜尋"; Say "Codex 內建網路搜尋（在 OpenAI 的伺服器上執行），不用另外設定。" }

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
Title "5/8 測試 AI 連線"
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

# ---------- 6. phone & away (optional) ----------
Title "6/8 手機和外出使用（選填）"
Say "想在手機上用，或在外面的公用電腦上看筆記，需要 Tailscale（免費）。它讓你的手機安全地連回這台電腦，不用在路由器開任何連接埠。"
$mobileUrl = ""; $funnelOn = $false
function Get-TsExe {
    $p = "C:\Program Files\Tailscale\tailscale.exe"; if (Test-Path $p) { return $p }
    $c = Get-Command tailscale -ErrorAction SilentlyContinue; if ($c) { return $c.Source }; return ""
}
function Get-TsStatus($ts) { try { return ((Run-Capture $ts @("status", "--json")) | ConvertFrom-Json) } catch { return $null } }
# runs a tailscale command that changes settings (or only prints it with -DryRunTailscale)
function Ts-Change($ts, [string[]]$argv) {
    Say ("執行：tailscale " + ($argv -join ' ')) DarkGray
    if ($DryRunTailscale) { Say "（測試模式，沒有真的執行）" DarkGray; return "" }
    return (Run-Capture $ts $argv)
}
if (YesNo "mobile" "要設定手機和外出使用嗎？（之後也可以重新執行精靈再設定）" $false) {
    $ts = Get-TsExe
    if (-not $ts) {
        if (YesNo "installTailscale" "這台電腦還沒有 Tailscale。要用 winget 安裝嗎？（可能會跳出系統管理員權限確認）") {
            winget install --id tailscale.tailscale --exact --accept-package-agreements --accept-source-agreements
            $ts = Get-TsExe
        }
    }
    if (-not $ts) { Say "沒有 Tailscale，略過這一步。" Yellow }
    else {
        $st = Get-TsStatus $ts
        while (-not $st -or $st.BackendState -ne "Running") {
            Say "Tailscale 還沒登入。請點工作列右下角的 Tailscale 圖示 →「Log in」，用 Google、GitHub 或 Microsoft 帳號登入；" Yellow
            Say "手機也要安裝 Tailscale App 並用「同一個帳號」登入。" Yellow
            [void](Ask "tailscaleLoggedIn" "登入完成後按 Enter 繼續")
            $st = Get-TsStatus $ts
            if ($Pre.ContainsKey("tailscaleLoggedIn") -and (-not $st -or $st.BackendState -ne "Running")) { throw "Tailscale 沒有登入" }
        }
        while (-not $st.CurrentTailnet.MagicDNSEnabled -or -not $st.CertDomains -or @($st.CertDomains).Count -eq 0) {
            Say "還要在 Tailscale 網站開兩個設定：打開 https://login.tailscale.com/admin/dns ，確認「MagicDNS」已開啟，並在「HTTPS Certificates」按 Enable。" Yellow
            [void](Ask "tailscaleDns" "設定好後按 Enter 繼續")
            $st = Get-TsStatus $ts
            if ($Pre.ContainsKey("tailscaleDns") -and (-not $st.CertDomains -or @($st.CertDomains).Count -eq 0)) { throw "Tailscale 的 HTTPS 憑證沒有開啟" }
        }
        $hostName = ([string]$st.Self.DNSName).TrimEnd('.')
        $mobileUrl = "https://$hostName"
        Say "你的電腦在 Tailscale 上的名稱：$hostName" Green
        if (YesNo "serve" "要讓你 Tailscale 裡的裝置（例如手機）連到筆記伺服器嗎？（執行 tailscale serve，只有你自己的裝置連得到）") {
            [void](Ts-Change $ts @("serve", "--bg", "8787"))
            $cfg2 = Get-Content -LiteralPath $ConfigOut -Raw -Encoding UTF8 | ConvertFrom-Json
            $cfg2 | Add-Member -NotePropertyName publicUrl -NotePropertyValue $mobileUrl -Force
            Say "手機網址：$mobileUrl" Green

            Say ""
            Say "【公用電腦】在外面沒裝 Tailscale 的電腦上看筆記：會開一個公開網址，但進去一定要先用你的手機掃 QR code 核准；"
            Say "公用電腦可以瀏覽筆記、新增筆記、叫 Agent 查資料，但不能核准別的登入或刪除草稿；2 小時後失效、閒置 15 分鐘自動登出。"
            if (YesNo "funnel" "要開啟公用電腦登入嗎？（執行 tailscale funnel，開放 8443 埠到網路上）" $false) {
                $caps = @($st.Self.Capabilities)
                if (-not $DryRunTailscale -and -not ($caps -contains "funnel")) {
                    Say "你的 Tailscale 帳號還沒允許 Funnel。執行下面的指令時，如果畫面出現一個網址，請用瀏覽器打開並按允許。" Yellow
                }
                $out = Ts-Change $ts @("funnel", "--bg", "--https=8443", "http://127.0.0.1:8788")
                if ($out -match 'https://login\.tailscale\.com\S+') {
                    Say ("請打開這個網址允許 Funnel：" + $Matches[0]) Yellow
                    [void](Ask "funnelEnabled" "允許後按 Enter 繼續")
                    $out = Ts-Change $ts @("funnel", "--bg", "--https=8443", "http://127.0.0.1:8788")
                }
                if ($DryRunTailscale -or $out -match 'Funnel started|Available on the internet|already') {
                    $cfg2 | Add-Member -NotePropertyName publicPort -NotePropertyValue 8788 -Force
                    $cfg2 | Add-Member -NotePropertyName funnelUrl -NotePropertyValue "https://${hostName}:8443" -Force
                    $funnelOn = $true
                    Say "公用電腦網址：https://${hostName}:8443 （公開 DNS 最多要等 10 分鐘才會生效）" Green
                } else { Say "Funnel 沒有開成功，略過公用電腦登入：" Yellow; Say $out Yellow }
            }
            [IO.File]::WriteAllText($ConfigOut, ($cfg2 | ConvertTo-Json -Depth 5), $utf8)
        } else { $mobileUrl = "" }
    }
}

# ---------- 7. Agent sandbox (advanced, optional) ----------
Title "7/8 進階：Agent 沙盒（選填）"
$cfgNow = Get-Content -LiteralPath $ConfigOut -Raw -Encoding UTF8 | ConvertFrom-Json
if ($cfgNow.provider -ne "claude" -and $cfgNow.provider -ne "codex") {
    Say "沙盒只支援 Claude 和 ChatGPT（Codex）訂閱，這次選的 AI 不能用，略過。"
} else {
    Say "沙盒是一台隔離的小 Linux（WSL），讓 Agent 遇到「要安裝、測試程式」的待辦時，可以真的裝起來試。"
    Say "沙盒裡的程式碰不到你電腦上的檔案、筆記伺服器、Tailscale 和區網。沒有沙盒時，這類待辦只會寫出建議步驟。"
    Say "需要：下載約 2 GB、磁碟空間約 6 GB、10～20 分鐘；如果電腦還沒開 WSL，要系統管理員權限並重新開機一次。" Yellow
    if (YesNo "sandbox" "要建立沙盒嗎？" $false) {
        $sbxDir = if ($SandboxDir) { $SandboxDir } else { Join-Path $Root "sandbox" }
        $drive = (Get-Item -LiteralPath $Root).PSDrive
        $freeGB = [math]::Round($drive.Free / 1GB, 1)
        $go = $true
        if ($freeGB -lt 6) { Say "磁碟 $($drive.Name): 只剩 $freeGB GB，至少要 6 GB，略過沙盒。" Red; $go = $false }
        $wslcfg = Join-Path $env:USERPROFILE ".wslconfig"
        if ($go -and (Test-Path $wslcfg) -and ((Get-Content $wslcfg -Raw) -match 'networkingMode\s*=\s*mirrored')) {
            Say "注意：你的 WSL 設成 mirrored 網路模式，隔離規則沒有在這種模式下測試過；稍後的隔離檢查沒通過的話，沙盒不會啟用。" Yellow
        }
        $sbxJs = Join-Path $PSScriptRoot "sandbox-setup.js"
        if ($go) {
            $st = (Run-Capture node @($sbxJs, "status", "--name", $SandboxName, "--dir", $sbxDir)).Split("`n") | Where-Object { $_ -like 'RESULT *' } | Select-Object -Last 1
            $st = if ($st) { $st.Substring(7) | ConvertFrom-Json } else { $null }
            if (-not $st -or -not $st.wsl) {
                Say "這台電腦還沒有啟用 WSL。" Yellow
                if (YesNo "installWsl" "要現在安裝嗎？（會跳出系統管理員權限確認，裝完要重新開機）") {
                    try {
                        Start-Process wsl.exe -ArgumentList "--install", "--no-distribution" -Verb RunAs -Wait
                        Say "WSL 安裝完成。請重新開機，開機後再執行一次 setup.cmd，到這一步選 Y 就會接著建立沙盒。" Green
                    } catch { Say ("WSL 安裝沒有完成：" + $_.Exception.Message) Red }
                    Say "如果安裝時出現「虛擬化未啟用」之類的錯誤，要到電腦的 BIOS 開啟虛擬化（Intel VT-x 或 AMD-V），可以搜尋你的電腦型號加「開啟虛擬化」。" Gray
                }
                $go = $false
            }
        }
        if ($go) {
            # what the sandbox must NOT reach: this PC on Tailscale and the home router
            $tsIp = ""; $tsName = ""   # empty = no Tailscale: those two checks are skipped
            $tsExe = "C:\Program Files\Tailscale\tailscale.exe"
            if (Test-Path $tsExe) { try { $j = (Run-Capture $tsExe @("status", "--json")) | ConvertFrom-Json; if ($j.Self.TailscaleIPs) { $tsIp = @($j.Self.TailscaleIPs)[0] }; if ($j.Self.DNSName) { $tsName = ([string]$j.Self.DNSName).TrimEnd('.') } } catch {} }
            $lanGw = ""
            try { $lanGw = (Get-NetRoute -DestinationPrefix "0.0.0.0/0" -ErrorAction Stop | Where-Object { $_.NextHop -ne "0.0.0.0" } | Sort-Object RouteMetric | Select-Object -First 1).NextHop } catch {}
            $res = $null
            & node $sbxJs install --name $SandboxName --dir $sbxDir --tailnet-ip "$tsIp" --tailnet-name "$tsName" --lan-gw "$lanGw" | ForEach-Object {
                if ($_ -like 'RESULT *') { $res = $_.Substring(7) | ConvertFrom-Json } else { Say $_ }
            }
            if ($res -and $res.ok) {
                $cfgNow | Add-Member -NotePropertyName sandbox -NotePropertyValue $true -Force
                $cfgNow | Add-Member -NotePropertyName sandboxName -NotePropertyValue $SandboxName -Force
                if ($SandboxDir) { $cfgNow | Add-Member -NotePropertyName sandboxDir -NotePropertyValue $SandboxDir -Force }
                [IO.File]::WriteAllText($ConfigOut, ($cfgNow | ConvertTo-Json -Depth 5), $utf8)
                Say "沙盒建立完成，隔離檢查全部通過 ✔ Agent 之後遇到要安裝、測試的待辦，會在沙盒裡實際試。" Green
            } else {
                $cfgNow | Add-Member -NotePropertyName sandbox -NotePropertyValue $false -Force
                [IO.File]::WriteAllText($ConfigOut, ($cfgNow | ConvertTo-Json -Depth 5), $utf8)
                Say ("沙盒沒有啟用：" + $(if ($res) { $res.error } else { "安裝程式沒有回應" })) Red
                if ($res -and $res.bad) { $res.bad | ForEach-Object { Say ("  " + $_) Red } }
            }
        }
    } elseif ($cfgNow.sandbox) { Say "保留之前建立的沙盒。" }
}

# ---------- 8. start ----------
Title "8/8 啟動"
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
Say "在這台電腦的瀏覽器打開 http://127.0.0.1:8787 就能使用。" Green
if ($mobileUrl) {
    Say ""
    Say "【手機】手機開著 Tailscale，用相機掃下面的 QR code（或直接輸入 $mobileUrl ）：" Cyan
    & node (Join-Path $PSScriptRoot "qr-term.js") $mobileUrl
    Say "打開後在瀏覽器選單選「加到主畫面」，再按右上角「⚙️ 設定・通知」→「開啟通知」。" Gray
    if ($funnelOn) {
        Say ""
        Say "【公用電腦】在外面的電腦打開 https://${hostName}:8443 ，用手機掃畫面上的 QR code 核准。" Cyan
        Say "第一次核准時，你的手機要開著 Tailscale。" Gray
    }
    if (-not $NoLaunch -and -not $DryRunTailscale) {
        try { $h = Invoke-WebRequest -Uri "$mobileUrl/api/health" -UseBasicParsing -TimeoutSec 20; if ($h.StatusCode -eq 200) { Say "已確認手機網址可以連到伺服器 ✔" Green } }
        catch { Say "手機網址暫時連不上（剛開啟時可能要等一下）。稍後用手機試試看。" Yellow }
    }
} else {
    $cur = $null; try { $cur = Get-Content -LiteralPath $ConfigOut -Raw -Encoding UTF8 | ConvertFrom-Json } catch {}
    if ($cur -and $cur.publicUrl) {
        Say "手機網址（之前設定的）：$($cur.publicUrl)" Gray
        if ($cur.funnelUrl -and $cur.publicPort) { Say "公用電腦網址（之前設定的）：$($cur.funnelUrl)" Gray }
    } else { Say "想在手機或公用電腦上用：重新執行 setup.cmd，在第 6 步選 Y。" Gray }
}
Say "之後要更新程式：執行 update.cmd。要改設定：重新執行 setup.cmd。" Gray
