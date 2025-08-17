# NFT Transfer System Documentation

## Overview

The NFT transfer system allows users to transfer their NFT tickets to other registered users or external wallets. The system handles both blockchain transfers and comprehensive database updates to maintain accurate ownership records.

## Key Features

- **User-to-User Transfers**: Transfer tickets between registered bot users
- **External Wallet Transfers**: Transfer tickets to external Solana wallets
- **Complete Database Tracking**: Maintains transfer history and ownership records
- **Automatic Ticket Management**: Creates new ticket records for recipients
- **Transfer History**: Tracks all transfers with metadata

## How It Works

### 1. Transfer Process Flow

1. **Validation**: Verify sender owns the NFT and has permission to transfer
2. **Blockchain Transfer**: Execute the actual NFT transfer on Solana
3. **Database Updates**: Update ownership records and create transfer history
4. **Ticket Management**: Mark old ticket as inactive, create new active ticket for recipient

### 2. Database Schema Changes

#### TicketPurchase Model
- `currentOwner`: Current owner's Telegram ID
- `originalOwner`: Original purchaser's Telegram ID  
- `transferCount`: Number of times transferred
- `lastTransferredAt`: When last transferred
- `isActive`: Whether ticket is currently active
- `transferHistory`: Array of transfer records

#### TransferHistory Model
- `fromTelegramId`: Sender's Telegram ID
- `toTelegramId`: Recipient's Telegram ID (null for external wallets)
- `transferType`: Type of transfer (user_to_user, user_to_external, etc.)
- `metadata`: Event details, category, price
- `status`: Transfer status (pending, confirmed, failed)

### 3. Transfer Types

- **user_to_user**: Transfer between registered bot users
- **user_to_external**: Transfer to external wallet
- **system_to_user**: System-generated transfers
- **user_to_system**: User transfers to system

## API Functions

### `transferNFTBetweenUsers`

Main function for transferring NFTs between users.

```typescript
const result = await transferNFTBetweenUsers(
    mintAddress,        // NFT mint address
    fromAddress,        // Sender's wallet address
    toAddress,          // Recipient's wallet address
    fromTelegramId,     // Sender's Telegram ID
    toTelegramId,       // Recipient's Telegram ID (null for external)
    privateKey,         // Admin private key for blockchain operations
    transferReason      // Optional reason for transfer
);
```

**Returns:**
```typescript
{
    success: boolean;
    transactionSignature?: string;
    error?: string;
}
```

### `getUserTransferHistory`

Get transfer history for a specific user.

```typescript
const history = await getUserTransferHistory(telegramId);
```

**Returns:**
```typescript
{
    success: boolean;
    receivedTransfers?: Array<TransferRecord>;
    sentTransfers?: Array<TransferRecord>;
    error?: string;
}
```

### `getNFTCurrentOwner`

Get current owner of an NFT from database.

```typescript
const owner = await getNFTCurrentOwner(mintAddress);
```

**Returns:**
```typescript
{
    success: boolean;
    currentOwner?: number;
    isActive?: boolean;
    error?: string;
}
```

## Database Operations

### When Transferring to Registered User

1. **Mark Current Ticket Inactive**:
   ```typescript
   currentTicketRecord.isActive = false;
   currentTicketRecord.transferCount += 1;
   currentTicketRecord.lastTransferredAt = new Date();
   ```

2. **Create New Active Ticket for Recipient**:
   ```typescript
   const newTicketRecord = new TicketPurchase({
       telegramId: toTelegramId,
       currentOwner: toTelegramId,
       originalOwner: currentTicketRecord.originalOwner,
       transferCount: 0,
       isActive: true
   });
   ```

3. **Create Transfer History Record**:
   ```typescript
   const transferHistoryRecord = new TransferHistory({
       fromTelegramId,
       toTelegramId,
       transferType: 'user_to_user',
       status: 'confirmed'
   });
   ```

### When Transferring to External Wallet

