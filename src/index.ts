import dbConnection from "./utils/dbConnetion";
import { initBot } from "./bot/telegramBot";
import dotenv from "dotenv";

dotenv.config();

async function startApp() {
  try {
    await dbConnection();
    initBot();
  } catch (error) {
    console.error("❌ Error starting application:", error);
    process.exit(1);
  }
}

startApp();