// Serves <repoDir> plus a harness page that loads index.html twice in one tab session
// and reports whether the intro video is shown each time. Usage: node intro-test.js <repoDir> <chromeExe>
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

const [repo, chrome] = process.argv.slice(2);

const harness = `<!doctype html><body><pre id="out">running</pre>
<iframe id="f" width="800" height="600"></iframe>
<script>
const f = document.getElementById('f'), lines = [];
function state(label) {
  const d = f.contentDocument, v = d.getElementById('intro-video');
  const shown = !!v && d.defaultView.getComputedStyle(v).display !== 'none';
  lines.push(label + ': videoInDom=' + !!v + ' shown=' + shown +
    ' introSeenClass=' + d.documentElement.classList.contains('intro-seen'));
}
function load(cb) {
  const tag = 'index.html?' + Math.random();
  f.src = tag;
  const poll = setInterval(() => {
    const d = f.contentDocument;
    if (d && d.URL.endsWith(tag) && d.readyState !== 'loading') { clearInterval(poll); setTimeout(cb, 200); }
  }, 50);
}
sessionStorage.clear();
load(() => { state('first visit'); load(() => { state('back to menu'); load(() => {
  state('third visit'); document.getElementById('out').textContent = lines.join('\\n'); }); }); });
</script></body>`;

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/harness.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(harness); }
  fs.readFile(path.join(repo, decodeURIComponent(url)), (err, data) => {
    if (err) { res.writeHead(404); return res.end(); }
    const t = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(url)];
    res.writeHead(200, t ? { 'Content-Type': t } : {});
    res.end(data);
  });
});

server.listen(0, () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'chromeprof-'));
  execFile(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${profile}`,
    '--virtual-time-budget=8000', '--dump-dom', `http://127.0.0.1:${server.address().port}/harness.html`],
    { maxBuffer: 1 << 24 }, (err, stdout) => {
      const m = stdout.match(/<pre id="out">([\s\S]*?)<\/pre>/);
      if (!m) {
        console.log('no result:\n' + stdout.slice(0, 500));
      } else {
        const r = m[1];
        const ok = (cond, msg) => console.log((cond ? 'PASS ' : 'FAIL ') + msg);
        ok(/first visit: videoInDom=true shown=true/.test(r), 'intro plays on the first visit');
        ok(/back to menu: videoInDom=false shown=false introSeenClass=true/.test(r), 'intro is skipped when returning to the menu');
        ok(/third visit: videoInDom=false shown=false/.test(r), 'intro stays skipped for the rest of the session');
      }
      server.close();
    });
});
