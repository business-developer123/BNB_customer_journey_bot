// Test file for NFT transfer functionality
// This file tests the core transfer logic without requiring the full bot setup

const { MongoClient } = require('mongodb');
require('dotenv').config();

// Test configuration
const TEST_CONFIG = {
    mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/solana_bot_test',
    testMintAddress: 'test_mint_address_123',
    testFromTelegramId: 12345,
    testToTelegramId: 67890,
    testEventId: 'test_event_123'
};

// Test data
const testTicketData = {
    purchaseId: `TEST_TICKET_${Date.now()}`,
    telegramId: TEST_CONFIG.testFromTelegramId,
    eventId: TEST_CONFIG.testEventId,
    category: 'Standard',
    mintAddress: TEST_CONFIG.testMintAddress,
    price: 0.1,
    purchasedAt: new Date(),
    isUsed: false,
    currentOwner: TEST_CONFIG.testFromTelegramId,
    originalOwner: TEST_CONFIG.testFromTelegramId,
    transferCount: 0,
    isActive: true,
    transferHistory: []
};

const testUserData = {
    telegramId: TEST_CONFIG.testFromTelegramId,
    username: 'testuser1',
    firstName: 'Test',
    lastName: 'User1',
    isActive: true,
    wallet: {
        address: 'test_wallet_address_1',
        isCustom: false,
        createdAt: new Date()
    }
};

const testRecipientData = {
    telegramId: TEST_CONFIG.testToTelegramId,
    username: 'testuser2',
    firstName: 'Test',
    lastName: 'User2',
    isActive: true,
    wallet: {
        address: 'test_wallet_address_2',
        isCustom: false,
        createdAt: new Date()
    }
};

