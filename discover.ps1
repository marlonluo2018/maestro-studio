# Maestro Studio Live Discovery Script (PowerShell Version)
# 100% Config-free CLI and Plugin Discovery Tool

$HomeDir = $env:USERPROFILE
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "🎵 Maestro Studio - 运行态能力与插件探测系统 (PowerShell 版)" -ForegroundColor Cyan
Write-Host "======================================================================`n"

# ==================== 1. OpenCode CLI 探测 ====================
Write-Host "[探测 1/3] 正在探测 OpenCode CLI..." -ForegroundColor Yellow
if (Get-Command opencode -ErrorAction SilentlyContinue) {
    Write-Host "`n🟢 OpenCode - 预设可用 AI 模型列表:" -ForegroundColor Green
    Write-Host "----------------------------------------"
    opencode models | Out-String | Write-Host
    Write-Host "----------------------------------------"

    Write-Host "`n🟢 OpenCode - 当前激活的全局 MCP 插件:" -ForegroundColor Green
    Write-Host "----------------------------------------"
    opencode mcp list | Out-String | Write-Host
    Write-Host "----------------------------------------"

    Write-Host "`n🟢 OpenCode - 内置 Agents 技能角色列表:" -ForegroundColor Green
    Write-Host "----------------------------------------"
    $agents = opencode agent list | Out-String
    $agents -split "`n" | Where-Object { $_ -match '\(primary\)' -or $_ -match '\(subagent\)' } | ForEach-Object {
        Write-Host "   🤖 $($_.Trim())"
    }
    Write-Host "----------------------------------------"
} else {
    Write-Host "❌ 未检测到 OpenCode CLI 安装。" -ForegroundColor Red
}

# ==================== 2. OpenAI Codex CLI 探测 ====================
Write-Host "`n[探测 2/3] 正在探测 OpenAI Codex CLI..." -ForegroundColor Yellow
if (Get-Command codex -ErrorAction SilentlyContinue) {
    Write-Host "`n🟢 Codex - 版本信息:" -ForegroundColor Green
    Write-Host "----------------------------------------"
    codex --version | Out-String | Write-Host
    Write-Host "----------------------------------------"

    # 读取 config.toml 解析
    $configPath = Join-Path $HomeDir ".codex\config.toml"
    $catalogFileName = "cc-switch-model-catalog.json" # 默认值
    if (Test-Path $configPath) {
        $content = Get-Content $configPath -Raw
        if ($content -match 'model\s*=\s*"(.*?)"') {
            Write-Host "`n🟢 Codex - 当前配置活跃模型 (通过 config.toml 读取):" -ForegroundColor Green
            Write-Host "----------------------------------------"
            Write-Host "- $($Matches[1]) (当前选中)"
            Write-Host "----------------------------------------"
        }
        if ($content -match 'model_catalog_json\s*=\s*"(.*?)"') {
            $catalogFileName = $Matches[1]
        }
    }

    # 解析 model_catalog_json
    $catalogPath = Join-Path $HomeDir ".codex\$catalogFileName"
    if (Test-Path $catalogPath) {
        $catalogJson = Get-Content $catalogPath -Raw | ConvertFrom-Json
        if ($catalogJson.models) {
            Write-Host "`n🟢 Codex - 探测到的可用 AI 模型列表 (自适应解析目录 JSON):" -ForegroundColor Green
            Write-Host "----------------------------------------"
            $catalogJson.models | ForEach-Object { Write-Host "- $($_.slug)" }
            Write-Host "----------------------------------------"
        }
    }

    Write-Host "`n🟢 Codex - 当前激活的全局 MCP 插件:" -ForegroundColor Green
    Write-Host "----------------------------------------"
    codex mcp list | Out-String | Write-Host
    Write-Host "----------------------------------------"

    Write-Host "`n🟢 Codex - 已装载的自定义 Plugins / 技能列表:" -ForegroundColor Green
    Write-Host "----------------------------------------"
    codex plugin list | Out-String | Write-Host
    Write-Host "----------------------------------------"
} else {
    Write-Host "❌ 未检测到 Codex CLI 安装。" -ForegroundColor Red
}

# ==================== 3. Claude Code CLI 探测 ====================
Write-Host "`n[探测 3/3] 正在探测 Claude Code CLI..." -ForegroundColor Yellow
$hasClaude = $false
if (Get-Command claude -ErrorAction SilentlyContinue) {
    Write-Host "`n🟢 Claude Code - 版本信息:" -ForegroundColor Green
    Write-Host "----------------------------------------"
    claude --version | Out-String | Write-Host
    Write-Host "----------------------------------------"
    $hasClaude = $true
} else {
    Write-Host "   (直接运行 'claude' 失败，尝试通过 npx 检测，这可能需要数秒...)" -ForegroundColor Gray
    $npxVersion = npx @anthropic-ai/claude-code --version 2>$null | Out-String
    if ($npxVersion.Trim()) {
        Write-Host "`n🟢 Claude Code - 版本信息:" -ForegroundColor Green
        Write-Host "----------------------------------------"
        Write-Host $npxVersion.Trim()
        Write-Host "----------------------------------------"
        $hasClaude = $true
    }
}

if ($hasClaude) {
    # 读取 settings.json 
    $settingsPath = Join-Path $HomeDir ".claude\settings.json"
    if (Test-Path $settingsPath) {
        Write-Host "`n🟢 Claude Code - 全局配置文件内容 (通过 ~/.claude/settings.json 读取):" -ForegroundColor Green
        Write-Host "----------------------------------------"
        Get-Content $settingsPath -Raw | Write-Host
        Write-Host "----------------------------------------"
    }

    Write-Host "`n🟢 Claude Code - 内置及三方 API 常用模型系列:" -ForegroundColor Green
    Write-Host "----------------------------------------"
    Write-Host "- Sonnet"
    Write-Host "- Opus"
    Write-Host "- Haiku"
    Write-Host "----------------------------------------"

    # 扫描 ~/.claude/skills
    $skillsPath = Join-Path $HomeDir ".claude\skills"
    if (Test-Path $skillsPath) {
        Write-Host "`n🟢 Claude Code - 探测到的全局专属技能列表 (Global Skills):" -ForegroundColor Green
        Write-Host "----------------------------------------"
        Get-ChildItem $skillsPath -Directory | ForEach-Object {
            $skillMd = Join-Path $_.FullName "SKILL.md"
            if (Test-Path $skillMd) {
                $content = Get-Content $skillMd -Raw
                $name = $_.Name
                $desc = "无描述"
                if ($content -match 'name:\s*(.*)') { $name = $Matches[1].Replace('"', '').Trim() }
                if ($content -match 'description:\s*(.*)') { $desc = $Matches[1].Replace('"', '').Trim() }
                Write-Host "   🎒 [Skill] $name (目录: $($_.Name)) - $desc"
            } else {
                Write-Host "   🎒 [Skill] $($_.Name)"
            }
        }
        Write-Host "----------------------------------------"
    }
} else {
    Write-Host "❌ 未检测到 Claude Code CLI。" -ForegroundColor Red
}

Write-Host "`n======================================================================" -ForegroundColor Cyan
Write-Host "🎉 运行态探测成功！该脚本已保存至 .\discover.ps1" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
