import Anthropic from '@anthropic-ai/sdk';
import sharp from 'sharp';

let anthropicClient: Anthropic | null = null;
const getAnthropicClient = () => {
  if (!anthropicClient) {
    // Ключ береться з ANTHROPIC_API_KEY у .env.
    anthropicClient = new Anthropic();
  }
  return anthropicClient;
};

// Рукописний табель дуже щільний («11⁵» замість 11.5, червоні хрести поверх
// клітинок) — слабші моделі помиляються тут у половині клітинок. Модель можна
// підмінити через CITY_SHEET_MODEL у .env.
const MODEL = process.env.CITY_SHEET_MODEL || 'claude-opus-5-5';

// Скільки незалежних прочитань листа робиться для голосування по клітинках.
const SHEET_READS = Number(process.env.CITY_SHEET_READS) || 3;
const SHEET_EFFORT = (process.env.CITY_SHEET_EFFORT as 'low' | 'medium' | 'high') || 'medium';

// Скільки разів перечитувати рядок, сума якого не збігається з «Hod. celkem».
const MAX_ROW_RETRIES = 2;

// На бланку завжди 31 колонка днів, незалежно від місяця.
const SHEET_COLUMNS = 31;

export interface ParsedCitySheetEmployee {
  name: string;
  // hours[i] = кількість годин у день (i+1); null = "x" / порожньо / нерозбірливо
  hours: (number | null)[];
  // Підсумок із останньої колонки фото («Hod. celkem»), якщо він є. Використовується
  // ЛИШЕ для перевірки: сума розпізнаних днів має збігатися з ним.
  total: number | null;
}

export interface ParsedCitySheet {
  cityName: string | null;
  year: number | null;
  month: number | null;
  employees: ParsedCitySheetEmployee[];
}

interface RawRow {
  name: string;
  cells: string[];
  total: number | null;
}

const daysInMonth = (year: number, month: number) => new Date(year, month, 0).getDate();

const nullable = (type: string) => ({ type: [type, 'null'] });

const ROW_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    cells: { type: 'array', items: { type: 'string' } },
    total: nullable('number'),
  },
  required: ['name', 'cells', 'total'],
  additionalProperties: false,
};

const SHEET_SCHEMA = {
  type: 'object',
  properties: {
    cityName: nullable('string'),
    date: nullable('string'),
    grandTotal: nullable('number'),
    rows: { type: 'array', items: ROW_SCHEMA },
  },
  required: ['cityName', 'date', 'grandTotal', 'rows'],
  additionalProperties: false,
};

const ORIENTATION_SCHEMA = {
  type: 'object',
  properties: { rotate: { type: 'integer', enum: [0, 90, 180, 270] } },
  required: ['rotate'],
  additionalProperties: false,
};

const TABLE_SCHEMA = {
  type: 'object',
  properties: { header: { type: 'number' }, top: { type: 'number' }, bottom: { type: 'number' } },
  required: ['header', 'top', 'bottom'],
  additionalProperties: false,
};

// Обрив з'єднання посеред потоку SDK сам не повторює — повторюємо запит цілком.
const isTransientError = (error: unknown) =>
  error instanceof Anthropic.APIConnectionError ||
  error instanceof Anthropic.RateLimitError ||
  error instanceof Anthropic.InternalServerError ||
  (error instanceof Anthropic.APIError && error.status === 529) ||
  (error instanceof Anthropic.AnthropicError && /terminated|ECONNRESET/i.test(error.message));

const askClaude = async (
  prompt: string,
  images: Buffer | Buffer[],
  schema: Record<string, unknown>,
  effort: 'low' | 'medium' | 'high'
): Promise<any> => {
  for (let attempt = 1; ; attempt++) {
    try {
      return await askClaudeOnce(prompt, images, schema, effort);
    } catch (error) {
      if (attempt >= 3 || !isTransientError(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
    }
  }
};

const askClaudeOnce = async (
  prompt: string,
  images: Buffer | Buffer[],
  schema: Record<string, unknown>,
  effort: 'low' | 'medium' | 'high'
): Promise<any> => {
  const imageBlocks = (Array.isArray(images) ? images : [images]).map((image) => ({
    type: 'image' as const,
    source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: image.toString('base64') },
  }));
  const stream = getAnthropicClient().beta.messages.stream({
    model: MODEL,
    max_tokens: 64000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort, format: { type: 'json_schema', schema } },
    messages: [
      {
        role: 'user',
        content: [...imageBlocks, { type: 'text', text: prompt }],
      },
    ],
  });
  const message = await stream.finalMessage();

  if (process.env.CITY_SHEET_DEBUG) {
    const { input_tokens, output_tokens } = message.usage;
    console.log(`[city-sheet] ${effort}: in=${input_tokens} out=${output_tokens}`);
  }

  if (message.stop_reason === 'refusal') {
    throw new Error('AI refused to process the image');
  }
  if (message.stop_reason === 'max_tokens') {
    throw new Error('AI response was truncated');
  }
  const text = message.content.find((block) => block.type === 'text');
  if (!text || text.type !== 'text') {
    throw new Error('AI did not return a text response');
  }
  try {
    return JSON.parse(text.text);
  } catch {
    throw new Error('Failed to parse AI response as JSON');
  }
};

