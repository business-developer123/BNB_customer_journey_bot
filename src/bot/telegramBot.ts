import TelegramBot from 'node-telegram-bot-api';
import { getOrCreateUser, isUserRegistered, hasWallet, getUserWalletInfo, getUserWalletInfoWithTokens } from '../services/userService';
import { createWalletForUser, updateUserWallet } from '../services/walletService';
import { formatTokenBalance } from '../utils/blockchainUtils';
import dotenv from 'dotenv';

dotenv.config({ debug: false, override: true });
const botToken = process.env.TELEGRAM_BOT_TOKEN;

const bot = new TelegramBot(botToken as string, { polling: true });

const userStates: { [key: number]: { state: string; data?: any; tokens?: any[]; walletAddress?: string; isCustom?: boolean; lastTokenPage?: number } } = {};

function createMainMenuKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '💰 Wallet', callback_data: 'wallet' }
        ],
        [
          { text: '🆕 Create Wallet', callback_data: 'create_wallet' },
          { text: '📥 Import Wallet', callback_data: 'import_wallet' }
        ],
        [
          { text: '❓ Help', callback_data: 'help' }
        ]
      ]
    }
  };
}

// Create inline keyboard for wallet management
function createWalletMenuKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🪙 All Tokens', callback_data: 'tokens' }
        ],
        [
          { text: '📥 Import Wallet', callback_data: 'import_wallet' }
        ],
        [
          { text: '🔙 Back to Main Menu', callback_data: 'main_menu' }
        ]
      ]
    }
  };
}

// Helper to create pagination keyboard for tokens
function createTokensPaginationKeyboard(currentPage: number, totalPages: number) {
  const buttons = [];
  if (currentPage > 1) {
    buttons.push({ text: '⬅️ Prev', callback_data: `tokens_page_${currentPage - 1}` });
  }
  if (currentPage < totalPages) {
    buttons.push({ text: 'Next ➡️', callback_data: `tokens_page_${currentPage + 1}` });
  }
  buttons.push({ text: '🔙 Back', callback_data: 'wallet' });
  return {
    reply_markup: {
      inline_keyboard: [buttons]
    }
  };
}

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
      // User is already registered - check if they have a wallet first
      const hasExistingWallet = await hasWallet(user.id);
      
      let walletStatus = '';
      if (hasExistingWallet) {
        // Only get basic wallet info without token balances
        const walletInfo = await getUserWalletInfo(user.id);
        if (walletInfo) {
          walletStatus = `
💰 *Wallet Status:* Active
📍 *Address:* \`${walletInfo.address}\`
🔐 *Type:* ${walletInfo.isCustom ? 'Custom Wallet' : 'Auto-generated'}
💎 *BNB Balance:* ${parseFloat(walletInfo.balance).toFixed(6)} BNB
`;
        } else {
          walletStatus = `
💰 *Wallet Status:* Error retrieving wallet information
`;
        }
      } else {
        walletStatus = `
💰 *Wallet Status:* Not created yet
`;
      }

      const welcomeBackMessage = `
🎉 *Welcome back to Crypto Trading Bot!*

👤 *User Info:*
• Name: ${user.first_name} ${user.last_name || ''}
• Username: ${user.username ? '@' + user.username : 'Not set'}
• ID: ${user.id}

✅ *You are already registered!* No need to create a new account.

${walletStatus}

🚀 *Use the buttons below to navigate:*
`;

      const keyboard = createMainMenuKeyboard();
      
      await bot.sendMessage(chatId, welcomeBackMessage, { 
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      });
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

💰 *Next Step:* Create your wallet to start trading!

🚀 *Use the buttons below to get started:*
`;

      const keyboard = createMainMenuKeyboard();
      
      await bot.sendMessage(chatId, welcomeMessage, { 
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      });
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

*Account Management:*
/start - Login and show welcome message
/help - Show this help message

*Wallet Management:*
/wallet - Show wallet information and options
/create_wallet - Create a new BNB wallet automatically
/import_wallet - Import existing wallet using private key

🔧 *Features in Development:*
• Real-time crypto prices
• Buy/sell cryptocurrencies
• P2P transfers
• NFT marketplace
• Orange Money integration
• Withdrawal options

💬 *Support:*
Contact our support team for assistance.
`;

  const keyboard = createMainMenuKeyboard();
  await bot.sendMessage(chatId, helpMessage, { 
    parse_mode: 'Markdown',
    reply_markup: keyboard.reply_markup
  });
}

