// Debug script to identify event ID mismatch
// This will help us see what's actually in the database vs what the bot is looking for

const { MongoClient } = require('mongodb');

async function debugEvents() {
    console.log('🔍 Debugging Event ID Mismatch\n');
    
    try {
        // Connect to MongoDB
        const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
        const client = new MongoClient(uri);
        await client.connect();
        
        const db = client.db('telegram_bot'); // Adjust database name if different
        const eventsCollection = db.collection('events');
        
        console.log('📊 Checking database directly...\n');
        
        // Get all events from database
        const dbEvents = await eventsCollection.find({}).toArray();
        console.log(`Total events in database: ${dbEvents.length}\n`);
        
        dbEvents.forEach((event, index) => {
            console.log(`Event ${index + 1}:`);
            console.log(`  _id: ${event._id}`);
            console.log(`  eventId: "${event.eventId}"`);
            console.log(`  name: "${event.name}"`);
            console.log(`  categories: ${event.categories?.length || 0} categories`);
            console.log('');
        });
        
        // Check for specific event ID from screenshot
        const targetEventId = 'ticket_event_1754903031082_l59dal74a';
        console.log(`🔍 Looking for specific event: "${targetEventId}"`);
        
        const foundEvent = await eventsCollection.findOne({ eventId: targetEventId });
        if (foundEvent) {
            console.log(`✅ Found event in database:`);
            console.log(`  _id: ${foundEvent._id}`);
            console.log(`  eventId: "${foundEvent.eventId}"`);
            console.log(`  name: "${foundEvent.name}"`);
        } else {
            console.log(`❌ Event NOT found in database`);
            
            // Check if there are similar event IDs
            const similarEvents = await eventsCollection.find({
                eventId: { $regex: '1754903031082' }
            }).toArray();
            
            if (similarEvents.length > 0) {
                console.log(`🔍 Found events with similar timestamp:`);
                similarEvents.forEach(e => {
                    console.log(`  - "${e.eventId}" (${e.name})`);
                });
            }
        }
        
        await client.close();
        
    } catch (error) {
        console.error('❌ Error debugging events:', error);
    }
}

debugEvents();
