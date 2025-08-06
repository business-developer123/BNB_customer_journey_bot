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

### 🚧 In Development

3. **Crypto Trading**
   - Real-time crypto prices
   - Buy/sell cryptocurrencies
   - Order management

4. **P2P Transfers**
   - Send crypto to other users
   - Transaction history

5. **NFT Management**
   - Browse and view NFTs
   - Buy/sell NFTs
   - NFT transfers

6. **Orange Money Integration**
   - Deposit funds via Orange Money
   - Withdraw to Orange Money

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
│   │   └── walletService.ts        # Wallet management (database operations)
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
   - Focus: Database interactions and business logic

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
- Replaces existing wallet if any

#### Balance Checking
- Real-time BNB balance checking
- Connects to BSC network for accurate balance
- Displays balance in BNB format

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