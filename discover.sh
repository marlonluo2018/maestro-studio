#!/bin/bash

# Maestro Studio Live Discovery Script (Bash Version)
# 100% Config-free CLI and Plugin Discovery Tool

# Text styling
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
GRAY='\033[0;90m'
NC='\033[0m' # No Color

# Determine Home Directory
if [ -z "$USERPROFILE" ]; then
  HOME_DIR="$HOME"
else
  HOME_DIR="$USERPROFILE"
fi

echo -e "${CYAN}======================================================================${NC}"
echo -e "${CYAN}🎵 Maestro Studio - 运行态能力与插件探测系统 (Bash Shell 版)${NC}"
echo -e "${CYAN}======================================================================${NC}\n"

# ==================== 1. OpenCode CLI 探测 ====================
echo -e "${YELLOW}[探测 1/3] 正在探测 OpenCode CLI...${NC}"
if command -v opencode &> /dev/null; then
  echo -e "\n${GREEN}🟢 OpenCode - 预设可用 AI 模型列表:${NC}"
  echo "----------------------------------------"
  opencode models 2>/dev/null </dev/null
  echo "----------------------------------------"

  echo -e "\n${GREEN}🟢 OpenCode - 当前激活的全局 MCP 插件:${NC}"
  echo "----------------------------------------"
  opencode mcp list 2>/dev/null </dev/null
  echo "----------------------------------------"

  echo -e "\n${GREEN}🟢 OpenCode - 内置 Agents 技能角色列表:${NC}"
  echo "----------------------------------------"
  opencode agent list 2>/dev/null </dev/null | grep -E '\(primary\)|\(subagent\)' | while read -r line; do
    echo "   🤖 $(echo "$line" | xargs)"
  done
  echo "----------------------------------------"
else
  echo -e "❌ 未检测到 OpenCode CLI 安装。"
fi

# ==================== 2. OpenAI Codex CLI 探测 ====================
echo -e "\n${YELLOW}[探测 2/3] 正在探测 OpenAI Codex CLI...${NC}"
if command -v codex &> /dev/null; then
  echo -e "\n${GREEN}🟢 Codex - 版本信息:${NC}"
  echo "----------------------------------------"
  codex --version 2>/dev/null </dev/null
  echo "----------------------------------------"

  # 读取 config.toml 解析当前选中模型
  CONFIG_PATH="$HOME_DIR/.codex/config.toml"
  if [ ! -f "$CONFIG_PATH" ]; then
    CONFIG_PATH="$HOME_DIR/.config/codex/config.toml"
  fi

  CATALOG_NAME="cc-switch-model-catalog.json"

  if [ -f "$CONFIG_PATH" ]; then
    ACTIVE_MODEL=$(grep -E '^model\s*=\s*' "$CONFIG_PATH" | head -n 1 | cut -d'"' -f2)
    CATALOG_VAL=$(grep -E '^model_catalog_json\s*=\s*' "$CONFIG_PATH" | head -n 1 | cut -d'"' -f2)
    
    if [ -not -z "$ACTIVE_MODEL" ]; then
      echo -e "\n${GREEN}🟢 Codex - 当前配置活跃模型 (通过 config.toml 读取):${NC}"
      echo "----------------------------------------"
      echo "- $ACTIVE_MODEL (当前选中)"
      echo "----------------------------------------"
    fi
    if [ -not -z "$CATALOG_VAL" ]; then
      CATALOG_NAME="$CATALOG_VAL"
    fi
  fi

  # 读取并解析 model_catalog_json 中的模型
  CATALOG_PATH="$HOME_DIR/.codex/$CATALOG_NAME"
  if [ ! -f "$CATALOG_PATH" ]; then
    CATALOG_PATH="$HOME_DIR/.config/codex/$CATALOG_NAME"
  fi

  if [ -f "$CATALOG_PATH" ]; then
    echo -e "\n${GREEN}🟢 Codex - 探测到的可用 AI 模型列表 (自适应解析目录 JSON):${NC}"
    echo "----------------------------------------"
    grep -E '"slug":' "$CATALOG_PATH" | cut -d'"' -f4 | while read -r slug; do
      echo "- $slug"
    done
    echo "----------------------------------------"
  fi

  echo -e "\n${GREEN}🟢 Codex - 当前激活的全局 MCP 插件:${NC}"
  echo "----------------------------------------"
  codex mcp list 2>/dev/null </dev/null
  echo "----------------------------------------"

  echo -e "\n${GREEN}🟢 Codex - 已装载的自定义 Plugins / 技能列表:${NC}"
  echo "----------------------------------------"
  codex plugin list 2>/dev/null </dev/null
  echo "----------------------------------------"
