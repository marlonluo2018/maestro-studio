#!/usr/bin/env tsx
/**
 * OpenCode Skills 审计脚本
 * 策略：1) 尝试 opencode CLI  2) 回退扫描已知 skills 目录
 */
import fs from "fs";
import path from "path";
import os from "os";
import { execFileSync } from "child_process";

const HOME = os.homedir();

// OpenCode 自动发现的源目录（按官方文档）
const SKILL_SOURCES: { scope: string; dir: string }[] = [
  { scope: "project", dir: ".opencode/skills" },
  { scope: "global", dir: path.join(HOME, ".config/opencode/skills") },
  { scope: "project-claude-compat", dir: ".claude/skills" },
  { scope: "global-claude-compat", dir: path.join(HOME, ".claude/skills") },
  { scope: "project-agents-compat", dir: ".agents/skills" },
  { scope: "global-agents-compat", dir: path.join(HOME, ".agents/skills") },
];

interface SkillInfo {
  scope: string;
  name: string;
  description?: string;
  path: string;
  source: string;
}

function parseFrontmatter(filePath: string): { name?: string; description?: string } {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!match) return {};
    const fm = match[1];
    const nameMatch = fm.match(/name:\s*(.+)/);
    const descMatch = fm.match(/description:\s*(.+)/);
    return {
      name: nameMatch ? nameMatch[1].trim() : undefined,
      description: descMatch ? descMatch[1].trim() : undefined,
    };
  } catch {
    return {};
  }
}

function scanSkillsInDir(dir: string, scope: string, source: string): SkillInfo[] {
  const skills: SkillInfo[] = [];
  if (!fs.existsSync(dir)) return skills;

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        const skillMd = path.join(fullPath, "SKILL.md");
        if (fs.existsSync(skillMd)) {
          const fm = parseFrontmatter(skillMd);
          skills.push({
            scope,
            name: fm.name || entry.name,
            description: fm.description,
            path: skillMd,
            source,
          });
        }
      } else if (entry.isFile() && entry.name.endsWith(".md") && entry.name !== "SKILL.md") {
        const fm = parseFrontmatter(fullPath);
        if (fm.name) {
          skills.push({
            scope,
            name: fm.name,
            description: fm.description,
            path: fullPath,
            source,
          });
        }
      }
    }
  } catch {}
  return skills;
}

function tryOpencodeCLI(): SkillInfo[] | null {
  try {
    const out = execFileSync("opencode", ["skills", "list", "--json"], {
      encoding: "utf-8",
      timeout: 10000,
      shell: true, // 强保障 Windows 环境下能定位全局 .cmd
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    if (out) {
      try {
        const parsed = JSON.parse(out);
        if (Array.isArray(parsed)) {
          return parsed.map((s: any) => ({
            scope: s.scope || "unknown",
            name: s.name,
            description: s.description,
            path: s.path || "",
            source: "opencode-cli",
          }));
        }
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
  return null;
}

export function auditOpenCodeSkills(): SkillInfo[] {
  const cliResult = tryOpencodeCLI();
  if (cliResult && cliResult.length > 0) {
    return cliResult;
  }

  const allSkills: SkillInfo[] = [];
  for (const { scope, dir } of SKILL_SOURCES) {
    allSkills.push(...scanSkillsInDir(dir, scope, dir));
  }

  const configFiles = ["opencode.json", "opencode.jsonc"];
  for (const cf of configFiles) {
    if (fs.existsSync(cf)) {
      try {
        const cfgContent = fs.readFileSync(cf, "utf-8");
        const match = cfgContent.match(/skills\s*:\s*\[([\s\S]*?)\]/);
        if (match) {
          const sources = match[1]
            .split(",")
            .map((s) => s.trim().replace(/["']/g, ""))
            .filter(Boolean);
          for (const src of sources) {
            const resolved = src.startsWith("~")
              ? path.join(HOME, src.slice(1))
              : src;
            if (fs.existsSync(resolved)) {
              allSkills.push(...scanSkillsInDir(resolved, "config", src));
            }
          }
        }
      } catch {
        // ignore
      }
    }
  }

  return allSkills;
}

// 如果直接运行该脚本则进行打印输出
if (import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  const skills = auditOpenCodeSkills();
  console.log(JSON.stringify({
    count: skills.length,
    skills,
  }, null, 2));
}
