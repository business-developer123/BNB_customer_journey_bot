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
    // P2P Transfer states
    p2pRecipientId?: string;
    p2pRecipientUser?: any;
    p2pRecipientWallet?: string;
    // NFT states
    nfts?: any[];
    selectedNFT?: any;
    nftFilter?: string;
    nftPage?: number;
    // Event states
    selectedEvent?: any;
    selectedCategory?: string;
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
          { text: '📈 Market & Trading', callback_data: 'market' }
        ],
        [
          { text: '🖼️ My NFTs', callback_data: 'nfts' },
          { text: '🎫 Events', callback_data: 'events' }
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
          { text: '💸 Transfer to Address', callback_data: 'transfer_token' },
          { text: '👥 P2P Transfer', callback_data: 'p2p_transfer' }
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

function createMarketMenuKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '💵 SOL ↔ USDC', callback_data: 'market_pair_SOL-USDC' },
        ],
        [
          { text: '💵 SOL ↔ USDT', callback_data: 'market_pair_SOL-USDT' },
        ],
        [
          { text: '🧮 Custom Pair (coming soon)', callback_data: 'market_tbd' },
        ],
        [
          { text: '🔙 Back to Main Menu', callback_data: 'main_menu' }
        ]
      ]
    }
  };
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

✅ *Available Features:*
• 💰 Wallet management (SOL, USDC, USDT)
• 📈 Market trading with Jupiter protocol
• 👥 P2P transfers (send to @username or ID)
• 🖼️ NFT collection management
• 🎫 Event ticket system with blockchain validation

🎫 *Event Tickets:*
• Purchase tickets as secure NFTs
• Multiple categories (VIP, Standard, Group)
• Anti-fraud blockchain validation
• QR code entry system

🖼️ *NFT Features:*
• Browse your NFT collection
• Transfer NFTs to other users
• Event tickets as collectible NFTs
• Secure ownership verification

🔧 *In Development:*
• Orange Money integration
• Advanced marketplace features
• NFT trading

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
    if (data.startsWith('market_pair_')) {
      const pair = data.slice('market_pair_'.length);
      const [inp, outp] = pair.split('-');
      await handleMarketQuote(chatId, user, messageId, inp, outp);
      return;
    }
    if (data.startsWith('market_slippage_')) {
      const parts = data.split('_');
      const bps = parseInt(parts[2], 10);
      const pair = parts[3];
      const [inp, outp] = pair.split('-');
      if (!userStates[user.id]) userStates[user.id] = { state: '' };
      if (!userStates[user.id].data) userStates[user.id].data = {};
      userStates[user.id].data.slippageBps = bps;
      await handleMarketQuote(chatId, user, messageId, inp, outp);
      return;
    }
    if (data.startsWith('market_amount_')) {
      const pair = data.slice('market_amount_'.length);
      if (!userStates[user.id]) userStates[user.id] = { state: '' };
      if (!userStates[user.id].data) userStates[user.id].data = {};
      userStates[user.id].data.pairForAmount = pair;
      userStates[user.id].state = 'market_enter_quote_amount';
      await bot.editMessageText(`✏️ Enter input amount for ${pair} (number):`, { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: `market_pair_${pair}` }]] } });
      return;
    }
    if (data.startsWith('market_slip_custom_')) {
      const pair = data.slice('market_slip_custom_'.length);
      if (!userStates[user.id]) userStates[user.id] = { state: '' };
      if (!userStates[user.id].data) userStates[user.id].data = {};
      userStates[user.id].data.pairForSlippage = pair;
      userStates[user.id].state = 'market_enter_custom_slippage';
      await bot.editMessageText(`⚙️ Enter slippage percent for ${pair} (e.g., 0.5 or 1 or 2):`, { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: `market_pair_${pair}` }]] } });
      return;
    }
    if (data.startsWith('market_buy_')) {
      const pair = data.slice('market_buy_'.length);
      const [inp, outp] = pair.split('-');
      const st = userStates[user.id] || { state: '', data: {} };
      const amount = st?.data?.quoteAmount as number | undefined;
      if (!amount || amount <= 0) {
        await handleMarketStartTrade(chatId, user, messageId, inp, outp, 'buy');
      } else {
        // Store trading parameters before going to confirm
        if (!userStates[user.id]) userStates[user.id] = { state: '' };
        if (!userStates[user.id].data) userStates[user.id].data = {};
        userStates[user.id].data.inputSymbol = inp;
        userStates[user.id].data.outputSymbol = outp;
        userStates[user.id].data.side = 'buy';
        
        const confirmText = `Please confirm trade amount: ${amount}`;
        await bot.editMessageText(confirmText, {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: { inline_keyboard: [[{ text: '✅ Confirm', callback_data: `market_confirm_${amount}` } , { text: '❌ Cancel', callback_data: 'market' }]] }
        });
      }
      return;
    }
    if (data.startsWith('market_sell_')) {
      const pair = data.slice('market_sell_'.length);
      const [inp, outp] = pair.split('-');
      const st = userStates[user.id] || { state: '', data: {} };
      const amount = st?.data?.quoteAmount as number | undefined;
      if (!amount || amount <= 0) {
        await handleMarketStartTrade(chatId, user, messageId, inp, outp, 'sell');
      } else {
        // Store trading parameters before going to confirm
        if (!userStates[user.id]) userStates[user.id] = { state: '' };
        if (!userStates[user.id].data) userStates[user.id].data = {};
        userStates[user.id].data.inputSymbol = inp;
        userStates[user.id].data.outputSymbol = outp;
        userStates[user.id].data.side = 'sell';
        
        const confirmText = `Please confirm trade amount: ${amount}`;
        await bot.editMessageText(confirmText, {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: { inline_keyboard: [[{ text: '✅ Confirm', callback_data: `market_confirm_${amount}` } , { text: '❌ Cancel', callback_data: 'market' }]] }
        });
      }
      return;
    }
    if (data.startsWith('market_confirm_')) {
      const amountStr = data.replace('market_confirm_', '');
      const amount = parseFloat(amountStr);
      await handleMarketConfirm(chatId, user, messageId, amount);
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
    if (data.startsWith('p2p_select_token_')) {
      const tokenIndex = parseInt(data.replace('p2p_select_token_', ''));
      await handleP2PTokenSelectionCallback(chatId, user, messageId, tokenIndex);
      return;
    }
    if (data.startsWith('confirm_p2p_transfer_')) {
      const amountStr = data.replace('confirm_p2p_transfer_', '');
      const amount = parseFloat(amountStr);
      if (isNaN(amount)) {
        await bot.answerCallbackQuery(query.id, { text: 'Invalid amount' });
        return;
      }
      await handleP2PTransferConfirmation(chatId, user, messageId, amount);
      return;
    }
    if (data.startsWith('view_event_')) {
      const eventId = data.replace('view_event_', '');
      console.log(`🔍 view_event_ callback received: data="${data}", extracted eventId="${eventId}"`);
      await handleViewEventCallback(chatId, user, messageId, eventId);
      return;
    }
    if (data.startsWith('purchase_ticket_')) {
      // Fix: Extract category from the end and eventId from the middle
      const parts = data.split('_');
      const category = parts[parts.length - 1]; // Last part is always category
      const eventId = parts.slice(1, -1).join('_'); // Everything between 'purchase_ticket' and category
      console.log(`🔍 purchase_ticket_ callback received: data="${data}", extracted eventId="${eventId}", category="${category}"`);
      await handlePurchaseTicketCallback(chatId, user, messageId, eventId, category as 'VIP' | 'Standard' | 'Group');
      return;
    }
    if (data.startsWith('view_ticket_')) {
      const mintAddress = data.replace('view_ticket_', '');
      await handleViewTicketCallback(chatId, user, messageId, mintAddress);
      return;
    }
    if (data.startsWith('validate_ticket_')) {
      const mintAddress = data.replace('validate_ticket_', '');
      await handleValidateTicketCallback(chatId, user, messageId, mintAddress);
      return;
    }
    if (data.startsWith('debug_event_')) {
      const eventId = data.replace('debug_event_', '');
      await handleDebugSpecificEventCallback(chatId, user, messageId, eventId);
      return;
    }
    // Always ack callback quickly to avoid Telegram 400 (query timeout)
    await bot.answerCallbackQuery(query.id);
    
    switch (data) {
      case 'wallet':
        await handleWalletCallback(chatId, user, messageId);
        break;
      case 'market':
        await handleMarketMenu(chatId, user, messageId);
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
      case 'p2p_transfer':
        await handleP2PTransferCallback(chatId, user, messageId);
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
      case 'nfts':
        await handleNFTsCallback(chatId, user, messageId);
        break;
      case 'nft_marketplace':
        await handleNFTMarketplaceCallback(chatId, user, messageId);
        break;
      case 'nft_list_all':
        await handleNFTListCallback(chatId, user, messageId, 'all');
        break;
      case 'nft_list_tickets':
        await handleNFTListCallback(chatId, user, messageId, 'tickets');
        break;
      case 'nft_list_collectibles':
        await handleNFTListCallback(chatId, user, messageId, 'collectibles');
        break;
      case 'nft_transfer':
        await handleNFTTransferCallback(chatId, user, messageId);
        break;
      case 'events':
        await handleEventsCallback(chatId, user, messageId);
        break;
      case 'admin_create_event':
        await handleCreateEventCallback(chatId, user, messageId);
        break;
      case 'admin_mint_custom':
        await handleMintCustomNFTCallback(chatId, user, messageId);
        break;
      case 'event_list':
        await handleEventListCallback(chatId, user, messageId);
        break;
      case 'my_tickets':
        await handleMyTicketsCallback(chatId, user, messageId);
        break;
      case 'admin_event_stats':
        await handleEventStatsCallback(chatId, user, messageId);
        break;
      case 'admin_check_nfts':
        await handleAdminCheckNFTsCallback(chatId, user, messageId);
        break;
      case 'admin_debug_event':
        await handleAdminDebugEventCallback(chatId, user, messageId);
        break;
      default:
        await bot.answerCallbackQuery(query.id, { text: 'Unknown command' });
    }
  } catch (error) {
    console.error('Error handling callback query:', error);
    await bot.answerCallbackQuery(query.id, { text: 'Error occurred' });
  }
}

async function handleMarketMenu(chatId: number, user: TelegramBot.User, messageId: number) {
  const { networkInfo } = getNetworkInfo();
  if (!userStates[user.id]) userStates[user.id] = { state: '' };
  if (!userStates[user.id].data) userStates[user.id].data = {};
  if (typeof userStates[user.id].data.slippageBps !== 'number') {
    userStates[user.id].data.slippageBps = 100; // default 1%
  }
  const text = `📈 Market & Trading\n\n` +
    `• Real-time quotes via Jupiter\n` +
    `• Network: ${networkInfo}\n\n` +
    `Choose a popular pair or use custom soon.`;
  const keyboard = createMarketMenuKeyboard();
  await bot.editMessageText(text, {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: keyboard.reply_markup
  });
}

