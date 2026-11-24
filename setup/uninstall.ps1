<#
  Claude 筆記 解除安裝（Windows PowerShell 5.1）。由 uninstall.cmd 啟動。
  你的筆記（Obsidian 筆記庫裡的 Claude-Notes：筆記、知識庫）一律保留，不會刪除。

  測試用參數：
    -Answers <json 檔>   預先填好的答案（不互動）
    -DryRun              只顯示會做什麼，不真的做
#>
param(
    [string]$Answers = "",
    [switch]$DryRun
)
$ErrorActionPreference = "Stop"
$utf8 = New-Object System.Text.UTF8Encoding $false
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8

$Root = Split-Path -Parent $PSScriptRoot
$Mobile = Join-Path $Root "mobile"
$Pre = @{}
if ($Answers) { (Get-Content -LiteralPath $Answers -Raw -Encoding UTF8 | ConvertFrom-Json).PSObject.Properties | ForEach-Object { $Pre[$_.Name] = $_.Value } }

function Say($t, $c = "Gray") { Write-Host $t -ForegroundColor $c }
function Title($t) { Write-Host ""; Write-Host "==== $t ====" -ForegroundColor Cyan }
function YesNo($key, $prompt, $defaultYes = $true) {
    $d = if ($defaultYes) { "Y" } else { "N" }
    if ($Pre.ContainsKey($key)) { $v = [string]$Pre[$key]; Say "$prompt (Y/N) $v" DarkGray }
    else { $v = Read-Host "$prompt (Y/N) [$d]"; if (-not $v) { $v = $d } }
    return ($v -match '^[Yy]')
}
function Run-Capture($exe, [string[]]$argv) {
    $old = $ErrorActionPreference; $ErrorActionPreference = "Continue"
    try { return ((& $exe @argv 2>&1 | ForEach-Object { "$_" }) -join "`n") } finally { $ErrorActionPreference = $old }
}
function Do-It($desc, [scriptblock]$action) {
    if ($DryRun) { Say "（測試模式）會執行：$desc" DarkGray; return }
    & $action
}

# safety: only ever act on a real Claude 筆記 folder
if (-not ((Test-Path (Join-Path $Mobile "server.js")) -and (Test-Path (Join-Path $Root "setup\setup.ps1")))) { Say "這不是 Claude 筆記的程式資料夾，停止。" Red; exit 1 }

$cfg = $null
try { $cfg = Get-Content -LiteralPath (Join-Path $Mobile "config.json") -Raw -Encoding UTF8 | ConvertFrom-Json } catch {}

Say ""
Say "  Claude 筆記 解除安裝" Cyan
Say "  程式資料夾：$Root"
Say "  你的筆記一律保留，不會被刪除。" Green
if (-not (YesNo "go" "確定要解除安裝嗎？" $false)) { Say "已取消，什麼都沒有改。"; exit 0 }

# ---------- 1. stop ----------
Title "1/6 停止伺服器"
Do-It "停止這個資料夾的伺服器" { & (Join-Path $Mobile "stop-server.cmd") | Out-Null }
Say "已停止。" Green

# ---------- 2. startup shortcut ----------
Title "2/6 開機自動啟動"
$startup = [Environment]::GetFolderPath('Startup')
$sh = New-Object -ComObject WScript.Shell
$mine = @(Get-ChildItem -LiteralPath $startup -Filter *.lnk -ErrorAction SilentlyContinue | Where-Object {
    $l = $sh.CreateShortcut($_.FullName); ($l.Arguments + ' ' + $l.TargetPath) -like ('*' + (Join-Path $Mobile "start-hidden.vbs") + '*') })
if ($mine.Count) { foreach ($f in $mine) { Do-It "刪除捷徑 $($f.Name)" { Remove-Item -LiteralPath $f.FullName -Force }; Say "已刪除開機捷徑：$($f.Name)" Green } }
else { Say "沒有找到這個資料夾的開機捷徑。" }

# ---------- 3. tailscale ----------
Title "3/6 Tailscale 分享設定"
$ts = "C:\Program Files\Tailscale\tailscale.exe"
if (-not (Test-Path $ts)) { $c = Get-Command tailscale -ErrorAction SilentlyContinue; $ts = if ($c) { $c.Source } else { "" } }
$offs = @()
if ($ts) {
    $raw = Run-Capture $ts @("serve", "status", "--json")
    $st = $null; try { $st = $raw | ConvertFrom-Json } catch {}
    if ($st -and $st.Web) {
        foreach ($p in $st.Web.PSObject.Properties) {
            $port = ($p.Name -split ':')[-1]
            $proxies = @($p.Value.Handlers.PSObject.Properties | ForEach-Object { $_.Value.Proxy })
            # only the two entrances this program creates: 8787 (tailnet) and 8788 (public, funnel)
            if ($proxies -match '127\.0\.0\.1:8787$') { $offs += [pscustomobject]@{ port = $port; kind = "serve"; desc = "手機用的入口（https 埠 $port → 筆記伺服器）" } }
            if ($proxies -match '127\.0\.0\.1:8788$') { $offs += [pscustomobject]@{ port = $port; kind = "funnel"; desc = "公用電腦用的公開入口（https 埠 $port → QR 登入）" } }
        }
    }
}
if (-not $offs.Count) { Say "沒有找到這套程式開的 Tailscale 分享，不用處理。" }
else {
    $offs | ForEach-Object { Say ("  - " + $_.desc) }
    Say "只會關掉上面這些，Tailscale 的其他設定不會動。"
    if (YesNo "tailscale" "要關掉嗎？") {
        foreach ($o in $offs) {
            $verb = if ($o.kind -eq "funnel") { "funnel" } else { "serve" }
            Do-It "tailscale $verb --https=$($o.port) off" { [void](Run-Capture $ts @($verb, "--https=$($o.port)", "off")) }
            Say "已關閉：$($o.desc)" Green
        }
    } else { Say "保留 Tailscale 分享設定。" }
}

