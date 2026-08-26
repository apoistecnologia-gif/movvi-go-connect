export function normalizeCpf(value: string): string {
  return String(value ?? "").replace(/\D/g, "");
}

export function isValidCpf(value: string): boolean {
  const digits = normalizeCpf(value);
  if (digits.length !== 11) return false;
  if (digits === digits[0]?.repeat(11)) return false;

  let sum = 0;
  for (let index = 0; index < 9; index += 1) {
    sum += Number(digits[index]) * (10 - index);
  }
  const first = (11 - (sum % 11)) % 10;
  if (first !== Number(digits[9])) return false;

  sum = 0;
  for (let index = 0; index < 10; index += 1) {
    sum += Number(digits[index]) * (11 - index);
  }
  const second = (11 - (sum % 11)) % 10;
  return second === Number(digits[10]);
}