async function handleMarketQuote(chatId: number, user: TelegramBot.User, messageId: number, inputSymbol: string, outputSymbol: string) {
  try {
    const { COMMON_MINTS, getNetworkFromEnv, fetchPrice, resolveMintSymbol } = await import('../utils/tradingUtils');
    const net = getNetworkFromEnv();
    const inSym = resolveMintSymbol(inputSymbol);
    const outSym = resolveMintSymbol(outputSymbol);
    const inMint = inSym ? COMMON_MINTS[net][inSym] : undefined;
    const outMint = outSym ? COMMON_MINTS[net][outSym] : undefined;
    if (!inMint || !outMint) {
      await bot.editMessageText('❌ Unsupported pair', {
        chat_id: chatId,
        message_id: messageId
      });
      return;
    }

    // Amount handling
    if (!userStates[user.id]) userStates[user.id] = { state: '' };
    if (!userStates[user.id].data) userStates[user.id].data = {};
    const slippageBps = typeof userStates[user.id].data.slippageBps === 'number' ? userStates[user.id].data.slippageBps : 100;
    const customAmount = typeof userStates[user.id].data.quoteAmount === 'number' ? userStates[user.id].data.quoteAmount : undefined;

    const decimals = inputSymbol === 'SOL' ? 9 : 6;
    const defaultHuman = inputSymbol === 'SOL' ? 0.1 : 10;
    const humanAmount = typeof customAmount === 'number' && customAmount > 0 ? customAmount : defaultHuman;
    const amountAtomic = BigInt(Math.floor(humanAmount * Math.pow(10, decimals))).toString();

    await bot.editMessageText(`🔄 Fetching quote for ${inputSymbol} → ${outputSymbol}...`, {
      chat_id: chatId,
      message_id: messageId
    });

    const quote = await fetchPrice(inMint, outMint, amountAtomic, slippageBps);
    const outDecimals = outputSymbol === 'SOL' ? 9 : 6;
    const outHuman = Number(quote.outAmount) / Math.pow(10, outDecimals);
    const priceImpact = (parseFloat(quote.priceImpactPct) * 100).toFixed(3);

    const txt = `📊 Quote (${inputSymbol} → ${outputSymbol})\n\n` +
      `• Input: ${humanAmount} ${inputSymbol}\n` +
      `• Estimated Output: ${outHuman.toFixed(6)} ${outputSymbol}\n` +
      `• Slippage: ${(slippageBps / 100).toFixed(2)}%\n` +
      `• Price Impact: ${priceImpact}%`;

    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [ { text: '🔁 Refresh Quote', callback_data: `market_pair_${inputSymbol}-${outputSymbol}` } ],
          [ { text: '✏️ Amount', callback_data: `market_amount_${inputSymbol}-${outputSymbol}` }, { text: '⚙️ Slippage', callback_data: `market_slip_custom_${inputSymbol}-${outputSymbol}` } ],
          [ { text: '0.5%', callback_data: `market_slippage_50_${inputSymbol}-${outputSymbol}` }, { text: '1%', callback_data: `market_slippage_100_${inputSymbol}-${outputSymbol}` }, { text: '2%', callback_data: `market_slippage_200_${inputSymbol}-${outputSymbol}` } ],
          [ { text: `🟢 Buy ${outputSymbol} with ${inputSymbol}`, callback_data: `market_buy_${inputSymbol}-${outputSymbol}` } ],
          [ { text: `🔴 Sell ${outputSymbol} for ${inputSymbol}`, callback_data: `market_sell_${outputSymbol}-${inputSymbol}` } ],
          [ { text: '🔙 Back', callback_data: 'market' } ]
        ]
      }
    };

    await bot.editMessageText(txt, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: keyboard.reply_markup
    });
  } catch (err) {
    console.error('Quote error:', err);
    await bot.editMessageText('❌ Failed to fetch quote. Please try again later.', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: createMarketMenuKeyboard().reply_markup
    });
  }
}

async function handleMarketStartTrade(chatId: number, user: TelegramBot.User, messageId: number, inputSymbol: string, outputSymbol: string, side: 'buy' | 'sell') {
  try {
    if (!userStates[user.id]) userStates[user.id] = { state: '' };
    userStates[user.id].state = 'market_enter_amount';
    userStates[user.id].data = { inputSymbol, outputSymbol, side };
    const prompt = side === 'buy'
      ? `Enter amount of ${inputSymbol} to spend:`
      : `Enter amount of ${inputSymbol} to sell:`;
    await bot.editMessageText(`🛒 ${side === 'buy' ? 'Buy' : 'Sell'} Flow\n\nPair: ${inputSymbol} → ${outputSymbol}\n${prompt}`, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'market' }]] }
    });
  } catch (e) {
    console.error('Start trade error', e);
  }
}

async function handleMarketConfirm(chatId: number, user: TelegramBot.User, messageId: number, amount: number) {
  try {
    const st = userStates[user.id];
    if (!st || !st.data) return;
    const { inputSymbol, outputSymbol, side, quoteAmount, slippageBps } = st.data;
    const { COMMON_MINTS, getNetworkFromEnv, fetchPrice, createSwapTransaction, signAndSendSwapTransaction, resolveMintSymbol } = await import('../utils/tradingUtils');
    const net = getNetworkFromEnv();
    const inSym = resolveMintSymbol(inputSymbol);
    const outSym = resolveMintSymbol(outputSymbol);
    
    if (!inSym || !outSym) {
      await bot.editMessageText(
        `❌ Unsupported trading pair: ${inputSymbol} → ${outputSymbol}\n\n` +
        `Supported tokens: SOL, USDC, USDT`, 
        { chat_id: chatId, message_id: messageId }
      );
      return;
    }
    
    const inMint = COMMON_MINTS[net][inSym];
    const outMint = COMMON_MINTS[net][outSym];
    
    if (!inMint || !outMint) {
      await bot.editMessageText(
        `❌ Missing mint addresses for ${inputSymbol} → ${outputSymbol} on ${net}\n\n` +
        `Please try again or contact support.`, 
        { chat_id: chatId, message_id: messageId }
      );
      return;
    }
    
    const decimals = inputSymbol === 'SOL' ? 9 : 6;
    const humanAmount = typeof quoteAmount === 'number' && quoteAmount > 0 ? quoteAmount : amount;
    const amountAtomic = BigInt(Math.floor(humanAmount * Math.pow(10, decimals))).toString();

    // Build quote with selected slippage (default 1%)
    await bot.editMessageText('🔄 Building route...', { chat_id: chatId, message_id: messageId });
    const bps = typeof slippageBps === 'number' ? slippageBps : 100;
    const quote = await fetchPrice(inMint, outMint, amountAtomic, bps);

    // Get user wallet and private key
    const { getUserWallet, getUserWalletPrivateKey } = await import('../services/walletService');
    const wallet = await getUserWallet(user.id);
    if (!wallet) throw new Error('Wallet not found');
    const pk = await getUserWalletPrivateKey(wallet.address);
    if (!pk) throw new Error('Missing private key');

    // Check balance before creating transaction
    const { getWalletBalance, getAllTokensInfoOfUserWallet } = await import('../utils/blockchainUtils');
    const solBalanceStr = await getWalletBalance(wallet.address);
    const solLamports = Math.floor(parseFloat(solBalanceStr) * 1e9);
    
    // Calculate required lamports based on input token
    let requiredLamports = 5_000_000; // Base fee buffer (0.005 SOL for fees + account creation)
    
    if (inputSymbol === 'SOL') {
      // If swapping SOL, need swap amount + fees
      const swapAmountLamports = BigInt(amountAtomic);
      requiredLamports += Number(swapAmountLamports);
    }
    
    if (solLamports < requiredLamports) {
      const requiredSOL = (requiredLamports / 1e9).toFixed(4);
      const currentSOL = (solLamports / 1e9).toFixed(4);
      await bot.editMessageText(
        `❌ Insufficient SOL balance!\n\n` +
        `Current: ${currentSOL} SOL\n` +
        `Required: ${requiredSOL} SOL\n\n` +
        `Please add more SOL to your wallet.`, 
        { chat_id: chatId, message_id: messageId }
      );
      return;
    }

    // If swapping tokens (not SOL), verify token balance
    if (inputSymbol !== 'SOL') {
      try {
        const tokenBalances = await getAllTokensInfoOfUserWallet(wallet.address);
        const inputToken = tokenBalances.find(token => 
          token.symbol.toLowerCase() === inputSymbol.toLowerCase() ||
          token.token_address === inMint
        );
        
        if (!inputToken) {
          await bot.editMessageText(`❌ You don't have any ${inputSymbol} tokens in your wallet.`, 
            { chat_id: chatId, message_id: messageId });
          return;
        }
        
        const availableBalance = parseFloat(inputToken.balance);
        if (availableBalance < humanAmount) {
          await bot.editMessageText(
            `❌ Insufficient ${inputSymbol} balance!\n\n` +
            `Available: ${availableBalance} ${inputSymbol}\n` +
            `Required: ${humanAmount} ${inputSymbol}`, 
            { chat_id: chatId, message_id: messageId }
          );
          return;
        }
      } catch (error) {
        console.warn('Could not verify token balance, proceeding with swap:', error);
      }
    }

    // Create swap transaction
    const serialized = await createSwapTransaction(quote, wallet.address);
    const sig = await signAndSendSwapTransaction(serialized , pk);
    // Success UI
    const { getSolanaNetworkInfo, getSolscanLink } = await import('../utils/blockchainUtils');
    const { explorerName } = getSolanaNetworkInfo();
    const link = getSolscanLink(sig);
    await bot.editMessageText(`✅ Trade submitted!\n\nTx: \`${sig}\`\n🔗 [View on ${explorerName}](${link})`, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [[{ text: '🔙 Back to Market', callback_data: 'market' }]] },
      disable_web_page_preview: true
    });
    userStates[user.id].state = '';
    delete userStates[user.id].data;
  } catch (e) {
    console.error('Trade error', e);
    
    // Show specific error message if available
    let errorMessage = '❌ Trade failed. Please try again later.';
    if (e instanceof Error) {
      if (e.message.includes('Insufficient SOL')) {
        errorMessage = `❌ ${e.message}`;
      } else if (e.message.includes('Transaction simulation failed')) {
        errorMessage = '❌ Transaction failed - please check your balance and network conditions.';
      } else if (e.message.includes('Price moved too much')) {
        errorMessage = '❌ Price moved too much during swap. Try increasing slippage tolerance.';
      }
    }
    
    await bot.editMessageText(errorMessage, { 
      chat_id: chatId, 
      message_id: messageId, 
      reply_markup: createMarketMenuKeyboard().reply_markup 
    });
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
• 📈 Market & Trading
• 🆕 Create a new wallet
• 📥 Import existing wallet
• ❓ Get help

*Quick Stats:*
• Status: Active
• Network: ${networkInfo}
• Trading: Quotes Enabled

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

// Handle P2P transfer callback
async function handleP2PTransferCallback(chatId: number, user: TelegramBot.User, messageId: number) {
  try {
    // Clear any cached token data to ensure fresh fetch from correct network
    if (userStates[user.id]) {
      delete userStates[user.id].tokens;
      delete userStates[user.id].walletAddress;
      delete userStates[user.id].isCustom;
      delete userStates[user.id].lastTokenPage;
      // Clear any P2P transfer state
      delete userStates[user.id].p2pRecipientId;
      delete userStates[user.id].p2pRecipientUser;
      delete userStates[user.id].p2pRecipientWallet;
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

    // Store tokens in user state for P2P transfer flow
    if (!userStates[user.id]) userStates[user.id] = { state: '' };
    userStates[user.id].transferTokens = walletInfo.tokens;
    userStates[user.id].state = 'p2p_entering_recipient';

    const { networkInfo } = getNetworkInfo();
    
    let p2pMessage = `👥 *P2P Transfer*\n\n`;
    p2pMessage += `📍 *Your Wallet:* \`${walletInfo.address}\`\n`;
    p2pMessage += `🌐 *Network:* ${networkInfo}\n\n`;
    p2pMessage += `*Enter recipient identifier:*\n`;
    p2pMessage += `• Telegram ID (e.g., your Telegram ID)\n`;
    p2pMessage += `• Username (e.g., @johndoe)\n\n`;
    p2pMessage += `_Send the recipient's ID or username as a message._`;

    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔙 Back to Wallet', callback_data: 'wallet' }]
        ]
      }
    };

    await bot.editMessageText(p2pMessage, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    console.error('Error handling P2P transfer callback:', error);
    await bot.editMessageText('❌ Error starting P2P transfer. Please try again.', {
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

// Handle P2P recipient input
async function handleP2PRecipientInput(msg: TelegramBot.Message) {
  const chatId = msg.chat.id;
  const user = msg.from;
  const recipientIdentifier = msg.text?.trim();

  if (!user || !recipientIdentifier) {
    await bot.sendMessage(chatId, '❌ Invalid input. Please try again.');
    return;
  }

  try {
    if (!userStates[user.id] || !userStates[user.id].transferTokens) {
      await bot.sendMessage(chatId, '❌ Session expired. Please start P2P transfer again.', {
        reply_markup: createWalletMenuKeyboard().reply_markup
      });
      return;
    }

    // Import P2P validation function
    const { validateP2PRecipient } = await import('../services/userService');
    
    // Show validation message
    const processingMsg = await bot.sendMessage(chatId, '🔄 *Validating recipient...*', {
      parse_mode: 'Markdown'
    });

    // Validate recipient
    const validation = await validateP2PRecipient(recipientIdentifier);
    
    if (!validation.isValid) {
      await bot.editMessageText(`❌ *Recipient validation failed*\n\n${validation.error}`, {
        chat_id: chatId,
        message_id: processingMsg.message_id,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 Back to P2P Transfer', callback_data: 'p2p_transfer' }]
          ]
        }
      });
      return;
    }

    // Store recipient information
    userStates[user.id].p2pRecipientId = recipientIdentifier;
    userStates[user.id].p2pRecipientUser = validation.user;
    userStates[user.id].p2pRecipientWallet = validation.walletAddress || undefined;
    userStates[user.id].state = 'p2p_selecting_token';

    // Show token selection for P2P transfer
    const tokens = userStates[user.id].transferTokens!;
    let tokenSelectionMessage = `✅ *Recipient Found!*\n\n`;
    tokenSelectionMessage += `👤 *Recipient:* ${validation.user!.firstName || validation.user!.username || 'User'}\n`;
    tokenSelectionMessage += `💳 *Wallet:* \`${validation.walletAddress!}\`\n\n`;
    tokenSelectionMessage += `*Select token to send:*\n\n`;

    tokens.forEach((token, index) => {
      tokenSelectionMessage += `${index + 1}. **${token.symbol}** (${token.name})\n`;
      tokenSelectionMessage += `   💰 Balance: ${token.balance} ${token.symbol}\n\n`;
    });

    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          ...tokens.map((_, index) => [{
            text: `${index + 1}. ${tokens[index].symbol}`,
            callback_data: `p2p_select_token_${index}`
          }]),
          [{ text: '🔙 Back to P2P Transfer', callback_data: 'p2p_transfer' }]
        ]
      }
    };

    await bot.editMessageText(tokenSelectionMessage, {
      chat_id: chatId,
      message_id: processingMsg.message_id,
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    console.error('Error handling P2P recipient input:', error);
    await bot.sendMessage(chatId, '❌ Error validating recipient. Please try again.');
  }
}

// Handle P2P amount input
async function handleP2PAmountInput(msg: TelegramBot.Message) {
  const chatId = msg.chat.id;
  const user = msg.from;
  const amount = msg.text?.trim();

  if (!user || !amount) {
    await bot.sendMessage(chatId, '❌ Invalid amount. Please try again.');
    return;
  }

  try {
    if (!userStates[user.id] || !userStates[user.id].selectedToken || !userStates[user.id].p2pRecipientUser) {
      await bot.sendMessage(chatId, '❌ Session expired. Please start P2P transfer again.', {
        reply_markup: createWalletMenuKeyboard().reply_markup
      });
      return;
    }

    const selectedToken = userStates[user.id].selectedToken;
    const recipientUser = userStates[user.id].p2pRecipientUser;
    const recipientWallet = userStates[user.id].p2pRecipientWallet;
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

    // Show P2P confirmation message
    let confirmationMessage = `👥 *P2P Transfer Confirmation*\n\n`;
    confirmationMessage += `👤 *To:* ${recipientUser.firstName || recipientUser.username || 'User'}\n`;
    confirmationMessage += `💳 *Wallet:* \`${recipientWallet}\`\n`;
    confirmationMessage += `💰 *Token:* ${selectedToken.name} (${selectedToken.symbol})\n`;
    confirmationMessage += `🔢 *Amount:* ${transferAmount} ${selectedToken.symbol}\n`;
    confirmationMessage += `📊 *Your Balance:* ${userBalance} ${selectedToken.symbol}\n\n`;
    confirmationMessage += `*Please confirm the P2P transfer:*`;

    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Confirm Transfer', callback_data: `confirm_p2p_transfer_${transferAmount}` },
            { text: '❌ Cancel', callback_data: 'p2p_transfer' }
          ]
        ]
      }
    };

    await bot.sendMessage(chatId, confirmationMessage, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    console.error('Error handling P2P amount input:', error);
    await bot.sendMessage(chatId, '❌ Error processing amount. Please try again.');
  }
}

