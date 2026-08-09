import fs from 'fs';
import path from 'path';

const sdkPath = 'node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs';
if (fs.existsSync(sdkPath)) {
  const content = fs.readFileSync(sdkPath, 'utf-8');
  let idx = 0;
  while (true) {
    idx = content.indexOf('cye(', idx);
    if (idx === -1) break;
    console.log(`\n=== Found cye( at index ${idx} ===`);
    console.log(content.slice(idx - 150, idx + 250));
    idx += 4;
  }
}