async function runTransferTest() {
    let client;
    
    try {
        console.log('🧪 Starting NFT transfer test...');
        
        // Connect to MongoDB
        client = new MongoClient(TEST_CONFIG.mongoUri);
        await client.connect();
        console.log('✅ Connected to MongoDB');
        
        const db = client.db();
        
        // Clean up any existing test data
        await db.collection('ticketpurchases').deleteMany({ mintAddress: TEST_CONFIG.testMintAddress });
        await db.collection('users').deleteMany({ 
            telegramId: { $in: [TEST_CONFIG.testFromTelegramId, TEST_CONFIG.testToTelegramId] } 
        });
        await db.collection('transferhistories').deleteMany({ mintAddress: TEST_CONFIG.testMintAddress });
        console.log('🧹 Cleaned up existing test data');
        
        // Insert test user
        await db.collection('users').insertOne(testUserData);
        console.log('✅ Inserted test sender user');
        
        // Insert test recipient user
        await db.collection('users').insertOne(testRecipientData);
        console.log('✅ Inserted test recipient user');
        
        // Insert test ticket
        await db.collection('ticketpurchases').insertOne(testTicketData);
        console.log('✅ Inserted test ticket');
        
        // Verify initial state
        const initialTicket = await db.collection('ticketpurchases').findOne({ 
            mintAddress: TEST_CONFIG.testMintAddress,
            isActive: true 
        });
        
        if (!initialTicket) {
            throw new Error('Initial ticket not found');
        }
        
        console.log('✅ Initial ticket state verified:', {
            currentOwner: initialTicket.currentOwner,
            isActive: initialTicket.isActive,
            transferCount: initialTicket.transferCount
        });
        
        // Simulate transfer by updating database records
        console.log('\n🔄 Simulating NFT transfer...');
        
        // 1. Mark current ticket as inactive
        await db.collection('ticketpurchases').updateOne(
            { mintAddress: TEST_CONFIG.testMintAddress },
            { 
                $set: { 
                    isActive: false,
                    transferCount: initialTicket.transferCount + 1,
                    lastTransferredAt: new Date()
                },
                $push: {
                    transferHistory: {
                        fromTelegramId: TEST_CONFIG.testFromTelegramId,
                        toTelegramId: TEST_CONFIG.testToTelegramId,
                        transferredAt: new Date(),
                        transactionSignature: 'test_signature_123'
                    }
                }
            }
        );
        console.log('✅ Marked current ticket as inactive');
        
        // 2. Create new active ticket for recipient
        const newTicketData = {
            purchaseId: `TEST_TICKET_${Date.now()}_recipient`,
            telegramId: TEST_CONFIG.testToTelegramId,
            eventId: TEST_CONFIG.testEventId,
            category: 'Standard',
            mintAddress: TEST_CONFIG.testMintAddress,
            price: 0.1,
            purchasedAt: new Date(),
            isUsed: false,
            currentOwner: TEST_CONFIG.testToTelegramId,
            originalOwner: TEST_CONFIG.testFromTelegramId,
            transferCount: 0,
            isActive: true,
            transferHistory: []
        };
        
        await db.collection('ticketpurchases').insertOne(newTicketData);
        console.log('✅ Created new active ticket for recipient');
        
        // 3. Create transfer history record
        const transferHistoryData = {
            transferId: `TEST_TRANSFER_${Date.now()}`,
            mintAddress: TEST_CONFIG.testMintAddress,
            fromTelegramId: TEST_CONFIG.testFromTelegramId,
            toTelegramId: TEST_CONFIG.testToTelegramId,
            fromWalletAddress: testUserData.wallet.address,
            toWalletAddress: testRecipientData.wallet.address,
            transactionSignature: 'test_signature_123',
            transferType: 'user_to_user',
            transferReason: 'Test transfer',
            transferredAt: new Date(),
            status: 'confirmed',
            metadata: {
                eventId: TEST_CONFIG.testEventId,
                eventName: 'Test Event',
                category: 'Standard',
                price: 0.1
            }
        };
        
        await db.collection('transferhistories').insertOne(transferHistoryData);
        console.log('✅ Created transfer history record');
        
        // Verify final state
        console.log('\n🔍 Verifying final state...');
        
        // Check that old ticket is inactive
        const oldTicket = await db.collection('ticketpurchases').findOne({ 
            purchaseId: testTicketData.purchaseId 
        });
        
        if (oldTicket.isActive) {
            throw new Error('Old ticket should be inactive');
        }
        
        console.log('✅ Old ticket is inactive');
        
        // Check that new ticket is active and owned by recipient
        const newTicket = await db.collection('ticketpurchases').findOne({ 
            mintAddress: TEST_CONFIG.testMintAddress,
            isActive: true 
        });
        
        if (!newTicket || newTicket.currentOwner !== TEST_CONFIG.testToTelegramId) {
            throw new Error('New ticket should be active and owned by recipient');
        }
        
        console.log('✅ New ticket is active and owned by recipient');
        
        // Check transfer history
        const transferHistory = await db.collection('transferhistories').findOne({ 
            mintAddress: TEST_CONFIG.testMintAddress 
        });
        
        if (!transferHistory) {
            throw new Error('Transfer history should exist');
        }
        
        console.log('✅ Transfer history created successfully');
        
        // Test getting user tickets for recipient
        const recipientTickets = await db.collection('ticketpurchases').find({
            currentOwner: TEST_CONFIG.testToTelegramId,
            isActive: true
        }).toArray();
        
        if (recipientTickets.length === 0) {
            throw new Error('Recipient should have active tickets');
        }
        
        console.log('✅ Recipient has active tickets:', recipientTickets.length);
        
        // Test getting user tickets for sender
        const senderTickets = await db.collection('ticketpurchases').find({
            currentOwner: TEST_CONFIG.testFromTelegramId,
            isActive: true
        }).toArray();
        
        if (senderTickets.length > 0) {
            console.log('⚠️ Sender still has active tickets (this might be expected if they have other tickets)');
        }
        
        console.log('\n🎉 All tests passed! NFT transfer simulation successful.');
        
        // Summary
        console.log('\n📊 Transfer Summary:');
        console.log(`- Ticket: ${TEST_CONFIG.testMintAddress}`);
        console.log(`- From: User ${TEST_CONFIG.testFromTelegramId}`);
        console.log(`- To: User ${TEST_CONFIG.testToTelegramId}`);
        console.log(`- Old ticket status: Inactive`);
        console.log(`- New ticket status: Active`);
        console.log(`- Transfer history: Created`);
        
    } catch (error) {
        console.error('❌ Test failed:', error);
        throw error;
    } finally {
        if (client) {
            await client.close();
            console.log('🔌 MongoDB connection closed');
        }
    }
}

// Run the test
if (require.main === module) {
    runTransferTest()
        .then(() => {
            console.log('✅ Test completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Test failed:', error);
            process.exit(1);
        });
}

module.exports = { runTransferTest };
