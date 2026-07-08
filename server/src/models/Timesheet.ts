import mongoose, { Schema, Document } from 'mongoose';

export type DayStatus = 'worked' | 'weekend' | 'dayoff' | 'sick' | 'vacation';

export interface ITimesheetDay {
  day: number;
  status: DayStatus;
  hours: number | null;
}

export interface ITimesheet extends Document {
  employeeId: mongoose.Types.ObjectId;
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

// Унікальний індекс для одного табеля на місяць для працівника
TimesheetSchema.index({ employeeId: 1, year: 1, month: 1 }, { unique: true });

export default mongoose.model<ITimesheet>('Timesheet', TimesheetSchema);
