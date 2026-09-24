import ExcelJS from 'exceljs';
import type { CityMonthRow } from './cityTimesheet';

// Зведений табель міста за місяць у вигляді еталонного Excel-файлу:
//   рядок 1 — «místo: <місто>» | зелена клітинка | «nástup: 1.MM.YYYY» | порожня клітинка
//   рядок 2 — «Jméno» | «1.» … «N.» | «Hod. celkem»
//   рядок 3 — зелена смуга-розділювач
//   рядки 4+ — працівник по центру | години (червоний «x», якщо не працював) | =SUM
// Ця функція нічого не знає про базу: приймає готові рядки (buildCityMonth).

const FONT = 'Calibri';
const GREEN = 'FFC5E0B4';
const RED = 'FFFF0000';
const BLACK = 'FF000000';

const thin: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: BLACK } };
const box: Partial<ExcelJS.Borders> = { top: thin, left: thin, bottom: thin, right: thin };
const fillGreen: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN } };

const F_BASE: Partial<ExcelJS.Font> = { name: FONT, size: 16 }; // шапка, години, підсумки
const F_NAME: Partial<ExcelJS.Font> = { name: FONT, size: 14 }; // імена працівників
const F_X: Partial<ExcelJS.Font> = { name: FONT, size: 14, color: { argb: RED } }; // «x»

const CENTER: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle' };

export const buildCityMonthWorkbook = (
  cityName: string,
  year: number,
  month: number,
  rows: CityMonthRow[]
): ExcelJS.Workbook => {
  const totalDays = new Date(year, month, 0).getDate();
  const lastDayCol = 1 + totalDays; // A = імена, дні йдуть з колонки B
  const totalCol = lastDayCol + 1; // «Hod. celkem»
  const midCol = 1 + Math.floor(totalDays / 2); // для 31 дня = 16 (P)
  const mm = String(month).padStart(2, '0');

  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('List1', {
    views: [{ state: 'frozen', xSplit: 1, ySplit: 0 }],
    pageSetup: {
      paperSize: 9, // A4
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });

  // ---- ширина колонок / висота рядків ---------------------------------
  ws.getColumn(1).width = 30.33;
  for (let d = 1; d <= totalDays; d++) ws.getColumn(1 + d).width = 6.2; // 5.22 з зразка обрізає «11,5» у 16 pt (Excel показав би 12)
  ws.getColumn(totalCol).width = 14;

  ws.getRow(1).height = 56;
  ws.getRow(2).height = 20;
  ws.getRow(3).height = 15;

  // ---- рядок 1: місто / дата ------------------------------------------
  const cityCell = ws.getCell(1, 1);
  cityCell.value = `místo: ${cityName}`;
  cityCell.font = F_BASE;
  cityCell.alignment = { horizontal: 'left', vertical: 'middle' };
  cityCell.border = box;

  ws.getCell(1, midCol - 1).fill = fillGreen; // зелена клітинка над серединою місяця

  ws.mergeCells(1, midCol, 1, lastDayCol);
  const dateCell = ws.getCell(1, midCol);
  dateCell.value = `nástup: 1.${mm}.${year}`;
  dateCell.font = F_BASE;
  dateCell.alignment = { horizontal: 'left', vertical: 'middle' };

  ws.getCell(1, totalCol).border = box;

  // ---- рядок 2: заголовки ----------------------------------------------
  const headers: (string | number)[] = [
    'Jméno',
    ...Array.from({ length: totalDays }, (_, i) => `${i + 1}.`),
    'Hod. celkem',
  ];
  headers.forEach((text, i) => {
    const c = ws.getCell(2, 1 + i);
    c.value = text;
    c.font = F_BASE;
    c.alignment = { horizontal: 'left' };
    c.border = box;
  });

  // ---- рядок 3: зелена смуга -------------------------------------------
  for (let col = 1; col <= totalCol; col++) {
    const c = ws.getCell(3, col);
    c.fill = fillGreen;
    c.border = {
      top: thin,
      bottom: thin,
      ...(col === 1 ? { left: thin } : {}),
      ...(col === totalCol ? { right: thin } : {}),
    };
  }

  // ---- рядки 4+: працівники --------------------------------------------
  const firstDataRow = 4;
  let r = firstDataRow;
  for (const row of rows) {
    ws.getRow(r).height = 36;

    const nameCell = ws.getCell(r, 1);
    nameCell.value = row.fullName;
    nameCell.font = F_NAME;
    nameCell.alignment = CENTER;
    nameCell.border = box;

    let sum = 0;
    for (let d = 1; d <= totalDays; d++) {
      const hours = row.hours[d - 1];
      const c = ws.getCell(r, 1 + d);
      if (hours !== null && hours !== undefined) {
        c.value = hours;
        c.font = F_BASE;
        sum += hours;
      } else {
        c.value = 'x';
        c.font = F_X;
      }
      c.alignment = CENTER;
      c.border = box;
    }

    const first = ws.getColumn(2).letter;
    const last = ws.getColumn(lastDayCol).letter;
    const totalCell = ws.getCell(r, totalCol);
    // result — щоб значення було видно і в переглядачах, які не рахують формули
    totalCell.value = { formula: `SUM(${first}${r}:${last}${r})`, result: sum };
    totalCell.font = F_BASE;
    totalCell.alignment = CENTER;
    totalCell.border = box;

    r++;
  }
  const lastDataRow = r - 1;

  // ---- загальна сума (через порожній рядок) ----------------------------
  if (rows.length > 0) {
    const grandRow = lastDataRow + 2;
    const col = ws.getColumn(totalCol).letter;
    const grand = ws.getCell(grandRow, totalCol);
    grand.value = {
      formula: `SUM(${col}${firstDataRow}:${col}${lastDataRow})`,
      result: rows.reduce((s, x) => s + x.totalHours, 0),
    };
    grand.font = F_BASE;
    grand.alignment = CENTER;
  }

  return workbook;
};