// "11.5" / "11,5" / "11⁵" / "115" -> 11.5; "x" / "" -> null.
// Число > 24 виду "115"/"95" — це загублена кома (на бланку пишуть 11 з
// маленькою 5 зверху), бо за добу більше 24 годин не буває.
export const parseCellToken = (token: unknown): number | null => {
  if (typeof token === 'number') return Number.isFinite(token) && token > 0 && token <= 24 ? token : null;
  if (typeof token !== 'string') return null;
  const text = token.trim().replace(/⁵/g, '.5').replace(',', '.').replace(/\s+/g, '');
  if (!text || /^[xх×✕✗]+$/i.test(text)) return null;
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  let value = Number(text);
  if (value > 24 && /^\d{2,3}5$/.test(text)) value = Number(`${text.slice(0, -1)}.5`);
  return value > 0 && value <= 24 ? value : null;
};

const parseTotal = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(String(value).replace(',', '.').replace(/[^\d.]/g, ''));
  return Number.isFinite(num) && num > 0 ? num : null;
};

const sumCells = (cells: string[], days: number) =>
  cells.slice(0, days).reduce((sum, c) => sum + (parseCellToken(c) ?? 0), 0);

const rowMatchesTotal = (row: RawRow, days: number) =>
  row.total !== null && Math.abs(sumCells(row.cells, days) - row.total) < 0.001;

const normalizeCells = (cells: unknown): string[] => {
  const list = Array.isArray(cells) ? cells.map((c) => (c === null || c === undefined ? '' : String(c))) : [];
  while (list.length < SHEET_COLUMNS) list.push('');
  return list.slice(0, SHEET_COLUMNS);
};

const toRows = (list: any[]): RawRow[] =>
  list
    .filter((r: any) => r && typeof r.name === 'string' && r.name.trim().length > 0)
    .map((r: any) => ({ name: r.name.trim(), cells: normalizeCells(r.cells), total: parseTotal(r.total) }));

// Значення, яке зустрічається найчастіше; при нічиїй — перше з лідерів.
const mostCommon = <T,>(values: T[], key: (v: T) => string): T => {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(key(v), (counts.get(key(v)) ?? 0) + 1);
  return values.reduce((best, v) => (counts.get(key(v))! > counts.get(key(best))! ? v : best));
};

const cellKey = (cell: string) => String(parseCellToken(cell) ?? '');

/**
 * Об'єднує кілька незалежних прочитань листа: кожна клітинка і кожен
 * підсумок — за більшістю голосів. Голосують лише прочитання з однаковою
 * (найчастішою) кількістю рядків, щоб рядки точно відповідали один одному.
 */
const voteRows = (reads: RawRow[][], days: number): RawRow[] => {
  const rowCount = mostCommon(
    reads.map((rows) => rows.length),
    String
  );
  const aligned = reads.filter((rows) => rows.length === rowCount);

  return aligned[0].map((baseRow, i) => {
    const versions = aligned.map((rows) => rows[i]);
    const totals = versions.map((v) => v.total).filter((t): t is number => t !== null);
    const total = totals.length > 0 ? mostCommon(totals, String) : null;
    const voted: RawRow = {
      name: baseRow.name,
      cells: baseRow.cells.map((_, d) => mostCommon(versions.map((v) => v.cells[d]), cellKey)),
      total,
    };
    if (rowMatchesTotal(voted, days)) return voted;

    // Голосування не зійшлося з підсумком (напр. усі три прочитання помилились
    // у різних клітинках). Якщо рівно один окремий варіант рядка сходиться —
    // беремо його; інакше лишаємо голосування, і рядок перечитається.
    const matching = versions
      .map((v) => ({ ...v, name: baseRow.name, total }))
      .filter((v) => rowMatchesTotal(v, days));
    const distinct = new Set(matching.map((v) => v.cells.map(cellKey).join('|')));
    return distinct.size === 1 ? matching[0] : voted;
  });
};

