// Simple verification script to check database models
const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
async function verifyModels() {
    try {
        console.log('🔍 Verifying database models...');
        
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/solana_bot');
        console.log('✅ Connected to MongoDB');
        
        // Test TicketPurchase model
        const { default: TicketPurchase } = await import('./src/models/TicketPurchase.js');
        console.log('✅ TicketPurchase model loaded');
        
        // Test TransferHistory model
        const { default: TransferHistory } = await import('./src/models/TransferHistory.js');
        console.log('✅ TransferHistory model loaded');
        
        // Test User model
        const { default: User } = await import('./src/models/User.js');
        console.log('✅ User model loaded');
        
        // Check collections exist
        const collections = await mongoose.connection.db.listCollections().toArray();
        const collectionNames = collections.map(c => c.name);
        
        console.log('📊 Available collections:', collectionNames);
        
        // Check if required collections exist
        const requiredCollections = ['ticketpurchases', 'transferhistories', 'users'];
        const missingCollections = requiredCollections.filter(c => !collectionNames.includes(c));
        
        if (missingCollections.length > 0) {
            console.log('⚠️ Missing collections:', missingCollections);
        } else {
            console.log('✅ All required collections exist');
        }
        
        // Test basic queries
        console.log('\n🧪 Testing basic queries...');
        
        // Count users
        const userCount = await User.countDocuments();
        console.log(`👥 Users in database: ${userCount}`);
        
        // Count tickets
        const ticketCount = await TicketPurchase.countDocuments();
        console.log(`🎫 Tickets in database: ${ticketCount}`);
        
        // Count transfers
        const transferCount = await TransferHistory.countDocuments();
        console.log(`🔄 Transfers in database: ${transferCount}`);
        
        // Check active tickets
        const activeTickets = await TicketPurchase.countDocuments({ isActive: true });
        console.log(`✅ Active tickets: ${activeTickets}`);
        
        // Check inactive tickets
        const inactiveTickets = await TicketPurchase.countDocuments({ isActive: false });
        console.log(`❌ Inactive tickets: ${inactiveTickets}`);
        
        console.log('\n🎉 Model verification completed successfully!');
        
    } catch (error) {
        console.error('❌ Model verification failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 MongoDB connection closed');
    }
}

// Run verification
if (require.main === module) {
    verifyModels();
}
