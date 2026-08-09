import fs from 'fs';
import path from 'path';

const HOME_DIR = process.env.USERPROFILE || process.env.HOME || '';

function searchDir(dirPath, term) {
  try {
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      const fullPath = path.join(dirPath, file);
      let stat;
      try {
        stat = fs.statSync(fullPath);
      } catch (e) {
        continue;
      }

      if (stat.isDirectory()) {
        searchDir(fullPath, term);
      } else if (file.endsWith('.json') || file.endsWith('.toml') || file.endsWith('.env') || file.endsWith('.js') || file.endsWith('.sh') || file.endsWith('.ps1')) {
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          if (content.includes(term)) {
            console.log(`🔍 找到匹配文件! 路径: ${fullPath}`);
            console.log(`--- 文件内容 ---`);
            console.log(content);
            console.log(`----------------`);
          }
        } catch (e) {}
      }
    }
  } catch (e) {}
}

console.log('>>> 正在深度检索包含 ANTHROPIC_DEFAULT_HAIKU_MODEL 的配置文件...');
searchDir(path.join(HOME_DIR, '.config'), 'ANTHROPIC_DEFAULT_HAIKU_MODEL');
searchDir(path.join(HOME_DIR, '.claude'), 'ANTHROPIC_DEFAULT_HAIKU_MODEL');
searchDir(path.join(HOME_DIR, '.local'), 'ANTHROPIC_DEFAULT_HAIKU_MODEL');
console.log('>>> 检索结束！');
