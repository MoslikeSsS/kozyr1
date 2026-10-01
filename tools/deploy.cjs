/*
  Публикация kozyr1 на GitHub Pages через REST API.
  git в системе нет, поэтому файлы уходят запросами к GitHub.

  Запуск (токен только в переменной окружения, в файлы он не пишется):
    $env:GITHUB_TOKEN = 'github_pat_...'
    node tools/deploy.cjs

  Используется Git Data API, а не Contents API: последний не умеет
  записывать в корень репозитория.
*/
const fs = require('fs');
const path = require('path');

const REPO = process.env.GITHUB_REPO || 'MoslikeSsS/kozyr1';
const BRANCH = 'main';
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

const H = () => ({
  Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'dsh-kozyr1',
});

async function api(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { ...H(), ...(opts.headers || {}) } });
  const t = await r.text();
  let j = null;
  try {
    j = t ? JSON.parse(t) : null;
  } catch {
    /* не JSON */
  }
  if (!r.ok) {
    const msg = j && j.message ? j.message : t.slice(0, 200);
    throw new Error(`${r.status} ${url.replace('https://api.github.com/repos/', '')}: ${msg}`);
  }
  return j;
}

function walk(dir, base = '') {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = base ? `${base}/${name}` : name;
    if (fs.statSync(full).isDirectory()) out.push(...walk(full, rel));
    else out.push({ rel, full });
  }
  return out;
}

(async () => {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('Нет GITHUB_TOKEN');

  if (!fs.existsSync(DIST)) throw new Error('Нет папки dist/. Сначала: npm run build');

  const repo = await api(`https://api.github.com/repos/${REPO}`);
  console.log(`Репозиторий: ${repo.full_name}`);

  // На пустом репозитории HEAD-запрос отвечает 409, а не 404 —
  // оба ответа означают «ветки нет», и это не ошибка.
  let head = null;
  try {
    head = await api(`https://api.github.com/repos/${REPO}/git/ref/heads/${BRANCH}`);
  } catch (e) {
    if (!/409|404/.test(e.message)) throw e;
  }

  if (!head) {
    console.log('Репозиторий пуст — создаю ветку…');
    await api(`https://api.github.com/repos/${REPO}/contents/.gitkeep`, {
      method: 'PUT',
      body: JSON.stringify({
        message: 'Начальный коммит',
        content: Buffer.from('').toString('base64'),
        committer: { name: 'dsh', email: 'dsh@localhost' },
      }),
    });
    head = await api(`https://api.github.com/repos/${REPO}/git/ref/heads/${BRANCH}`);
  }

  const baseCommit = await api(`https://api.github.com/repos/${REPO}/git/commits/${head.object.sha}`);

  const files = walk(DIST);
  console.log(`Файлов в сборке: ${files.length}`);

  const tree = [];
  for (const { rel, full } of files) {
    const blob = await api(`https://api.github.com/repos/${REPO}/git/blobs`, {
      method: 'POST',
      body: JSON.stringify({
        content: fs.readFileSync(full).toString('base64'),
        encoding: 'base64',
      }),
    });
    tree.push({ path: rel, mode: '100644', type: 'blob', sha: blob.sha });
  }

  // Дерево собирается одним запросом и одним коммитом: состояние сайта
  // меняется целиком, а не по файлам, поэтому посетитель никогда не увидит
  // наполовину старую, наполовину новую сборку.
  const newTree = await api(`https://api.github.com/repos/${REPO}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({ base_tree: baseCommit.tree.sha, tree }),
  });

  const stamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const commit = await api(`https://api.github.com/repos/${REPO}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({
      message: `Сборка ${stamp}`,
      tree: newTree.sha,
      parents: [baseCommit.sha],
      committer: { name: 'dsh', email: 'dsh@localhost' },
    }),
  });

  await api(`https://api.github.com/repos/${REPO}/git/refs/heads/${BRANCH}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.sha, force: false }),
  });

  console.log(`\nОпубликовано: ${commit.sha.slice(0, 8)}`);
  console.log(`Страница обновится через минуту: https://${REPO.split('/')[0]}.github.io/${REPO.split('/')[1]}/`);
})().catch((e) => {
  console.error('Ошибка деплоя:', e.message);
  process.exitCode = 1;
});