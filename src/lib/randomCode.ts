/** Трёхзначный код комнаты. Можно расширить до 4 знаков, если понадобится. */
export function randomCode(): string {
  return String(100 + Math.floor(Math.random() * 900));
}

/** Приводит введённый код к трём цифрам: убирает пробелы и ведущие нули потерял не будет. */
export function normalizeCode(raw: string): string {
  const digits = raw.replace(/\D+/g, '').slice(-3);
  return digits;
}

export function isValidCode(code: string): boolean {
  return /^\d{3}$/.test(code);
}
