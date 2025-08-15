# My Solana repo verify commit 👌

# Crypto Trading Telegram Bot

A Telegram bot for crypto trading with BNB wallet integration.

## Features

### ✅ Completed Features

1. **User Registration & Login**
   - Automatic user registration via Telegram
   - User authentication and session management
   - User profile management

2. **Wallet Integration** 🆕
   - Automatic BNB wallet creation
   - Custom wallet import via private key
   - Wallet balance checking
   - Secure wallet management

### ✅ Completed Features

3. **Vue Marché & Trading** 🆕
   - Real-time price consultation (SOL, USDC, USDT)
   - Crypto buys/sells with instant confirmation in Telegram
   - Multiple trading pairs with slippage control
   - Swap transactions via Jupiter protocol

4. **P2P Transfers** 🆕
   - Send crypto to other users via Telegram ID or username
   - User discovery by @username or Telegram ID
   - Recipient validation (checks if user exists and has wallet)
   - Support for both SOL and SPL token transfers
   - Real-time notifications for sender and recipient
   - Transaction history with blockchain explorer links

5. **NFT Management** 🆕
   - Transfer NFTs between users (P2P NFT transfers)
   - Event ticketing system with blockchain validation
   - NFT metadata display with images and attributes
   - Support for both collectibles and event tickets
   - Anti-fraud protection with ownership verification

6. **Event Ticketing System** 🆕
   - Create events with multiple ticket categories (VIP, Standard, Group)
   - Mint tickets as NFTs with unique metadata
   - Purchase tickets directly through Telegram
   - Blockchain-based entry validation
   - Prevent ticket reuse with smart contract logic
   - QR code generation for event entry
   - Admin controls for event creation and management

### ✅ Completed Features

7. **Orange Money Integration** 🆕
   - Multiple payment methods (Crypto + Orange Money)
   - Orange Money cash-in transactions
   - Real-time payment processing
   - Secure authentication and token management
   - Support for XOF currency (100 - 1,000,000 XOF)
   - Comprehensive error handling and user feedback

## Project Structure

```
backend/
├── src/
│   ├── bot/
│   │   └── telegramBot.ts          # Telegram bot implementation
│   ├── models/
│   │   └── User.ts                 # User model with wallet support
│   ├── services/
│   │   ├── userService.ts          # User management (database operations)
│   │   ├── walletService.ts        # Wallet management (database operations)
│   │   ├── orangeMoneyService.ts   # Orange Money API integration
│   │   └── paymentService.ts       # Payment processing (Crypto + OM)
│   ├── utils/
│   │   ├── dbConnection.ts         # Database connection
│   │   └── blockchainUtils.ts      # BNB blockchain utilities
│   └── index.ts                    # Application entry point
├── package.json
└── tsconfig.json
```

## Architecture

### **Separation of Concerns**

1. **Services Layer** (`/services/`)
   - **userService.ts**: Handles user-related database operations
   - **walletService.ts**: Handles wallet-related database operations
   - **orangeMoneyService.ts**: Handles Orange Money API integration
   - **paymentService.ts**: Handles payment processing for both crypto and Orange Money
   - Focus: Database interactions, external API integrations, and business logic

2. **Utilities Layer** (`/utils/`)
   - **blockchainUtils.ts**: Handles all BNB blockchain operations
   - **dbConnection.ts**: Database connection management
   - Focus: External integrations and utilities

3. **Models Layer** (`/models/`)
   - **User.ts**: User data model with wallet support
   - Focus: Data structure definitions

4. **Bot Layer** (`/bot/`)
   - **telegramBot.ts**: Telegram bot implementation
   - Focus: User interface and interaction logic

### **Blockchain Utilities** (`/utils/blockchainUtils.ts`)

- `generateWallet()` - Generate new BNB wallet
- `createWalletFromPrivateKey()` - Create wallet from private key
- `getWalletBalance()` - Get BNB balance for address
- `isValidWalletAddress()` - Validate wallet address
- `getBSCProvider()` - Get BSC network provider
- `formatBNB()` - Format BNB amounts
- `parseBNB()` - Parse BNB amounts

### **Wallet Service** (`/services/walletService.ts`)

- `getUserWallet()` - Get user's wallet from database
- `createWalletForUser()` - Create wallet for user (database + blockchain)
- `updateUserWallet()` - Update user's wallet (database + blockchain)
- `getUserWalletInfo()` - Get wallet info with balance
- `hasWallet()` - Check if user has wallet
- `deleteUserWallet()` - Delete user's wallet
- `getAllWallets()` - Get all wallets

