import { Request, Response } from 'express';
import ExcelJS from 'exceljs';
import Timesheet from '../models/Timesheet';
import Employee from '../models/Employee';
import City from '../models/City';
import { getDayName } from '../utils/timesheetUtils';
import { buildCityMonth } from '../utils/cityTimesheet';
import { buildCityMonthWorkbook } from '../utils/cityMonthWorkbook';

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

// Зведений табель міста за місяць — Excel у вигляді еталонного зразка
// (див. utils/cityMonthWorkbook.ts). Дані беруться з бази через buildCityMonth:
// ті самі, що бачить сторінка «Експорт» у прев'ю.
export const exportCityMonthToExcel = async (req: Request, res: Response) => {
  try {
    const { cityId, year, month } = req.params;
    const yearNum = parseInt(year);
    const monthNum = parseInt(month);
    if (!yearNum || !monthNum || monthNum < 1 || monthNum > 12) {
      return res.status(400).json({ error: 'Invalid year or month' });
    }

    const city = await City.findById(cityId);
    if (!city) {
      return res.status(404).json({ error: 'City not found' });
    }

    const rowsData = await buildCityMonth(cityId, yearNum, monthNum);
    console.log(
      `[exportCityMonthToExcel] cityId=${cityId} city="${city.name}" year=${yearNum} month=${monthNum} rows=${rowsData.length}`
    );

    const workbook = buildCityMonthWorkbook(city.name, yearNum, monthNum, rowsData);

    const fileName = `${city.name.replace(/\s+/g, '_')}__${String(monthNum).padStart(2, '0')}_${String(
      yearNum % 100
    ).padStart(2, '0')}_.xlsx`;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    // Назва міста може містити кирилицю — у «голому» filename= це кидає
    // ERR_INVALID_CHAR і дає 500, тому filename* (RFC 5987) + ASCII-запасний варіант.
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="timesheet.xlsx"; filename*=UTF-8''${encodeURIComponent(fileName)}`
    );

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
