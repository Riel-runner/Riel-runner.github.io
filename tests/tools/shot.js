// Screenshot a page after seeding localStorage.
// Usage: node shot.js <repoDir> <chromeExe> <out.png> <page> <width,height> <seedJsonFile>
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { execFile } = require('child_process');
const [repo, chrome, out, page, size, seedFile] = process.argv.slice(2);
const seed = JSON.parse(fs.readFileSync(seedFile, 'utf8')); // { key: value(object|string) }

const boot = `<!doctype html><script>
localStorage.clear(); sessionStorage.clear();
const seed = ${JSON.stringify(seed)};
for (const k in seed) localStorage.setItem(k, typeof seed[k] === 'string' ? seed[k] : JSON.stringify(seed[k]));
location.replace(${JSON.stringify(page)});
</script>`;

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/boot.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(boot); }
  fs.readFile(path.join(repo, decodeURIComponent(url)), (e, d) => {
    if (e) { res.writeHead(404); return res.end(); }
    const t = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.ttf': 'font/ttf' }[path.extname(url)];
    res.writeHead(200, t ? { 'Content-Type': t } : {}); res.end(d);
  });
});
server.listen(0, () => execFile(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
  `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'cp-'))}`, `--window-size=${size}`, '--virtual-time-budget=4000',
  `--screenshot=${out}`, `http://127.0.0.1:${server.address().port}/boot.html`], () => { console.log('saved ' + out); server.close(); }));
