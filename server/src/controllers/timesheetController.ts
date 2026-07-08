import { Request, Response } from 'express';
import Timesheet from '../models/Timesheet';
import { generateTimesheetDays } from '../utils/timesheetUtils';

export const getTimesheet = async (req: Request, res: Response) => {
  try {
    const { employeeId, year, month } = req.params;
    let timesheet = await Timesheet.findOne({
      employeeId,
      year: parseInt(year),
      month: parseInt(month),
    });

    // Якщо табеля не існує, створюємо з автозаповненням вихідних
    if (!timesheet) {
      const days = generateTimesheetDays(parseInt(year), parseInt(month));
      timesheet = new Timesheet({
        employeeId,
        year: parseInt(year),
        month: parseInt(month),
        days,
      });
      await timesheet.save();
    }

    res.json(timesheet);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch timesheet' });
  }
};

export const updateTimesheet = async (req: Request, res: Response) => {
  try {
    const { employeeId, year, month } = req.params;
    const { days } = req.body;

    const timesheet = await Timesheet.findOneAndUpdate(
      { employeeId, year: parseInt(year), month: parseInt(month) },
      { days, updatedAt: new Date() },
      { new: true, upsert: true }
    );

    res.json(timesheet);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update timesheet' });
  }
};
