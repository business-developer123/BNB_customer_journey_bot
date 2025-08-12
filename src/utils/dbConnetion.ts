import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

const dbConnection = async () => {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error('MONGO_URI environment variable is not set');
    }
    
    console.log("🔌 Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGO_URI);
    
    // Wait for connection to be ready
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Database connection timeout'));
      }, 10000);
      
      if (mongoose.connection.readyState === 1) {
        clearTimeout(timeout);
        resolve(true);
      } else {
        mongoose.connection.once('connected', () => {
          clearTimeout(timeout);
          resolve(true);
        });
      }
    });
    
    console.log("🌳 Connected to MongoDB successfully");
    console.log(`📊 Database: ${mongoose.connection.name}`);
    console.log(`🔗 Host: ${mongoose.connection.host}`);
    console.log(`📈 Ready State: ${mongoose.connection.readyState}`);
    
  } catch (error) {
    console.error("❌ Database connection failed:", error);
    throw error;
  }
};

export default dbConnection;