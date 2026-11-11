<#
  claude-note.ps1 - Organize notes/thoughts with Claude and save them into an Obsidian vault.

  Usage:
    claude-note.ps1                     # use clipboard text
    claude-note.ps1 C:\path\note.txt    # use a text/markdown file
    claude-note.ps1 -Text "some idea"   # inline text

  Requires: Claude Code CLI (claude) logged in. No API key needed.
#>
param(
    [Parameter(Position = 0)][string]$Path,
    [string]$Text,
    [string]$Vault = "",
    [string]$Folder = "Claude-Notes",
    [switch]$Open
)

$ErrorActionPreference = "Stop"
# Vault: -Vault, else the one configured for the server (mobile\config.json). Claude Code only.
if (-not $Vault) {
    $cfgFile = Join-Path $PSScriptRoot "mobile\config.json"
    if (Test-Path -LiteralPath $cfgFile) { $Vault = (Get-Content -LiteralPath $cfgFile -Raw -Encoding UTF8 | ConvertFrom-Json).vault }
    if (-not $Vault) { throw "No vault configured. Run setup.cmd first, or pass -Vault <folder>." }
}
$utf8 = New-Object System.Text.UTF8Encoding $false
$OutputEncoding = $utf8
[Console]::OutputEncoding = $utf8
[Console]::InputEncoding = $utf8

# ---------- 1. Collect input ----------
$source = ""
if ($Text) {
    $raw = $Text; $source = "inline"
} elseif ($Path) {
    if (-not (Test-Path -LiteralPath $Path)) { throw "File not found: $Path" }
    $raw = [IO.File]::ReadAllText((Resolve-Path -LiteralPath $Path).Path, [Text.Encoding]::UTF8)
    $source = [IO.Path]::GetFileName($Path)
} else {
    $raw = Get-Clipboard -Raw; $source = "clipboard"
}
if ([string]::IsNullOrWhiteSpace($raw)) { throw "Input is empty (source: $source)." }

# ---------- 2. Ask Claude ----------
$promptFile = Join-Path $PSScriptRoot "prompt.md"
$instructions = [IO.File]::ReadAllText($promptFile, [Text.Encoding]::UTF8)
# The user's own rules (same file, heading and comment-stripping as mobile/lib/rules.js); heading escaped so this BOM-less script stays safe in PowerShell 5.1
$localFile = Join-Path $PSScriptRoot "prompt.local.md"
if (Test-Path -LiteralPath $localFile) {
    $local = ([IO.File]::ReadAllText($localFile, [Text.Encoding]::UTF8) -replace '(?s)<!--.*?-->', '').Trim()
    $heading = [regex]::Unescape('===== 使用者自訂規則 =====\n以下是使用者自己加的整理規則。和上面的規則衝突時，以這裡為準；但輸出格式（TITLE、TAGS 等開頭的標頭行，以及後面附加的格式規則）一律照原規則。')
    if ($local) { $instructions = $instructions.TrimEnd() + "`n`n" + $heading + "`n`n" + $local + "`n" }
}
$payload = $instructions + "`n`n===== RAW NOTES START =====`n" + $raw + "`n===== RAW NOTES END =====`n"

Write-Host "Asking Claude to organize ($source, $($raw.Length) chars)..." -ForegroundColor Cyan
Push-Location $env:TEMP   # avoid picking up any project CLAUDE.md
try {
    $result = ($payload | & claude -p "Follow the instructions in the input above and output only the note.") -join "`n"
    $code = $LASTEXITCODE
} finally { Pop-Location }
if ($code -ne 0 -or [string]::IsNullOrWhiteSpace($result)) { throw "claude failed (exit $code): $result" }

# ---------- 3. Parse output ----------
$result = $result.Trim()
$result = $result -replace '^\s*```(markdown|md)?\s*\r?\n', '' -replace '\r?\n```\s*$', ''
$lines = $result -split "\r?\n"
$title = "Untitled"; $tags = @(); $start = 0
for ($i = 0; $i -lt [Math]::Min(5, $lines.Count); $i++) {
    if ($lines[$i] -match '^\s*TITLE:\s*(.+)$') { $title = $Matches[1].Trim(); $start = $i + 1 }
    elseif ($lines[$i] -match '^\s*TAGS:\s*(.+)$') {
        $tags = $Matches[1] -split '[,，]' | ForEach-Object { ($_.Trim() -replace '^#', '' -replace '\s+', '-') } | Where-Object { $_ }
        $start = $i + 1
    }
}
$body = ($lines[$start..($lines.Count - 1)] -join "`n").Trim()

# ---------- 4. Write into vault ----------
$dir = Join-Path $Vault $Folder
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$date = Get-Date -Format "yyyy-MM-dd"
$safe = ($title -replace '[\\/:*?"<>|#^\[\]]', '').Trim()
if (-not $safe) { $safe = "note" }
$file = Join-Path $dir "$date $safe.md"
$n = 2
while (Test-Path -LiteralPath $file) { $file = Join-Path $dir "$date $safe ($n).md"; $n++ }

$tagYaml = ($tags | ForEach-Object { '  - "' + ($_ -replace '"', '') + '"' }) -join "`n"
$titleYaml = $title -replace '"', "'"
$front = @"
---
title: "$titleYaml"
created: $(Get-Date -Format "yyyy-MM-ddTHH:mm")
source: "$source"
generated_by: claude-note
tags:
  - claude-note
$tagYaml
---

# $title

"@
$raw2 = "`n`n---`n`n<details><summary>Original notes</summary>`n`n" + $raw.Trim() + "`n`n</details>`n"
[IO.File]::WriteAllText($file, ($front.TrimEnd() + "`n`n" + $body + $raw2), $utf8)

Write-Host "Saved: $file" -ForegroundColor Green

if ($Open) {
    $rel = [Uri]::EscapeDataString("$Folder/" + [IO.Path]::GetFileNameWithoutExtension($file))
    $vname = [Uri]::EscapeDataString((Split-Path $Vault -Leaf))
    Start-Process "obsidian://open?vault=$vname&file=$rel"
}
