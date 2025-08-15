# NFT Transfer System Documentation

## Overview

The NFT transfer system allows users to transfer NFT tickets between each other while maintaining proper database synchronization and ownership tracking. When an NFT is transferred:

1. **Blockchain Transfer**: The NFT is transferred on the Solana blockchain
2. **Database Update**: The `TicketPurchase` record is updated to reflect the new owner
3. **User Experience**: The sender no longer sees the ticket, the recipient now sees it
4. **Transfer History**: Complete transfer trail is maintained for audit purposes

## Key Functions

### 1. `transferNFTBetweenUsers`

**Location**: `src/utils/nftUtils.ts`

**Purpose**: Comprehensive NFT transfer function that handles both blockchain and database operations

**Parameters**:
- `mintAddress`: The NFT's mint address
- `fromAddress`: Sender's wallet address
- `toAddress`: Recipient's wallet address  
- `fromTelegramId`: Sender's Telegram ID
- `toTelegramId`: Recipient's Telegram ID
- `privateKey`: Admin private key for blockchain operations

**Returns**:
```typescript
{
    success: boolean;
    transactionSignature?: string;
    error?: string;
}
```

**Features**:
- ✅ Validates both users exist
- ✅ Verifies sender owns the NFT
- ✅ Checks if NFT is listed for sale (prevents transfer)
- ✅ Prevents transfer of used event tickets
- ✅ Performs blockchain transfer
- ✅ Updates database records
- ✅ Handles edge cases gracefully

### 2. `getNFTTransferHistory`

**Purpose**: Retrieves complete transfer history for an NFT

**Returns**: Array of transfer records with sender/recipient details and timestamps

### 3. `testNFTTransfer`

**Purpose**: Test function for development and testing purposes

## Database Changes

### TicketPurchase Collection

**Before Transfer**:
```json
{
    "telegramId": 123456789,  // Sender's ID
    "mintAddress": "NFT123...",
    "purchasedAt": "2024-01-01T00:00:00Z"
}
```

**After Transfer**:
```json
{
    "telegramId": 987654321,  // Recipient's ID
    "mintAddress": "NFT123...",
    "purchasedAt": "2024-01-15T12:00:00Z"  // Updated timestamp
}
```

### NFTListing Collection (if applicable)

**Before Transfer**:
```json
{
    "mintAddress": "NFT123...",
    "isActive": true
}
```

**After Transfer**:
```json
{
    "mintAddress": "NFT123...",
    "isActive": false  // Deactivated
}
```

## User Experience Flow

### 1. Transfer Initiation
- User requests NFT transfer
- System validates ownership and eligibility
- System checks for active listings

### 2. Blockchain Transfer
- NFT is transferred on Solana blockchain
- Transaction is confirmed and signature recorded

### 3. Database Synchronization
- `TicketPurchase` record is updated with new owner
- `NFTListing` is deactivated if it exists
- Transfer timestamp is recorded

### 4. User Interface Updates
- **Sender**: Ticket disappears from their events list
- **Recipient**: Ticket appears in their events list
- Both users can verify ownership through blockchain

## Security Features

### Ownership Validation
- Verifies sender actually owns the NFT
- Checks blockchain ownership before database updates
- Prevents unauthorized transfers

### Transfer Restrictions
- Cannot transfer used event tickets
- Cannot transfer NFTs listed for sale
- Cannot transfer to yourself

### Database Integrity
- Atomic operations where possible
- Fallback handling for partial failures
- Audit trail maintained

## Usage Examples

### Basic Transfer
```typescript
import { transferNFTBetweenUsers } from './src/utils/nftUtils';

const result = await transferNFTBetweenUsers(
    'NFT_MINT_ADDRESS',
    'SENDER_WALLET_ADDRESS',
    'RECIPIENT_WALLET_ADDRESS',
    123456789,  // Sender Telegram ID
    987654321,  // Recipient Telegram ID
    'ADMIN_PRIVATE_KEY'
);

if (result.success) {
    console.log('Transfer successful:', result.transactionSignature);
} else {
    console.error('Transfer failed:', result.error);
}
```

### Get Transfer History
```typescript
import { getNFTTransferHistory } from './src/utils/nftUtils';

const history = await getNFTTransferHistory('NFT_MINT_ADDRESS');
if (history.success) {
    history.transfers?.forEach(transfer => {
        console.log(`From: ${transfer.fromTelegramId} To: ${transfer.toTelegramId}`);
    });
}
```

## Testing

### Test File
Use `test-nft-transfer.js` to test the transfer functionality:

```bash
# Set environment variable
export ADMIN_WALLET_PRIVATE_KEY="your_private_key"

# Run test
node test-nft-transfer.js
```

### Test Parameters
- Update `mintAddress` with actual NFT mint address
- Set `fromTelegramId` and `toTelegramId` with real user IDs
- Ensure both users have wallet addresses in the database

## Error Handling

### Common Errors
- **"Sender does not own this NFT"**: Ownership validation failed
- **"Cannot transfer used event tickets"**: Ticket already used
- **"Cannot transfer NFT that is listed for sale"**: Active listing exists
- **"User not found"**: Invalid Telegram ID

### Recovery
- Blockchain transfers are atomic and cannot be partially completed
- Database updates are handled gracefully with error logging
- Failed database updates don't invalidate successful blockchain transfers

## Integration Points

### Telegram Bot
The transfer system integrates with the Telegram bot through:
- `/transfer` command for user-initiated transfers
- Admin commands for system transfers
- User verification and wallet management

### NFT Service
The main NFT service uses the transfer functions for:
- User-to-user transfers
- System transfers (e.g., after purchase)
- Transfer validation and history

## Monitoring and Logging

### Transfer Logs
- All transfer attempts are logged with detailed information
- Success/failure status is recorded
- Transaction signatures are stored for verification

### Database Monitoring
- Transfer operations update audit fields
- Ownership changes are tracked
- Failed operations are logged for investigation

## Future Enhancements

### Planned Features
- **Batch Transfers**: Transfer multiple NFTs at once
- **Transfer Limits**: Rate limiting for transfers
- **Advanced Validation**: Additional business rule checks
- **Webhook Support**: Notifications for transfer events

### Performance Optimizations
- **Caching**: Cache frequently accessed NFT data
- **Batch Updates**: Optimize database operations
- **Async Processing**: Handle high-volume transfer requests

## Support and Troubleshooting

### Common Issues
1. **Transfer Fails**: Check admin private key and network connectivity
2. **Database Errors**: Verify MongoDB connection and schema
3. **Ownership Issues**: Confirm NFT ownership on blockchain

### Debug Mode
Enable detailed logging by setting environment variable:
```bash
export DEBUG_NFT_TRANSFER=true
```

### Contact
For technical support or questions about the NFT transfer system, refer to the main project documentation or contact the development team.
