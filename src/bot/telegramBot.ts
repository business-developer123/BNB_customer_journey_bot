import TelegramBot from 'node-telegram-bot-api';
import { getOrCreateUser, isUserRegistered } from '../services/userService';
import dotenv from 'dotenv';

dotenv.config({ debug: false, override: true });

const botToken = process.env.TELEGRAM_BOT_TOKEN;

// Initialize bot
const bot = new TelegramBot(botToken as string, { polling: true });

// Handle /start command
async function handleStart(msg: TelegramBot.Message) {
  const chatId = msg.chat.id;
  const user = msg.from;

  if (!user) {
    await bot.sendMessage(chatId, '❌ Error: User information not available');
    return;
  }

  try {
    // Check if user is already registered
    const isRegistered = await isUserRegistered(user.id);
    
    if (isRegistered) {
      // User is already registered
      const welcomeBackMessage = `
🎉 *Welcome back to Crypto Trading Bot!*

👤 *User Info:*
• Name: ${user.first_name} ${user.last_name || ''}
• Username: ${user.username ? '@' + user.username : 'Not set'}
• ID: ${user.id}

✅ *You are already registered!* No need to create a new account.

🚀 *Available Commands:*
/start - Show this message
/help - Show help information

*Coming soon:*
• Wallet integration
• Crypto trading
• P2P transfers
• NFT management
`;

      await bot.sendMessage(chatId, welcomeBackMessage, { parse_mode: 'Markdown' });
      console.log(`✅ Returning user logged in: ${user.username} (ID: ${user.id})`);
    } else {
      // New user registration
      const savedUser = await getOrCreateUser({
        telegramId: user.id,
        username: user.username,
        firstName: user.first_name,
        lastName: user.last_name
      });

      const welcomeMessage = `
🎉 *Welcome to Crypto Trading Bot!*

👤 *User Info:*
• Name: ${user.first_name} ${user.last_name || ''}
• Username: ${user.username ? '@' + user.username : 'Not set'}
• ID: ${user.id}

✅ *Registration successful!* Your account has been created.

🚀 *Available Commands:*
/start - Show this message
/help - Show help information

*Coming soon:*
• Wallet integration
• Crypto trading
• P2P transfers
• NFT management
`;

      await bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' });
      console.log(`✅ New user registered: ${user.username} (ID: ${user.id})`);
    }
  } catch (error) {
    console.error('❌ Error during login:', error);
    await bot.sendMessage(chatId, '❌ Error during login. Please try again.');
  }
}

// Handle /help command
async function handleHelp(msg: TelegramBot.Message) {
  const chatId = msg.chat.id;
  
  const helpMessage = `
📚 *Help & Commands*

/start - Login and show welcome message
/help - Show this help message

🔧 *Features in Development:*
• Wallet creation and management
• Real-time crypto prices
• Buy/sell cryptocurrencies
• P2P transfers
• NFT marketplace
• Orange Money integration
• Withdrawal options

💬 *Support:*
Contact our support team for assistance.
`;

  await bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
}

// Handle unknown commands
async function handleUnknownCommand(msg: TelegramBot.Message) {
  const chatId = msg.chat.id;
  
  const unknownMessage = `
❓ *Unknown Command*

Please use one of these commands:
/start - Login to the bot
/help - Show help information
`;

  await bot.sendMessage(chatId, unknownMessage, { parse_mode: 'Markdown' });
}

// Set up bot event handlers
function setupBotHandlers() {
  // Handle /start command
  bot.onText(/\/start/, handleStart);
  
  // Handle /help command
  bot.onText(/\/help/, handleHelp);
  
  // Handle all other messages
  bot.on('message', (msg) => {
    if (msg.text && !msg.text.startsWith('/')) {
      handleUnknownCommand(msg);
    }
  });

  // Handle bot errors
  bot.on('error', (error) => {
    console.error('❌ Bot error:', error);
  });

  // Handle polling errors
  bot.on('polling_error', (error) => {
    console.error('❌ Polling error:', error);
  });
}

// Initialize bot
function initBot() {
  console.log('🤖 Starting Telegram bot...');
  setupBotHandlers();
}

export { initBot }; 