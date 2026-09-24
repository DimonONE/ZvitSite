import { Request, Response } from 'express';
import ExcelJS from 'exceljs';
import Timesheet from '../models/Timesheet';
import Employee from '../models/Employee';
import City from '../models/City';
import { getDayName } from '../utils/timesheetUtils';
import { buildCityMonth } from '../utils/cityTimesheet';

export const exportTimesheetToExcel = async (req: Request, res: Response) => {
  try {
    const { employeeId, year, month } = req.params;

    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Табель належить парі «працівник + місто»: ?cityId=... або домашнє місто.
    const cityId =
      typeof req.query.cityId === 'string' && req.query.cityId
        ? req.query.cityId
        : String(employee.cityId);

    const timesheet = await Timesheet.findOne({
      employeeId,
      cityId,
      year: parseInt(year),
      month: parseInt(month),
    });

    if (!timesheet) {
      return res.status(404).json({ error: 'Timesheet not found' });
    }

    const city = await City.findById(cityId);

    // Створюємо Excel файл
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Табель');

    // Шапка документа
    worksheet.mergeCells('A1:G1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = `Табель обліку робочого часу за ${getMonthName(parseInt(month))} ${year}`;
    titleCell.font = { bold: true, size: 14 };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

    worksheet.getRow(2).height = 20;
    worksheet.getCell('A2').value = 'Місто:';
    worksheet.getCell('B2').value = city?.name || '';
    worksheet.getCell('A2').font = { bold: true };

    worksheet.getCell('A3').value = 'Працівник:';
    worksheet.getCell('B3').value = employee.fullName;
    worksheet.getCell('A3').font = { bold: true };

    worksheet.getCell('A4').value = 'Дата:';
    worksheet.getCell('B4').value = new Date().toLocaleDateString('uk-UA');
    worksheet.getCell('A4').font = { bold: true };

    // Заголовки таблиці
    worksheet.getRow(6).height = 25;
    worksheet.getCell('A6').value = 'День';
    worksheet.getCell('B6').value = 'День тижня';
    worksheet.getCell('C6').value = 'Статус';

    ['A6', 'B6', 'C6'].forEach(cell => {
      const excelCell = worksheet.getCell(cell);
      excelCell.font = { bold: true };
      excelCell.alignment = { horizontal: 'center', vertical: 'middle' };
      excelCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };
      excelCell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });

    // Дані
    timesheet.days.forEach((dayData, index) => {
      const rowNum = 7 + index;
      const row = worksheet.getRow(rowNum);
      row.height = 20;

      row.getCell(1).value = dayData.day;
      row.getCell(2).value = getDayName(parseInt(year), parseInt(month), dayData.day);
      row.getCell(3).value = getStatusLabelUk(dayData.status);

      // Вихідні зафарбовуємо зеленим
      if (dayData.status === 'weekend') {
        [1, 2, 3].forEach(col => {
          row.getCell(col).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF90EE90' }
          };
        });
      }

      // Бордери
      [1, 2, 3].forEach(col => {
        row.getCell(col).border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
        row.getCell(col).alignment = { horizontal: 'center', vertical: 'middle' };
      });
    });

    // Ширина колонок
    worksheet.getColumn(1).width = 10;
    worksheet.getColumn(2).width = 15;
    worksheet.getColumn(3).width = 20;

    // Відправляємо файл
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=Табель_${employee.fullName.replace(/\s+/g, '_')}_${month.toString().padStart(2, '0')}.${year}.xlsx`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: 'Failed to export timesheet' });
  }
};

function getMonthName(month: number): string {
  const monthNames = [
    'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
    'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'
  ];
  return monthNames[month - 1];
}

function getStatusLabelUk(status: string): string {
  const labels: Record<string, string> = {
    worked: 'Робочий',
    weekend: 'Вихідний',
    dayoff: 'Відгул',
    sick: 'Лікарняний',
    vacation: 'Відпустка',
  };
  return labels[status] || status;
}

// Точна відповідність референсному файлу: місто+дата в шапці, Jméno + дні
// місяця + Hod. celkem, "x" для невідпрацьованих днів, формули SUM.
export const exportCityMonthToExcel = async (req: Request, res: Response) => {
  try {
    const { cityId, year, month } = req.params;
    const yearNum = parseInt(year);
    const monthNum = parseInt(month);

    const city = await City.findById(cityId);
    if (!city) {
      return res.status(404).json({ error: 'City not found' });
    }

    const rowsData = await buildCityMonth(cityId, yearNum, monthNum);
    console.log(
      `[exportCityMonthToExcel] cityId=${cityId} city="${city.name}" year=${yearNum} month=${monthNum} rows=${rowsData.length}`
    );
    const totalDays = new Date(yearNum, monthNum, 0).getDate();
    const lastDayCol = 1 + totalDays; // колонка A = 1, дні йдуть з колонки B
    const totalCol = lastDayCol + 1;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('List1');

    const baseFont = { bold: false, size: 16 };
    const nameFont = { bold: false, size: 14 };

    // Шапка: місто зліва, дата початку місяця справа (як у зразку: для 31
    // дня це A1:N1 "місто" + порожня колонка O + P1:AF1 "дата").
    const midCol = 1 + Math.floor(totalDays / 2); // напр. 16 для 31 дня
    worksheet.mergeCells(1, 1, 1, midCol - 2);
    const cityCell = worksheet.getCell(1, 1);
    cityCell.value = `місto: ${city.name}`;
    cityCell.font = baseFont;

    worksheet.mergeCells(1, midCol, 1, lastDayCol);
    const dateCell = worksheet.getCell(1, midCol);
    dateCell.value = `nástup: 1.${monthNum.toString().padStart(2, '0')}.${yearNum} `;
    dateCell.font = baseFont;

    // Заголовки таблиці
    worksheet.getCell(2, 1).value = 'Jméno';
    worksheet.getCell(2, 1).font = baseFont;
    for (let d = 1; d <= totalDays; d++) {
      const cell = worksheet.getCell(2, 1 + d);
      cell.value = `${d}.`;
      cell.font = baseFont;
    }
    worksheet.getCell(2, totalCol).value = 'Hod. celkem';
    worksheet.getCell(2, totalCol).font = baseFont;

    // Рядок 3 — порожній розділювач (як у зразку)

    let rowNum = 4;
    const firstDataRow = rowNum;
    for (const row of rowsData) {
      const nameCell = worksheet.getCell(rowNum, 1);
      nameCell.value = row.fullName;
      nameCell.font = nameFont;

      for (let d = 1; d <= totalDays; d++) {
        const value = row.hours[d - 1];
        const cell = worksheet.getCell(rowNum, 1 + d);
        cell.value = value !== null && value !== undefined ? value : 'x';
        cell.font = baseFont;
      }

      const totalCell = worksheet.getCell(rowNum, totalCol);
      const startColLetter = worksheet.getColumn(2).letter;
      const endColLetter = worksheet.getColumn(1 + totalDays).letter;
      totalCell.value = { formula: `SUM(${startColLetter}${rowNum}:${endColLetter}${rowNum})` };
      totalCell.font = baseFont;

      rowNum++;
    }
    const lastDataRow = rowNum - 1;

    // Порожній рядок + підсумковий рядок з загальною сумою (як у зразку)
    rowNum++;
    const grandTotalRow = rowNum;
    const totalColLetter = worksheet.getColumn(totalCol).letter;
    worksheet.getCell(grandTotalRow, totalCol).value = {
      formula: `SUM(${totalColLetter}${firstDataRow}:${totalColLetter}${lastDataRow})`,
    };
    worksheet.getCell(grandTotalRow, totalCol).font = baseFont;

    // Ширина колонок — як у зразку
    worksheet.getColumn(1).width = 30.33;
    for (let d = 1; d <= totalDays; d++) {
      worksheet.getColumn(1 + d).width = 5.22;
    }
    worksheet.getColumn(totalCol).width = 12.33;

    const fileName = `${city.name.replace(/\s+/g, '_')}__${monthNum
      .toString()
      .padStart(2, '0')}_${(yearNum % 100).toString().padStart(2, '0')}_.xlsx`;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('City export error:', error);
    res.status(500).json({ error: 'Failed to export city timesheet' });
  }
};


// JSON-версія зведеного табеля міста за місяць: ті самі дані, що йдуть в
// Excel. Використовується сторінкою «Експорт» і прев'ю.
export const getCityMonthJson = async (req: Request, res: Response) => {
  try {
    const { cityId, year, month } = req.params;
    const city = await City.findById(cityId);
    if (!city) {
      return res.status(404).json({ error: 'City not found' });
    }
    const rows = await buildCityMonth(cityId, parseInt(year), parseInt(month));
    res.json({ cityId, cityName: city.name, year: parseInt(year), month: parseInt(month), rows });
  } catch (error) {
    console.error('City month error:', error);
    res.status(500).json({ error: 'Failed to load city timesheet' });
  }
};
