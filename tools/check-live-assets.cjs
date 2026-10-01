// Проверяем, что живая страница действительно играбельна: главный документ
// должен ссылаться на сборку, и каждый названный файл должен отдаваться.
const BASE = 'https://moslikesss.github.io/kozyr1/';

(async () => {
  const page = await fetch(BASE, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await page.text();
  console.log(`Главная: ${page.status} ${page.statusText}`);

  // Какие файлы страница просит у сервера
  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((u) => u.startsWith('./assets/') || u.startsWith('/kozyr1/assets/') || u.startsWith('assets/'));

  if (!refs.length) {
    console.log('\n  ВНИМАНИЕ: страница не ссылается ни на один файл сборки.');
    console.log('  Похоже, сервер отдаёт исходники, а не собранную игру.');
    const local = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
    console.log('  Ссылки на странице:', local.join(', '));
    return;
  }

  console.log(`\nФайлов сборки на странице: ${refs.length}`);
  const origin = new URL(BASE).origin;
  let ok = 0;
  for (const ref of refs) {
    // Ссылка в документе уже абсолютная от корня сайта (/kozyr1/assets/...),
    // поэтому её нужно брать от домена. Если строить от BASE, получится
    // /kozyr1/kozyr1/assets/... — такой запрос проверял бы несуществующий адрес.
    const url = ref.startsWith('http') ? ref : origin + ref;
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const size = Number(r.headers.get('content-length') || 0);
    console.log(`  ${r.ok ? '  OK  ' : ' СБОЙ'} ${r.status} ${String(size).padStart(7)} Б  ${ref}`);
    if (r.ok) ok++;
  }
  console.log(`\nИТОГ: ${ok} из ${refs.length} файлов отдаются`);
})();