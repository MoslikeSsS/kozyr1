/*
  Раскладывает проект по репозиторию:
    main       — исходники (тот проект, который можно править и собирать)
    gh-pages   — собранная игра, которую раздаёт GitHub Pages

  Отдельная ветка для сборки выбрана потому, что так не нужно доверять
  Actions: публикация происходит сразу и не зависит от того, разрешено ли
  токену запускать workflows.

  Запуск:
    $env:GITHUB_TOKEN = 'github_pat_...'
    node tools/publish.cjs
*/
const fs = require('fs');
const path = require('path');

const REPO = process.env.GITHUB_REPO || 'MoslikeSsS/kozyr1';
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

// То, что не должно попасть в репозиторий.
const SKIP_DIRS = new Set(['node_modules', '.git', '.npmcache', '.vite', 'dist', '_base']);
const SKIP_FILES = new Set(['.env', '.env.local', 'tsconfig.ssr.json']);

/*
  Файлы workflow GitHub принимает только у токена с правом Workflows.
  Без него запись дерева с .github/workflows отклоняется целиком (403),
  поэтому их можно пропустить: SKIP_WORKFLOWS=1 node tools/publish.cjs
*/
const SKIP_WORKFLOWS = process.env.SKIP_WORKFLOWS === '1';

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
    throw new Error(`${r.status} ${url.replace('https://api.github.com/repos/', '')}: ${j && j.message ? j.message : t.slice(0, 160)}`);
  }
  return j;
}

/** Рекурсивно превращает папку в плоский список {path, sha} через git blobs. */
async function uploadTree(dir, base = '') {
  const entries = [];
  for (const name of fs.readdirSync(dir)) {
    if (SKIP_DIRS.has(name) || SKIP_FILES.has(name)) continue;
    const full = path.join(dir, name);
    const rel = base ? `${base}/${name}` : name;
    if (SKIP_WORKFLOWS && rel.startsWith('.github/workflows')) continue;
    if (fs.statSync(full).isDirectory()) entries.push(...(await uploadTree(full, rel)));
    else {
      const blob = await api(`https://api.github.com/repos/${REPO}/git/blobs`, {
        method: 'POST',
        body: JSON.stringify({
          content: fs.readFileSync(full).toString('base64'),
          encoding: 'base64',
        }),
      });
      entries.push({ path: rel, mode: '100644', type: 'blob', sha: blob.sha });
    }
  }
  return entries;
}

/** Создаёт дерево и коммит, возвращает sha коммита. */
/**
 * Создаёт дерево и коммит, возвращает sha коммита.
 * baseCommitSha — с какого коммита продолжаем историю. Дерево для base_tree
 * GitHub возьмёт сам из этого коммита, а родителем станет именно он:
 * путать эти два значения нельзя, иначе родителем станет дерево.
 */
async function makeCommit(treeEntries, message, baseCommitSha) {
  const tree = await api(`https://api.github.com/repos/${REPO}/git/trees`, {
    method: 'POST',
    body: JSON.stringify(
      baseCommitSha
        ? {
            base_tree: (
              await api(`https://api.github.com/repos/${REPO}/git/commits/${baseCommitSha}`)
            ).tree.sha,
            tree: treeEntries,
          }
        : { tree: treeEntries },
    ),
  });
  const body = {
    message,
    tree: tree.sha,
    committer: { name: 'dsh', email: 'dsh@localhost' },
  };
  if (baseCommitSha) body.parents = [baseCommitSha];
  const commit = await api(`https://api.github.com/repos/${REPO}/git/commits`, { method: 'POST', body: JSON.stringify(body) });
  return commit.sha;
}