// Handle P2P token selection callback
async function handleP2PTokenSelectionCallback(chatId: number, user: TelegramBot.User, messageId: number, tokenIndex: number) {
  try {
    if (!userStates[user.id] || !userStates[user.id].transferTokens || !userStates[user.id].p2pRecipientUser) {
      await bot.editMessageText('❌ Session expired. Please try again.', {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: createWalletMenuKeyboard().reply_markup
      });
      return;
    }

    const selectedToken = userStates[user.id].transferTokens![tokenIndex];
    const recipientUser = userStates[user.id].p2pRecipientUser;
    userStates[user.id].selectedToken = selectedToken;
    userStates[user.id].state = 'p2p_entering_amount';

    let transferMessage = `👥 *P2P Transfer ${selectedToken.symbol}*\n\n`;
    transferMessage += `👤 *To:* ${recipientUser.firstName || recipientUser.username || 'User'}\n`;
    transferMessage += `💰 *Selected Token:* ${selectedToken.name} (${selectedToken.symbol})\n`;
    transferMessage += `📊 *Your Balance:* ${selectedToken.balance} ${selectedToken.symbol}\n\n`;
    transferMessage += `*Please enter the amount to transfer:*\n`;
    transferMessage += `(Send the amount as a number)`;

    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔙 Back to Token Selection', callback_data: 'p2p_transfer' }]
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
    console.error('Error handling P2P token selection:', error);
    await bot.editMessageText('❌ Error selecting token. Please try again.', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: createWalletMenuKeyboard().reply_markup
    });
  }
}

// Handle P2P transfer confirmation and execute transfer
async function handleP2PTransferConfirmation(chatId: number, user: TelegramBot.User, messageId: number, amount: number) {
  try {
    if (!userStates[user.id] || !userStates[user.id].selectedToken || !userStates[user.id].p2pRecipientUser || !userStates[user.id].p2pRecipientWallet) {
      await bot.editMessageText('❌ Session expired. Please start P2P transfer again.', {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: createWalletMenuKeyboard().reply_markup
      });
      return;
    }

    const selectedToken = userStates[user.id].selectedToken;
    const recipientUser = userStates[user.id].p2pRecipientUser;
    const recipientWallet = userStates[user.id].p2pRecipientWallet;
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
    await bot.editMessageText('🔄 *Processing P2P Transfer...*\n\nPlease wait while we process your transaction.', {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown'
    });

    // Determine if this is a native SOL transfer or SPL token transfer
    const isNativeSOL = selectedToken.token_address === 'So11111111111111111111111111111111111111112' || selectedToken.symbol === 'SOL' || selectedToken.name === 'Solana';
    
    let transactionResult;
    
    if (isNativeSOL) {
      // Transfer native SOL
      const { transferSOL } = await import('../utils/blockchainUtils');
      transactionResult = await transferSOL(
        senderWallet.address,
        recipientWallet!,
        amount.toString()
      );
    } else {
      // Transfer SPL token
      const { transferSPLToken } = await import('../utils/blockchainUtils');
      transactionResult = await transferSPLToken(
        senderWallet.address,
        recipientWallet!,
        amount.toString(),
        selectedToken.token_address,
        selectedToken.decimals || 6
      );
    }

    // Show success message with transaction link
    let successMessage = `✅ *P2P Transfer Successful!*\n\n`;
    successMessage += `👤 *To:* ${recipientUser.firstName || recipientUser.username || 'User'}\n`;
    successMessage += `💰 *Token:* ${selectedToken.name} (${selectedToken.symbol})\n`;
    successMessage += `🔢 *Amount:* ${amount} ${selectedToken.symbol}\n`;
    successMessage += `💳 *Recipient Wallet:* \`${recipientWallet}\`\n`;
    successMessage += `🔗 *Transaction Hash:* \`${transactionResult.transactionHash}\`\n\n`;
    
    // Add Solscan link for the transaction based on network
    const { getSolanaNetworkInfo } = await import('../utils/blockchainUtils');
    const { explorerName } = getSolanaNetworkInfo();
    const solscanUrl = transactionResult.solscanLink || `https://solscan.io/tx/${transactionResult.transactionHash}`;
    successMessage += `🔗 [View on ${explorerName}](${solscanUrl})\n\n`;
    successMessage += `*Your P2P transfer has been completed successfully!*`;

    // Clear P2P transfer state
    delete userStates[user.id].transferTokens;
    delete userStates[user.id].selectedToken;
    delete userStates[user.id].p2pRecipientId;
    delete userStates[user.id].p2pRecipientUser;
    delete userStates[user.id].p2pRecipientWallet;
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

    // Send notification to recipient
    await sendP2PTransferNotification(recipientUser.telegramId, {
      senderName: user.first_name || user.username || 'Someone',
      token: selectedToken,
      amount: amount,
      transactionHash: transactionResult.transactionHash,
      solscanUrl: solscanUrl
    });

  } catch (error) {
    console.error('Error handling P2P transfer confirmation:', error);
    await bot.editMessageText('❌ *P2P Transfer Failed*\n\nThere was an error processing your transfer. Please try again.', {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: createWalletMenuKeyboard().reply_markup
    });
  }
}

// Send notification to P2P transfer recipient
async function sendP2PTransferNotification(recipientTelegramId: number, transferInfo: {
  senderName: string;
  token: any;
  amount: number;
  transactionHash: string;
  solscanUrl: string;
}) {
  try {
    const { getSolanaNetworkInfo } = await import('../utils/blockchainUtils');
    const { explorerName } = getSolanaNetworkInfo();
    
    let notificationMessage = `🎉 *You received a P2P transfer!*\n\n`;
    notificationMessage += `👤 *From:* ${transferInfo.senderName}\n`;
    notificationMessage += `💰 *Token:* ${transferInfo.token.name} (${transferInfo.token.symbol})\n`;
    notificationMessage += `🔢 *Amount:* ${transferInfo.amount} ${transferInfo.token.symbol}\n`;
    notificationMessage += `🔗 *Transaction:* \`${transferInfo.transactionHash}\`\n\n`;
    notificationMessage += `🔗 [View on ${explorerName}](${transferInfo.solscanUrl})\n\n`;
    notificationMessage += `*The tokens have been transferred to your wallet!*`;

    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '📋 View Transaction', url: transferInfo.solscanUrl },
            { text: '💰 Check Wallet', callback_data: 'wallet' }
          ]
        ]
      }
    };

    await bot.sendMessage(recipientTelegramId, notificationMessage, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup,
      disable_web_page_preview: true
    });
  } catch (error) {
    console.error('Error sending P2P transfer notification:', error);
    // Don't throw error here, as the transfer itself was successful
  }
}

// Handle NFTs callback
async function handleNFTsCallback(chatId: number, user: TelegramBot.User, messageId: number) {
  try {
    // Clear any existing NFT state
    if (userStates[user.id]) {
      delete userStates[user.id].nfts;
      delete userStates[user.id].selectedNFT;
      delete userStates[user.id].nftFilter;
      delete userStates[user.id].nftPage;
    }

    const walletInfo = await getUserWalletInfo(user.id);
    if (!walletInfo) {
      await bot.editMessageText('❌ *No wallet found*\n\nPlease create or import a wallet first.', {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: createMainMenuKeyboard().reply_markup
      });
      return;
    }

    // Show loading message
    await bot.editMessageText('🔄 *Loading your NFTs...*\n\nThis may take a moment.', {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown'
    });

    try {
      const { getUserNFTsWithFilters } = await import('../services/nftService');
      const nftData = await getUserNFTsWithFilters(user.id);
      
      if (!userStates[user.id]) userStates[user.id] = { state: '' };
      userStates[user.id].nfts = nftData.nfts;

      const { networkInfo } = getNetworkInfo();
      
      let nftMessage = `🖼️ *Your NFT Collection*\n\n`;
      nftMessage += `📍 *Wallet:* \`${walletInfo.address}\`\n`;
      nftMessage += `🌐 *Network:* ${networkInfo}\n\n`;
      nftMessage += `📊 *Collection Summary:*\n`;
      nftMessage += `• Total NFTs: ${nftData.totalCount}\n`;
      nftMessage += `• Event Tickets: ${nftData.ticketCount}\n`;
      nftMessage += `• Collectibles: ${nftData.collectibleCount}\n\n`;

      if (nftData.totalCount === 0) {
        nftMessage += `*You don't have any NFTs yet.*\n\n`;
        nftMessage += `Visit the Events section to purchase tickets or check marketplace for collectibles!`;

        const keyboard = {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '🎫 Browse Events', callback_data: 'events' },
                { text: '🔄 Refresh', callback_data: 'nfts' }
              ],
              [{ text: '🔙 Back to Main Menu', callback_data: 'main_menu' }]
            ]
          }
        };

        await bot.editMessageText(nftMessage, {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown',
          reply_markup: keyboard.reply_markup
        });
        return;
      }

      // Show first few NFTs
      const displayLimit = 5;
      const displayNFTs = nftData.nfts.slice(0, displayLimit);
      
      displayNFTs.forEach((nft, index) => {
        nftMessage += `${index + 1}. **${nft.name}**\n`;
        if (nft.isEventTicket && nft.eventDetails) {
          nftMessage += `   🎫 ${nft.eventDetails.category} Ticket\n`;
          nftMessage += `   📅 ${nft.eventDetails.eventName}\n`;
          nftMessage += `   ${nft.eventDetails.isUsed ? '✅ Used' : '🎯 Valid'}\n`;
        } else {
          nftMessage += `   🖼️ Collectible\n`;
        }
        nftMessage += `\n`;
      });

      if (nftData.totalCount > displayLimit) {
        nftMessage += `... and ${nftData.totalCount - displayLimit} more\n\n`;
      }

      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '📋 View All NFTs', callback_data: 'nft_list_all' },
              { text: '🎫 Tickets Only', callback_data: 'nft_list_tickets' }
            ],
            [
              { text: '🖼️ Collectibles Only', callback_data: 'nft_list_collectibles' },
              { text: '🔄 Refresh', callback_data: 'nfts' }
            ],
            [
              { text: '👥 Transfer NFT', callback_data: 'nft_transfer' },
              { text: '🛒 NFT Marketplace', callback_data: 'nft_marketplace' }
            ],
            [{ text: '🔙 Back', callback_data: 'main_menu' }]
          ]
        }
      };

      await bot.editMessageText(nftMessage, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      });
    } catch (nftError) {
      console.error('Error fetching NFTs:', nftError);
      
      let errorMessage = '❌ *Error loading NFTs*\n\n';
      
      if (nftError instanceof Error && nftError.message.includes('MORALIS_API_KEY')) {
        errorMessage += 'Moralis API is not configured. Please contact the administrator to enable NFT functionality.';
      } else {
        errorMessage += 'There was an issue fetching your NFTs. This could be due to:\n\n';
        errorMessage += '• Network connectivity issues\n';
        errorMessage += '• Moralis API rate limits\n';
        errorMessage += '• Temporary service unavailability\n\n';
        errorMessage += 'Please try again in a moment.';
      }
      
      await bot.editMessageText(errorMessage, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🔄 Try Again', callback_data: 'nfts' },
              { text: '🔙 Back', callback_data: 'main_menu' }
            ]
          ]
        }
      });
    }
  } catch (error) {
    console.error('Error handling NFTs callback:', error);
    await bot.editMessageText('❌ Error accessing NFT collection. Please try again.', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: createMainMenuKeyboard().reply_markup
    });
  }
}

