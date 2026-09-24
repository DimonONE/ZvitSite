import mongoose, { Schema, Document } from 'mongoose';

export type DayStatus = 'worked' | 'weekend' | 'dayoff' | 'sick' | 'vacation';

export interface ITimesheetDay {
  day: number;
  status: DayStatus;
  hours: number | null;
}

export interface ITimesheet extends Document {
  employeeId: mongoose.Types.ObjectId;
  // Місце (місто/об'єкт), на якому відпрацьовані ці години. Один працівник
  // може мати окремі табелі в різних місцях за той самий місяць.
  cityId: mongoose.Types.ObjectId;
  year: number;
  month: number;
  days: ITimesheetDay[];
  updatedAt: Date;
}

const TimesheetDaySchema = new Schema<ITimesheetDay>({
  day: {
    type: Number,
    required: true,
    min: 1,
    max: 31,
  },
  status: {
    type: String,
    enum: ['worked', 'weekend', 'dayoff', 'sick', 'vacation'],
    default: 'worked',
  },
  hours: {
    type: Number,
    default: null,
  },
}, { _id: false });

const TimesheetSchema = new Schema<ITimesheet>({
  employeeId: {
    type: Schema.Types.ObjectId,
    ref: 'Employee',
    required: true,
  },
  cityId: {
    type: Schema.Types.ObjectId,
    ref: 'City',
    required: true,
  },
  year: {
    type: Number,
    required: true,
  },
  month: {
    type: Number,
    required: true,
    min: 1,
    max: 12,
  },
  days: [TimesheetDaySchema],
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Один табель на місяць для пари «працівник + місто».
// (Старий індекс {employeeId, year, month} видаляється міграцією при старті.)
TimesheetSchema.index({ employeeId: 1, cityId: 1, year: 1, month: 1 }, { unique: true });
// Швидка вибірка всіх табелів міста за місяць (експорт / прев'ю).
TimesheetSchema.index({ cityId: 1, year: 1, month: 1 });

export default mongoose.model<ITimesheet>('Timesheet', TimesheetSchema);