/**
 * Фото табеля часто зроблене «боком». Моделі значно гірше читають повернуту
 * таблицю, тож спершу повертаємо зображення так, щоб текст читався нормально.
 */
const makeUpright = async (image: Buffer): Promise<Buffer> => {
  const preview = await sharp(image).resize({ width: 1024, height: 1024, fit: 'inside' }).jpeg().toBuffer();
  const raw = await askClaude(
    `This photo shows a paper table. By how many degrees must the photo be rotated CLOCKWISE so that the handwritten names and the printed column headers read normally (left-to-right, not sideways or upside down)?`,
    preview,
    ORIENTATION_SCHEMA,
    'low'
  );
  const rotate = [0, 90, 180, 270].includes(raw?.rotate) ? raw.rotate : 0;
  return rotate === 0 ? image : sharp(image).rotate(rotate).jpeg({ quality: 92 }).toBuffer();
};

const CELL_RULES = `How to read a day cell (one cell = one day column):
- A handwritten number of hours: return it as text, e.g. "11.5", "10", "9", "8", "6", "12.5".
  People write the half hour as a SMALL raised "5" after the number: "11⁵" / "11s" / "11ˢ" means "11.5", "12⁵" means "12.5".
  A plain "10" has no raised digit. Do not drop the ".5"; do not confuse "11⁵" with "11" or "10".
- A red/pink cross "X" or a pink-shaded cell = day off: return "X". A cross is NEVER a number.
- A blank cell: return "".
- Read each cell from its own column only, using the printed day numbers in the header (1. 2. 3. … 31.) to keep alignment. Handwriting may lean into a neighbouring cell or the photo may be distorted by perspective — follow the grid lines, not the text position.
- Do not guess from neighbouring rows or days; a row with many identical values is normal, but check every cell.`;

/**
 * Ліва і права половини листа в повній роздільності. Ціле фото сервер
 * зменшує, і дрібний почерк («11⁵» проти «11», хрест проти числа) губиться;
 * на половинах кожна клітинка має вдвічі більше пікселів.
 */
const makeHalves = async (image: Buffer): Promise<Buffer[]> => {
  const { width, height } = await sharp(image).metadata();
  if (!width || !height) return [];
  const half = (from: number, to: number) => {
    const left = Math.floor(width * from);
    return sharp(image)
      .extract({ left, top: 0, width: Math.ceil(width * to) - left, height })
      .jpeg({ quality: 95 })
      .toBuffer();
  };
  return Promise.all([half(0, 0.58), half(0.42, 1)]);
};

const readWholeSheet = async (images: Buffer[]) =>
  askClaude(
    `You are transcribing a photographed paper timesheet EXACTLY, cell by cell, like a scanner.

Image 1 is the whole sheet. Images 2 and 3 are zoomed crops of the same photo: the LEFT part (names and the first days) and the RIGHT part (the last days and "Hod. celkem"); they overlap in the middle. Read every cell on the zoomed crops, where the handwriting is clearest, and use image 1 to keep rows and columns aligned.

Layout:
- Header: "místo:" = place/city name (handwritten), "nástup:" = start date of the month (handwritten, e.g. "1.09.2026").
- Table: column "Jméno" = employee name, then ${SHEET_COLUMNS} day columns numbered 1. … 31., then the "Hod. celkem" column = handwritten row total (e.g. "295,5h" -> 295.5; ignore the trailing "h"/"н").
- Below the table there may be "PRACE <number>" = grand total.

${CELL_RULES}

Output fields:
- "cityName": the place name as written (e.g. "Moskevska 49"), "date": the "nástup" date as written (e.g. "1.09.2026"), "grandTotal": the PRACE number. Use null if not present.
- "rows": EVERY employee row that has a name, in the order of the sheet, even if all its cells are blank.
- "cells": EXACTLY ${SHEET_COLUMNS} strings per row, e.g. ["11.5", "11.5", "X", "", …] — day 1 first, day 31 last.
- "total": the number in "Hod. celkem" for that row, or null if blank/unreadable. Copy it from the sheet; never compute it yourself.
- Months shorter than 31 days leave the last day columns unused. A value that seems to sit in such a column is almost always the photo's perspective: follow the grid lines down from the header to find the real column.`,
    images,
    SHEET_SCHEMA,
    SHEET_EFFORT
  );

