export interface City {
  _id: string;
  name: string;
  createdAt: string;
}

export interface Employee {
  _id: string;
  cityId: string;
  fullName: string;
  photoUrl: string | null;
  birthDate: string | null;
  createdAt: string;
}

export type DayStatus = 'worked' | 'weekend' | 'dayoff' | 'sick' | 'vacation';

export interface TimesheetDay {
  day: number;
  status: DayStatus;
  hours: number | null;
}

export interface Timesheet {
  _id: string;
  employeeId: string;
  year: number;
  month: number;
  days: TimesheetDay[];
  updatedAt: string;
}