// Handle callback queries (button clicks)
async function handleCallbackQuery(query: TelegramBot.CallbackQuery) {
  const chatId = query.message?.chat.id;
  const messageId = query.message?.message_id;
  const data = query.data;
  const user = query.from;

  if (!chatId || !data || !user || !messageId) {
    return;
  }

  try {
    if (data.startsWith('tokens_page_')) {
      const page = parseInt(data.replace('tokens_page_', ''));
      await handleTokensCallback(chatId, user, messageId, page);
      return;
    }
    switch (data) {
      case 'wallet':
        await handleWalletCallback(chatId, user, messageId);
        break;
      case 'tokens':
        await handleTokensCallback(chatId, user, messageId, 1);
        break;
      case 'create_wallet':
        await handleCreateWalletCallback(chatId, user, messageId);
        break;
      case 'import_wallet':
        await handleImportWalletCallback(chatId, user, messageId);
        break;
      case 'help':
        await handleHelpCallback(chatId, messageId);
        break;
      case 'main_menu':
        await handleMainMenuCallback(chatId, user, messageId);
        break;
      default:
        await bot.answerCallbackQuery(query.id, { text: 'Unknown command' });
    }
  } catch (error) {
    console.error('Error handling callback query:', error);
    await bot.answerCallbackQuery(query.id, { text: 'Error occurred' });
  }
}

// Handle wallet callback
async function handleWalletCallback(chatId: number, user: TelegramBot.User, messageId: number) {
  if (userStates[user.id]) {
    delete userStates[user.id].tokens;
    delete userStates[user.id].walletAddress;
    delete userStates[user.id].isCustom;
    delete userStates[user.id].lastTokenPage;
  }
  try {
    const walletInfo = await getUserWalletInfo(user.id);
    
    if (walletInfo) {
      let walletMessage = `
💰 *Your Wallet Information*

📍 *Address:* \`${walletInfo.address}\`
🔐 *Type:* ${walletInfo.isCustom ? 'Custom Wallet' : 'Auto-generated'}

💎 *Native Balance:*
• BNB: ${parseFloat(walletInfo.balance).toFixed(6)} BNB

🪙 *Token Balances:* Click "All Tokens" to view your token balances

*Wallet Actions:*
`;
      
      const keyboard = createWalletMenuKeyboard();
      await bot.editMessageText(walletMessage, { 
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      });
    } else {
      const noWalletMessage = `
💰 *Wallet Not Created*

You don't have a wallet yet. Create one to start trading!

*Options:*
`;
      
      const keyboard = createMainMenuKeyboard();
      await bot.editMessageText(noWalletMessage, { 
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      });
    }
  } catch (error) {
    console.error('Error handling wallet callback:', error);
    await bot.sendMessage(chatId, '❌ Error retrieving wallet information. Please try again.');
  }
}



// Handle create wallet callback
async function handleCreateWalletCallback(chatId: number, user: TelegramBot.User, messageId: number) {
  try {
    // Check if user already has a wallet
    const hasExistingWallet = await hasWallet(user.id);
    
    if (hasExistingWallet) {
      const keyboard = createMainMenuKeyboard();
      await bot.editMessageText('❌ You already have a wallet. Use "Import Wallet" to replace it with a different one.', {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: keyboard.reply_markup
      });
      return;
    }

    // Create new wallet
    const wallet = await createWalletForUser(user.id);
    
    const successMessage = `
🎉 *Wallet Created Successfully!*

📍 *Address:* \`${wallet.address}\`
🔐 *Type:* Auto-generated
💰 *Balance:* 0 BNB

*Important:* This wallet was automatically generated for you. Keep your private key safe if you want to import it elsewhere.

*Next Steps:*
• Fund your wallet with BNB
• Start trading cryptocurrencies
• Use "Check Balance" to monitor your balance

*Commands:*
`;
    
    const keyboard = createWalletMenuKeyboard();
    await bot.editMessageText(successMessage, { 
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    console.error('Error creating wallet:', error);
    await bot.sendMessage(chatId, '❌ Error creating wallet. Please try again.');
  }
}

// Handle import wallet callback
async function handleImportWalletCallback(chatId: number, user: TelegramBot.User, messageId: number) {
  try {
    // Set user state to waiting for private key
    userStates[user.id] = { state: 'waiting_for_private_key' };
    
    const importMessage = `
🔐 *Import Existing Wallet*

Please send your wallet's private key.

*Important:*
• This will replace your current wallet (if any)
• Make sure you're sending the correct private key
• Your private key will be stored securely

*Format:* 64-character hexadecimal string (with or without 0x prefix)
`;
    
    await bot.editMessageText(importMessage, { 
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔙 Cancel', callback_data: 'main_menu' }]
        ]
      }
    });
  } catch (error) {
    console.error('Error handling import wallet callback:', error);
    await bot.sendMessage(chatId, '❌ Error starting wallet import. Please try again.');
  }
}

