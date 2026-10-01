/*
  КОЗЫРЬ — локальный сервер: раздача собранной игры + сигнализация WebRTC.
  ─────────────────────────────────────────────────────────────────────────
  Запуск:
    npm install
    npm run build
    npm run serve            # или node server.mjs

  Что делает:
    • раздаёт собранную игру из dist/ на том же порту
    • поднимает сервер сигнализации PeerJS по пути /peerjs
    • весь игровой трафик идёт напрямую между браузерами (WebRTC),
      сервер участвует только в знакомстве

  КАК ЭТО РАБОТАЕТ И ПОЧЕМУ ТАК:
    Сервер сигнализации — это отдельное express-приложение. PeerJS инициализирует
    его в обработчике события 'mount', то есть в момент, когда приложение
    подключают к родительскому. Если результат PeerServer() просто вызвать и
    выбросить, 'mount' не наступит и сигнализация не запустится вовсе —
    соединения просто не будут устанавливаться, без всякой ошибки.
    Поэтому здесь приложение честно подключается: app.use('/peerjs', ...).

  Порты:
    3000 — режим разработки (npm run dev)
    9000 — этот сервер (по умолчанию). Игра и сигнализация на одном порту.
    Свой порт:  PORT=8080 npm run serve

  Клиент сам определяет, где искать сигнализацию:
    порт 9000 или 8080  → считает, что сервер рядом (этот случай)
    иначе               → публичный сервер PeerJS
*/
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import express from 'express';
// Сервер сигнализации берём из пакета `peer` (в нём есть ExpressPeerServer),
// а не из `peerjs`: в peerjs 1.5 остался только браузерный клиент, который
// на сервере запустить нельзя. Оба пакета используют один и тот же протокол,
// поэтому браузерный peerjs прекрасно говорит с этим сервером.
import { ExpressPeerServer } from 'peer';

const DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist');
const PORT = Number(process.env.PORT) || 9000;
const SIGNAL_PATH = '/peerjs';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
};

const app = express();
const server = http.createServer(app);

// --- 1. Сигнализация PeerJS. Подключаем к приложению — это и запускает её. ---
app.use(
  SIGNAL_PATH,
  ExpressPeerServer(server, {
    allow_discovery: false, // чужие не должны видеть список комнат
    proxied: false,
  }),
);

// --- 2. Раздача собранной игры. Идёт после сигнализации, поэтому не мешает ей. ---
app.use((req, res) => {
  const url = (req.url || '/').split('?')[0];

  // В dev-режиме Vite отдаёт модули с корня — проксируем на 3000.
  if (process.env.DEV_PROXY === '1') {
    http.get(
      { host: '127.0.0.1', port: 3000, path: req.url, headers: req.headers },
      (up) => {
        res.writeHead(up.statusCode || 200, up.headers);
        up.pipe(res);
      },
    ).on('error', () => {
      res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Vite на порту 3000 не отвечает. Запустите: npm run dev');
    });
    return;
  }

  // Маршруты сигнализации не должны проваливаться в раздачу игры.
  // Если PeerServer не ответил, клиент обязан получить пустой JSON-ответ,
  // а не HTML-страницу: иначе ошибка выглядит как «игра сломалась»,
  // хотя на самом деле сервер сигнализации просто не знает такой запрос.
  if (url === SIGNAL_PATH || url.startsWith(SIGNAL_PATH + '/')) {
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Unknown signaling endpoint', url }));
    return;
  }

  let rel;
  try {
    rel = decodeURIComponent(url);
  } catch {
    res.writeHead(400).end('bad request');
    return;
  }
  if (rel.endsWith('/')) rel += 'index.html';

  const file = path.normalize(path.join(DIST, rel));

  // Выход за пределы dist/ запрещён: без этой проверки путь вида
  // /../../secret превратился бы в чтение произвольного файла на диске.
  if (!file.startsWith(DIST + path.sep) && file !== DIST) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('forbidden');
    return;
  }

  let target = file;
  if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) {
    target = path.join(DIST, 'index.html'); //SPA-подобная маршрутизация
  }

  if (!fs.existsSync(target)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Папка dist/ не найдена. Сначала выполните: npm run build');
    return;
  }

  res.writeHead(200, {
    'Content-Type': MIME[path.extname(target)] || 'application/octet-stream',
    'Cache-Control': path.basename(target) === 'index.html' ? 'no-cache' : 'public, max-age=3600',
  });
  fs.createReadStream(target).pipe(res);
});

function lanIPs() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const n of list || []) {
      if (n.family === 'IPv4' && !n.internal) out.push(n.address);
    }
  }
  return out;
}

server.on('error', (e) => {
  console.error(`\n  Не удалось занять порт ${PORT}: ${e.message}`);
  console.error(`  Занят ли порт? Запустить на другом:  PORT=${PORT + 1} npm run serve\n`);
  process.exit(1);
});

server.listen(PORT, '0.0.0.0', () => {
  const built = fs.existsSync(path.join(DIST, 'index.html'));
  console.log('');
  console.log('  ♠  КОЗЫРЬ — сервер готов');
  console.log('  ─────────────────────────────────────────────');
  console.log(`  Для себя:     http://localhost:${PORT}`);
  for (const ip of lanIPs()) console.log(`  Для игроков:  http://${ip}:${PORT}`);
  console.log(`  Сигнализация: ${SIGNAL_PATH} (PeerJS, на этом же порту)`);
  if (!built) {
    console.log('');
    console.log('  ⚠  Папка dist/ пуста — игра не отдаётся.');
    console.log('     Соберите её:  npm run build');
  }
  console.log('');
  console.log('  Раздайте ссылку «Для игроков» остальным.');
  console.log('  Вы — «Создать комнату», они — «Войти по коду».');
  console.log('');
});
