import dbConnection from "./utils/dbConnetion";
import { initBot } from "./bot/telegramBot";
import dotenv from "dotenv";

// Import models to ensure they are registered
import "./models/Event";
import "./models/User";
import "./models/TicketPurchase";
import "./models/NFTListing";
import "./models/NFTResale";

dotenv.config();

async function startApp() {
  try {
    await dbConnection();
    await initBot();
  } catch (error) {
    console.error("❌ Error starting application:", error);
    process.exit(1);
  }
}

startApp();