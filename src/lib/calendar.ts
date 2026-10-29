/** Grila unei luni pentru calendar, cu luni prima zi a săptămânii. Funcții pure. */

export interface CalendarCell {
  /** YYYY-MM-DD; null = celulă goală înainte de ziua 1 */
  date: string | null;
  day: number | null;
}

/** Celulele lunii, grupate pe săptămâni (rânduri de câte 7). */
export function monthGrid(month: string): CalendarCell[][] {
  const [y, m] = month.split('-').map(Number);
  const days = new Date(y, m, 0).getDate();
  // getDay(): 0 = duminică … 6 = sâmbătă → luni = 0
  const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  const cells: CalendarCell[] = Array.from({ length: lead }, () => ({ date: null, day: null }));
  for (let d = 1; d <= days; d++) cells.push({ date: `${month}-${String(d).padStart(2, '0')}`, day: d });
  while (cells.length % 7 !== 0) cells.push({ date: null, day: null });
  const weeks: CalendarCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
