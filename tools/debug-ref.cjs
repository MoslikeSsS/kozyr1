// Разбор создания ветки gh-pages: где именно ломается.
const fs = require('fs');
const path = require('path');

const REPO = 'MoslikeSsS/kozyr1';
const DIST = path.resolve(__dirname, '..', 'dist');

const H = {
  Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'dsh',
};

async function api(label, url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: H });
  const t = await r.text();
  let j = null;
  try { j = t ? JSON.parse(t) : null; } catch { /* не JSON */ }
  console.log(`${r.ok ? '  OK  ' : ' СБОЙ'} ${label} -> ${r.status}`);
  if (!r.ok) console.log(`        ${t.slice(0, 240)}`);
  return j;
}

function walk(dir, base = '') {
  const out = [];
  for (const n of fs.readdirSync(dir)) {
    const full = path.join(dir, n);
    const rel = base ? `${base}/${n}` : n;
    if (fs.statSync(full).isDirectory()) out.push(...walk(full, rel));
    else out.push({ rel, full });
  }
  return out;
}

(async () => {
  const files = walk(DIST);
  console.log(`файлов: ${files.length}\n`);

  const tree = [];
  for (const { rel, full } of files) {
    const b = await api(
      `blob ${rel}`,
      `https://api.github.com/repos/${REPO}/git/blobs`,
      { method: 'POST', body: JSON.stringify({ content: fs.readFileSync(full).toString('base64'), encoding: 'base64' }) },
    );
    if (b) tree.push({ path: rel, mode: '100644', type: 'blob', sha: b.sha });
  }

  const t = await api('создание дерева', `https://api.github.com/repos/${REPO}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({ tree }),
  });
  if (!t) return;

  const c = await api('создание корневого коммита', `https://api.github.com/repos/${REPO}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({
      message: 'Сборка (разбор)',
      tree: t.sha,
      committer: { name: 'dsh', email: 'dsh@localhost' },
    }),
  });
  if (!c) return;
  console.log(`        sha коммита: ${c.sha}`);

  const ref = await api('создание ветки gh-pages', `https://api.github.com/repos/${REPO}/git/refs`, {
    method: 'POST',
    body: JSON.stringify({ ref: 'refs/heads/gh-pages', sha: c.sha }),
  });
  console.log(ref ? `        ветка создана: ${ref.ref}` : '        ветка не создана');
})();