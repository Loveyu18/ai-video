// 截圖：node tools/shot.mjs <輸出.png> [網址參數]
//   例：node tools/shot.mjs out/kitchen.png "room=kitchen&corner=1"
//       node tools/shot.mjs out/top.png
// 用無頭 Edge/Chrome 渲染；預設用 GPU，設環境變數 SHOT_CPU=1 改用 SwiftShader 軟體渲染。
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from './serve.mjs';

const [, , outArg, query = '', size = '1280,720'] = process.argv;
if (!outArg) { console.error('usage: node tools/shot.mjs <out.png> [query] [w,h]'); process.exit(1); }

const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];
const browser = BROWSERS.find((p) => fs.existsSync(p));
if (!browser) { console.error('找不到 Edge/Chrome'); process.exit(1); }

const out = path.resolve(outArg);
fs.mkdirSync(path.dirname(out), { recursive: true });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'shot-'));
const server = await startServer(0);
const url = `http://127.0.0.1:${server.address().port}/index.html${query ? '?' + query : ''}`;

execFile(browser, [
  '--headless=new', '--disable-gpu-sandbox',
  ...(process.env.SHOT_CPU ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--enable-gpu', '--ignore-gpu-blocklist']),
  '--hide-scrollbars', `--user-data-dir=${profile}`, `--window-size=${size}`,
  '--virtual-time-budget=20000', `--screenshot=${out}`, url,
], { timeout: 120000 }, (err) => {
  server.close();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  if (err && !fs.existsSync(out)) { console.error(err.message); process.exit(1); }
  console.log(`saved ${out}  (${url})`);
});
