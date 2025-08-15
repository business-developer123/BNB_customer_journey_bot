const bs58 = require('bs58');

// Your signature in byte array format
const signatureBytes = [197,74,5,123,165,14,174,211,53,156,234,237,61,140,182,25,224,195,24,33,57,169,123,194,189,65,124,73,85,192,51,121,97,139,209,162,33,157,56,53,235,142,223,120,179,77,218,197,11,132,88,85,142,104,77,6,39,102,252,170,129,52,72,8];

// Convert to Uint8Array
const uint8Array = new Uint8Array(signatureBytes);

// Convert to base58 (Solana transaction hash format)
const transactionHash = bs58.encode(uint8Array);

console.log('🔗 Original signature (byte array):');
console.log(signatureBytes);
console.log('\n🔗 Converted transaction hash:');
console.log(transactionHash);
console.log('\n🔗 Transaction hash length:', transactionHash.length, 'characters');

// You can also verify by decoding back
const decoded = bs58.decode(transactionHash);
console.log('\n🔗 Verification - decoded back to bytes:');
console.log(Array.from(decoded));
console.log('\n✅ Conversion successful!');
