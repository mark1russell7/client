export function add(a: number, b: number): number {
  return a + b;
}

export function unused(a: number): string {
  if (a > 0) return "positive";
  return "other";
}
