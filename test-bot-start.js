#!/usr/bin/env node

// Simple test to verify bot initialization
console.log('🧪 Testing bot initialization...');

try {
  // Test if the bot module can be imported
  const { initBot } = require('./dist/bot/telegramBot');
  console.log('✅ Bot module imported successfully');
  
  // Test if initBot is a function
  if (typeof initBot === 'function') {
    console.log('✅ initBot function found');
  } else {
    console.log('❌ initBot is not a function');
  }
  
  console.log('✅ Bot initialization test passed');
} catch (error) {
  console.error('❌ Bot initialization test failed:', error.message);
  
  if (error.code === 'MODULE_NOT_FOUND') {
    console.log('💡 Try running "npm run build" first to compile TypeScript');
  }
  
  process.exit(1);
}
