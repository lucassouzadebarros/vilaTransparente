export function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

export function monthLabel(month: string) {
  const [year, value] = month.split('-');
  return `${value}/${year}`;
}
