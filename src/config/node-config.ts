import fs from 'fs';
import path from 'path';
import { MaestroConfig, DEFAULT_CONFIG } from './types.js';

const CONFIG_FILE_PATH = path.resolve(process.cwd(), 'maestro-config.json');

export function loadConfig(): MaestroConfig {
  try {
    if (fs.existsSync(CONFIG_FILE_PATH)) {
      const data = fs.readFileSync(CONFIG_FILE_PATH, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Failed to load maestro-config.json, using defaults:', err);
  }
  saveConfig(DEFAULT_CONFIG);
  return DEFAULT_CONFIG;
}

export function saveConfig(config: MaestroConfig): void {
  try {
    fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(config, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save maestro-config.json:', err);
  }
}
