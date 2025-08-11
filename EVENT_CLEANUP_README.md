# Event ID Cleanup - One-Time Fix

## Problem
You have existing events in your database that were created before proper event ID generation was implemented. These events have malformed `eventId` values (like just "event" or very short IDs), which prevents users from buying tickets.

## Solution
The `createEvent` function now generates proper event IDs like `event_1733661234567_abc123def`. However, to fix your existing events, you need to run a one-time cleanup command.

## How to Fix Existing Events

### Step 1: Run the Cleanup Command
As an admin, send this command in your Telegram bot:
```
/cleanup_events
```

This command will:
- Scan all events in your database
- Identify events with invalid IDs
- Generate new, proper IDs for them
- Update the database

### Step 2: Verify the Fix
After running the cleanup:
1. Check the bot's response message
2. Try to view events again
3. Users should now be able to buy tickets from previously broken events

## What the Cleanup Does
- **Finds invalid IDs**: Events with `eventId` that is empty, just "event", or less than 5 characters
- **Generates new IDs**: Creates proper IDs in format `event_${timestamp}_${randomString}`
- **Updates database**: Saves the new IDs to MongoDB
- **Reports results**: Shows how many events were fixed

## Example Output
```
✅ Event Cleanup Completed!

🔧 Fixed: 2 events
📊 Total: 2 events

🎯 All events now have valid IDs and should be accessible for ticket purchases!
```

## Important Notes
- **One-time use**: Only run this command once to fix existing events
- **Admin only**: Only administrators can run this command
- **No data loss**: This only fixes the `eventId` field, all other event data remains intact
- **New events**: All new events created after this fix will have proper IDs automatically

## Why This Happened
- Your `createEvent` function was already generating proper IDs
- But you had events created before this function was properly implemented
- The cleanup fixes these legacy events so users can buy tickets

## After Cleanup
- Users can now buy tickets from all events
- New events will continue to have proper IDs
- No more "Event not found" errors when buying tickets
