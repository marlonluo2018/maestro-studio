#!/usr/bin/env tsx
/**
 * Codex Skills 审计脚本
 * 策略：1) 尝试 codex exec "/skills"  2) 回退扫描 ~/.codex/skills
 *       3) 备选第三方工具
 */
import fs from "fs";
import path from "path";
import os from "os";
import { execFileSync } from "child_process";

const HOME = os.homedir();
const CODEX_SKILLS_DIR = path.join(HOME, ".codex/skills");

export interface CodexSkill {
  name: string;
  path: string;
  description?: string;
  source: string;
}

function parseSkillMd(filePath: string): { name?: string; description?: string } {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!match) return {};
    const fm = match[1];
    return {
      name: fm.match(/name:\s*(.+)/)?.[1]?.trim(),
      description: fm.match(/description:\s*(.+)/)?.[1]?.trim(),
    };
  } catch {
    return {};
  }
}

function scanCodexSkillsDir(): CodexSkill[] {
  const skills: CodexSkill[] = [];
  if (!fs.existsSync(CODEX_SKILLS_DIR)) return skills;

  const walk = (dir: string) => {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          const skillMd = path.join(full, "SKILL.md");
          if (fs.existsSync(skillMd)) {
            const fm = parseSkillMd(skillMd);
            skills.push({
              name: fm.name || entry.name,
              description: fm.description,
              path: skillMd,
              source: "directory-scan",
            });
          }
          walk(full);
        }
      }
    } catch {}
  };
  walk(CODEX_SKILLS_DIR);
  return skills;
}

function tryCodexSlashCommand(): CodexSkill[] | null {
  try {
    const out = execFileSync("codex", ["exec", "/skills"], {
      encoding: "utf-8",
      timeout: 15000,
      shell: true, // 强保障 Windows 环境下能定位全局 .cmd
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    
    if (!out) return null;
    
    const skills: CodexSkill[] = [];
    const lines = out.split("\n");
    for (const line of lines) {
      const m = line.match(/^[-*]?\s*(.+?)(?::\s*(.+))?$/);
      if (m && !line.includes("Available") && line.trim()) {
        skills.push({
          name: m[1].trim(),
          description: m[2]?.trim(),
          path: "",
          source: "codex-exec-/skills",
        });
      }
    }
    return skills.length > 0 ? skills : null;
  } catch {
    return null;
  }
}

function tryThirdPartyLs(): CodexSkill[] | null {
  try {
    const out = execFileSync("x", ["codex", "skill", "ls"], {
      encoding: "utf-8",
      timeout: 10000,
      shell: true,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    if (out) {
      return out.split("\n")
        .filter((l) => l.trim())
        .map((l) => ({
          name: l.trim(),
          path: "",
          source: "x-codex-cli",
        }));
    }
  } catch {
    // ignore
  }
  return null;
}

export function auditCodexSkills(): CodexSkill[] {
  // 1) 尝试 exec /skills 命令
  const fromSlash = tryCodexSlashCommand();
  if (fromSlash) return fromSlash;

  // 2) 目录扫描
  const fromDir = scanCodexSkillsDir();
  if (fromDir.length > 0) return fromDir;

  // 3) 第三方工具
  const fromThirdParty = tryThirdPartyLs();
  if (fromThirdParty) return fromThirdParty;

  return [];
}

// 如果直接运行该脚本则进行打印输出
if (import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  const skills = auditCodexSkills();
  console.log(JSON.stringify({
    count: skills.length,
    skills,
  }, null, 2));
}
