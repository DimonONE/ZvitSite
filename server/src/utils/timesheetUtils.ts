import { ITimesheetDay } from '../models/Timesheet';

export const generateTimesheetDays = (year: number, month: number): ITimesheetDay[] => {
  const daysInMonth = new Date(year, month, 0).getDate();
  const days: ITimesheetDay[] = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day);
    const dayOfWeek = date.getDay();

    // 0 = неділя, 6 = субота
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    days.push({
      day,
      status: isWeekend ? 'weekend' : 'worked',
      hours: null,
    });
  }

  return days;
};

export const getDayName = (year: number, month: number, day: number): string => {
  const date = new Date(year, month - 1, day);
  const dayNames = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  return dayNames[date.getDay()];
};