// Handle Create Event callback (Admin only)
async function handleCreateEventCallback(chatId: number, user: TelegramBot.User, messageId: number) {
  try {
    const { isAdmin } = await import('../services/nftService');
    
    if (!isAdmin(user.id)) {
      await bot.editMessageText('❌ Access denied. Only admins can create events.', {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 Back to Events', callback_data: 'events' }]
          ]
        }
      });
      return;
    }

    // Set user state for event creation
    if (!userStates[user.id]) userStates[user.id] = { state: '' };
    userStates[user.id].state = 'creating_event_name';

    await bot.editMessageText(
      '🆕 *Create New Event*\n\n' +
      'Let\'s create a new event with NFT tickets!\n\n' +
      '**Step 1 of 6:** Event Name\n' +
      'Please enter the name of your event:',
      {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '❌ Cancel', callback_data: 'events' }]
          ]
        }
      }
    );
  } catch (error) {
    console.error('Error handling create event callback:', error);
    await bot.editMessageText('❌ Error starting event creation. Please try again.', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔙 Back to Events', callback_data: 'events' }]
        ]
      }
    });
  }
}

// Handle Mint Custom NFT callback (Admin only)
async function handleMintCustomNFTCallback(chatId: number, user: TelegramBot.User, messageId: number) {
  try {
    const { isAdmin } = await import('../services/nftService');
    
    if (!isAdmin(user.id)) {
      await bot.editMessageText('❌ Access denied. Only admins can mint custom NFTs.', {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 Back to Events', callback_data: 'events' }]
          ]
        }
      });
      return;
    }

    // Set user state for custom NFT creation
    if (!userStates[user.id]) userStates[user.id] = { state: '' };
    userStates[user.id].state = 'minting_custom_nft_name';

    await bot.editMessageText(
      '🎨 *Mint Custom NFT*\n\n' +
      'Create a unique collectible NFT!\n\n' +
      '**Step 1 of 5:** NFT Name\n' +
      'Please enter the name for your NFT:',
      {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '❌ Cancel', callback_data: 'events' }]
          ]
        }
      }
    );
  } catch (error) {
    console.error('Error handling mint custom NFT callback:', error);
    await bot.editMessageText('❌ Error starting NFT creation. Please try again.', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔙 Back to Events', callback_data: 'events' }]
        ]
      }
    });
  }
}

// Handle Event List callback
async function handleEventListCallback(chatId: number, user: TelegramBot.User, messageId: number) {
  try {
    const { getAllEvents } = await import('../services/nftService');
    const events = await getAllEvents();

    console.log(`🔍 handleEventListCallback: Retrieved ${events.length} events`);
    events.forEach((event, index) => {
      console.log(`📋 Event ${index + 1}: name="${event.name}", eventId="${event.eventId}"`);
    });

    if (events.length === 0) {
      await bot.editMessageText(
        '📋 *All Events*\n\n' +
        '*No events available at the moment.*\n\n' +
        'Check back later for new events!',
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔙 Back to Events', callback_data: 'events' }]
            ]
          }
        }
      );
      return;
    }

    let eventListMessage = '📋 *All Events*\n\n';
    
    const eventButtons: any[][] = [];
    events.forEach((event, index) => {
      const totalTickets = event.categories.reduce((sum, cat) => sum + cat.maxSupply, 0);
      const availableTickets = event.categories.reduce((sum, cat) => sum + cat.mintAddresses.length, 0);
      
      eventListMessage += `🎫 **${event.name}**\n`;
      eventListMessage += `📅 ${event.date.toDateString()}\n`;
      eventListMessage += `📍 ${event.venue}\n`;
      eventListMessage += `🎫 ${availableTickets}/${totalTickets} tickets available\n\n`;
      
      const callbackData = `view_event_${event.eventId}`;
      console.log(`🔗 Creating button for "${event.name}" with callback_data: "${callbackData}"`);
      
      eventButtons.push([{ text: `🎫 ${event.name}`, callback_data: callbackData }]);
    });

    eventButtons.push([{ text: '🔙 Back to Events', callback_data: 'events' }]);

    await bot.editMessageText(eventListMessage, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: eventButtons
      }
    });
  } catch (error) {
    console.error('Error handling event list callback:', error);
    await bot.editMessageText('❌ Error loading events. Please try again.', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔙 Back to Events', callback_data: 'events' }]
        ]
      }
    });
  }
}

// Handle My Tickets callback
async function handleMyTicketsCallback(chatId: number, user: TelegramBot.User, messageId: number) {
  try {
    const { getUserNFTsWithFilters } = await import('../services/nftService');
    const nftData = await getUserNFTsWithFilters(user.id, { type: 'tickets' });

    if (nftData.ticketCount === 0) {
      await bot.editMessageText(
        '🎫 *My Tickets*\n\n' +
        '*You don\'t have any event tickets yet.*\n\n' +
        'Purchase tickets from available events to see them here!',
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '📋 Browse Events', callback_data: 'event_list' },
                { text: '🔙 Back', callback_data: 'events' }
              ]
            ]
          }
        }
      );
      return;
    }

    let ticketsMessage = `🎫 *My Tickets* (${nftData.ticketCount})\n\n`;
    
    const ticketButtons: any[][] = [];
    nftData.nfts.forEach((ticket, index) => {
      const eventDetails = ticket.eventDetails;
      const isUsed = eventDetails?.isUsed ? '✅ Used' : '🎫 Valid';
      
      ticketsMessage += `🎫 **${ticket.name}**\n`;
      ticketsMessage += `📅 Event: ${eventDetails?.eventName || 'Unknown'}\n`;
      ticketsMessage += `🏷️ Category: ${eventDetails?.category || 'Unknown'}\n`;
      ticketsMessage += `🔒 Status: ${isUsed}\n\n`;
      
      ticketButtons.push([{ 
        text: `🎫 ${ticket.name}`, 
        callback_data: `view_ticket_${ticket.mint}` 
      }]);
    });

    ticketButtons.push([{ text: '🔙 Back to Events', callback_data: 'events' }]);

    await bot.editMessageText(ticketsMessage, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: ticketButtons
      }
    });
  } catch (error) {
    console.error('Error handling my tickets callback:', error);
    await bot.editMessageText('❌ Error loading your tickets. Please try again.', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔙 Back to Events', callback_data: 'events' }]
        ]
      }
    });
  }
}

// Handle Event Stats callback (Admin only)
async function handleEventStatsCallback(chatId: number, user: TelegramBot.User, messageId: number) {
  try {
    const { isAdmin, getAllEvents, getEventStatistics } = await import('../services/nftService');
    
    if (!isAdmin(user.id)) {
      await bot.editMessageText('❌ Access denied. Only admins can view event statistics.', {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 Back to Events', callback_data: 'events' }]
          ]
        }
      });
      return;
    }

    const events = await getAllEvents();
    
    if (events.length === 0) {
      await bot.editMessageText(
        '📊 *Event Statistics*\n\n' +
        '*No events to show statistics for.*\n\n' +
        'Create some events first!',
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔙 Back to Events', callback_data: 'events' }]
            ]
          }
        }
      );
      return;
    }

    let statsMessage = '📊 *Event Statistics*\n\n';
    
    const eventButtons: any[][] = [];
    events.forEach(async (event) => {
      const stats = await getEventStatistics(event.eventId);
      
      statsMessage += `🎫 **${event.name}**\n`;
      statsMessage += `📅 ${event.date.toDateString()}\n`;
      statsMessage += `🎫 Sold: ${stats.soldTickets}/${stats.totalTickets}\n`;
      statsMessage += `💰 Revenue: ${stats.revenue} SOL\n\n`;
      
      eventButtons.push([{ 
        text: `📊 ${event.name}`, 
        callback_data: `event_stats_${event.eventId}` 
      }]);
    });

    eventButtons.push([{ text: '🔙 Back to Events', callback_data: 'events' }]);

    await bot.editMessageText(statsMessage, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: eventButtons
      }
    });
  } catch (error) {
    console.error('Error handling event stats callback:', error);
    await bot.editMessageText('❌ Error loading event statistics. Please try again.', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔙 Back to Events', callback_data: 'events' }]
        ]
      }
    });
  }
}

