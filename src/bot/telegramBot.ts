import TelegramBot from 'node-telegram-bot-api';
import { getOrCreateUser, isUserRegistered, hasWallet, getUserWalletInfo, getUserWalletInfoWithTokens } from '../services/userService';
import { createWalletForUser, updateUserWallet, getUserWallet } from '../services/walletService';
import dotenv from 'dotenv';

dotenv.config({ debug: false, override: true });
const botToken = process.env.TELEGRAM_BOT_TOKEN;

const bot = new TelegramBot(botToken as string, { polling: true });

// Helper function to determine network and get network info
function getNetworkInfo() {
  const solanaRpcProvider = process.env.SOLANA_RPC_PROVIDER;
  const isTestnet = solanaRpcProvider?.includes('testnet') || solanaRpcProvider?.includes('devnet') || solanaRpcProvider?.includes('data-seed-prebsc');
  const networkInfo = isTestnet ? '🟡 Solana Testnet' : '🟢 Solana Mainnet';
  return { isTestnet, networkInfo };
}

const userStates: {
  [key: number]: {
    state: string;
    data?: any;
    tokens?: any[];
    walletAddress?: string;
    isCustom?: boolean;
    lastTokenPage?: number;
    transferTokens?: any[];
    selectedToken?: any;
    recipientAddress?: string;
  }
} = {};

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
          { text: '🔄 Refresh Tokens', callback_data: 'refresh_tokens' }
        ],
        [
          { text: '💸 Transfer Token', callback_data: 'transfer_token' }
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
💎 *SOL Balance:* ${parseFloat(walletInfo.balance).toFixed(6)} SOL
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

      const { networkInfo } = getNetworkInfo();
      
      const welcomeBackMessage = `
🎉 *Welcome back to Crypto Trading Bot!*

👤 *User Info:*
• Name: ${user.first_name} ${user.last_name || ''}
• Username: ${user.username ? '@' + user.username : 'Not set'}
• ID: ${user.id}

✅ *You are already registered!* No need to create a new account.
🌐 *Network:* ${networkInfo}

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

      const { networkInfo } = getNetworkInfo();
      
      const welcomeMessage = `
🎉 *Welcome to Crypto Trading Bot!*

👤 *User Info:*
• Name: ${user.first_name} ${user.last_name || ''}
• Username: ${user.username ? '@' + user.username : 'Not set'}
• ID: ${user.id}

✅ *Registration successful!* Your account has been created.
🌐 *Network:* ${networkInfo}

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
/create_wallet - Create a new SOL wallet automatically
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
    if (data.startsWith('select_token_')) {
      const tokenIndex = parseInt(data.replace('select_token_', ''));
      await handleTokenSelectionCallback(chatId, user, messageId, tokenIndex);
      return;
    }
    if (data.startsWith('confirm_transfer_')) {
      const amountStr = data.replace('confirm_transfer_', '');
      const amount = parseFloat(amountStr);
      if (isNaN(amount)) {
        await bot.answerCallbackQuery(query.id, { text: 'Invalid amount' });
        return;
      }
      await handleTransferConfirmation(chatId, user, messageId, amount);
      return;
    }
    switch (data) {
      case 'wallet':
        await handleWalletCallback(chatId, user, messageId);
        break;
      case 'tokens':
        await handleTokensCallback(chatId, user, messageId, 1);
        break;
      case 'refresh_tokens':
        await handleRefreshTokensCallback(chatId, user, messageId);
        break;
      case 'transfer_token':
        await handleTransferTokenCallback(chatId, user, messageId);
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
  // Clear transfer-related state when entering wallet menu, but preserve token data for pagination
  if (userStates[user.id]) {
    // Keep tokens data for pagination functionality
    // delete userStates[user.id].tokens; // Commented out to preserve token data
    // delete userStates[user.id].walletAddress; // Commented out to preserve wallet info
    // delete userStates[user.id].isCustom; // Commented out to preserve wallet info
    // delete userStates[user.id].lastTokenPage; // Commented out to preserve pagination state
    delete userStates[user.id].transferTokens;
    delete userStates[user.id].selectedToken;
    delete userStates[user.id].recipientAddress;
    userStates[user.id].state = '';
  }
  try {
    const walletInfo = await getUserWalletInfo(user.id);

    if (walletInfo) {
      const { networkInfo } = getNetworkInfo();
      
      let walletMessage = `
💰 *Your Wallet Information*

📍 *Address:* \`${walletInfo.address}\`
🔐 *Type:* ${walletInfo.isCustom ? 'Custom Wallet' : 'Auto-generated'}
🌐 *Network:* ${networkInfo}

💎 *Native Balance:*
• SOL: ${parseFloat(walletInfo.balance).toFixed(6)} SOL

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
💰 *Balance:* 0 SOL

*Important:* This wallet was automatically generated for you. Keep your private key safe if you want to import it elsewhere.

*Next Steps:*
• Fund your wallet with SOL
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
/create_wallet - Create a new SOL wallet automatically
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
  // Clear all user state when returning to main menu
  if (userStates[user.id]) {
    delete userStates[user.id];
  }

  const { networkInfo } = getNetworkInfo();

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
• Network: ${networkInfo}
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

// Handle tokens callback with pagination
async function handleTokensCallback(chatId: number, user: TelegramBot.User, messageId: number, page = 1) {
  try {
    console.log(`🔄 Handling tokens callback for user ${user.id}, page ${page}`);
    
    // Check cache
    if (!userStates[user.id]) userStates[user.id] = { state: '' };
    let tokens = userStates[user.id].tokens;
    
    if (!tokens) {
      console.log(`📥 No cached tokens found for user ${user.id}, fetching from blockchain...`);
      await bot.editMessageText('🔄 *Loading token info...*\n\nPlease wait while we fetch your token information...', {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown'
      });
      const walletInfo = await getUserWalletInfoWithTokens(user.id);
      if (!walletInfo || !walletInfo.tokens || walletInfo.tokens.length === 0) {
        console.log(`❌ No tokens found for user ${user.id}`);
        let tokensMessage = `\n🪙 *All Token Balances*\n\n`;
        tokensMessage += `📍 *Wallet Address:* \`${walletInfo ? walletInfo.address : ''}\`\n`;
        tokensMessage += `🔐 *Wallet Type:* ${walletInfo ? (walletInfo.isCustom ? 'Custom Wallet' : 'Auto-generated') : ''}\n`;
        tokensMessage += `\n*Token Balances:* No tokens found in this wallet\n\n*Note:* Only common Solana tokens are checked. Your wallet may have other tokens not shown here.`;
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
      console.log(`✅ Cached ${tokens.length} tokens for user ${user.id}`);
    } else {
      console.log(`📋 Using cached tokens for user ${user.id}, found ${tokens.length} tokens`);
    }

    // Pagination logic - show 1 token per page
    const tokensPerPage = 1;
    const totalPages = Math.ceil(tokens.length / tokensPerPage);
    let currentPage = page;
    if (currentPage < 1) currentPage = 1;
    if (currentPage > totalPages) currentPage = totalPages;
    
    userStates[user.id].lastTokenPage = currentPage;
    
    const startIndex = (currentPage - 1) * tokensPerPage;
    const endIndex = Math.min(startIndex + tokensPerPage, tokens.length);
    const pageTokens = tokens.slice(startIndex, endIndex);
    
    console.log(`📄 Pagination: Page ${currentPage}/${totalPages}, showing token ${startIndex + 1} of ${tokens.length}`);
    console.log(`🎯 Current token: ${pageTokens[0]?.symbol} (${pageTokens[0]?.name})`);
    
    const { networkInfo } = getNetworkInfo();
    
    let tokensMessage = `\n🪙 *Token Information*\n\n`;
    tokensMessage += `📍 *Wallet Address:* \`${userStates[user.id].walletAddress}\`\n`;
    tokensMessage += `🔐 *Wallet Type:* ${userStates[user.id].isCustom ? 'Custom Wallet' : 'Auto-generated'}\n`;
    tokensMessage += `🌐 *Network:* ${networkInfo}\n`;
    tokensMessage += `\n*Token ${currentPage} of ${totalPages}*\n\n`;

    // Display single token with detailed information
    const token = pageTokens[0];
    tokensMessage += `🪙 *${token.symbol} (${token.name})*\n`;
    tokensMessage += `📍 *Token Address:* \`${token.token_address}\`\n`;
    tokensMessage += `💰 *Balance:* ${token.balance} ${token.symbol}\n`;
    tokensMessage += `🔢 *Decimals:* ${token.decimals || 'N/A'}\n`;
    tokensMessage += `💵 *Price:* $${token.price ? parseFloat(token.price).toFixed(6) : 'N/A'}\n`;
    
    // Pagination keyboard with improved layout
    const buttons = [];
    const navigationRow = [];
    
    if (currentPage > 1) {
      navigationRow.push({ text: '⬅️ Prev', callback_data: `tokens_page_${currentPage - 1}` });
    }
    if (currentPage < totalPages) {
      navigationRow.push({ text: 'Next ➡️', callback_data: `tokens_page_${currentPage + 1}` });
    }
    
    if (navigationRow.length > 0) {
      buttons.push(navigationRow);
    }
    
    buttons.push([{ text: '🔙 Back to Wallet', callback_data: 'wallet' }]);
    
    const keyboard = {
      reply_markup: {
        inline_keyboard: buttons
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

// Handle refresh tokens callback
async function handleRefreshTokensCallback(chatId: number, user: TelegramBot.User, messageId: number) {
  try {
    console.log(`🔄 Refreshing tokens for user ${user.id}`);
    
    // Clear cached token data to force fresh fetch
    if (userStates[user.id]) {
      delete userStates[user.id].tokens;
      delete userStates[user.id].walletAddress;
      delete userStates[user.id].isCustom;
      delete userStates[user.id].lastTokenPage;
    }
    
    // Fetch fresh token data and show first page
    await handleTokensCallback(chatId, user, messageId, 1);
  } catch (error) {
    console.error('Error refreshing tokens:', error);
    await bot.editMessageText('❌ Error refreshing tokens. Please try again.', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: createWalletMenuKeyboard().reply_markup
    });
  }
}

// Handle transfer token callback
async function handleTransferTokenCallback(chatId: number, user: TelegramBot.User, messageId: number) {
  try {
    // Clear any cached token data to ensure fresh fetch from correct network
    if (userStates[user.id]) {
      delete userStates[user.id].tokens;
      delete userStates[user.id].walletAddress;
      delete userStates[user.id].isCustom;
      delete userStates[user.id].lastTokenPage;
    }

    const walletInfo = await getUserWalletInfoWithTokens(user.id);
    if (!walletInfo || !walletInfo.tokens || walletInfo.tokens.length === 0) {
      await bot.editMessageText('❌ *No tokens found*\n\nYou don\'t have any tokens to transfer.', {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: createWalletMenuKeyboard().reply_markup
      });
      return;
    }

    // Store tokens in user state for transfer flow
    if (!userStates[user.id]) userStates[user.id] = { state: '' };
    userStates[user.id].transferTokens = walletInfo.tokens;
    userStates[user.id].state = 'selecting_token_for_transfer';

    const { networkInfo } = getNetworkInfo();
    
    let transferMessage = `💸 *Transfer Token*\n\n`;
    transferMessage += `📍 *Your Wallet:* \`${walletInfo.address}\`\n`;
    transferMessage += `🌐 *Network:* ${networkInfo}\n\n`;
    transferMessage += `*Select a token to transfer:*\n\n`;

    walletInfo.tokens.forEach((token, index) => {
      transferMessage += `${index + 1}. **${token.symbol}** (${token.name})\n`;
      transferMessage += `   💰 Balance: ${token.balance} ${token.symbol}\n\n`;
    });

    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          ...walletInfo.tokens.map((_, index) => [{
            text: `${index + 1}. ${walletInfo.tokens[index].symbol}`,
            callback_data: `select_token_${index}`
          }]),
          [{ text: '🔙 Back', callback_data: 'wallet' }]
        ]
      }
    };

    await bot.editMessageText(transferMessage, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    console.error('Error handling transfer token callback:', error);
    await bot.editMessageText('❌ Error loading tokens for transfer. Please try again.', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: createWalletMenuKeyboard().reply_markup
    });
  }
}

// Handle token selection for transfer
async function handleTokenSelectionCallback(chatId: number, user: TelegramBot.User, messageId: number, tokenIndex: number) {
  try {
    if (!userStates[user.id] || !userStates[user.id].transferTokens) {
      await bot.editMessageText('❌ Session expired. Please try again.', {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: createWalletMenuKeyboard().reply_markup
      });
      return;
    }

    const selectedToken = userStates[user.id].transferTokens![tokenIndex];
    userStates[user.id].selectedToken = selectedToken;
    userStates[user.id].state = 'entering_recipient_address';

    let transferMessage = `💸 *Transfer ${selectedToken.symbol}*

`;
    transferMessage += `*Selected Token:* ${selectedToken.name} (${selectedToken.symbol})
`;
    transferMessage += `*Your Balance:* ${selectedToken.balance} ${selectedToken.symbol}\n\n`;
    transferMessage += `*Please enter the recipient wallet address:*
`;
    transferMessage += `(Send the address as a text message)`;

    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔙 Back to Token Selection', callback_data: 'transfer_token' }]
        ]
      }
    };

    await bot.editMessageText(transferMessage, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    console.error('Error handling token selection:', error);
    await bot.editMessageText('❌ Error selecting token. Please try again.', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: createWalletMenuKeyboard().reply_markup
    });
  }
}

