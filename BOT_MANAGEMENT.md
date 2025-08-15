# Telegram Bot Management Guide

## Overview
This guide explains how to properly manage your Telegram bot to prevent the "409 Conflict" error that occurs when multiple bot instances are running simultaneously.

## The Problem
The error `409 Conflict: terminated by other getUpdates request; make sure that only one bot instance is running` occurs when:
- Multiple instances of the same bot are running
- The bot wasn't properly shut down before restarting
- Process management is not properly handled

## Solution Implemented

### 1. Improved Bot Lifecycle Management
- **Delayed Polling**: Bot no longer starts polling immediately upon creation
- **Graceful Shutdown**: Proper cleanup when the application stops
- **Conflict Detection**: Intelligent handling of 409 errors with automatic retry
- **Process Management**: Better handling of signals and process events

### 2. Process Management Scripts
- `start-bot.js`: Ensures only one bot instance runs at a time
- `stop-bot.js`: Gracefully stops the running bot instance
- PID file tracking to prevent multiple instances

## Usage

### Starting the Bot
```bash
# Use the process manager (recommended)
npm run start-bot

# Or start directly (not recommended for production)
npm run start
```

### Stopping the Bot
```bash
# Gracefully stop the bot
npm run stop-bot

# Or use Ctrl+C if running directly
```

### Development Mode
```bash
# Start with nodemon for development
npm run dev
```

## How It Works

### 1. Bot Initialization
```typescript
// Bot is created without polling
const bot = new TelegramBot(botToken, { polling: false });

// Polling starts only after setup is complete
await bot.startPolling({ polling: true });
```

### 2. Conflict Resolution
When a 409 error occurs:
1. Bot automatically stops polling
2. Waits 5 seconds
3. Attempts to restart polling
4. Logs the conflict for debugging

### 3. Graceful Shutdown
- Handles SIGINT, SIGTERM, and SIGQUIT signals
- Stops bot polling before exit
- Cleans up resources properly

## Environment Variables
Make sure these are set in your `.env` file:
```env
TELEGRAM_BOT_TOKEN=your_bot_token_here
MONGO_URI=your_mongodb_connection_string
SOLANA_RPC_PROVIDER=your_solana_rpc_url
```

## Troubleshooting

### Bot Won't Start
1. Check if another instance is running: `npm run stop-bot`
2. Verify your bot token is correct
3. Check the logs in `bot.log`

### Still Getting 409 Errors
1. Stop all bot instances: `npm run stop-bot`
2. Wait a few seconds
3. Start fresh: `npm run start-bot`

### Bot Crashes
1. Check the logs for errors
2. Verify database connection
3. Check environment variables
4. Restart: `npm run start-bot`

## Best Practices

### 1. Always Use Process Manager
- Use `npm run start-bot` instead of `npm run start`
- This prevents multiple instances

### 2. Proper Shutdown
- Use `npm run stop-bot` to stop the bot
- Don't just kill the process with Ctrl+C

### 3. Monitor Logs
- Check `bot.log` for detailed information
- Monitor console output for errors

### 4. Development vs Production
- Use `npm run dev` for development
- Use `npm run start-bot` for production

## File Structure
```
├── start-bot.js          # Bot process manager
├── stop-bot.js           # Bot stopper
├── src/
│   ├── index.ts          # Main application entry
│   └── bot/
│       └── telegramBot.ts # Bot implementation
├── bot.pid               # Process ID file (auto-generated)
├── bot.log               # Bot logs (auto-generated)
└── package.json          # NPM scripts
```

## Technical Details

### Conflict Prevention
- Bot starts with `polling: false`
- Polling only starts after complete setup
- Proper error handling for conflicts
- Automatic retry mechanism

### Process Management
- PID file tracking
- Signal handling
- Graceful shutdown
- Resource cleanup

### Error Recovery
- Intelligent error classification
- Automatic retry for recoverable errors
- Proper logging for debugging
- Never lets the bot stop unexpectedly

## Support
If you continue to experience issues:
1. Check the logs in `bot.log`
2. Verify no other instances are running
3. Ensure proper environment variables
4. Check database connectivity
5. Review the console output for specific errors