// Handle Events callback
async function handleEventsCallback(chatId: number, user: TelegramBot.User, messageId: number) {
  try {
    const { getAllEvents, isAdmin } = await import('../services/nftService');
    const events = await getAllEvents();
    const userIsAdmin = isAdmin(user.id);

    let eventsMessage = `🎫 *Event Tickets & NFTs*\n\n`;
    
    if (events.length === 0) {
      eventsMessage += `*No active events available at the moment.*\n\n`;
      if (userIsAdmin) {
        eventsMessage += `As an admin, you can create new events.`;
      } else {
        eventsMessage += `Check back later for new events!`;
      }

      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            ...(userIsAdmin ? [
              [
                { text: '🆕 Create Event', callback_data: 'admin_create_event' },
                { text: '🎨 Mint Custom NFT', callback_data: 'admin_mint_custom' }
              ],
              [
                { text: '🔍 Check Admin NFTs', callback_data: 'admin_check_nfts' },
                { text: '🔍 Debug Event NFTs', callback_data: 'admin_debug_event' }
              ]
            ] : []),
            [{ text: '🔙 Back to Main Menu', callback_data: 'main_menu' }]
          ]
        }
      };

      await bot.editMessageText(eventsMessage, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      });
      return;
    }

    eventsMessage += `*Available Events:*\n\n`;
    
    events.slice(0, 5).forEach((event, index) => {
      const eventDate = new Date(event.date);
      const isUpcoming = eventDate > new Date();
      
      eventsMessage += `${index + 1}. **${event.name}**\n`;
      eventsMessage += `   📅 ${eventDate.toLocaleDateString()}\n`;
      eventsMessage += `   📍 ${event.venue}\n`;
      eventsMessage += `   🎫 ${event.categories.length} categories available\n`;
      eventsMessage += `   ${isUpcoming ? '🔔 Upcoming' : '⏰ Past'}\n\n`;
    });

    if (events.length > 5) {
      eventsMessage += `... and ${events.length - 5} more events\n\n`;
    }

    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '📋 Browse All Events', callback_data: 'event_list' },
            { text: '🎫 My Tickets', callback_data: 'my_tickets' }
          ],
          ...(userIsAdmin ? [
            [
              { text: '🆕 Create Event', callback_data: 'admin_create_event' },
              { text: '🎨 Mint Custom NFT', callback_data: 'admin_mint_custom' }
            ],
            [
              { text: '📊 Event Stats', callback_data: 'admin_event_stats' },
              { text: '🔍 Check Admin NFTs', callback_data: 'admin_check_nfts' }
            ],
            [
              { text: '🔍 Debug Event NFTs', callback_data: 'admin_debug_event' }
            ]
          ] : []),
          [{ text: '🔙 Back to Main Menu', callback_data: 'main_menu' }]
        ]
      }
    };

    await bot.editMessageText(eventsMessage, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    console.error('Error handling events callback:', error);
    await bot.editMessageText('❌ Error loading events. Please try again.', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: createMainMenuKeyboard().reply_markup
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

        // Determine if this is a native SOL transfer or SPL token transfer
    const isNativeSOL = selectedToken.token_address === 'So11111111111111111111111111111111111111112' || selectedToken.symbol === 'SOL' || selectedToken.name === 'Solana';
    
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
      // Transfer SPL token
      const { transferSPLToken } = await import('../utils/blockchainUtils');
      transactionResult = await transferSPLToken(
        senderWallet.address,
        recipientAddress!,
        amount.toString(),
        selectedToken.token_address,
        selectedToken.decimals || 6
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

  // Handle /test_pinata command (for debugging)
  bot.onText(/\/test_pinata/, async (msg) => {
    const chatId = msg.chat.id;
    const user = msg.from;
    
    if (!user) {
      bot.sendMessage(chatId, '❌ User information not available.');
      return;
    }

    const { isAdmin } = await import('../services/nftService');
    if (!isAdmin(user.id)) {
      bot.sendMessage(chatId, '❌ This command is only available to administrators.');
      return;
    }

    try {
      bot.sendMessage(chatId, '🔍 Testing Pinata API configuration...');
      
      const { testPinataSetup } = await import('../utils/nftUtils');
      const result = await testPinataSetup();
      
      if (result.success) {
        bot.sendMessage(chatId, `✅ ${result.message}`, { parse_mode: 'Markdown' });
      } else {
        bot.sendMessage(chatId, `❌ ${result.message}`, { parse_mode: 'Markdown' });
      }
    } catch (error) {
      console.error('Error testing Pinata:', error);
      bot.sendMessage(chatId, `❌ Error testing Pinata: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

  // Admin command to clean up invalid event IDs (one-time use)
  bot.onText(/\/cleanup_events/, async (msg) => {
    const chatId = msg.chat.id;
    const user = msg.from;
    
    if (!user) {
      bot.sendMessage(chatId, '❌ User information not available.');
      return;
    }

    const { isAdmin, cleanupInvalidEventIds } = await import('../services/nftService');
    
    if (!isAdmin(user.id)) {
      bot.sendMessage(chatId, '❌ Access denied. Only admins can run this command.');
      return;
    }
    
    bot.sendMessage(chatId, '🧹 Starting cleanup of invalid event IDs... This may take a moment.');
    
    try {
      const result = await cleanupInvalidEventIds();
      
      if (result.success) {
        bot.sendMessage(chatId, 
          `✅ *Event Cleanup Completed!*\n\n` +
          `🔧 **Fixed:** ${result.fixed} events\n` +
          `📊 **Total:** ${result.total} events\n\n` +
          `🎯 All events now have valid IDs and should be accessible for ticket purchases!`,
          { parse_mode: 'Markdown' }
        );
      } else {
        bot.sendMessage(chatId, 
          `❌ *Failed to cleanup events*\n\n` +
          `Error: ${result.error || 'Unknown error'}\n\n` +
          `Please check the logs and try again.`,
          { parse_mode: 'Markdown' }
        );
      }
    } catch (error) {
      console.error('Error running event cleanup:', error);
      bot.sendMessage(chatId, '❌ Error running event cleanup. Please try again.');
    }
  });

  // Handle callback queries (button clicks)
  bot.on('callback_query', handleCallbackQuery);

  // Handle photo uploads
  bot.on('photo', async (msg) => {
    const user = msg.from;
    if (!user) return;

    const userState = userStates[user.id];
    if (userState && userState.state === 'creating_event_image') {
      await handleEventPhotoUpload(msg);
    } else {
      bot.sendMessage(msg.chat.id, '📸 Please use the event creation flow to upload images for NFTs.');
    }
  });

  // Handle all other messages
  bot.on('message', async (msg) => {
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
        } else if (userState.state === 'p2p_entering_recipient') {
          handleP2PRecipientInput(msg);
          return;
        } else if (userState.state === 'p2p_entering_amount') {
          handleP2PAmountInput(msg);
          return;
        } else if (userState.state === 'creating_event_name') {
          handleEventNameInput(msg);
          return;
        } else if (userState.state === 'creating_event_description') {
          handleEventDescriptionInput(msg);
          return;
        } else if (userState.state === 'creating_event_date') {
          handleEventDateInput(msg);
          return;
        } else if (userState.state === 'creating_event_venue') {
          handleEventVenueInput(msg);
          return;
        } else if (userState.state === 'creating_event_image') {
          handleEventImageInput(msg);
          return;
        } else if (userState.state === 'creating_event_categories') {
          handleEventCategoriesInput(msg);
          return;
        } else if (userState.state === 'minting_custom_nft_name') {
          handleCustomNFTNameInput(msg);
          return;
        } else if (userState.state === 'minting_custom_nft_description') {
          handleCustomNFTDescriptionInput(msg);
          return;
        } else if (userState.state === 'minting_custom_nft_symbol') {
          handleCustomNFTSymbolInput(msg);
          return;
        } else if (userState.state === 'minting_custom_nft_image') {
          handleCustomNFTImageInput(msg);
          return;
        } else if (userState.state === 'market_enter_amount') {
          const amount = parseFloat(msg.text!.trim());
          if (isNaN(amount) || amount <= 0) {
            bot.sendMessage(msg.chat.id, '❌ Invalid amount. Please enter a positive number.');
            return;
          }
          // Use last edited message? Fall back to sending new confirmation
          const confirmText = `Please confirm trade amount: ${amount}`;
          bot.sendMessage(msg.chat.id, confirmText, {
            reply_markup: {
              inline_keyboard: [
                [ { text: '✅ Confirm', callback_data: `market_confirm_${amount}` } ],
                [ { text: '❌ Cancel', callback_data: 'market' } ]
              ]
            }
          });
          return;
        } else if (userState.state === 'market_enter_quote_amount') {
          const amount = parseFloat(msg.text!.trim());
          if (isNaN(amount) || amount <= 0) {
            bot.sendMessage(msg.chat.id, '❌ Invalid amount. Please enter a positive number.');
            return;
          }
          userStates[user.id].data.quoteAmount = amount;
          const pair = userStates[user.id].data.pairForAmount as string;
          userStates[user.id].state = '';
          await bot.sendMessage(msg.chat.id, `✅ Amount set to ${amount}. Refreshing quote...`);
          const [inp, outp] = pair.split('-');
          const { message_id } = await bot.sendMessage(msg.chat.id, '🔄 Updating quote...');
          await handleMarketQuote(msg.chat.id, user, message_id, inp, outp);
          return;
        } else if (userState.state === 'market_enter_custom_slippage') {
          const perc = parseFloat(msg.text!.trim());
          if (isNaN(perc) || perc <= 0 || perc > 50) {
            bot.sendMessage(msg.chat.id, '❌ Invalid slippage. Enter a percent between 0 and 50.');
            return;
          }
          const bps = Math.round(perc * 100);
          userStates[user.id].data.slippageBps = bps;
          const pair = userStates[user.id].data.pairForSlippage as string;
          userStates[user.id].state = '';
          await bot.sendMessage(msg.chat.id, `✅ Slippage set to ${perc}%. Refreshing quote...`);
          const [inp, outp] = pair.split('-');
          const { message_id } = await bot.sendMessage(msg.chat.id, '🔄 Updating quote...');
          await handleMarketQuote(msg.chat.id, user, message_id, inp, outp);
          return;
        }
      }
      handleUnknownCommand(msg);
    }
  });

  // Handle bot errors - NEVER let bot stop
  bot.on('error', (error) => {
    console.error('❌ Bot error (recovered):', error);
    // Don't exit process, just log error and continue
  });

  // Handle polling errors - NEVER let bot stop
  bot.on('polling_error', (error) => {
    console.error('❌ Polling error (recovered):', error);
    // Don't exit process, just log error and continue
    // Bot will automatically retry polling
  });

  // Handle uncaught exceptions - NEVER let bot stop
  process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception (recovered):', error);
    // Don't exit process, just log error and continue
  });

  // Handle unhandled promise rejections - NEVER let bot stop
  process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection (recovered):', reason);
    console.error('Promise:', promise);
    // Don't exit process, just log error and continue
  });
}

// Event Creation Input Handlers
async function handleEventNameInput(msg: TelegramBot.Message) {
  const user = msg.from!;
  const eventName = msg.text!.trim();
  
  if (eventName.length < 3) {
    bot.sendMessage(msg.chat.id, '❌ Event name must be at least 3 characters long. Please try again:');
    return;
  }

  if (!userStates[user.id].data) userStates[user.id].data = {};
  if (!userStates[user.id].data.eventData) userStates[user.id].data.eventData = {};
  userStates[user.id].data.eventData.name = eventName;
  userStates[user.id].state = 'creating_event_description';

  bot.sendMessage(msg.chat.id, 
    `✅ Event name set: "${eventName}"\n\n` +
    '**Step 2 of 6:** Event Description\n' +
    'Please enter a description for your event:'
  );
}

async function handleEventDescriptionInput(msg: TelegramBot.Message) {
  const user = msg.from!;
  const description = msg.text!.trim();
  
  userStates[user.id].data.eventData.description = description;
  userStates[user.id].state = 'creating_event_date';

  bot.sendMessage(msg.chat.id, 
    `✅ Description set\n\n` +
    '**Step 3 of 6:** Event Date\n' +
    'Please enter the event date and time (e.g., "2024-12-25 19:00" or "December 25, 2024 7:00 PM"):'
  );
}

async function handleEventDateInput(msg: TelegramBot.Message) {
  const user = msg.from!;
  const dateInput = msg.text!.trim();
  
  try {
    const eventDate = new Date(dateInput);
    if (isNaN(eventDate.getTime()) || eventDate < new Date()) {
      bot.sendMessage(msg.chat.id, '❌ Invalid date or date is in the past. Please enter a future date (e.g., "2024-12-25 19:00"):');
      return;
    }

    userStates[user.id].data.eventData.date = eventDate;
    userStates[user.id].state = 'creating_event_venue';

    bot.sendMessage(msg.chat.id, 
      `✅ Event date set: ${eventDate.toLocaleString()}\n\n` +
      '**Step 4 of 6:** Venue\n' +
      'Please enter the event venue/location:'
    );
  } catch (error) {
    bot.sendMessage(msg.chat.id, '❌ Invalid date format. Please try again (e.g., "2024-12-25 19:00"):');
  }
}

async function handleEventVenueInput(msg: TelegramBot.Message) {
  const user = msg.from!;
  const venue = msg.text!.trim();
  
  userStates[user.id].data.eventData.venue = venue;
  userStates[user.id].state = 'creating_event_image';

  bot.sendMessage(msg.chat.id, 
    `✅ Venue set: "${venue}"\n\n` +
    '**Step 5 of 6:** Event Image\n' +
    '📸 Upload an image file directly, enter an image URL, or type "skip" to use a default image:'
  );
}

async function handleEventImageInput(msg: TelegramBot.Message) {
  const user = msg.from!;
  
  // Check if this is a text message (URL or skip)
  if (msg.text) {
    const imageInput = msg.text.trim();
    let imageUrl = 'https://via.placeholder.com/400x300/4CAF50/white?text=Event';
    
    if (imageInput.toLowerCase() !== 'skip') {
      try {
        new URL(imageInput); // Validate URL
        imageUrl = imageInput;
      } catch {
        bot.sendMessage(msg.chat.id, '❌ Invalid URL format. Please enter a valid image URL, upload an image, or type "skip":');
        return;
      }
    }

    userStates[user.id].data.eventData.imageUrl = imageUrl;
    userStates[user.id].state = 'creating_event_categories';
    proceedToCategories(msg.chat.id);
  } else {
    bot.sendMessage(msg.chat.id, '❌ Please upload an image, enter a valid image URL, or type "skip":');
  }
}

// Handle uploaded photos for event images
async function handleEventPhotoUpload(msg: TelegramBot.Message) {
  const user = msg.from!;
  
  if (!msg.photo || msg.photo.length === 0) {
    bot.sendMessage(msg.chat.id, '❌ No photo found. Please try uploading again or enter an image URL:');
    return;
  }

  try {
    bot.sendMessage(msg.chat.id, '🔄 Uploading image to IPFS... This may take a moment.');

    // Get the highest resolution photo
    const photo = msg.photo[msg.photo.length - 1];
    console.log('📸 Photo info:', {
      file_id: photo.file_id,
      file_unique_id: photo.file_unique_id,
      width: photo.width,
      height: photo.height,
      file_size: photo.file_size
    });
    
    // Get file info from Telegram
    const fileInfo = await bot.getFile(photo.file_id);
    console.log('📁 File info from Telegram:', fileInfo);
    
    if (!fileInfo.file_path) {
      throw new Error('Could not get file path from Telegram');
    }

    // Download the file
    const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${fileInfo.file_path}`;
    console.log('⬇️ Downloading from:', fileUrl);
    
    const response = await fetch(fileUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
    }

    const imageBuffer = Buffer.from(await response.arrayBuffer());
    console.log('📏 Downloaded image size:', imageBuffer.length, 'bytes');
    
    // Determine file extension from the file path
    const fileExtension = fileInfo.file_path.split('.').pop() || 'jpg';
    const fileName = `event_${Date.now()}_${user.id}.${fileExtension}`;

    // Validate image buffer
    if (imageBuffer.length === 0) {
      throw new Error('Downloaded image is empty');
    }

    // Upload to Pinata IPFS
    const { uploadImageToPinata } = await import('../utils/nftUtils');
    
    try {
      const imageUrl = await uploadImageToPinata(imageBuffer, fileName);
      
      // Store the IPFS URL
      userStates[user.id].data.eventData.imageUrl = imageUrl;
      userStates[user.id].state = 'creating_event_categories';
      
      bot.sendMessage(msg.chat.id, 
        `✅ Image uploaded successfully!\n` +
        `📁 File: ${fileName}\n` +
        `📏 Size: ${(imageBuffer.length / 1024).toFixed(1)} KB\n` +
        `🔗 IPFS URL: ${imageUrl}\n\n` +
        'Proceeding to ticket categories...'
      );

      proceedToCategories(msg.chat.id);
    } catch (uploadError) {
      console.error('Pinata upload failed, using fallback:', uploadError);
      
      // Fallback: Use a default image URL for now
      const fallbackImageUrl = 'https://via.placeholder.com/400x300/4CAF50/white?text=Event+Image';
      userStates[user.id].data.eventData.imageUrl = fallbackImageUrl;
      userStates[user.id].state = 'creating_event_categories';
      
      bot.sendMessage(msg.chat.id, 
        `⚠️ Image upload to IPFS failed, but we'll continue with a default image.\n` +
        `📁 File: ${fileName} (${(imageBuffer.length / 1024).toFixed(1)} KB)\n` +
        `❌ Upload Error: ${uploadError instanceof Error ? uploadError.message : 'Unknown error'}\n\n` +
        `💡 **Troubleshooting steps:**\n` +
        `1. Type /test_pinata to check Pinata API connection\n` +
        `2. Verify PINATA_API_KEY and PINATA_SECRET_API_KEY in .env file\n` +
        `3. Try uploading a smaller image (< 1MB)\n\n` +
        'Proceeding with default image for now...'
      );

      proceedToCategories(msg.chat.id);
    }
  } catch (error) {
    console.error('Error uploading photo:', error);
    bot.sendMessage(msg.chat.id, 
      `❌ Failed to upload image: ${error instanceof Error ? error.message : 'Unknown error'}\n\n` +
      'Please try again, enter an image URL, or type "skip":'
    );
  }
}

function proceedToCategories(chatId: number) {
  bot.sendMessage(chatId, 
    `**Step 6 of 6:** Ticket Categories\n` +
    'Type "default" for standard categories:\n' +
    '• VIP: 10 tickets @ 0.1 SOL each\n' +
    '• Standard: 50 tickets @ 0.5 SOL each\n' +
    '• Group: 20 tickets @ 0.3 SOL each\n\n' +
    'Or provide custom JSON format:\n' +
    '```\n' +
    '[\n' +
    '  {"category": "VIP", "price": 0.1, "maxSupply": 10, "baseImageUrl": "auto"},\n' +
    '  {"category": "Standard", "price": 0.5, "maxSupply": 50, "baseImageUrl": "auto"}\n' +
    ']\n' +
    '```',
    { parse_mode: 'Markdown' }
  );
}

async function handleEventCategoriesInput(msg: TelegramBot.Message) {
  const user = msg.from!;
  const categoriesInput = msg.text!.trim();
  
  let categories;
  
  if (categoriesInput.toLowerCase() === 'default') {
    categories = [
      { category: 'VIP', price: 0.1, maxSupply: 10, baseImageUrl: userStates[user.id].data.eventData.imageUrl },
      { category: 'Standard', price: 0.05, maxSupply: 50, baseImageUrl: userStates[user.id].data.eventData.imageUrl },
      { category: 'Group', price: 0.03, maxSupply: 20, baseImageUrl: userStates[user.id].data.eventData.imageUrl }
    ];
  } else {
    try {
      categories = JSON.parse(categoriesInput);
      
      // Validate categories
      if (!Array.isArray(categories) || categories.length === 0) {
        throw new Error('Categories must be a non-empty array');
      }
      
      for (const cat of categories) {
        if (!cat.category || !cat.price || !cat.maxSupply) {
          throw new Error('Each category must have category, price, and maxSupply');
        }
        if (!['VIP', 'Standard', 'Group'].includes(cat.category)) {
          throw new Error('Category must be VIP, Standard, or Group');
        }
      }
    } catch (error) {
      bot.sendMessage(msg.chat.id, `❌ Invalid categories format: ${error}. Please try again or type "default":`);
      return;
    }
  }

  // **THIS IS WHERE NFT MINTING HAPPENS!**
  userStates[user.id].state = '';
  
  bot.sendMessage(msg.chat.id, '🔄 Creating event and minting NFT tickets... This may take a moment.');

  try {
    const { createEvent } = await import('../services/nftService');
    
    const result = await createEvent(user.id, {
      name: userStates[user.id].data.eventData.name,
      description: userStates[user.id].data.eventData.description,
      date: userStates[user.id].data.eventData.date,
      venue: userStates[user.id].data.eventData.venue,
      imageUrl: userStates[user.id].data.eventData.imageUrl,
      categories
    });

    if (result.success) {
      const totalTickets = categories.reduce((sum, cat) => sum + cat.maxSupply, 0);
      const totalCost = (totalTickets * 0.02).toFixed(3);
      
      bot.sendMessage(msg.chat.id, 
        `🎉 *Event Created Successfully!*\n\n` +
        `📅 **${userStates[user.id].data.eventData.name}**\n` +
        `📍 ${userStates[user.id].data.eventData.venue}\n` +
        `🗓️ ${userStates[user.id].data.eventData.date.toLocaleString()}\n\n` +
        `🎫 **${totalTickets} NFT tickets minted:**\n` +
        categories.map(cat => `• ${cat.maxSupply}x ${cat.category} (${cat.price} SOL each)`).join('\n') + '\n\n' +
        `💰 **Minting Cost:** ~${totalCost} SOL\n` +
        `🔗 **Event ID:** \`${result.eventId}\`\n\n` +
        `✅ All tickets are now available for purchase!`,
        { 
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '🎫 View Events', callback_data: 'events' },
                { text: '📊 Event Stats', callback_data: 'admin_event_stats' }
              ],
              [
                { text: '🆕 Create Another Event', callback_data: 'admin_create_event' }
              ],
              [
                { text: '🏠 Main Menu', callback_data: 'main_menu' }
              ]
            ]
          }
        }
      );
    } else {
      bot.sendMessage(msg.chat.id, `❌ Failed to create event: ${result.error}`, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🔄 Try Again', callback_data: 'admin_create_event' },
              { text: '🎫 Back to Events', callback_data: 'events' }
            ],
            [
              { text: '🏠 Main Menu', callback_data: 'main_menu' }
            ]
          ]
        }
      });
    }
  } catch (error) {
    console.error('Error creating event:', error);
    bot.sendMessage(msg.chat.id, '❌ Error creating event. Please try again later.', {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🔄 Try Again', callback_data: 'admin_create_event' },
            { text: '🎫 Back to Events', callback_data: 'events' }
          ],
          [
            { text: '🏠 Main Menu', callback_data: 'main_menu' }
          ]
        ]
      }
    });
  }

  // Clean up user state
  if (userStates[user.id].data) {
    delete userStates[user.id].data.eventData;
  }
}

