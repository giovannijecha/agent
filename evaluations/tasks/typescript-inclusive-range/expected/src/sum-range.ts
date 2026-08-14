export function sumRange(start: number, end: number): number {
  let total = 0;
  for (let current = start; current <= end; current += 1) {
    total += current;
  }
  return total;
}
