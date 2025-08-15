#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const PID_FILE = path.join(__dirname, 'bot.pid');

function stopBot() {
  try {
    if (!fs.existsSync(PID_FILE)) {
      console.log('❌ No bot PID file found. Bot may not be running.');
      return;
    }

    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8'));
    console.log(`🛑 Stopping bot with PID: ${pid}`);

    try {
      // Try graceful shutdown first
      process.kill(pid, 'SIGTERM');
      console.log('✅ Sent SIGTERM signal to bot');
      
      // Wait a bit for graceful shutdown
      setTimeout(() => {
        try {
          // Check if process is still running
          process.kill(pid, 0);
          console.log('⚠️ Bot still running, sending SIGKILL...');
          process.kill(pid, 'SIGKILL');
        } catch (e) {
          // Process already stopped
        }
      }, 3000);
      
    } catch (e) {
      if (e.code === 'ESRCH') {
        console.log('⚠️ Process not found, removing stale PID file');
      } else {
        console.error('❌ Error stopping bot:', e.message);
      }
    }

    // Remove PID file
    try {
      fs.unlinkSync(PID_FILE);
      console.log('✅ Removed PID file');
    } catch (e) {
      console.log('⚠️ Could not remove PID file:', e.message);
    }

  } catch (error) {
    console.error('❌ Error stopping bot:', error.message);
  }
}

// Main execution
if (require.main === module) {
  stopBot();
}

module.exports = { stopBot };
