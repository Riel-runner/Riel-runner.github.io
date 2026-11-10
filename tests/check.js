// Serve <repoDir> on localhost, open each page in headless Edge, and report
// console errors plus any request that 404s. Usage: node check.js <repoDir> <browserExe>
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const [repo, browser] = process.argv.slice(2);
const pages = ['index', 'game', 'level-select', 'shop', 'settings', 'credits'];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const missing = [];

const server = http.createServer((req, res) => {
  const p = path.join(repo, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (err, data) => {
    if (err) { missing.push(req.url); res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' });
    res.end(data);
  });
});

function run(url, profile) {
  return new Promise(resolve => {
    const args = ['--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${profile}`,
      '--enable-logging=stderr', '--v=0', '--virtual-time-budget=3000', '--dump-dom', url];
    const proc = spawn(browser, args);
    let out = '', err = '';
    proc.stdout.on('data', d => out += d);
    proc.stderr.on('data', d => err += d);
    proc.on('close', () => resolve({ out, err }));
  });
}

server.listen(0, async () => {
  const port = server.address().port;
  const profile = fs.mkdtempSync(path.join(require('os').tmpdir(), 'edgeprof-'));
  let bad = 0;
  for (const page of pages) {
    missing.length = 0;
    const { out, err } = await run(`http://127.0.0.1:${port}/${page}.html`, profile);
    const consoleLines = err.split('\n').filter(l => /CONSOLE|Uncaught/.test(l) && !/favicon/.test(l));
    const realMissing = missing.filter(u => !/favicon/.test(u));
    const ok = out.includes('</html>') && !consoleLines.length && !realMissing.length;
    if (!ok) bad++;
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${page}.html  (dom ${out.length} chars)`);
    consoleLines.forEach(l => console.log('     console: ' + l.trim().slice(0, 220)));
    realMissing.forEach(u => console.log('     404: ' + u));
  }
  server.close();
  process.exit(bad ? 1 : 0);
});