/** Создаёт ветку либо обновляет существующую. */
async function setRef(branch, sha) {
  const base = `https://api.github.com/repos/${REPO}/git/refs`;
  let exists = true;
  try {
    await api(`https://api.github.com/repos/${REPO}/git/ref/heads/${branch}`);
  } catch (e) {
    if (/404/.test(e.message)) exists = false;
    else throw e;
  }
  if (exists) {
    // Изменение существующей ссылки — PATCH по адресу с именем ветки.
    await api(`${base}/heads/${branch}`, { method: 'PATCH', body: JSON.stringify({ sha, force: true }) });
  } else {
    // Создание — только через корневой адрес, с именем ветки в теле.
    // POST по адресу /git/refs/heads/<имя> не поддерживается.
    await api(base, { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${branch}`, sha }) });
  }
}

(async () => {
  if (!process.env.GITHUB_TOKEN) throw new Error('Нет GITHUB_TOKEN');
  if (!fs.existsSync(DIST)) throw new Error('Нет dist/. Сначала: npm run build');

  const stamp = new Date().toISOString().slice(0, 19).replace('T', ' ');

  /* ---- gh-pages: собранная игра ---- */
  console.log('Загружаю сборку…');
  const distEntries = await uploadTree(DIST);
  // Без base_tree: ветка собирается с нуля, в корне остаётся только игра.
  const pagesCommit = await makeCommit(distEntries, `Сборка ${stamp}`, null);
  await setRef('gh-pages', pagesCommit);
  console.log(`  gh-pages → ${pagesCommit.slice(0, 8)} (${distEntries.length} файлов)`);

  /* ---- main: исходники ---- */
  console.log('Загружаю исходники…');
  const srcEntries = await uploadTree(ROOT);
  const head = await api(`https://api.github.com/repos/${REPO}/git/ref/heads/main`);
  const base = await api(`https://api.github.com/repos/${REPO}/git/commits/${head.object.sha}`);

  // Собираем дерево поверх прежнего, но явно удаляем всё, чего в новой
  // сборке уже нет: GitHub удаляет путь, если передать sha: null.
  // Без этого файлы прошлых коммитов живут вечно — например, папка assets/
  // от раннего деплоя, то есть ненужные копии сборки в репозитории с исходниками.
  const oldTree = await api(`https://api.github.com/repos/${REPO}/git/trees/${base.tree.sha}?recursive=1`);
  const fresh = new Set(srcEntries.map((e) => e.path));
  const stale = (oldTree.tree || [])
    .filter((n) => n.type === 'blob' && !fresh.has(n.path))
    .map((n) => ({ path: n.path, mode: '100644', type: 'blob', sha: null }));

  const srcCommit = await makeCommit([...srcEntries, ...stale], `Исходники, ${stamp}`, base.sha);
  await setRef('main', srcCommit);
  console.log(`  main → ${srcCommit.slice(0, 8)} (${srcEntries.length} файлов${stale.length ? `, удалено ${stale.length}` : ''})`);

  /* ---- проверяем, что Pages смотрит на gh-pages ---- */
  console.log('Проверяю Pages…');
  const pages = await api(`https://api.github.com/repos/${REPO}/pages`);
  const src = pages.source || {};
  const right = src.branch === 'gh-pages' && (src.path === '/' || src.path === '/ (root)');

  if (right) {
    console.log(`  источник: ${src.branch}${src.path}, статус: ${pages.status}`);
  } else {
    // Переключить источник токену без права Pages:write не дано, поэтому
    // не роняем публикацию из-за этого: файлы уже загружены, остаётся
    // один раз переключить источник вручную в настройках репозитория.
    console.log(`  ВНИМАНИЕ: источник Pages — ${JSON.stringify(src)}, а нужен gh-pages.`);
    console.log('  Переключите один раз: Settings → Pages → Source → gh-pages, папка / (root)');
  }

  console.log(`\nАдрес: ${pages.html_url || `https://${REPO.split('/')[0]}.github.io/${REPO.split('/')[1]}/`}`);
  console.log('Сборка развернётся в течение минуты.');
})().catch((e) => {
  console.error('Ошибка:', e.message);
  process.exitCode = 1;
});