// Handle help callback
async function handleHelpCallback(chatId: number, messageId: number) {
  const helpMessage = `
📚 *Help & Commands*

*Account Management:*
/start - Login and show welcome message
/help - Show this help message

*Wallet Management:*
/wallet - Show wallet information and options
/create_wallet - Create a new BNB wallet automatically
/import_wallet - Import existing wallet using private key

🔧 *Features in Development:*
• Real-time crypto prices
• Trading functionality
• Peer-to-peer transfers
• NFT management
• Withdrawals to Orange Money

*Need Help?*
Contact support or use the buttons below to navigate.
`;

  const keyboard = createMainMenuKeyboard();
  await bot.editMessageText(helpMessage, { 
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'Markdown',
    reply_markup: keyboard.reply_markup
  });
}

// Handle main menu callback
async function handleMainMenuCallback(chatId: number, user: TelegramBot.User, messageId: number) {
  const mainMenuMessage = `
🎉 *Crypto Trading Bot - Main Menu*

Welcome to your crypto trading dashboard!

*Available Actions:*
• 💰 Manage your wallet
• 🆕 Create a new wallet
• 📥 Import existing wallet
• ❓ Get help

*Quick Stats:*
• Status: Active
• Network: BNB Smart Chain
• Trading: Coming Soon

🚀 *Select an option below:*
`;

  const keyboard = createMainMenuKeyboard();
  await bot.editMessageText(mainMenuMessage, { 
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'Markdown',
    reply_markup: keyboard.reply_markup
  });
}