// Підказка для місяців коротших за 31 день: зайві колонки бланка ніхто не
// заповнює, тож значення «в 31-й колонці» — це майже завжди перспектива фото.
const shortMonthHint = (days: number) =>
  days < SHEET_COLUMNS
    ? `\nThis month has only ${days} days: day columns ${days + 1}–${SHEET_COLUMNS} are never filled in. If a handwritten value seems to sit in one of those columns, the photo is skewed by perspective — follow the grid lines down from the header to find the real day column (usually the previous one).\n`
    : '';

/**
 * Повторне читання одного рядка на збільшеному фрагменті: шапка з номерами
 * днів + смуга навколо рядка. Використовується лише для рядків, сума яких не
 * збіглася з «Hod. celkem».
 */
const rereadRow = async (
  image: Buffer,
  rows: RawRow[],
  index: number,
  table: { top: number; bottom: number; header: number } | null,
  attempt: number,
  days: number
): Promise<RawRow | null> => {
  const row = rows[index];
  let crop = image;

  if (table) {
    const meta = await sharp(image).metadata();
    const width = meta.width!;
    const height = meta.height!;
    const rowHeight = (table.bottom - table.top) / rows.length;
    // Ширша смуга на другій спробі — на випадок, якщо оцінка позиції рядка зсунулась.
    const spread = attempt === 0 ? 1.6 : 2.6;
    const centre = table.top + rowHeight * (index + 0.5);
    const bandTop = Math.max(0, Math.floor(((centre - rowHeight * spread) / 1000) * height));
    const bandBottom = Math.min(height, Math.ceil(((centre + rowHeight * spread) / 1000) * height));
    const headerTop = Math.max(0, Math.floor(((table.header - rowHeight * 0.8) / 1000) * height));
    const headerBottom = Math.min(height, Math.ceil(((table.top + rowHeight * 0.2) / 1000) * height));

    if (bandBottom > bandTop && headerBottom > headerTop && bandTop > headerBottom) {
      const header = await sharp(image)
        .extract({ left: 0, top: headerTop, width, height: headerBottom - headerTop })
        .toBuffer();
      const band = await sharp(image)
        .extract({ left: 0, top: bandTop, width, height: bandBottom - bandTop })
        .toBuffer();
      const gap = 12;
      crop = await sharp({
        create: {
          width,
          height: headerBottom - headerTop + gap + (bandBottom - bandTop),
          channels: 3,
          background: { r: 255, g: 255, b: 255 },
        },
      })
        .composite([
          { input: header, top: 0, left: 0 },
          { input: band, top: headerBottom - headerTop + gap, left: 0 },
        ])
        .jpeg({ quality: 95 })
        .toBuffer();
    } else if (bandBottom > bandTop) {
      crop = await sharp(image)
        .extract({ left: 0, top: 0, width, height: bandBottom })
        .jpeg({ quality: 95 })
        .toBuffer();
    }
  }

  const neighbours = [rows[index - 1]?.name, rows[index + 1]?.name].filter(Boolean).join('", "');

  const raw = await askClaude(
    `This image shows part of a photographed paper timesheet: the header row with day numbers (1. … 31., then "Hod. celkem"), and below it a few employee rows.
Transcribe ONLY the row of employee "${row.name}"${neighbours ? ` (NOT the neighbouring rows "${neighbours}")` : ''}.
${shortMonthHint(days)}
${CELL_RULES}

"cells": EXACTLY ${SHEET_COLUMNS} strings, day 1 first. "total": the number written in the "Hod. celkem" column of that row, or null.`,
    crop,
    ROW_SCHEMA,
    'high'
  );

  if (!raw || !Array.isArray(raw.cells)) return null;
  // Підсумок із першого прочитання не перезаписуємо: інакше модель, що
  // «з'їхала» на сусідній рядок, прочитала б і його підсумок, і перевірка
  // хибно пройшла б.
  return { name: row.name, cells: normalizeCells(raw.cells), total: row.total ?? parseTotal(raw.total) };
};