// Custom NFT Input Handlers
async function handleCustomNFTNameInput(msg: TelegramBot.Message) {
  const user = msg.from!;
  const nftName = msg.text!.trim();
  
  if (nftName.length < 2) {
    bot.sendMessage(msg.chat.id, '❌ NFT name must be at least 2 characters long. Please try again:');
    return;
  }

  if (!userStates[user.id].data) userStates[user.id].data = {};
  if (!userStates[user.id].data.nftData) userStates[user.id].data.nftData = {};
  userStates[user.id].data.nftData.name = nftName;
  userStates[user.id].state = 'minting_custom_nft_description';

  bot.sendMessage(msg.chat.id, 
    `✅ NFT name set: "${nftName}"\n\n` +
    '**Step 2 of 5:** NFT Description\n' +
    'Please enter a description for your NFT:'
  );
}

async function handleCustomNFTDescriptionInput(msg: TelegramBot.Message) {
  const user = msg.from!;
  const description = msg.text!.trim();
  
  userStates[user.id].data.nftData.description = description;
  userStates[user.id].state = 'minting_custom_nft_symbol';

  bot.sendMessage(msg.chat.id, 
    `✅ Description set\n\n` +
    '**Step 3 of 5:** NFT Symbol\n' +
    'Please enter a short symbol for your NFT (2-10 characters, e.g., "ART", "BADGE"):'
  );
}

async function handleCustomNFTSymbolInput(msg: TelegramBot.Message) {
  const user = msg.from!;
  const symbol = msg.text!.trim().toUpperCase();
  
  if (symbol.length < 2 || symbol.length > 10) {
    bot.sendMessage(msg.chat.id, '❌ Symbol must be 2-10 characters long. Please try again:');
    return;
  }

  userStates[user.id].data.nftData.symbol = symbol;
  userStates[user.id].state = 'minting_custom_nft_image';

  bot.sendMessage(msg.chat.id, 
    `✅ Symbol set: "${symbol}"\n\n` +
    '**Step 4 of 5:** NFT Image\n' +
    'Please enter the image URL for your NFT (or type "skip" for a default image):'
  );
}

async function handleCustomNFTImageInput(msg: TelegramBot.Message) {
  const user = msg.from!;
  const imageInput = msg.text!.trim();
  
  let imageUrl = 'https://via.placeholder.com/400x400/9C27B0/white?text=Custom+NFT';
  
  if (imageInput.toLowerCase() !== 'skip') {
    try {
      new URL(imageInput); // Validate URL
      imageUrl = imageInput;
    } catch {
      bot.sendMessage(msg.chat.id, '❌ Invalid URL format. Please enter a valid image URL or type "skip":');
      return;
    }
  }

  // **THIS IS WHERE CUSTOM NFT MINTING HAPPENS!**
  userStates[user.id].state = '';
  
  bot.sendMessage(msg.chat.id, '🔄 Minting your custom NFT... This may take a moment.');

  try {
    const { mintCustomNFT } = await import('../services/nftService');
    
    const nftMetadata = {
      name: userStates[user.id].data.nftData.name,
      description: userStates[user.id].data.nftData.description,
      symbol: userStates[user.id].data.nftData.symbol,
      image: imageUrl,
      attributes: [
        { trait_type: 'Type', value: 'Custom Collectible' },
        { trait_type: 'Creator', value: 'Admin' },
        { trait_type: 'Rarity', value: 'Unique' }
      ]
    };

    const result = await mintCustomNFT(user.id, nftMetadata);

    if (result.success) {
      bot.sendMessage(msg.chat.id, 
        `🎨 *Custom NFT Minted Successfully!*\n\n` +
        `🏷️ **Name:** ${nftMetadata.name}\n` +
        `🔤 **Symbol:** ${nftMetadata.symbol}\n` +
        `📝 **Description:** ${nftMetadata.description}\n\n` +
        `🔗 **Mint Address:** \`${result.mintAddress}\`\n\n` +
        `✅ Your NFT has been created and is now in your collection!`,
        { 
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '🖼️ View My NFTs', callback_data: 'nfts' },
                { text: '🎫 Back to Events', callback_data: 'events' }
              ],
              [
                { text: '🏠 Main Menu', callback_data: 'main_menu' }
              ]
            ]
          }
        }
      );
    } else {
      bot.sendMessage(msg.chat.id, `❌ Failed to mint NFT: ${result.error}`, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🔄 Try Again', callback_data: 'admin_mint_custom' },
              { text: '🎫 Back to Events', callback_data: 'events' }
            ],
            [
              { text: '🏠 Main Menu', callback_data: 'main_menu' }
            ]
          ]
        }
      });
    }
  } catch (error) {
    console.error('Error minting custom NFT:', error);
    bot.sendMessage(msg.chat.id, '❌ Error minting NFT. Please try again later.', {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🔄 Try Again', callback_data: 'admin_mint_custom' },
            { text: '🎫 Back to Events', callback_data: 'events' }
          ],
          [
            { text: '🏠 Main Menu', callback_data: 'main_menu' }
          ]
        ]
      }
    });
  }

  // Clean up user state
  if (userStates[user.id].data) {
    delete userStates[user.id].data.nftData;
  }
}