// Refactored handleTokensCallback to support pagination
async function handleTokensCallback(chatId: number, user: TelegramBot.User, messageId: number, page = 1) {
  try {
    // Check cache
    if (!userStates[user.id]) userStates[user.id] = { state: '' };
    let tokens = userStates[user.id].tokens;
    if (!tokens) {
      await bot.editMessageText('🔄 *Loading token info...*\n\nPlease wait while we fetch your token information...', {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown'
      });
      const walletInfo = await getUserWalletInfoWithTokens(user.id);
      if (!walletInfo || !walletInfo.tokens || walletInfo.tokens.length === 0) {
        let tokensMessage = `\n🪙 *All Token Balances*\n\n`;
        tokensMessage += `📍 *Wallet Address:* \`${walletInfo ? walletInfo.address : ''}\`\n`;
        tokensMessage += `🔐 *Wallet Type:* ${walletInfo ? (walletInfo.isCustom ? 'Custom Wallet' : 'Auto-generated') : ''}\n`;
        tokensMessage += `\n*Token Balances:* No tokens found in this wallet\n\n*Note:* Only common BSC tokens are checked. Your wallet may have other tokens not shown here.`;
        const keyboard = createWalletMenuKeyboard();
        await bot.editMessageText(tokensMessage, {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown',
          reply_markup: keyboard.reply_markup
        });
        return;
      }
      tokens = walletInfo.tokens;
      userStates[user.id].tokens = tokens;
      userStates[user.id].walletAddress = walletInfo.address;
      userStates[user.id].isCustom = walletInfo.isCustom;
    }
    const totalPages = tokens.length;
    let currentPage = page;
    if (currentPage < 1) currentPage = 1;
    if (currentPage > totalPages) currentPage = totalPages;
    userStates[user.id].lastTokenPage = currentPage;
    const token = tokens[currentPage - 1];
    let tokensMessage = `\n🪙 *All Token Balances*\n\n`;
    tokensMessage += `📍 *Wallet Address:* \`${userStates[user.id].walletAddress}\`\n`;
    tokensMessage += `🔐 *Wallet Type:* ${userStates[user.id].isCustom ? 'Custom Wallet' : 'Auto-generated'}\n`;
    tokensMessage += `\n*Token ${currentPage} of ${totalPages}*\n`;
    tokensMessage += `*Name:* ${token.name}\n`;
    tokensMessage += `*Symbol:* ${token.symbol}\n`;
    tokensMessage += `*Balance:* ${token.balance} ${token.symbol}\n`;
    tokensMessage += `*Decimals:* ${token.decimals}\n`;
    tokensMessage += `*Address:* \`${token.token_address}\`\n`;
    // Pagination keyboard
    const buttons = [];
    if (currentPage > 1) {
      buttons.push({ text: '⬅️ Prev', callback_data: `tokens_page_${currentPage - 1}` });
    }
    if (currentPage < totalPages) {
      buttons.push({ text: 'Next ➡️', callback_data: `tokens_page_${currentPage + 1}` });
    }
    buttons.push({ text: '🔙 Back', callback_data: 'wallet' });
    const keyboard = {
      reply_markup: {
        inline_keyboard: [buttons]
      }
    };
    await bot.editMessageText(tokensMessage, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    console.error('Error checking tokens:', error);
    const errorMessage = `\n❌ *Error Loading Token Info*\n\nThe following issues may have occurred:\n• Network connectivity problems\n• Rate limiting from the blockchain provider\n• Temporary service unavailability\n\n*Please try again in a few moments.*`;
    const keyboard = createWalletMenuKeyboard();
    await bot.editMessageText(errorMessage, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  }
}

// Handle /wallet command
async function handleWallet(msg: TelegramBot.Message) {
  const chatId = msg.chat.id;
  const user = msg.from;

  if (!user) {
    await bot.sendMessage(chatId, '❌ Error: User information not available');
    return;
  }

  try {
    const walletInfo = await getUserWalletInfo(user.id);
    
    if (walletInfo) {
      let walletMessage = `
💰 *Your Wallet Information*

📍 *Address:* \`${walletInfo.address}\`
🔐 *Type:* ${walletInfo.isCustom ? 'Custom Wallet' : 'Auto-generated'}

💎 *Native Balance:*
• BNB: ${parseFloat(walletInfo.balance).toFixed(6)} BNB

🪙 *Token Balances:* Click "All Tokens" to view your token balances

*Wallet Actions:*
`;
      
      const keyboard = createWalletMenuKeyboard();
      await bot.sendMessage(chatId, walletMessage, { 
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      });
    } else {
      const noWalletMessage = `
💰 *Wallet Not Created*

You don't have a wallet yet. Create one to start trading!

*Options:*
`;
      
      const keyboard = createMainMenuKeyboard();
      await bot.sendMessage(chatId, noWalletMessage, { 
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      });
    }
  } catch (error) {
    console.error('Error handling wallet command:', error);
    await bot.sendMessage(chatId, '❌ Error retrieving wallet information. Please try again.');
  }
}

// Handle /create_wallet command
async function handleCreateWallet(msg: TelegramBot.Message) {
  const chatId = msg.chat.id;
  const user = msg.from;

  if (!user) {
    await bot.sendMessage(chatId, '❌ Error: User information not available');
    return;
  }

  try {
    // Check if user already has a wallet
    const hasExistingWallet = await hasWallet(user.id);
    
    if (hasExistingWallet) {
      const keyboard = createMainMenuKeyboard();
      await bot.sendMessage(chatId, '❌ You already have a wallet. Use "Import Wallet" to replace it with a different one.', {
        reply_markup: keyboard.reply_markup
      });
      return;
    }

    // Create new wallet
    const wallet = await createWalletForUser(user.id);
    
    const successMessage = `
🎉 *Wallet Created Successfully!*

📍 *Address:* \`${wallet.address}\`
🔐 *Type:* Auto-generated
💰 *Balance:* 0 BNB

*Important:* This wallet was automatically generated for you. Keep your private key safe if you want to import it elsewhere.

*Next Steps:*
• Fund your wallet with BNB
• Start trading cryptocurrencies
• Use "Check Balance" to monitor your balance

*Commands:*
`;
    
    const keyboard = createWalletMenuKeyboard();
    await bot.sendMessage(chatId, successMessage, { 
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    console.error('Error creating wallet:', error);
    await bot.sendMessage(chatId, '❌ Error creating wallet. Please try again.');
  }
}

// Handle /import_wallet command
async function handleImportWallet(msg: TelegramBot.Message) {
  const chatId = msg.chat.id;
  const user = msg.from;

  if (!user) {
    await bot.sendMessage(chatId, '❌ Error: User information not available');
    return;
  }

  try {
    // Set user state to waiting for private key
    userStates[user.id] = { state: 'waiting_for_private_key' };
    
    const importMessage = `
🔐 *Import Existing Wallet*

Please send your wallet's private key.

*Important:*
• This will replace your current wallet (if any)
• Make sure you're sending the correct private key
• Your private key will be stored securely

*Format:* 64-character hexadecimal string (with or without 0x prefix)
`;
    
    await bot.sendMessage(chatId, importMessage, { 
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔙 Cancel', callback_data: 'main_menu' }]
        ]
      }
    });
  } catch (error) {
    console.error('Error handling import wallet command:', error);
    await bot.sendMessage(chatId, '❌ Error starting wallet import. Please try again.');
  }
}



// Handle private key input for wallet import
async function handlePrivateKeyInput(msg: TelegramBot.Message) {
  const chatId = msg.chat.id;
  const user = msg.from;
  const privateKey = msg.text?.trim();

  if (!user || !privateKey) {
    await bot.sendMessage(chatId, '❌ Invalid input. Please try again.');
    return;
  }

  const userState = userStates[user.id];
  if (!userState || userState.state !== 'waiting_for_private_key') {
    return;
  }

  try {
    // Clear user state
    delete userStates[user.id];

    // Update wallet with private key
    const wallet = await updateUserWallet(user.id, privateKey);
    
    const successMessage = `
✅ *Wallet Imported Successfully!*

📍 *Address:* \`${wallet.address}\`
🔐 *Type:* Custom Wallet
💰 *Balance:* Checking...

*Your wallet has been updated with the provided private key.*

*Commands:*
`;
    
    const keyboard = createWalletMenuKeyboard();
    await bot.sendMessage(chatId, successMessage, { 
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    console.error('Error importing wallet:', error);
    delete userStates[user.id];
    const keyboard = createMainMenuKeyboard();
    await bot.sendMessage(chatId, '❌ Invalid private key. Please make sure it\'s a valid 64-character hexadecimal string and try again.', {
      reply_markup: keyboard.reply_markup
    });
  }
}

// Handle unknown commands
async function handleUnknownCommand(msg: TelegramBot.Message) {
  const chatId = msg.chat.id;
  const user = msg.from;
  
  if (!user) {
    await bot.sendMessage(chatId, '❌ Error: User information not available');
    return;
  }

  // Check if user is in a special state
  const userState = userStates[user.id];
  if (userState && userState.state === 'waiting_for_private_key') {
    await handlePrivateKeyInput(msg);
    return;
  }
  
  const unknownMessage = `
❓ *Unknown Command*

Please use one of these commands or the buttons below:
/start - Login to the bot
/help - Show help information
/wallet - Manage your wallet
/create_wallet - Create a new wallet
/import_wallet - Import existing wallet
`;

  const keyboard = createMainMenuKeyboard();
  await bot.sendMessage(chatId, unknownMessage, { 
    parse_mode: 'Markdown',
    reply_markup: keyboard.reply_markup
  });
}

// Set up bot event handlers
function setupBotHandlers() {
  // Handle /start command
  bot.onText(/\/start/, handleStart);
  
  // Handle /help command
  bot.onText(/\/help/, handleHelp);
  
  // Handle /wallet command
  bot.onText(/\/wallet/, handleWallet);
  
  // Handle /create_wallet command
  bot.onText(/\/create_wallet/, handleCreateWallet);
  
  // Handle /import_wallet command
  bot.onText(/\/import_wallet/, handleImportWallet);
  
  // Handle callback queries (button clicks)
  bot.on('callback_query', handleCallbackQuery);
  
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