## Wallet Integration Guide

### Commands

- `/start` - Login and show welcome message
- `/help` - Show help information
- `/wallet` - Manage your wallet
- `/create_wallet` - Create a new BNB wallet automatically
- `/import_wallet` - Import existing wallet using private key
- `/balance` - Check your wallet balance

### Wallet Features

#### Automatic Wallet Creation
- Users can create a new BNB wallet automatically
- Wallet is generated securely using ethers.js
- Private key is stored securely in the database

#### Custom Wallet Import
- Users can import existing wallets using private keys
- Supports 64-character hexadecimal format (with or without 0x prefix)

### P2P Transfer Guide

#### How to Send Crypto to Another User

1. **Start P2P Transfer**: Go to Wallet → "👥 P2P Transfer"
2. **Enter Recipient**: Send recipient's Telegram ID (e.g., your Telegram ID) or username (e.g., @johndoe)
3. **Select Token**: Choose which crypto to send (SOL, USDC, USDT, etc.)
4. **Enter Amount**: Specify how much to transfer
5. **Confirm**: Review details and confirm the transfer
6. **Complete**: Both sender and recipient get notifications with transaction details

#### Features
- **User Discovery**: Find recipients by Telegram ID or username
- **Validation**: Automatic check if recipient exists and has a wallet
- **Token Support**: Send any token in your wallet (SOL and SPL tokens)
- **Notifications**: Both parties receive instant notifications
- **Transaction Links**: Direct links to view transactions on Solscan
- **Error Handling**: Clear error messages for invalid recipients or insufficient funds

### NFT Management Guide

#### How to View Your NFTs

1. **Access NFTs**: Go to Main Menu → "🖼️ My NFTs"
2. **Browse Collection**: View all NFTs, filter by tickets or collectibles
3. **NFT Details**: See metadata, images, and attributes
4. **Transfer NFTs**: Send NFTs to other users via P2P transfer

#### Event Ticketing System

**For Users:**
1. **Browse Events**: Go to Main Menu → "🎫 Events"
2. **Select Event**: Choose from available events
3. **Pick Category**: VIP, Standard, or Group tickets
4. **Purchase**: Buy tickets directly with SOL
5. **Event Entry**: Present ticket NFT at event

**For Admins:**
1. **Create Event**: Use admin controls to create new events
2. **Set Categories**: Define ticket types and quantities
3. **Mint Tickets**: Automatically create ticket NFTs
4. **Manage Sales**: Monitor ticket sales and revenue
5. **Validate Entry**: Scan QR codes to validate tickets

#### NFT Features
- **Ownership Verification**: Blockchain-based proof of ownership
- **Anti-Fraud Protection**: Immutable NFT records prevent forgery
- **Metadata Storage**: IPFS storage via Pinata for permanence
- **Transfer Security**: Secure P2P transfers between verified wallets

#### Balance Checking
- Real-time SOL balance checking
- Connects to Solana network for accurate balance
- Displays balance in SOL format

### Security Features

- Private keys are stored securely in the database
- Wallet addresses are validated before use
- User states are managed for secure wallet import
- Error handling for invalid private keys

## Setup

### Prerequisites

- Node.js (v16 or higher)
- MongoDB
- Telegram Bot Token

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file with:
   ```
   TELEGRAM_BOT_TOKEN=your_telegram_bot_token
   MONGO_URI=your_mongodb_connection_string
   ```

4. Run the application:
   ```bash
   npm run dev
   ```

## Technology Stack

- **Backend**: Node.js, TypeScript
- **Database**: MongoDB with Mongoose
- **Blockchain**: ethers.js for BNB wallet integration
- **Bot Framework**: node-telegram-bot-api
- **Network**: BSC (Binance Smart Chain)

## Usage Examples

### Creating a Wallet
1. Start the bot with `/start`
2. Use `/create_wallet` to create a new wallet
3. The bot will generate a new BNB wallet and display the address

### Importing a Wallet
1. Use `/import_wallet` to start the import process
2. Send your private key when prompted
3. The bot will validate and import your wallet

### Checking Balance
1. Use `/balance` to check your current BNB balance
2. The bot will display your wallet address and current balance

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

ISC 