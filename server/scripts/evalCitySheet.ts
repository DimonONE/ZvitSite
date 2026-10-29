// Прогоняє розпізнавання зведеного табеля на еталонних фото з
// test-fixtures/city-sheets і порівнює результат з expected.json клітинка
// в клітинку. Запуск:  npx tsx scripts/evalCitySheet.ts [фільтр-по-імені-файлу]
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseCitySheetPhoto } from '../src/services/aiCitySheetParser';
import { findBestNameMatch } from '../src/utils/nameMatch';

interface ExpectedRow {
  name: string;
  total: number;
  cells: string;
}

interface ExpectedSheet {
  image: string;
  cityName: string;
  year: number;
  month: number;
  grandTotal: number;
  rows: ExpectedRow[];
}

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../test-fixtures/city-sheets');

// "11.5*3 x _" -> [11.5, 11.5, 11.5, null, null]
const expandCells = (cells: string): (number | null)[] =>
  cells
    .trim()
    .split(/\s+/)
    .flatMap((token) => {
      const [value, times] = token.split('*');
      const parsed = value === 'x' || value === '_' ? null : Number(value);
      return Array(times ? Number(times) : 1).fill(parsed);
    });

const sum = (hours: (number | null)[]) => hours.reduce<number>((s, h) => s + (h ?? 0), 0);

const fmt = (v: number | null | undefined) => (v === null || v === undefined ? '·' : String(v));

const main = async () => {
  const filter = process.argv[2];
  const { sheets } = JSON.parse(
    fs.readFileSync(path.join(FIXTURES, 'expected.json'), 'utf8')
  ) as { sheets: ExpectedSheet[] };

  let totalCells = 0;
  let wrongCells = 0;

  for (const sheet of sheets) {
    if (filter && !sheet.image.includes(filter)) continue;

    const days = new Date(sheet.year, sheet.month, 0).getDate();

    // Самоперевірка еталону: довжина і сума кожного рядка.
    for (const row of sheet.rows) {
      const hours = expandCells(row.cells);
      if (hours.length !== days) throw new Error(`${sheet.image} / ${row.name}: ${hours.length} cells, expected ${days}`);
      if (sum(hours) !== row.total) throw new Error(`${sheet.image} / ${row.name}: sum ${sum(hours)} != total ${row.total}`);
    }

    console.log(`\n=== ${sheet.image} ===`);
    const started = Date.now();
    const buffer = fs.readFileSync(path.join(FIXTURES, sheet.image));
    const parsed = await parseCitySheetPhoto(buffer, 'image/jpeg');
    console.log(
      `city="${parsed.cityName}" date=${parsed.month}/${parsed.year} rows=${parsed.employees.length}/${sheet.rows.length} ` +
        `(${((Date.now() - started) / 1000).toFixed(1)}s)`
    );
    if (parsed.year !== sheet.year || parsed.month !== sheet.month) console.log('  !! wrong month/year');

    // Рядки на фото йдуть у тому ж порядку, що й в еталоні; зіставлення за
    // ім'ям — лише запасний варіант, якщо модель пропустила/додала рядок.
    const byPosition = parsed.employees.length === sheet.rows.length;

    for (const [index, row] of sheet.rows.entries()) {
      const expected = expandCells(row.cells);
      const match = byPosition
        ? parsed.employees[index]
        : findBestNameMatch(parsed.employees, row.name, (e) => e.name);
      totalCells += days;
      if (!match) {
        wrongCells += days;
        console.log(`  ✗ ${row.name}: NOT FOUND`);
        continue;
      }
      const diffs: string[] = [];
      for (let d = 0; d < days; d++) {
        if ((match.hours[d] ?? null) !== expected[d]) {
          diffs.push(`${d + 1}: ${fmt(match.hours[d])}≠${fmt(expected[d])}`);
        }
      }
      wrongCells += diffs.length;
      const status = diffs.length === 0 ? '✓' : '✗';
      console.log(
        `  ${status} ${row.name.padEnd(16)} read="${match.name}" sum=${sum(match.hours)} photoTotal=${fmt(match.total)} expected=${row.total}` +
          (diffs.length ? `  [${diffs.join(', ')}]` : '')
      );
    }
  }

  const accuracy = totalCells ? (100 * (totalCells - wrongCells)) / totalCells : 0;
  console.log(`\nCells: ${totalCells - wrongCells}/${totalCells} correct (${accuracy.toFixed(2)}%)`);
  process.exitCode = wrongCells === 0 ? 0 : 1;
};

main().catch((err) => {
  console.error(err);
  process.exitCode = 2;
});
