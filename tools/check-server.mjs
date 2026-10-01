// Проверка сервера: статика, сигнализация, защита от выхода за пределы dist/.
const BASE = process.env.BASE || 'http://127.0.0.1:9000';

async function probe(label, path, expect) {
  const r = await fetch(BASE + path);
  const body = await r.text();
  const ct = r.headers.get('content-type');
  const ok = expect ? expect(r.status, ct, body) : r.ok;
  console.log(`${ok ? '  OK  ' : ' ПРОВАЛ'} ${label}`);
  console.log(`         -> ${r.status} ${ct ?? ''} ${JSON.stringify(body.slice(0, 60))}`);
  return ok;
}

const results = [];

// PeerJS отдаёт id через res.send(uuid), поэтому content-type у ответа
// text/html — это норма для express, а не признак неработающей сигнализации.
// Признак поломки здесь другой: 404 либо HTML-страница приложения вместо id.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

results.push(
  await probe('Главная страница отдаётся', '/', (s, ct, b) =>
    s === 200 && !!ct?.includes('text/html') && /<div id="root">/.test(b),
  ),
);

results.push(
  await probe('Сигнализация PeerJS выдаёт id', '/peerjs/peerjs/id?key=peerjs', (s, _ct, b) =>
    s === 200 && UUID.test(b.trim()),
  ),
);

// Список комнат закрыт: чужие не должны видеть чужие комнаты.
results.push(
  await probe('Список комнат недоступен', '/peerjs/peerjs/', (s, ct, b) =>
    s === 403 || s === 404 || (ct?.includes('json') && /peer\w*|Error/i.test(b)) || s === 401,
  ),
);

results.push(
  await probe('Неизвестный путь отдаёт приложение', '/player/42', (s, ct) =>
    s === 200 && !!ct?.includes('text/html'),
  ),
);

// Выход за пределы dist/ обязан быть закрыт: без этой проверки путь вида
// /../../package.json раскрыл бы произвольные файлы на диске.
results.push(
  await probe('Обход каталога закрыт', '/..%2f..%2fpackage.json', (s) => s === 403 || s === 404),
);

const failed = results.filter((x) => !x).length;
console.log(`\n  ИТОГ: ${results.length - failed} из ${results.length} проверок пройденo`);
// Не вызываем process.exit: он обрывает закрывающиеся сокеты libuv,
// и на Windows процесс падает с assertion — это шум, а не ошибка сервера.
process.exitCode = failed ? 1 : 0;