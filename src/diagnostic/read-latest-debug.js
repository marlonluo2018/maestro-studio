import fs from 'fs';
import path from 'path';
import os from 'os';

const HOME_DIR = os.homedir();
const debugDir = path.join(HOME_DIR, '.claude', 'debug');

try {
  if (fs.existsSync(debugDir)) {
    const files = fs.readdirSync(debugDir)
      .map(name => ({ name, time: fs.statSync(path.join(debugDir, name)).mtime.getTime() }))
      .sort((a, b) => b.time - a.time);

    if (files.length > 0) {
      const latestFile = files[0].name;
      const latestPath = path.join(debugDir, latestFile);
      console.log(`\n>>> 最新调试日志文件: ${latestPath} (${new Date(files[0].time).toLocaleString()})`);
      console.log('--------------------------------------------------');
      console.log(fs.readFileSync(latestPath, 'utf-8'));
      console.log('--------------------------------------------------');
    } else {
      console.log('未找到任何调试日志文件');
    }
  } else {
    console.log('debug 目录不存在:', debugDir);
  }
} catch (e) {
  console.error('Error:', e.message);
}
