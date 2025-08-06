const { getAllTokenBalances } = require('./dist/utils/blockchainUtils');

async function testTokenBalances() {
  try {
    console.log('🧪 Testing token balance functionality...');
    
    // Test with a known wallet address (you can replace this with any BSC address)
    const testWalletAddress = '0x66a50a97320a27c786adf4374674c474582c3972';
    
    console.log(`📍 Testing wallet: ${testWalletAddress}`);
    console.log('⏳ Fetching token balances...');
    
    const result = await getAllTokenBalances(testWalletAddress);
    
    console.log('\n✅ Success! Token balances retrieved:');
    console.log(`💎 Native BNB: ${result.nativeBalance} BNB`);
    console.log(`🪙 Tokens found: ${result.tokens.length}`);
    
    if (result.tokens.length > 0) {
      console.log('\n📋 Token Details:');
      result.tokens.forEach((token, index) => {
        console.log(`${index + 1}. ${token.symbol} (${token.name})`);
        console.log(`   Balance: ${token.balance} ${token.symbol}`);
        console.log(`   Contract: ${token.address}`);
        console.log('');
      });
    } else {
      console.log('\n📋 No tokens found in this wallet');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Full error:', error);
  }
}

// Run the test
testTokenBalances(); 