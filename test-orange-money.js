#!/usr/bin/env node

/**
 * Test script for Orange Money integration
 * Run with: node test-orange-money.js
 */

const dotenv = require('dotenv');
dotenv.config();

// Test Orange Money configuration
console.log('🧪 Testing Orange Money Configuration...\n');

// Check environment variables
const requiredEnvVars = [
  'OM_CLIENT_ID',
  'OM_CLIENT_SECRET', 
  'ADMIN_OM_ID',
  'OM_ENCRYPTED_PIN_CODE'
];

console.log('📋 Environment Variables Check:');
requiredEnvVars.forEach(varName => {
  const value = process.env[varName];
  if (value) {
    const masked = value.length > 8 ? `${value.substring(0, 4)}...${value.substring(value.length - 4)}` : '***';
    console.log(`  ✅ ${varName}: ${masked}`);
  } else {
    console.log(`  ❌ ${varName}: Not set`);
  }
});

console.log('\n🔧 Configuration Status:');
console.log(`  Base URL: ${process.env.OM_BASE_URL || 'https://api.sandbox.orange-sonatel.com'}`);
console.log(`  ID Type: ${process.env.OM_ID_TYPE || 'MSISDN'}`);
console.log(`  Wallet: ${process.env.OM_WALLET || 'PRINCIPAL'}`);

console.log('\n💡 Next Steps:');
console.log('1. Make sure all required environment variables are set');
console.log('2. Test the bot with /start command');
console.log('3. Try to purchase a ticket using Orange Money payment method');
console.log('4. Check logs for any errors');

console.log('\n🎯 Expected Flow:');
console.log('1. User selects event and ticket category');
console.log('2. User chooses Orange Money payment method');
console.log('3. User enters phone number');
console.log('4. System checks user\'s OM wallet balance');
console.log('5. User confirms payment');
console.log('6. Money transfers from user to admin OM wallet');
console.log('7. Ticket NFT is minted and transferred to user');