# ---------- 4. Agent sandbox ----------
Title "4/6 Agent 沙盒"
$sbxName = if ($cfg -and $cfg.sandboxName) { $cfg.sandboxName } else { "ClaudeSandbox" }
$sbxDir = if ($cfg -and $cfg.sandboxDir) { $cfg.sandboxDir } else { Join-Path $Root "sandbox" }
$sbxBlocks = $false   # a sandbox disk left inside the folder would block deleting it
$sst = $null
try { $line = (Run-Capture node @((Join-Path $PSScriptRoot "sandbox-setup.js"), "status", "--name", $sbxName, "--dir", $sbxDir)).Split("`n") | Where-Object { $_ -like 'RESULT *' } | Select-Object -Last 1; if ($line) { $sst = $line.Substring(7) | ConvertFrom-Json } } catch {}
if ($sst -and $sst.exists -and $sst.owned) {
    Say "這個程式建立的沙盒（WSL 發行版「$sbxName」）還在，約佔 5 GB。"
    if (YesNo "sandbox" "要刪除沙盒嗎？（只刪這一個，你其他的 WSL 發行版不會動）") {
        Do-It "移除 WSL 發行版 $sbxName" { $r = Run-Capture node @((Join-Path $PSScriptRoot "sandbox-setup.js"), "remove", "--name", $sbxName, "--dir", $sbxDir); Say ($r.Split("`n") | Select-Object -Last 1) DarkGray }
        Say "已刪除沙盒。" Green
    } else { Say "保留沙盒。"; $sbxBlocks = $sbxDir -like ($Root + '*') }
} elseif ($sst -and $sst.exists) { Say "WSL 裡的「$sbxName」不是這個資料夾建立的，不會動它。" }
else { Say "沒有沙盒，不用處理。" }

# ---------- 5. folder + data ----------
Title "5/6 刪除程式資料夾"
$drafts = @(Get-ChildItem -LiteralPath (Join-Path $Mobile "data\drafts") -Directory -ErrorAction SilentlyContinue).Count
Say "會刪除整個資料夾 $Root ，包含：程式、設定（API 金鑰）、草稿、推播金鑰、登入紀錄、執行紀錄。"
if ($drafts) { Say "注意：還有 $drafts 篇草稿沒有上傳到 Obsidian，刪除後就找不回來。" Yellow }
$vaultInside = $cfg -and $cfg.vault -and ((Resolve-Path -LiteralPath $cfg.vault -ErrorAction SilentlyContinue).Path -like ($Root + '*'))
$deleteFolder = $false
if ($vaultInside) { Say "你的筆記庫在這個資料夾裡面，為了保護筆記，不會自動刪除資料夾，請自己處理。" Red }
elseif ($sbxBlocks) { Say "沙盒還留在這個資料夾裡（WSL 正在使用它的檔案），所以不會刪除資料夾。要刪的話，重新執行解除安裝並選擇刪除沙盒。" Yellow }
elseif (YesNo "deleteFolder" "要在這個視窗關閉後自動刪除整個資料夾嗎？") { $deleteFolder = $true }
else { Say "保留資料夾。之後想刪，直接刪除 $Root 即可。" }
$codexTmp = Join-Path $env:TEMP "claude-note-codex-empty"
if (Test-Path $codexTmp) { Do-It "刪除暫存資料夾 $codexTmp" { Remove-Item -LiteralPath $codexTmp -Recurse -Force -ErrorAction SilentlyContinue } }

# ---------- 5. other software ----------
Title "6/6 其他軟體（不會自動移除）"
Say "安裝精靈可能幫你裝過下面這些軟體，其他程式也可能在用，所以不會自動移除。要移除的話，在 PowerShell 執行："
Say "  Node.js：    winget uninstall --id OpenJS.NodeJS.LTS" White
Say "  Tailscale：  winget uninstall --id tailscale.tailscale" White
Say "  Codex CLI：  npm uninstall -g @openai/codex" White
Say "  Claude Code：請看 Claude Code 官方說明的解除安裝方式" White
Say "  Git：        winget uninstall --id Git.Git" White

Title "完成"
if ($cfg -and $cfg.vault) { Say "你的筆記還在：$($cfg.vault)" Green }
if ($deleteFolder) {
    # this script runs from inside the folder: hand the deletion to a small helper that waits until nothing uses it
    $helper = Join-Path $env:TEMP ("claude-note-uninstall-" + [guid]::NewGuid().ToString("N") + ".ps1")
    $body = @'
param([string]$Target)
$deadline = (Get-Date).AddMinutes(10)
while ((Get-Date) -lt $deadline) {
    $busy = @(Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -and $_.CommandLine.Contains($Target) })
    if (-not $busy.Count) { break }
    Start-Sleep -Seconds 2
}
Start-Sleep -Seconds 1
Remove-Item -LiteralPath $Target -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $PSCommandPath -Force -ErrorAction SilentlyContinue
'@
    if ($DryRun) { Say "（測試模式）會在視窗關閉後刪除 $Root" DarkGray }
    else {
        [IO.File]::WriteAllText($helper, $body, (New-Object System.Text.UTF8Encoding $true))
        Start-Process powershell.exe -WindowStyle Hidden -WorkingDirectory $env:TEMP -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$helper`"", "-Target", "`"$Root`"")
        Say "關閉這個視窗後，資料夾會在幾秒內自動刪除。" Green
    }
}
