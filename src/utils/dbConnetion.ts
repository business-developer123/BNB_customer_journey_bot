import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

const dbConnection = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI as string);
    console.log("🌳Connected to MongoDB");
  } catch (error) {
    console.log(error);
  }
};

export default dbConnection;