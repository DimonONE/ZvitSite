import { Request, Response } from 'express';
import Timesheet from '../models/Timesheet';
import { generateTimesheetDays } from '../utils/timesheetUtils';
import { parseTimesheetPhoto } from '../services/aiTimesheetParser';
import Employee from '../models/Employee';

// Табель належить парі «працівник + місто». Місто береться з ?cityId=...;
// якщо його не передали — використовуємо «домашнє» місто працівника.
const resolveCityId = async (employeeId: string, queryCityId: unknown) => {
  if (typeof queryCityId === 'string' && queryCityId) return queryCityId;
  const employee = await Employee.findById(employeeId).select('cityId');
  return employee ? String(employee.cityId) : null;
};

export const getTimesheet = async (req: Request, res: Response) => {
  try {
    const { employeeId, year, month } = req.params;
    const cityId = await resolveCityId(employeeId, req.query.cityId);
    if (!cityId) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const timesheet = await Timesheet.findOne({
      employeeId,
      cityId,
      year: parseInt(year),
      month: parseInt(month),
    });

    if (timesheet) {
      return res.json(timesheet);
    }

    // Табеля ще немає: віддаємо шаблон місяця з вихідними, але в базу НЕ
    // пишемо — інакше порожній табель «прописав» би працівника в місті.
    res.json({
      employeeId,
      cityId,
      year: parseInt(year),
      month: parseInt(month),
      days: generateTimesheetDays(parseInt(year), parseInt(month)),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch timesheet' });
  }
};

export const updateTimesheet = async (req: Request, res: Response) => {
  try {
    const { employeeId, year, month } = req.params;
    const { days } = req.body;
    const cityId = await resolveCityId(employeeId, req.query.cityId);
    if (!cityId) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const timesheet = await Timesheet.findOneAndUpdate(
      { employeeId, cityId, year: parseInt(year), month: parseInt(month) },
      { days, updatedAt: new Date() },
      { new: true, upsert: true }
    );

    res.json(timesheet);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update timesheet' });
  }
};

// Приймає фото паперового табеля, розпізнає його через Claude і одразу
// зберігає результат в MongoDB (той самий документ, що використовує ручне
// редагування та експорт в Excel).
export const importTimesheetPhoto = async (req: Request, res: Response) => {
  try {
    const { employeeId, year, month } = req.params;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'Photo file is required (field name: "photo")' });
    }

    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const cityId = await resolveCityId(employeeId, req.query.cityId);

    const parsedDays = await parseTimesheetPhoto(
      file.buffer,
      file.mimetype,
      parseInt(year),
      parseInt(month),
      employee.fullName
    );

    // Беремо базовий шаблон місяця (щоб дні, яких немає у відповіді AI,
    // не зникли з табеля) і накладаємо зверху розпізнані значення.
    const baseDays = generateTimesheetDays(parseInt(year), parseInt(month));
    const mergedDays = baseDays.map((base) => {
      const recognized = parsedDays.find((d) => d.day === base.day);
      return recognized ?? base;
    });

    const timesheet = await Timesheet.findOneAndUpdate(
      { employeeId, cityId, year: parseInt(year), month: parseInt(month) },
      { days: mergedDays, updatedAt: new Date() },
      { new: true, upsert: true }
    );

    res.json(timesheet);
  } catch (error) {
    console.error('Failed to import timesheet photo:', error);
    res.status(500).json({
      error: 'Failed to recognize timesheet photo',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
