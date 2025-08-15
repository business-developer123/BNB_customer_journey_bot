#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PID_FILE = path.join(__dirname, 'bot.pid');
const LOG_FILE = path.join(__dirname, 'bot.log');

// Check if bot is already running
function isBotRunning() {
  try {
    if (fs.existsSync(PID_FILE)) {
      const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8'));
      
      // Check if process is actually running
      try {
        process.kill(pid, 0); // Signal 0 doesn't kill the process, just checks if it exists
        return true;
      } catch (e) {
        // Process doesn't exist, remove stale PID file
        fs.unlinkSync(PID_FILE);
        return false;
      }
    }
    return false;
  } catch (e) {
    return false;
  }
}

// Start the bot
function startBot() {
  if (isBotRunning()) {
    console.log('❌ Bot is already running!');
    console.log('Use "npm run stop-bot" to stop the current instance');
    process.exit(1);
  }

  console.log('🚀 Starting Telegram bot...');
  
  // Start the bot process
  const botProcess = spawn('npm', ['run', 'start'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: false
  });

  // Write PID to file
  fs.writeFileSync(PID_FILE, botProcess.pid.toString());
  console.log(`✅ Bot started with PID: ${botProcess.pid}`);

  // Handle process output
  botProcess.stdout.on('data', (data) => {
    const output = data.toString().trim();
    if (output) {
      console.log(`[BOT] ${output}`);
      // Also log to file
      fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${output}\n`);
    }
  });

  botProcess.stderr.on('data', (data) => {
    const output = data.toString().trim();
    if (output) {
      console.error(`[BOT ERROR] ${output}`);
      // Also log to file
      fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ERROR: ${output}\n`);
    }
  });

  // Handle process exit
  botProcess.on('exit', (code) => {
    console.log(`🔄 Bot process exited with code: ${code}`);
    
    // Remove PID file
    try {
      if (fs.existsSync(PID_FILE)) {
        fs.unlinkSync(PID_FILE);
      }
    } catch (e) {
      // Ignore errors
    }
    
    if (code !== 0) {
      console.log('⚠️ Bot crashed. You can restart it with "npm run start-bot"');
    }
  });

  // Handle process errors
  botProcess.on('error', (error) => {
    console.error('❌ Failed to start bot process:', error);
    
    // Remove PID file
    try {
      if (fs.existsSync(PID_FILE)) {
        fs.unlinkSync(PID_FILE);
      }
    } catch (e) {
      // Ignore errors
    }
    
    process.exit(1);
  });

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down bot...');
    botProcess.kill('SIGINT');
    
    // Remove PID file
    try {
      if (fs.existsSync(PID_FILE)) {
        fs.unlinkSync(PID_FILE);
      }
    } catch (e) {
      // Ignore errors
    }
    
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n🛑 Terminating bot...');
    botProcess.kill('SIGTERM');
    
    // Remove PID file
    try {
      if (fs.existsSync(PID_FILE)) {
        fs.unlinkSync(PID_FILE);
      }
    } catch (e) {
      // Ignore errors
    }
    
    process.exit(0);
  });
}

// Main execution
if (require.main === module) {
  startBot();
}

module.exports = { startBot, isBotRunning };
