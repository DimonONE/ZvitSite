import { Request, Response } from 'express';
import Timesheet from '../models/Timesheet';
import { generateTimesheetDays } from '../utils/timesheetUtils';
import { parseTimesheetPhoto } from '../services/aiTimesheetParser';
import Employee from '../models/Employee';

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

    res.json({
      employeeId,
      cityId,
      year: parseInt(year),
      month: parseInt(month),
      days: generateTimesheetDays(parseInt(year), parseInt(month)),
      hourlyRate: null,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch timesheet' });
  }
};

// Усі збережені табелі працівника (у всіх містах і місяцях) — для навігації
// на сторінці редагування: від найновішого до найстарішого.
export const listEmployeeTimesheets = async (req: Request, res: Response) => {
  try {
    const { employeeId } = req.params;
    const timesheets = await Timesheet.find({ employeeId })
      .select('cityId year month days hourlyRate')
      .sort({ year: -1, month: -1 });
    res.json(
      timesheets.map((t) => ({
        cityId: String(t.cityId),
        year: t.year,
        month: t.month,
        totalHours: t.days.reduce((sum, d) => sum + (d.hours ?? 0), 0),
        hourlyRate: t.hourlyRate ?? null,
      }))
    );
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch timesheets' });
  }
};

export const updateTimesheet = async (req: Request, res: Response) => {
  try {
    const { employeeId, year, month } = req.params;
    const { days, hourlyRate } = req.body;
    const cityId = await resolveCityId(employeeId, req.query.cityId);
    if (!cityId) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    const update: Record<string, unknown> = { days, updatedAt: new Date() };
    // Ставку чіпаємо лише якщо її передали: null — очистити, число — задати.
    if (hourlyRate === null) {
      update.hourlyRate = null;
    } else if (hourlyRate !== undefined) {
      const rate = Number(hourlyRate);
      if (!Number.isFinite(rate) || rate < 0) {
        return res.status(400).json({ error: 'Invalid hourlyRate' });
      }
      update.hourlyRate = rate;
    }
    const timesheet = await Timesheet.findOneAndUpdate(
      { employeeId, cityId, year: parseInt(year), month: parseInt(month) },
      update,
      { new: true, upsert: true }
    );

    res.json(timesheet);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update timesheet' });
  }
};

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