1. **Mark Ticket Inactive**:
   ```typescript
   currentTicketRecord.isActive = false;
   currentTicketRecord.transferCount += 1;
   ```

2. **Create Transfer History**:
   ```typescript
   transferType: 'user_to_external',
   toTelegramId: 0  // External wallet indicator
   ```

## Error Handling

### Common Errors

- **"No active ticket record found for this NFT"**: Ticket doesn't exist or is already transferred
- **"Sender is not the current owner"**: User doesn't have permission to transfer
- **"Cannot transfer used event tickets"**: Ticket has already been used
- **"Cannot transfer NFT that is listed for sale"**: Cancel listing before transfer

### Error Recovery

The system is designed to be resilient:
- Blockchain transfers are the source of truth
- Database failures don't prevent successful transfers
- Comprehensive logging for debugging

## Testing

### Test File: `test_transfer.js`

Run the test to verify transfer functionality:

```bash
node test_transfer.js
```

The test simulates a complete transfer process:
1. Creates test users and ticket
2. Simulates transfer database operations
3. Verifies final state
4. Cleans up test data

## Usage Examples

### Basic User-to-User Transfer

```typescript
import { transferNFTBetweenUsers } from './src/utils/nftUtils';

const result = await transferNFTBetweenUsers(
    'NFT_MINT_ADDRESS',
    'SENDER_WALLET_ADDRESS',
    'RECIPIENT_WALLET_ADDRESS',
    12345,  // Sender Telegram ID
    67890,  // Recipient Telegram ID
    'ADMIN_PRIVATE_KEY'
);

if (result.success) {
    console.log('Transfer successful:', result.transactionSignature);
} else {
    console.error('Transfer failed:', result.error);
}
```

### Get User's Transfer History

```typescript
import { getUserTransferHistory } from './src/utils/nftUtils';

const history = await getUserTransferHistory(12345);
if (history.success) {
    console.log('Received transfers:', history.receivedTransfers?.length);
    console.log('Sent transfers:', history.sentTransfers?.length);
}
```

## Security Considerations

1. **Ownership Verification**: Only current owners can transfer tickets
2. **Blockchain Validation**: Verifies NFT ownership on-chain
3. **Admin Key Usage**: Uses admin private key for blockchain operations
4. **Transfer History**: Complete audit trail of all transfers

## Performance Optimizations

1. **Database Indexes**: Optimized queries for current owners and transfers
2. **Batch Operations**: Efficient database updates
3. **Async Processing**: Non-blocking transfer operations
4. **Connection Pooling**: Efficient database connections

## Monitoring and Logging

### Log Levels

- **🔄**: Transfer operations
- **✅**: Successful operations
- **❌**: Errors and failures
- **⚠️**: Warnings and non-critical issues

### Key Metrics

- Transfer success rate
- Database operation performance
- Blockchain transaction confirmation times
- User transfer patterns

## Troubleshooting

### Common Issues

1. **Transfer Fails with "No active ticket record"**
   - Check if ticket exists in database
   - Verify ticket is not already transferred
   - Check database connection

2. **Recipient Doesn't See Transferred Ticket**
   - Verify new ticket record was created
   - Check `currentOwner` and `isActive` fields
   - Ensure recipient's wallet address is correct

3. **Database Update Failures**
   - Check MongoDB connection
   - Verify schema compatibility
   - Check for constraint violations

### Debug Commands

```typescript
// Check ticket status
const ticket = await TicketPurchase.findOne({ mintAddress, isActive: true });

// Check transfer history
const transfers = await TransferHistory.find({ mintAddress });

// Verify ownership
const owner = await getNFTCurrentOwner(mintAddress);
```

## Future Enhancements

1. **Batch Transfers**: Transfer multiple tickets at once
2. **Transfer Limits**: Rate limiting and daily transfer caps
3. **Advanced Notifications**: Push notifications for transfers
4. **Transfer Scheduling**: Schedule transfers for future dates
5. **Multi-Signature Support**: Require multiple approvals for transfers