const locateTable = async (image: Buffer, firstName: string, lastName: string) => {
  const raw = await askClaude(
    `This is a photographed paper timesheet table. Return the vertical positions (normalized 0..1000 of the image height) of:
- "header": the centre of the row with printed day numbers "1. 2. 3. …",
- "top": the top edge of the first employee row ("${firstName}"),
- "bottom": the bottom edge of the last employee row ("${lastName}").`,
    image,
    TABLE_SCHEMA,
    'low'
  );
  const { header, top, bottom } = raw ?? {};
  if ([header, top, bottom].every((v) => Number.isFinite(v)) && header < top && top < bottom && bottom <= 1000) {
    return { header, top, bottom } as { header: number; top: number; bottom: number };
  }
  return null;
};

const parseSheetDate = (date: unknown): { year: number | null; month: number | null } => {
  if (typeof date !== 'string') return { year: null, month: null };
  const match = date.match(/(\d{1,2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{2,4})/);
  if (!match) return { year: null, month: null };
  const month = Number(match[2]);
  let year = Number(match[3]);
  if (year < 100) year += 2000;
  return {
    year: year >= 2000 && year <= 2100 ? year : null,
    month: month >= 1 && month <= 12 ? month : null,
  };
};

/**
 * Розпізнає фото зведеного табеля по місту: перший рядок — номери днів (1..31),
 * зліва — прізвища працівників, у клітинках — кількість годин або "x".
 *
 * 1. Фото повертається вертикально (табель часто сфотографований боком).
 * 2. Модель переписує всю таблицю кілька разів незалежно: кожен рядок — рівно
 *    31 клітинка ("11.5"/"X"/""); клітинки обираються голосуванням.
 * 3. Кожен рядок звіряється з «Hod. celkem»; якщо сума не збігається — рядок
 *    перечитується окремо на збільшеному фрагменті.
 */
export const parseCitySheetPhoto = async (
  imageBuffer: Buffer,
  _mimeType: string
): Promise<ParsedCitySheet> => {
  const normalized = await sharp(imageBuffer)
    .rotate()
    .resize({ width: 3072, height: 3072, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 92 })
    .toBuffer();
  const image = await makeUpright(normalized);
  const images = [image, ...(await makeHalves(image))];

  // Кілька незалежних прочитань паралельно (за часом — як одне). Випадкова
  // помилка одного прочитання програє голосуванню двох інших.
  const settled = await Promise.allSettled(Array.from({ length: SHEET_READS }, () => readWholeSheet(images)));
  const reads = settled
    .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
    .map((r) => r.value)
    .filter((raw) => raw && Array.isArray(raw.rows))
    .map((raw) => ({ raw, rows: toRows(raw.rows) }))
    .filter((read) => read.rows.length > 0);

  if (reads.length === 0) {
    const failure = settled.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    throw failure ? failure.reason : new Error('AI response did not contain any employees');
  }

  const raw = reads[0].raw;
  const { year, month } = parseSheetDate(raw.date);
  const totalDays = year && month ? daysInMonth(year, month) : SHEET_COLUMNS;

  const rows = voteRows(
    reads.map((read) => read.rows),
    totalDays
  );

  const mismatched = rows.map((_, i) => i).filter((i) => !rowMatchesTotal(rows[i], totalDays));
  if (process.env.CITY_SHEET_DEBUG) {
    console.log(`[city-sheet] ${MODEL}: ${rows.length} rows, mismatched: ${mismatched.map((i) => rows[i].name).join(', ') || 'none'}`);
  }
  if (mismatched.length > 0) {
    const table = await locateTable(image, rows[0].name, rows[rows.length - 1].name).catch(() => null);
    await Promise.all(
      mismatched.map(async (index) => {
        for (let attempt = 0; attempt < MAX_ROW_RETRIES; attempt++) {
          const reread = await rereadRow(image, rows, index, table, attempt, totalDays).catch(() => null);
          if (!reread) continue;
          // Прийнятий лише той варіант, що збігається з підсумком на фото —
          // інакше лишаємо перше прочитання, а прев'ю підсвітить розбіжність.
          if (rowMatchesTotal(reread, totalDays)) {
            rows[index] = reread;
            return;
          }
        }
      })
    );
  }

  const employees: ParsedCitySheetEmployee[] = rows.map((row) => ({
    name: row.name,
    hours: row.cells.slice(0, totalDays).map(parseCellToken),
    total: row.total,
  }));

  return {
    cityName: typeof raw.cityName === 'string' && raw.cityName.trim() ? raw.cityName.trim() : null,
    year,
    month,
    employees,
  };
};