// Handle recipient address input
async function handleRecipientAddressInput(msg: TelegramBot.Message) {
  const chatId = msg.chat.id;
  const user = msg.from;
  const recipientAddress = msg.text?.trim();

  if (!user || !recipientAddress) {
    await bot.sendMessage(chatId, '❌ Invalid address. Please try again.');
    return;
  }

  try {
    if (!userStates[user.id] || !userStates[user.id].selectedToken) {
      await bot.sendMessage(chatId, '❌ Session expired. Please start transfer again.', {
        reply_markup: createWalletMenuKeyboard().reply_markup
      });
      return;
    }

    // Validate address format
    const { isValidWalletAddress } = await import('../utils/blockchainUtils');
    if (!isValidWalletAddress(recipientAddress)) {
      await bot.sendMessage(chatId, '❌ Invalid wallet address format. Please enter a valid BSC address.');
      return;
    }

    userStates[user.id].recipientAddress = recipientAddress;
    userStates[user.id].state = 'entering_amount';

    const selectedToken = userStates[user.id].selectedToken;
    let transferMessage = `💸 *Transfer ${selectedToken.symbol}*\n\n`;
    transferMessage += `*Token:* ${selectedToken.name} (${selectedToken.symbol})\n`;
    transferMessage += `*Recipient:* \`${recipientAddress}\`\n`;
    transferMessage += `*Your Balance:* ${selectedToken.balance} ${selectedToken.symbol}\n\n`;
    transferMessage += `*Please enter the amount to transfer:*\n`;
    transferMessage += `(Send the amount as a number)`;

    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔙 Back to Token Selection', callback_data: 'transfer_token' }]
        ]
      }
    };

    await bot.sendMessage(chatId, transferMessage, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    console.error('Error handling recipient address input:', error);
    await bot.sendMessage(chatId, '❌ Error processing address. Please try again.');
  }
}

