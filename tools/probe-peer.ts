import * as p from 'peer';

console.log('ключи модуля:', Object.keys(p).join(', ') || '(нет)');
console.log('default:', typeof p.default);
if (p.default) console.log('  ключи default:', Object.keys(p.default).join(', '));
console.log('ExpressPeerServer:', typeof (p as Record<string, unknown>).ExpressPeerServer);