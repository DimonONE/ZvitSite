import * as XLSX from 'xlsx';

interface EmployeeData {
  fullName: string;
  hours: (number | null)[];
  totalHours: number;
}

export const exportToExcel = (
  cityName: string,
  year: number,
  month: number,
  employees: EmployeeData[]
) => {
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthNames = [
    'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
    'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень',
  ];
  const monthName = monthNames[month - 1];
  const totalAllHours = employees.reduce((sum, emp) => sum + emp.totalHours, 0);

  // Створюємо дані для таблиці
  const data: any[][] = [];

  // Перший рядок: Місто, Дата (розтягнуто), Сумарно годин
  const firstRow = [
    `Місто: ${cityName}`,
    '',
    `Дата: ${monthName} ${year}`,
    ...Array(daysInMonth - 2).fill(''),
    `Сумарно годин: ${totalAllHours}`,
  ];
  data.push(firstRow);

  // Другий рядок: №, Ім'я, дні місяця, Всього
  const headerRow = ['№', "Ім'я", ...Array.from({ length: daysInMonth }, (_, i) => i + 1), 'Всього'];
  data.push(headerRow);

  // Рядки з працівниками
  employees.forEach((employee, index) => {
    const row = [
      index + 1,
      employee.fullName,
      ...employee.hours.map((h) => (h === null ? '' : h)),
      employee.totalHours,
    ];
    data.push(row);
  });

  // Створюємо worksheet
  const ws = XLSX.utils.aoa_to_sheet(data);

  // Встановлюємо ширину колонок
  const colWidths = [
    { wch: 5 },  // №
    { wch: 25 }, // Ім'я
    ...Array(daysInMonth).fill({ wch: 5 }), // Дні
    { wch: 10 },  // Всього
  ];
  ws['!cols'] = colWidths;

  // Об'єднуємо комірки для першого рядка
  const merges = [
    // Місто: об'єднуємо A1:B1
    { s: { r: 0, c: 0 }, e: { r: 0, c: 1 } },
    // Дата: об'єднуємо C1 до передостанньої колонки
    { s: { r: 0, c: 2 }, e: { r: 0, c: daysInMonth + 1 } },
  ];
  ws['!merges'] = merges;

  // Додаємо стилі до комірок
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');

  // Стилізація всіх комірок
  for (let R = range.s.r; R <= range.e.r; ++R) {
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[cellAddress]) continue;

      // Базові стилі для всіх комірок
      ws[cellAddress].s = {
        border: {
          top: { style: 'thin', color: { rgb: '000000' } },
          bottom: { style: 'thin', color: { rgb: '000000' } },
          left: { style: 'thin', color: { rgb: '000000' } },
          right: { style: 'thin', color: { rgb: '000000' } },
        },
        alignment: { vertical: 'center', horizontal: 'center' },
      };

      // Перший рядок (заголовки)
      if (R === 0) {
        ws[cellAddress].s.fill = { fgColor: { rgb: 'F0F0F0' } };
        ws[cellAddress].s.font = { bold: true };
        ws[cellAddress].s.alignment = { vertical: 'center', horizontal: 'center' };
      }

      // Другий рядок (колонки)
      if (R === 1) {
        ws[cellAddress].s.fill = { fgColor: { rgb: 'E0E0E0' } };
        ws[cellAddress].s.font = { bold: true };
        ws[cellAddress].s.alignment = { vertical: 'center', horizontal: 'center' };
      }

      // Колонка з іменами (вирівнювання ліворуч)
      if (C === 1 && R > 1) {
        ws[cellAddress].s.alignment = { vertical: 'center', horizontal: 'left' };
      }

      // Колонка "Всього" (сірий фон)
      if (C === daysInMonth + 2 && R > 1) {
        ws[cellAddress].s.fill = { fgColor: { rgb: 'F9F9F9' } };
        ws[cellAddress].s.font = { bold: true };
      }

      // Пусті клітинки (вихідні) - світло-сірий фон
      if (R > 1 && C > 1 && C < daysInMonth + 2 && (!ws[cellAddress].v || ws[cellAddress].v === '')) {
        ws[cellAddress].s.fill = { fgColor: { rgb: 'F5F5F5' } };
      }
    }
  }

  // Створюємо workbook
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, monthName);

  // Генеруємо файл
  const fileName = `Табель_${cityName}_${monthName}_${year}.xlsx`;
  XLSX.writeFile(wb, fileName, { bookType: 'xlsx', cellStyles: true });
};
