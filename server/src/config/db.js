import mongoose from 'mongoose';
import { config } from 'dotenv';

config();

const connectDB = async () => {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('MONGODB_URI must be set in production.');
    }
    // Development fallback only — unauthenticated local instance
    console.warn('WARNING: MONGODB_URI not set, falling back to local unauthenticated MongoDB (dev only)');
  }

  try {
    const conn = await mongoose.connect(uri || 'mongodb://localhost:27017/runwatch');
    console.log('MongoDB Connected:', conn.connection.host);
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
    process.exit(1);
  }
};

export default connectDB;