// Handle amount input and execute transfer
async function handleAmountInput(msg: TelegramBot.Message) {
  const chatId = msg.chat.id;
  const user = msg.from;
  const amount = msg.text?.trim();

  if (!user || !amount) {
    await bot.sendMessage(chatId, '❌ Invalid amount. Please try again.');
    return;
  }

  try {
    if (!userStates[user.id] || !userStates[user.id].selectedToken || !userStates[user.id].recipientAddress) {
      await bot.sendMessage(chatId, '❌ Session expired. Please start transfer again.', {
        reply_markup: createWalletMenuKeyboard().reply_markup
      });
      return;
    }

    const selectedToken = userStates[user.id].selectedToken;
    const recipientAddress = userStates[user.id].recipientAddress;
    const transferAmount = parseFloat(amount);

    if (isNaN(transferAmount) || transferAmount <= 0) {
      await bot.sendMessage(chatId, '❌ Invalid amount. Please enter a positive number.');
      return;
    }

    const userBalance = parseFloat(selectedToken.balance);
    if (transferAmount > userBalance) {
      await bot.sendMessage(chatId, `❌ Insufficient balance. You have ${userBalance} ${selectedToken.symbol}, but trying to transfer ${transferAmount} ${selectedToken.symbol}.`);
      return;
    }

    // Show confirmation message
    let confirmationMessage = `💸 *Transfer Confirmation*\n\n`;
    confirmationMessage += `*Token:* ${selectedToken.name} (${selectedToken.symbol})\n`;
    confirmationMessage += `*Amount:* ${transferAmount} ${selectedToken.symbol}\n`;
    confirmationMessage += `*Recipient:* \`${recipientAddress}\`\n`;
    confirmationMessage += `*Your Balance:* ${userBalance} ${selectedToken.symbol}\n\n`;
    confirmationMessage += `*Please confirm the transfer:*`;

    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Confirm Transfer', callback_data: `confirm_transfer_${transferAmount}` },
            { text: '❌ Cancel', callback_data: 'wallet' }
          ]
        ]
      }
    };

    await bot.sendMessage(chatId, confirmationMessage, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    console.error('Error handling amount input:', error);
    await bot.sendMessage(chatId, '❌ Error processing amount. Please try again.');
  }
}

