import { Request, Response } from 'express';
import Employee from '../models/Employee';
import City from '../models/City';
import Timesheet from '../models/Timesheet';
import { generateTimesheetDays } from '../utils/timesheetUtils';
import { parseCitySheetPhoto } from '../services/aiCitySheetParser';

// Нормалізує ім'я для порівняння: нижній регістр, без зайвих пробілів,
// без крапок (скорочення на кшталт "Markovyc Tol." vs "Markovyc Tolik").
const normalizeName = (name: string) =>
  name.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();

const namesLooselyMatch = (a: string, b: string): boolean => {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return true;

  const wordsA = na.split(' ').filter(Boolean);
  const wordsB = nb.split(' ').filter(Boolean);
  if (wordsA.length === 0 || wordsB.length === 0) return false;

  // Кожне слово з коротшого імені має бути префіксом якогось слова в довшому
  // (покриває скорочення на кшталт "Tol." <-> "Tolik", "І." <-> "Іван").
  const [shorter, longer] = wordsA.length <= wordsB.length ? [wordsA, wordsB] : [wordsB, wordsA];
  return shorter.every((w) => longer.some((lw) => lw.startsWith(w) || w.startsWith(lw)));
};

export const importCitySheetPhoto = async (req: Request, res: Response) => {
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

    // Пошук працівників: якщо клієнт передав cityId — шукаємо тільки в
    // цьому місті (щоб не плутати однофамільців), інакше по всій базі.
    const employeeQuery = fallbackCityId ? { cityId: fallbackCityId } : {};
    const allEmployees = await Employee.find(employeeQuery);

    const baseDays = generateTimesheetDays(year, month);

    const matched: Array<{ employeeId: string; employeeName: string; totalHours: number }> = [];
    const unmatched: Array<{ recognizedName: string; hours: (number | null)[] }> = [];

    for (const recognized of parsed.employees) {
      const employee = allEmployees.find((e) => namesLooselyMatch(e.fullName, recognized.name));

      if (!employee) {
        unmatched.push({ recognizedName: recognized.name, hours: recognized.hours });
        continue;
      }

      const mergedDays = baseDays.map((base, idx) => {
        const hours = recognized.hours[idx] ?? null;
        return {
          day: base.day,
          hours,
          status: hours !== null ? ('worked' as const) : ('weekend' as const),
        };
      });

      await Timesheet.findOneAndUpdate(
        { employeeId: employee._id, year, month },
        { days: mergedDays, updatedAt: new Date() },
        { upsert: true }
      );

      const totalHours = mergedDays.reduce((sum, d) => sum + (d.hours ?? 0), 0);
      matched.push({ employeeId: String(employee._id), employeeName: employee.fullName, totalHours });
    }

    // Якщо AI розпізнав назву міста і клієнт її не задав — спробуємо знайти
    // відповідне місто, щоб одразу підказати на фронті, куди прив'язувати
    // незнайдених працівників.
    let resolvedCity: { _id: string; name: string } | null = null;
    if (fallbackCityId) {
      const c = await City.findById(fallbackCityId);
      if (c) resolvedCity = { _id: String(c._id), name: c.name };
    } else if (parsed.cityName) {
      const cities = await City.find();
      const match = cities.find((c) => normalizeName(c.name) === normalizeName(parsed.cityName!));
      if (match) resolvedCity = { _id: String(match._id), name: match.name };
    }

    res.json({
      year,
      month,
      detectedCityName: parsed.cityName,
      resolvedCity,
      matched,
      unmatched,
    });
  } catch (error) {
    console.error('Failed to import city sheet photo:', error);
    res.status(500).json({
      error: 'Failed to recognize timesheet sheet photo',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
