import mongoose, { Schema, Document } from 'mongoose';

export interface ICity extends Document {
  name: string;
  createdAt: Date;
}

const CitySchema = new Schema<ICity>({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model<ICity>('City', CitySchema);