// Handle transfer confirmation and execute transfer
async function handleTransferConfirmation(chatId: number, user: TelegramBot.User, messageId: number, amount: number) {
  try {
    if (!userStates[user.id] || !userStates[user.id].selectedToken || !userStates[user.id].recipientAddress) {
      await bot.editMessageText('❌ Session expired. Please start transfer again.', {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: createWalletMenuKeyboard().reply_markup
      });
      return;
    }

    const selectedToken = userStates[user.id].selectedToken;
    const recipientAddress = userStates[user.id].recipientAddress;
    const senderWallet = await getUserWallet(user.id);

    if (!senderWallet) {
      await bot.editMessageText('❌ Wallet not found. Please create or import a wallet first.', {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: createWalletMenuKeyboard().reply_markup
      });
      return;
    }

    // Show processing message
    await bot.editMessageText('🔄 *Processing Transfer...*\n\nPlease wait while we process your transaction.', {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown'
    });

    // Determine if this is a native SOL transfer or token transfer
    const isNativeSOL = selectedToken.token_address === 'SOL' || selectedToken.symbol === 'SOL' || selectedToken.name === 'Solana';
    
    let transactionResult;
    
    if (isNativeSOL) {
      // Transfer native SOL
      const { transferSOL } = await import('../utils/blockchainUtils'); 
      transactionResult = await transferSOL(
        senderWallet.address,
        recipientAddress!,
        amount.toString()
      );
    } else {
      // Transfer SPL token (for now using SOL transfer, but this should be updated for SPL tokens)
      const { transferSOL } = await import('../utils/blockchainUtils');
      transactionResult = await transferSOL(
        senderWallet.address,
        recipientAddress!,
        amount.toString()
      );
    }

    // Show success message with transaction link
    let successMessage = `✅ *Transfer Successful!*\n\n`;
    successMessage += `*Token:* ${selectedToken.name} (${selectedToken.symbol})\n`;
    successMessage += `*Amount:* ${amount} ${selectedToken.symbol}\n`;
    successMessage += `*Recipient:* \`${recipientAddress}\`\n`;
    successMessage += `*Transaction Hash:* \`${transactionResult.transactionHash}\`\n\n`;
    
    // Add Solscan link for the transaction based on network
    const { getSolanaNetworkInfo } = await import('../utils/blockchainUtils');
    const { isTestnet, explorerName } = getSolanaNetworkInfo();
    const solscanUrl = transactionResult.solscanLink || `https://solscan.io/tx/${transactionResult.transactionHash}`;
    successMessage += `🔗 [View on ${explorerName}](${solscanUrl})\n\n`;
    successMessage += `*Your transfer has been completed successfully!*`;

    // Clear transfer state
    delete userStates[user.id].transferTokens;
    delete userStates[user.id].selectedToken;
    delete userStates[user.id].recipientAddress;
    userStates[user.id].state = '';

    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '📋 View Transaction', url: solscanUrl },
            { text: '🔙 Back to Wallet', callback_data: 'wallet' }
          ]
        ]
      }
    };

    await bot.editMessageText(successMessage, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup,
      disable_web_page_preview: true
    });
  } catch (error) {
    console.error('Error confirming transfer:', error);
    await bot.editMessageText(`❌ Transfer failed: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: createWalletMenuKeyboard().reply_markup
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
• SOL: ${parseFloat(walletInfo.balance).toFixed(6)} SOL

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
💰 *Balance:* 0 SOL

*Important:* This wallet was automatically generated for you. Keep your private key safe if you want to import it elsewhere.

*Next Steps:*
• Fund your wallet with SOL
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

    // Get wallet info with real balance
    const walletInfo = await getUserWalletInfo(user.id);
    const balance = walletInfo ? walletInfo.balance : '0';

    const successMessage = `
✅ *Wallet Imported Successfully!*

📍 *Address:* \`${wallet.address}\`
🔐 *Type:* Custom Wallet
💰 *Balance:* ${balance} SOL

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
      const user = msg.from;
      if (!user) return;

      const userState = userStates[user.id];
      if (userState) {
        if (userState.state === 'waiting_for_private_key') {
          handlePrivateKeyInput(msg);
          return;
        } else if (userState.state === 'entering_recipient_address') {
          handleRecipientAddressInput(msg);
          return;
        } else if (userState.state === 'entering_amount') {
          handleAmountInput(msg);
          return;
        }
      }
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