// Handle View Event callback
async function handleViewEventCallback(chatId: number, user: TelegramBot.User, messageId: number, eventId: string) {
  try {
    console.log(`🔍 handleViewEventCallback: Processing eventId="${eventId}"`);
    
    const { getEvent } = await import('../services/nftService');
    const event = await getEvent(eventId);

    if (!event) {
      console.log(`❌ Event not found for eventId: "${eventId}"`);
      await bot.editMessageText('❌ Event not found.', {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 Back to Events', callback_data: 'event_list' }]
          ]
        }
      });
      return;
    }

    console.log(`✅ Event found: "${event.name}" with eventId: "${event.eventId}"`);

    let eventMessage = `🎫 **${event?.name}**\n\n`;
    eventMessage += `📝 ${event?.description}\n\n`;
    eventMessage += `📅 **Date:** ${event?.date.toLocaleString()}\n`;
    eventMessage += `📍 **Venue:** ${event?.venue}\n\n`;
    eventMessage += `🎫 **Available Tickets:**\n`;

    const ticketButtons: any[][] = [];
    
    event?.categories.forEach(cat => {
      const available = cat.mintAddresses.length;
      const total = cat.maxSupply;
      const status = available > 0 ? '🟢 Available' : '🔴 Sold Out';
      
      eventMessage += `• **${cat.category}**: ${cat.price} SOL - ${available}/${total} available ${status}\n`;
      
      if (available > 0) {
        const callbackData = `purchase_ticket_${eventId}_${cat.category}`;
        console.log(`🔗 Creating buy button for "${event.name}" - ${cat.category} with callback_data: "${callbackData}"`);
        
        ticketButtons.push([{ 
          text: `🎫 Buy ${cat.category} (${cat.price} SOL)`, 
          callback_data: callbackData 
        }]);
      }
    });

    ticketButtons.push([{ text: '🔙 Back to Events', callback_data: 'event_list' }]);

    await bot.editMessageText(eventMessage, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: ticketButtons
      }
    });
  } catch (error) {
    console.error('Error handling view event callback:', error);
    await bot.editMessageText('❌ Error loading event details. Please try again.', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔙 Back to Events', callback_data: 'event_list' }]
        ]
      }
    });
  }
}

// Handle Purchase Ticket callback
async function handlePurchaseTicketCallback(chatId: number, user: TelegramBot.User, messageId: number, eventId: string, category: 'VIP' | 'Standard' | 'Group') {
  try {
    console.log(`🔍 Attempting to purchase ticket for event: ${eventId}, category: ${category}`);
    
    const { purchaseTicket, getEvent } = await import('../services/nftService');
    const event = await getEvent(eventId);

    if (!event) {
      console.log(`❌ Event not found in database for eventId: ${eventId}`);
      console.log(`🔍 Available events in database:`);
      try {
        const { getAllEvents } = await import('../services/nftService');
        const allEvents = await getAllEvents();
        console.log(`📋 Total events: ${allEvents.length}`);
        allEvents.forEach(e => console.log(`  - ${e.eventId}: ${e.name}`));
      } catch (debugError) {
        console.log(`❌ Could not fetch all events for debugging: ${debugError}`);
      }
      
      await bot.editMessageText(`❌ Event not found.\n\nEvent ID: \`${eventId}\`\n\nThis might happen if:\n• The event was deleted\n• The event ID is incorrect\n• There's a database issue\n\nPlease try viewing the events list again.`, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 Back to Events', callback_data: 'event_list' }]
          ]
        }
      });
      return;
    }

    const categoryData = event?.categories.find(cat => cat.category === category);
    if (!categoryData) {
      await bot.editMessageText('❌ Ticket category not found.', {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 Back to Event', callback_data: `view_event_${eventId}` }]
          ]
        }
      });
      return;
    }

    if (categoryData.mintAddresses.length === 0) {
      await bot.editMessageText('❌ No tickets available in this category.', {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 Back to Event', callback_data: `view_event_${eventId}` }]
          ]
        }
      });
      return;
    }

    // Show processing message
    await bot.editMessageText('🔄 *Processing ticket purchase...*\n\nPlease wait while we mint and transfer your ticket NFT.', {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown'
    });

    // Purchase the ticket
    const result = await purchaseTicket(user.id, eventId, category);

    if (result.success) {
      await bot.editMessageText(
        `🎉 *Ticket Purchased Successfully!*\n\n` +
        `🎫 **Event:** ${event?.name}\n` +
        `🏷️ **Category:** ${category}\n` +
        `💰 **Price:** ${categoryData.price} SOL\n` +
        `🔗 **Ticket NFT:** \`${result.mintAddress}\`\n\n` +
        `✅ Your ticket is now in your wallet and ready for use at the event!`,
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '🎫 My Tickets', callback_data: 'my_tickets' },
                { text: '🔙 Back to Event', callback_data: `view_event_${eventId}` }
              ]
            ]
          }
        }
      );
    } else {
      await bot.editMessageText(
        `❌ *Ticket Purchase Failed*\n\n` +
        `Error: ${result.error}\n\n` +
        `Please try again or contact support if the issue persists.`,
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '🔄 Try Again', callback_data: `purchase_ticket_${eventId}_${category}` },
                { text: '🔙 Back to Event', callback_data: `view_event_${eventId}` }
              ]
            ]
          }
        }
      );
    }
  } catch (error) {
    console.error('Error handling purchase ticket callback:', error);
    await bot.editMessageText('❌ Error processing ticket purchase. Please try again.', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔙 Back to Event', callback_data: `view_event_${eventId}` }]
        ]
      }
    });
  }
}

// Handle View Ticket callback
async function handleViewTicketCallback(chatId: number, user: TelegramBot.User, messageId: number, mintAddress: string) {
  try {
    const { getNFTMetadata } = await import('../utils/nftUtils');
    const { isAdmin } = await import('../services/nftService');
    
    const ticket = await getNFTMetadata(mintAddress);

    if (!ticket) {
      await bot.editMessageText('❌ Ticket not found.', {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 My Tickets', callback_data: 'my_tickets' }]
          ]
        }
      });
      return;
    }

    const eventDetails = ticket.eventDetails;
    const isUsed = eventDetails?.isUsed ? '✅ Used' : '🎫 Valid';
    const userIsAdmin = isAdmin(user.id);

    let ticketMessage = `🎫 **${ticket.name}**\n\n`;
    ticketMessage += `📅 **Event:** ${eventDetails?.eventName || 'Unknown'}\n`;
    ticketMessage += `🏷️ **Category:** ${eventDetails?.category || 'Unknown'}\n`;
    ticketMessage += `📍 **Venue:** ${ticket.attributes?.find(attr => attr.trait_type === 'Venue')?.value || 'Unknown'}\n`;
    ticketMessage += `💺 **Seat:** ${ticket.attributes?.find(attr => attr.trait_type === 'Seat')?.value || 'Unknown'}\n`;
    ticketMessage += `🔒 **Status:** ${isUsed}\n\n`;
    ticketMessage += `🔗 **NFT Address:** \`${mintAddress}\`\n`;

    if (ticket.image) {
      ticketMessage += `\n🖼️ [View Ticket Image](${ticket.image})`;
    }

    const buttons: any[][] = [
      [{ text: '🔄 Transfer Ticket', callback_data: `transfer_ticket_${mintAddress}` }]
    ];

    // Add admin validation button if user is admin and ticket is valid
    if (userIsAdmin && !eventDetails?.isUsed) {
      buttons.push([{ text: '✅ Validate Entry', callback_data: `validate_ticket_${mintAddress}` }]);
    }

    buttons.push([{ text: '🔙 My Tickets', callback_data: 'my_tickets' }]);

    await bot.editMessageText(ticketMessage, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: buttons
      },
      disable_web_page_preview: true
    });
  } catch (error) {
    console.error('Error handling view ticket callback:', error);
    await bot.editMessageText('❌ Error loading ticket details. Please try again.', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔙 My Tickets', callback_data: 'my_tickets' }]
        ]
      }
    });
  }
}

// Handle Validate Ticket callback (Admin only)
async function handleValidateTicketCallback(chatId: number, user: TelegramBot.User, messageId: number, mintAddress: string) {
  try {
    const { isAdmin, useTicketForEntry } = await import('../services/nftService');
    const { getNFTMetadata } = await import('../utils/nftUtils');

    if (!isAdmin(user.id)) {
      await bot.editMessageText('❌ Access denied. Only admins can validate tickets.', {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 Back', callback_data: `view_ticket_${mintAddress}` }]
          ]
        }
      });
      return;
    }

    const ticket = await getNFTMetadata(mintAddress);
    if (!ticket || !ticket.eventDetails) {
      await bot.editMessageText('❌ Invalid ticket.', {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 Back', callback_data: `view_ticket_${mintAddress}` }]
          ]
        }
      });
      return;
    }

    // Show processing message
    await bot.editMessageText('🔄 *Validating ticket for entry...*', {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown'
    });

    // Find the ticket owner (this is a simplified approach - in a real implementation, you'd have better tracking)
    const result = await useTicketForEntry(user.id, mintAddress, ticket.eventDetails.eventId);

    if (result.success) {
      await bot.editMessageText(
        `✅ *Ticket Validated Successfully!*\n\n` +
        `🎫 **Event:** ${ticket.eventDetails.eventName}\n` +
        `🏷️ **Category:** ${ticket.eventDetails.category}\n` +
        `⏰ **Entry Time:** ${new Date().toLocaleString()}\n\n` +
        `🔒 This ticket has been marked as used and cannot be used again.`,
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔙 Back to Ticket', callback_data: `view_ticket_${mintAddress}` }]
            ]
          }
        }
      );
    } else {
      await bot.editMessageText(
        `❌ *Ticket Validation Failed*\n\n` +
        `Error: ${result.error}\n\n` +
        `This ticket cannot be used for entry.`,
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔙 Back to Ticket', callback_data: `view_ticket_${mintAddress}` }]
            ]
          }
        }
      );
    }
  } catch (error) {
    console.error('Error handling validate ticket callback:', error);
    await bot.editMessageText('❌ Error validating ticket. Please try again.', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔙 Back', callback_data: `view_ticket_${mintAddress}` }]
        ]
      }
    });
  }
}