else
  echo -e "❌ 未检测到 Codex CLI 安装。"
fi

# ==================== 3. Claude Code CLI 探测 ====================
echo -e "\n${YELLOW}[探测 3/3] 正在探测 Claude Code CLI...${NC}"
HAS_CLAUDE=false

if command -v claude &> /dev/null; then
  echo -e "\n${GREEN}🟢 Claude Code - 版本信息:${NC}"
  echo "----------------------------------------"
  claude --version 2>/dev/null </dev/null
  echo "----------------------------------------"
  HAS_CLAUDE=true
else
  echo -e "${GRAY}   (直接运行 'claude' 失败，尝试通过 npx 检测，这可能需要数秒...)${NC}"
  NPX_VER=$(npx @anthropic-ai/claude-code --version 2>/dev/null </dev/null)
  if [ -not -z "$NPX_VER" ]; then
    echo -e "\n${GREEN}🟢 Claude Code - 版本信息:${NC}"
    echo "----------------------------------------"
    echo "$NPX_VER" | xargs
    echo "----------------------------------------"
    HAS_CLAUDE=true
  fi
fi

if [ "$HAS_CLAUDE" = true ]; then
  SETTINGS_PATH="$HOME_DIR/.claude/settings.json"
  if [ -f "$SETTINGS_PATH" ]; then
    echo -e "\n${GREEN}🟢 Claude Code - 全局配置文件内容 (通过 ~/.claude/settings.json 读取):${NC}"
    echo "----------------------------------------"
    cat "$SETTINGS_PATH"
    echo -e "\n----------------------------------------"
  fi

  echo -e "\n${GREEN}🟢 Claude Code - 内置及三方 API 常用模型系列:${NC}"
  echo "----------------------------------------"
  echo "- Sonnet"
  echo "- Opus"
  echo "- Haiku"
  echo "----------------------------------------"

  # 扫描 ~/.claude/skills
  SKILLS_PATH="$HOME_DIR/.claude/skills"
  if [ -d "$SKILLS_PATH" ]; then
    echo -e "\n${GREEN}🟢 Claude Code - 探测到的全局专属技能列表 (Global Skills):${NC}"
    echo "----------------------------------------"
    find "$SKILLS_PATH" -mindepth 1 -maxdepth 1 -type d | while read -r skill_dir; do
      SKILL_NAME=$(basename "$skill_dir")
      SKILL_MD="$skill_dir/SKILL.md"
      if [ ! -f "$SKILL_MD" ]; then
        SKILL_MD="$skill_dir/skill.md"
      fi

      if [ -f "$SKILL_MD" ]; then
        NAME_VAL=$(grep -E '^name:\s*' "$SKILL_MD" | head -n 1 | cut -d':' -f2- | tr -d '"' | tr -d "'" | xargs)
        DESC_VAL=$(grep -E '^description:\s*' "$SKILL_MD" | head -n 1 | cut -d':' -f2- | tr -d '"' | tr -d "'" | xargs)
        echo "   🎒 [Skill] ${NAME_VAL:-$SKILL_NAME} (目录: $SKILL_NAME) - $DESC_VAL"
      else
        echo "   🎒 [Skill] $SKILL_NAME"
      fi
    done
    echo "----------------------------------------"
  fi
else
  echo -e "❌ 未检测到 Claude Code CLI。"
fi

echo -e "\n${CYAN}======================================================================${NC}"
echo -e "${CYAN}🎉 运行态探测成功！该脚本已保存至 .\discover.sh${NC}"
echo -e "${CYAN}======================================================================${NC}"
