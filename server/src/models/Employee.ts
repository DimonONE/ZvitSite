import mongoose, { Schema, Document } from 'mongoose';

export interface IEmployee extends Document {
  cityId: mongoose.Types.ObjectId;
  fullName: string;
  photoUrl: string | null;
  birthDate: Date | null;
  createdAt: Date;
}

const EmployeeSchema = new Schema<IEmployee>({
  cityId: {
    type: Schema.Types.ObjectId,
    ref: 'City',
    required: true,
  },
  fullName: {
    type: String,
    required: true,
    trim: true,
  },
  photoUrl: {
    type: String,
    default: null,
  },
  birthDate: {
    type: Date,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model<IEmployee>('Employee', EmployeeSchema);
