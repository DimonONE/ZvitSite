import { Request, Response } from 'express';
import Employee from '../models/Employee';
import City from '../models/City';
import Timesheet from '../models/Timesheet';
import { generateTimesheetDays } from '../utils/timesheetUtils';
import { parseCitySheetPhoto } from '../services/aiCitySheetParser';
import { namesLooselyMatch, findBestNameMatch } from '../utils/nameMatch';

// ---- КРОК 1: preview -----------------------------------------------------
// Розпізнає фото і повертає таблицю "як буде імпортовано" (точно в тому
// вигляді, в якому вона піде в Excel). Нічого НЕ пише в базу — це чисто
// прев'ю, щоб користувач міг перевірити правильність розпізнавання перед
// збереженням.
export const previewCitySheetPhoto = async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'Photo file is required (field name: "photo")' });
    }

    // Необов'язкові підказки від клієнта — використовуються, якщо AI не
    // зміг розпізнати рік/місяць/місто з самого фото.
    const fallbackYear = req.body.year ? parseInt(req.body.year) : undefined;
    const fallbackMonth = req.body.month ? parseInt(req.body.month) : undefined;
    const fallbackCityId = req.body.cityId || undefined;

    const parsed = await parseCitySheetPhoto(file.buffer, file.mimetype);

    const year = parsed.year ?? fallbackYear;
    const month = parsed.month ?? fallbackMonth;

    if (!year || !month) {
      return res.status(422).json({
        error: 'Could not detect month/year from the photo',
        needsManualDate: true,
        parsed,
      });
    }

    // Визначаємо місто: явно передане клієнтом, або те, що розпізнав AI
    // з шапки фото.
    let resolvedCity: { _id: string; name: string } | null = null;
    if (fallbackCityId) {
      const c = await City.findById(fallbackCityId);
      if (c) resolvedCity = { _id: String(c._id), name: c.name };
    } else if (parsed.cityName) {
      const cities = await City.find();
      // Фотографія майже ніколи не розпізнається побуквенно точно (діакритика,
      // пробіли, окремі букви в адресі), тож шукаємо найбільш схожу назву,
      // а не вимагаємо ідентичного тексту.
      const match = findBestNameMatch(cities, parsed.cityName, (c) => c.name);
      if (match) resolvedCity = { _id: String(match._id), name: match.name };
    }

    // Працівник може працювати в кількох місцях, тому шукаємо збіги серед ВСІХ
    // працівників, але спершу серед «домашніх» працівників цього міста.
    // Нічого при цьому не змінюємо і не створюємо.
    const allEmployees = await Employee.find();
    const cityEmployees = resolvedCity
      ? allEmployees.filter((e) => String(e.cityId) === resolvedCity!._id)
      : [];

    const rows = parsed.employees.map((recognized) => {
      const employee =
        cityEmployees.find((e) => namesLooselyMatch(e.fullName, recognized.name)) ??
        allEmployees.find((e) => namesLooselyMatch(e.fullName, recognized.name));
      const totalHours = recognized.hours.reduce((sum: number, h) => sum + (h ?? 0), 0);
      return {
        recognizedName: recognized.name,
        hours: recognized.hours,
        totalHours,
        photoTotal: recognized.total,
        matchedEmployeeId: employee ? String(employee._id) : null,
        matchedEmployeeName: employee ? employee.fullName : null,
      };
    });

    res.json({
      year,
      month,
      totalDays: rows[0]?.hours.length ?? new Date(year, month, 0).getDate(),
      detectedCityName: parsed.cityName,
      resolvedCity,
      rows,
    });
  } catch (error) {
    console.error('Failed to preview city sheet photo:', error);
    res.status(500).json({
      error: 'Failed to recognize timesheet sheet photo',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};

// ---- КРОК 2: confirm -------------------------------------------------------
// Викликається лише після того, як користувач підтвердив прев'ю (побачив
// точну таблицю і натиснув "Зберегти"). Тут і тільки тут:
//   - створюємо працівників, яких ще немає в базі (по обраному місту);
//   - записуємо/оновлюємо табель за відповідний місяць.
interface ConfirmRow {
  recognizedName: string;
  hours: (number | null)[];
  employeeId?: string | null;
  skip?: boolean;
}

export const confirmCitySheetImport = async (req: Request, res: Response) => {
  try {
    const body = req.body as {
      year: number | string;
      month: number | string;
      cityName: string;
      rows: ConfirmRow[];
    };
    const { cityName, rows } = body;
    const year = Number(body.year);
    const month = Number(body.month);

    if (!year || !month || month < 1 || month > 12) {
      return res.status(400).json({ error: 'year and month are required' });
    }
    if (!cityName?.trim()) {
      return res.status(400).json({ error: 'cityName is required' });
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'rows is required and must be a non-empty array' });
    }

    // Два рядки, прив'язані до ОДНОГО працівника, — другий мовчки перезаписав би
    // табель першого (втрата годин). Відхиляємо до будь-яких змін у базі.
    const seenEmployeeIds = new Set<string>();
    for (const r of rows) {
      if (r.skip || !r.employeeId) continue;
      if (seenEmployeeIds.has(String(r.employeeId))) {
        return res.status(400).json({
          error: 'Two rows are linked to the same employee',
          employeeId: r.employeeId,
        });
      }
      seenEmployeeIds.add(String(r.employeeId));
    }

    const trimmedName = cityName.trim();

    // Місто НІКОЛИ не обирається вручну — воно завжди береться з того, що
    // розпізналось на фото (або було виправлене користувачем прямо в
    // прев'ю). Тут просто вирішуємо: чи таке місце вже є в базі (тоді
    // використовуємо його), чи це нове (тоді створюємо — тільки тепер,
    // після підтвердження).
    const existingCities = await City.find();
    const existing = findBestNameMatch(existingCities, trimmedName, (c) => c.name);

    let city;
    let cityCreated = false;
    if (existing) {
      city = existing;
    } else {
      city = await City.create({ name: trimmedName });
      cityCreated = true;
    }

    const baseDays = generateTimesheetDays(year, month);
    const saved: Array<{ employeeId: string; employeeName: string; totalHours: number; created: boolean }> = [];
    let skipped = 0;

    for (const row of rows) {
      if (row.skip) {
        skipped++;
        continue;
      }

      const name = (row.recognizedName || '').trim();
      if (!name) {
        skipped++;
        continue;
      }

      let employee = row.employeeId ? await Employee.findById(row.employeeId) : null;
      let created = false;

      // Існуючого працівника НЕ переносимо між містами: він може працювати
      // в кількох місцях. Місто зберігається в самому табелі (Timesheet.cityId).
      // Користувач підтвердив, що це новий працівник (нема прив'язки до
      // існуючого) — тільки тепер, після підтвердження, його реально
      // створюємо в базі (з цим містом як «домашнім»).
      if (!employee) {
        employee = await Employee.create({ fullName: name, cityId: city._id });
        created = true;
      }

      const mergedDays = baseDays.map((base, idx) => {
        const hours = row.hours?.[idx] ?? null;
        return {
          day: base.day,
          hours,
          status: hours !== null ? ('worked' as const) : ('weekend' as const),
        };
      });

      await Timesheet.findOneAndUpdate(
        { employeeId: employee._id, cityId: city._id, year, month },
        { days: mergedDays, updatedAt: new Date() },
        { upsert: true }
      );

      const totalHours = mergedDays.reduce((sum, d) => sum + (d.hours ?? 0), 0);
      saved.push({
        employeeId: String(employee._id),
        employeeName: employee.fullName,
        totalHours,
        created,
      });
    }

    res.json({
      year,
      month,
      cityId: String(city._id),
      cityName: city.name,
      cityCreated,
      saved,
      skipped,
    });
  } catch (error) {
    console.error('Failed to confirm city sheet import:', error);
    res.status(500).json({
      error: 'Failed to save timesheet sheet import',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};