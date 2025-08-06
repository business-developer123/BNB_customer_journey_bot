import TelegramBot from 'node-telegram-bot-api';
import { getOrCreateUser, isUserRegistered, hasWallet, getUserWalletInfo, getUserWalletInfoWithTokens } from '../services/userService';
import { createWalletForUser, updateUserWallet } from '../services/walletService';
import { formatTokenBalance } from '../utils/blockchainUtils';
import dotenv from 'dotenv';

dotenv.config({ debug: false, override: true });

const botToken = process.env.TELEGRAM_BOT_TOKEN;

// Initialize bot
const bot = new TelegramBot(botToken as string, { polling: true });

// Store user states for wallet operations
const userStates: { [key: number]: { state: string; data?: any } } = {};

// Create inline keyboard for main menu
function createMainMenuKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '💰 Wallet', callback_data: 'wallet' },
          { text: '💎 Balance', callback_data: 'balance' }
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
          { text: '💎 Check Balance', callback_data: 'balance' },
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

// Format wallet info with tokens for display
function formatWalletInfoWithTokens(walletInfo: {
  address: string;
  isCustom: boolean;
  nativeBalance: string;
  tokens: Array<{
    balance: string;
    symbol: string;
    name: string;
    decimals: number;
    address: string;
  }>;
}): string {
  let formattedInfo = `
💰 *Wallet Information*

📍 *Address:* \`${walletInfo.address}\`
🔐 *Type:* ${walletInfo.isCustom ? 'Custom Wallet' : 'Auto-generated'}

💎 *Native Balance:*
• BNB: ${parseFloat(walletInfo.nativeBalance).toFixed(6)} BNB
`;

  if (walletInfo.tokens.length > 0) {
    formattedInfo += `
🪙 *Token Balances:*\n`;
    
    walletInfo.tokens.forEach(token => {
      const formattedBalance = formatTokenBalance(token.balance, token.decimals);
      formattedInfo += `• ${token.symbol} (${token.name}): ${formattedBalance} ${token.symbol}\n`;
    });
  } else {
    formattedInfo += `
🪙 *Token Balances:* No tokens found
`;
  }

  return formattedInfo;
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
        // Only get wallet info if user has a wallet
        const walletInfo = await getUserWalletInfoWithTokens(user.id);
        if (walletInfo) {
          walletStatus = formatWalletInfoWithTokens(walletInfo);
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
/balance - Check your wallet balance

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
    switch (data) {
      case 'wallet':
        await handleWalletCallback(chatId, user, messageId);
        break;
      case 'balance':
        await handleBalanceCallback(chatId, user, messageId);
        break;
      case 'tokens':
        await handleTokensCallback(chatId, user, messageId);
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
  try {
    const walletInfo = await getUserWalletInfoWithTokens(user.id);
    
    if (walletInfo) {
      let walletMessage = `
💰 *Your Wallet Information*

📍 *Address:* \`${walletInfo.address}\`
🔐 *Type:* ${walletInfo.isCustom ? 'Custom Wallet' : 'Auto-generated'}

💎 *Native Balance:*
• BNB: ${parseFloat(walletInfo.nativeBalance).toFixed(6)} BNB
`;

      if (walletInfo.tokens.length > 0) {
        walletMessage += `
🪙 *Token Balances:*\n`;
        
        walletInfo.tokens.forEach(token => {
          const formattedBalance = formatTokenBalance(token.balance, token.decimals);
          walletMessage += `• ${token.symbol} (${token.name}): ${formattedBalance} ${token.symbol}\n`;
        });
      } else {
        walletMessage += `
🪙 *Token Balances:* No tokens found
`;
      }

      walletMessage += `
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

// Handle balance callback
async function handleBalanceCallback(chatId: number, user: TelegramBot.User, messageId: number) {
  try {
    // Send a loading message first
    await bot.editMessageText('🔄 *Loading wallet balance...*\n\nPlease wait while we fetch your balance information...', {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown'
    });

    const walletInfo = await getUserWalletInfoWithTokens(user.id);
    
    if (walletInfo) {
      let balanceMessage = `
💰 *Wallet Balance*

📍 *Address:* \`${walletInfo.address}\`
🔐 *Type:* ${walletInfo.isCustom ? 'Custom Wallet' : 'Auto-generated'}

💎 *Native Balance:*
• BNB: ${parseFloat(walletInfo.nativeBalance).toFixed(6)} BNB
`;

      if (walletInfo.tokens.length > 0) {
        balanceMessage += `
🪙 *Token Balances:*\n`;
        
        walletInfo.tokens.forEach(token => {
          const formattedBalance = formatTokenBalance(token.balance, token.decimals);
          balanceMessage += `• ${token.symbol} (${token.name}): ${formattedBalance} ${token.symbol}\n`;
        });
      } else {
        balanceMessage += `
🪙 *Token Balances:* No tokens found
`;
      }
      
      const keyboard = createWalletMenuKeyboard();
      await bot.editMessageText(balanceMessage, { 
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      });
    } else {
      const keyboard = createMainMenuKeyboard();
      await bot.editMessageText('❌ You don\'t have a wallet yet. Use the "Create Wallet" button to create one.', {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: keyboard.reply_markup
      });
    }
  } catch (error) {
    console.error('Error checking balance:', error);
    
    // Provide a more helpful error message
    const errorMessage = `
❌ *Error Loading Wallet Balance*

The following issues may have occurred:
• Network connectivity problems
• Rate limiting from the blockchain provider
• Temporary service unavailability

*Please try again in a few moments.*
`;

    const keyboard = createWalletMenuKeyboard();
    await bot.editMessageText(errorMessage, { 
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
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
/balance - Check your wallet balance

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
• 💎 Check your balance
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

// Handle tokens callback
async function handleTokensCallback(chatId: number, user: TelegramBot.User, messageId: number) {
  try {
    // Send a loading message first
    await bot.editMessageText('🔄 *Loading token balances...*\n\nPlease wait while we fetch your token information...', {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown'
    });

    const walletInfo = await getUserWalletInfoWithTokens(user.id);
    
    if (walletInfo) {
      let tokensMessage = `
🪙 *All Token Balances*

📍 *Wallet Address:* \`${walletInfo.address}\`
🔐 *Wallet Type:* ${walletInfo.isCustom ? 'Custom Wallet' : 'Auto-generated'}

💎 *Native Balance:*
• BNB: ${parseFloat(walletInfo.nativeBalance).toFixed(6)} BNB

`;

      if (walletInfo.tokens.length > 0) {
        tokensMessage += `🪙 *Token Balances:*\n\n`;
        
        walletInfo.tokens.forEach((token, index) => {
          const formattedBalance = formatTokenBalance(token.balance, token.decimals);
          tokensMessage += `${index + 1}. **${token.symbol}** (${token.name})\n`;
          tokensMessage += `   💰 Balance: ${formattedBalance} ${token.symbol}\n`;
          tokensMessage += `   📍 Contract: \`${token.address}\`\n\n`;
        });
        
        tokensMessage += `*Total Tokens:* ${walletInfo.tokens.length} tokens found`;
      } else {
        tokensMessage += `🪙 *Token Balances:* No tokens found in this wallet\n\n*Note:* Only common BSC tokens are checked. Your wallet may have other tokens not shown here.`;
      }
      
      const keyboard = createWalletMenuKeyboard();
      await bot.editMessageText(tokensMessage, { 
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      });
    } else {
      const keyboard = createMainMenuKeyboard();
      await bot.editMessageText('❌ You don\'t have a wallet yet. Use the "Create Wallet" button to create one.', {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: keyboard.reply_markup
      });
    }
  } catch (error) {
    console.error('Error checking tokens:', error);
    
    // Provide a more helpful error message
    const errorMessage = `
❌ *Error Loading Token Balances*

The following issues may have occurred:
• Network connectivity problems
• Rate limiting from the blockchain provider
• Temporary service unavailability

*Please try again in a few moments.*

*Supported Tokens:*
• WBNB, BUSD, USDT, USDC, CAKE, ETH, BTCB
`;

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
    const walletInfo = await getUserWalletInfoWithTokens(user.id);
    
    if (walletInfo) {
      let walletMessage = `
💰 *Your Wallet Information*

📍 *Address:* \`${walletInfo.address}\`
🔐 *Type:* ${walletInfo.isCustom ? 'Custom Wallet' : 'Auto-generated'}

💎 *Native Balance:*
• BNB: ${parseFloat(walletInfo.nativeBalance).toFixed(6)} BNB
`;

      if (walletInfo.tokens.length > 0) {
        walletMessage += `
🪙 *Token Balances:*\n`;
        
        walletInfo.tokens.forEach(token => {
          const formattedBalance = formatTokenBalance(token.balance, token.decimals);
          walletMessage += `• ${token.symbol} (${token.name}): ${formattedBalance} ${token.symbol}\n`;
        });
      } else {
        walletMessage += `
🪙 *Token Balances:* No tokens found
`;
      }

      walletMessage += `
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

// Handle /balance command
async function handleBalance(msg: TelegramBot.Message) {
  const chatId = msg.chat.id;
  const user = msg.from;

  if (!user) {
    await bot.sendMessage(chatId, '❌ Error: User information not available');
    return;
  }

  try {
    const walletInfo = await getUserWalletInfoWithTokens(user.id);
    
    if (walletInfo) {
      let balanceMessage = `
💰 *Wallet Balance*

📍 *Address:* \`${walletInfo.address}\`
🔐 *Type:* ${walletInfo.isCustom ? 'Custom Wallet' : 'Auto-generated'}

💎 *Native Balance:*
• BNB: ${parseFloat(walletInfo.nativeBalance).toFixed(6)} BNB
`;

      if (walletInfo.tokens.length > 0) {
        balanceMessage += `
🪙 *Token Balances:*\n`;
        
        walletInfo.tokens.forEach(token => {
          const formattedBalance = formatTokenBalance(token.balance, token.decimals);
          balanceMessage += `• ${token.symbol} (${token.name}): ${formattedBalance} ${token.symbol}\n`;
        });
      } else {
        balanceMessage += `
🪙 *Token Balances:* No tokens found
`;
      }
      
      const keyboard = createWalletMenuKeyboard();
      await bot.sendMessage(chatId, balanceMessage, { 
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      });
    } else {
      const keyboard = createMainMenuKeyboard();
      await bot.sendMessage(chatId, '❌ You don\'t have a wallet yet. Use the "Create Wallet" button to create one.', {
        reply_markup: keyboard.reply_markup
      });
    }
  } catch (error) {
    console.error('Error checking balance:', error);
    await bot.sendMessage(chatId, '❌ Error checking balance. Please try again.');
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
/balance - Check wallet balance
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
  
  // Handle /balance command
  bot.onText(/\/balance/, handleBalance);
  
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