// Handle Admin Check NFTs callback
async function handleAdminCheckNFTsCallback(chatId: number, user: TelegramBot.User, messageId: number) {
  try {
    const { getAdminWalletNFTs, isAdmin } = await import('../services/nftService');
    
    if (!isAdmin(user.id)) {
      await bot.editMessageText('❌ Access denied. Admin only.', {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 Back to Events', callback_data: 'events' }]
          ]
        }
      });
      return;
    }

    await bot.editMessageText('🔍 Checking admin wallet NFTs...', {
      chat_id: chatId,
      message_id: messageId
    });

    const result = await getAdminWalletNFTs();

    if (result && Array.isArray(result)) {
      let message = `📊 *Admin Wallet NFT Inventory*\n\n`;
      message += `🔑 **Total NFTs:** ${result.length}\n\n`;
      
      if (result.length > 0) {
        message += `*Recent NFTs:*\n`;
        result.slice(0, 10).forEach((nft, index) => {
          message += `${index + 1}. ${nft.name}\n`;
          message += `   🔗 \`${nft.mint}\`\n`;
          message += `   🎫 ${nft.type === 'ticket' ? 'Event Ticket' : 'Collectible'}\n\n`;
        });
        
        if (result.length > 10) {
          message += `... and ${result.length - 10} more NFTs\n\n`;
        }
      } else {
        message += `*No NFTs found in admin wallet*\n\n`;
      }

      message += `💡 Use /admin_debug_event to check specific event NFT status`;

      await bot.editMessageText(message, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🔍 Debug Event', callback_data: 'admin_debug_event' },
              { text: '📊 Event Stats', callback_data: 'admin_event_stats' }
            ],
            [
              { text: '🔙 Back to Events', callback_data: 'events' }
            ]
          ]
        }
      });
    } else {
      await bot.editMessageText(`❌ Error checking admin NFTs: No NFTs found or error occurred`, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 Back to Events', callback_data: 'events' }]
          ]
        }
      });
    }
  } catch (error) {
    console.error('Error handling admin check NFTs callback:', error);
    await bot.editMessageText('❌ Error checking admin NFTs. Please try again.', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔙 Back to Events', callback_data: 'events' }]
        ]
      }
    });
  }
}

// Handle Admin Debug Event callback
async function handleAdminDebugEventCallback(chatId: number, user: TelegramBot.User, messageId: number) {
  try {
    const { getAllEvents, isAdmin } = await import('../services/nftService');
    
    if (!isAdmin(user.id)) {
      await bot.editMessageText('❌ Access denied. Admin only.', {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 Back to Events', callback_data: 'events' }]
          ]
        }
      });
      return;
    }

    const events = await getAllEvents();
    
    if (events.length === 0) {
      await bot.editMessageText('📋 *No events to debug*\n\nCreate an event first to debug NFT status.', {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🆕 Create Event', callback_data: 'admin_create_event' },
              { text: '🔙 Back to Events', callback_data: 'events' }
            ]
          ]
        }
      });
      return;
    }

    let message = `🔍 *Debug Event NFTs*\n\n`;
    message += `Select an event to debug:\n\n`;
    
    const eventButtons: any[][] = [];
    events.forEach((event, index) => {
      const totalTickets = event.categories.reduce((sum, cat) => sum + cat.maxSupply, 0);
      const availableTickets = event.categories.reduce((sum, cat) => sum + cat.mintAddresses.length, 0);
      
      message += `${index + 1}. **${event.name}**\n`;
      message += `   🎫 ${availableTickets}/${totalTickets} tickets available\n`;
      message += `   📅 ${event.date.toDateString()}\n\n`;
      
      eventButtons.push([{ 
        text: `🔍 Debug ${event.name}`, 
        callback_data: `debug_event_${event.eventId}` 
      }]);
    });

    eventButtons.push([{ text: '🔙 Back to Events', callback_data: 'events' }]);

    await bot.editMessageText(message, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: eventButtons
      }
    });
  } catch (error) {
    console.error('Error handling admin debug event callback:', error);
    await bot.editMessageText('❌ Error loading events for debug. Please try again.', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔙 Back to Events', callback_data: 'events' }]
        ]
      }
    });
  }
}

// Handle Debug Specific Event callback
async function handleDebugSpecificEventCallback(chatId: number, user: TelegramBot.User, messageId: number, eventId: string) {
  try {
    const { debugEventNFTs, isAdmin } = await import('../services/nftService');
    
    if (!isAdmin(user.id)) {
      await bot.editMessageText('❌ Access denied. Admin only.', {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 Back to Events', callback_data: 'events' }]
          ]
        }
      });
      return;
    }

    const result = await debugEventNFTs(eventId);

    if (result && result.eventName) {
      let message = `🔍 *Event NFT Debug: ${result.eventName}*\n\n`;
      message += `📊 **Summary:**\n`;
      message += `• Total Minted: ${result.totalMinted}\n`;
      message += `• Available: ${result.totalAvailable}\n`;
      message += `• Sold: ${result.totalSold}\n\n`;
      message += `🎫 **Ticket Categories:**\n`;
      
      result.categories.forEach((cat: any) => {
        const available = cat.available;
        const total = cat.minted;
        const sold = cat.sold;
        const status = available > 0 ? '🟢 Available' : '🔴 Sold Out';
        
        message += `\n**${cat.category}** (${cat.price} SOL)\n`;
        message += `   📊 ${available}/${total} available ${status}\n`;
        message += `   💰 ${sold} sold\n`;
        
        if (cat.mintAddresses && cat.mintAddresses.length > 0) {
          message += `   🔗 Sample mint: \`${cat.mintAddresses[0]}\`\n`;
        }
      });

      message += `\n💡 **Next Steps:**\n`;
      message += `• Check if NFTs exist in admin wallet\n`;
      message += `• Verify transfer function works\n`;
      message += `• Test ticket purchase flow`;

      await bot.editMessageText(message, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🔍 Check Admin NFTs', callback_data: 'admin_check_nfts' },
              { text: '📊 Event Stats', callback_data: 'admin_event_stats' }
            ],
            [
              { text: '🔙 Back to Debug', callback_data: 'admin_debug_event' }
            ]
          ]
        }
      });
    } else {
      await bot.editMessageText(`❌ Error debugging event: Event not found or invalid`, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 Back to Debug', callback_data: 'admin_debug_event' }]
          ]
        }
      });
    }
  } catch (error) {
    console.error('Error handling debug specific event callback:', error);
    await bot.editMessageText('❌ Error debugging event. Please try again.', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔙 Back to Debug', callback_data: 'admin_debug_event' }]
        ]
      }
    });
  }
}

// Handle NFT Marketplace callback
async function handleNFTMarketplaceCallback(chatId: number, user: TelegramBot.User, messageId: number) {
  try {
    const { getActiveNFTListings, getNFTListingsBySeller } = await import('../services/nftService');
    
    const allListings = await getActiveNFTListings();
    const userListings = await getNFTListingsBySeller(user.id);
    
    let message = `🛒 *NFT Marketplace*\n\n`;
    message += `📊 **Market Overview:**\n`;
    message += `• Total Active Listings: ${allListings.length}\n`;
    message += `• Your Listings: ${userListings.length}\n\n`;
    
    if (allListings.length === 0) {
      message += `*No NFTs are currently listed for sale.*\n\n`;
      message += `Be the first to list an NFT!`;
      
      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '📝 List My NFT', callback_data: 'nft_list_for_sale' },
              { text: '🖼️ My NFTs', callback_data: 'nfts' }
            ],
            [{ text: '🔙 Back', callback_data: 'nfts' }]
          ]
        }
      };
      
      await bot.editMessageText(message, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      });
      return;
    }
    
    // Show first few listings
    const displayLimit = 5;
    const displayListings = allListings.slice(0, displayLimit);
    
    message += `🔥 **Featured Listings:**\n\n`;
    
    displayListings.forEach((listing, index) => {
      message += `${index + 1}. **NFT Listing**\n`;
      message += `   💰 Price: ${listing.price} SOL\n`;
      message += `   📊 Type: ${listing.listingType}\n`;
      message += `   📅 Listed: ${listing.startTime.toLocaleDateString()}\n`;
      if (listing.originalPrice) {
        message += `   🏷️ Original: ${listing.originalPrice} SOL\n`;
        message += `   🔄 Resale #${listing.resaleCount + 1}\n`;
      }
      message += `\n`;
    });
    
    if (allListings.length > displayLimit) {
      message += `... and ${allListings.length - displayLimit} more listings\n\n`;
    }
    
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '📋 View All Listings', callback_data: 'nft_marketplace_listings' },
            { text: '📝 List My NFT', callback_data: 'nft_list_for_sale' }
          ],
          [
            { text: '🛒 Buy NFT', callback_data: 'nft_marketplace_buy' },
            { text: '📊 My Listings', callback_data: 'nft_my_listings' }
          ],
          [
            { text: '🖼️ My NFTs', callback_data: 'nfts' },
            { text: '🔙 Back', callback_data: 'nfts' }
          ]
        ]
      }
    };
    
    await bot.editMessageText(message, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    console.error('Error handling NFT marketplace callback:', error);
    await bot.editMessageText('❌ Error loading marketplace. Please try again.', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔙 Back', callback_data: 'nfts' }]
        ]
      }
    });
  }
}

// Handle NFT List callback (filtered view)
async function handleNFTListCallback(chatId: number, user: TelegramBot.User, messageId: number, filter: 'all' | 'tickets' | 'collectibles') {
  try {
    const { getUserNFTsWithFilters } = await import('../services/nftService');
    
    const nftData = await getUserNFTsWithFilters(user.id, { type: filter });
    
    let message = `🖼️ *Your NFT Collection*\n\n`;
    message += `🔍 **Filter:** ${filter.charAt(0).toUpperCase() + filter.slice(1)}\n`;
    message += `📊 **Total:** ${nftData.totalCount} NFTs\n\n`;
    
    if (nftData.nfts.length === 0) {
      message += `*No NFTs found with this filter.*\n\n`;
      message += `Try a different filter or check your collection.`;
      
      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🔄 All NFTs', callback_data: 'nft_list_all' },
              { text: '🎫 Tickets Only', callback_data: 'nft_list_tickets' },
              { text: '🖼️ Collectibles Only', callback_data: 'nft_list_collectibles' }
            ],
            [{ text: '🔙 Back', callback_data: 'nfts' }]
          ]
        }
      };
      
      await bot.editMessageText(message, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      });
      return;
    }
    
    // Show all NFTs with this filter
    nftData.nfts.forEach((nft, index) => {
      message += `${index + 1}. **${nft.name}**\n`;
      if (nft.isEventTicket && nft.eventDetails) {
        message += `   🎫 ${nft.eventDetails.category} Ticket\n`;
        message += `   📅 ${nft.eventDetails.eventName}\n`;
        message += `   ${nft.eventDetails.isUsed ? '✅ Used' : '🎯 Valid'}\n`;
      } else {
        message += `   🖼️ Collectible\n`;
      }
      message += `   🔗 Mint: \`${nft.mint}\`\n\n`;
    });
    
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '📝 List for Sale', callback_data: 'nft_list_for_sale' },
            { text: '👥 Transfer', callback_data: 'nft_transfer' }
          ],
          [
            { text: '🔄 All NFTs', callback_data: 'nft_list_all' },
            { text: '🎫 Tickets Only', callback_data: 'nft_list_tickets' },
            { text: '🖼️ Collectibles Only', callback_data: 'nft_list_collectibles' }
          ],
          [{ text: '🔙 Back', callback_data: 'nfts' }]
        ]
      }
    };
    
    await bot.editMessageText(message, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    console.error('Error handling NFT list callback:', error);
    await bot.editMessageText('❌ Error loading NFT list. Please try again.', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔙 Back', callback_data: 'nfts' }]
        ]
      }
    });
  }
}

// Handle NFT Transfer callback
async function handleNFTTransferCallback(chatId: number, user: TelegramBot.User, messageId: number) {
  try {
    const { getUserNFTsWithFilters } = await import('../services/nftService');
    
    const nftData = await getUserNFTsWithFilters(user.id);
    
    if (nftData.totalCount === 0) {
      await bot.editMessageText('❌ You don\'t have any NFTs to transfer.', {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 Back', callback_data: 'nfts' }]
          ]
        }
      });
      return;
    }
    
    let message = `👥 *Transfer NFT*\n\n`;
    message += `Select an NFT to transfer:\n\n`;
    
    const nftButtons: any[][] = [];
    
    nftData.nfts.forEach((nft, index) => {
      const nftName = nft.name || `NFT ${index + 1}`;
      nftButtons.push([{
        text: `${nft.isEventTicket ? '🎫' : '🖼️'} ${nftName}`,
        callback_data: `nft_transfer_select_${nft.mint}`
      }]);
    });
    
    nftButtons.push([{ text: '🔙 Back', callback_data: 'nfts' }]);
    
    await bot.editMessageText(message, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: nftButtons
      }
    });
  } catch (error) {
    console.error('Error handling NFT transfer callback:', error);
    await bot.editMessageText('❌ Error loading NFTs for transfer. Please try again.', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔙 Back', callback_data: 'nfts' }]
        ]
      }
    });
  }
}

// Initialize bot
function initBot() {
  console.log('🤖 Starting Telegram bot...');
  setupBotHandlers();
}

export { initBot }; 