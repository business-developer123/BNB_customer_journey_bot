# Orange Money Integration Setup Guide

This guide explains how to set up and use the Orange Money payment integration in your Telegram bot.

## Overview

The bot now supports two payment methods:
1. **Crypto Wallet** - Traditional blockchain payments (SOL, USDC, USDT)
2. **Orange Money** - Mobile money payments in XOF (West African CFA franc)

## Environment Variables Required

Add these variables to your `.env` file:

```bash
# Orange Money Configuration
OM_ID_TYPE=MSISDN
OM_ID=your_orange_money_id_here
OM_ENCRYPTED_PIN_CODE=your_encrypted_pin_code_here
OM_WALLET=PRINCIPAL
```

### Configuration Details

- **OM_ID_TYPE**: Usually "MSISDN" for mobile phone numbers
- **OM_ID**: Your Orange Money account ID (phone number)
- **OM_ENCRYPTED_PIN_CODE**: Your encrypted PIN code from Orange Money
- **OM_WALLET**: Wallet type (usually "PRINCIPAL")

## Orange Money API Endpoints

The integration uses these Orange Money API endpoints:

1. **Authentication**: `GET /api/eWallet/v1/account/retailer/balance`
2. **Public Keys**: `GET /api/account/v1/publicKeys`
3. **Cash-in**: `POST /api/eWallet/v1/cashins`

## Features

### Payment Methods Menu
- Access via "💳 Payment Methods" in the main menu
- Shows available payment methods and their status
- Displays configuration status for Orange Money

### Orange Money Payments
- Amount range: 100 - 1,000,000 XOF
- Real-time transaction processing
- Transaction confirmation and status tracking
- Automatic error handling and user feedback

### Crypto Payments
- Existing functionality preserved
- Automatic wallet detection
- Support for SOL, USDC, USDT tokens

## Usage Flow

### For Users:
1. Go to "💳 Payment Methods" in main menu
2. Select "🟠 Orange Money" or "💰 Crypto Wallet"
3. Follow the prompts to complete payment

### For Orange Money:
1. Enter amount in XOF
2. Confirm payment details
3. Process transaction via Orange Money API
4. Receive confirmation with transaction details

## Security Features

- Encrypted PIN code storage
- Token-based authentication
- Automatic token refresh
- Secure transaction processing
- User session management

## Error Handling

The system handles various error scenarios:
- Invalid amounts
- Network failures
- API authentication errors
- Transaction failures
- User session timeouts

## Troubleshooting

### Common Issues:

1. **Orange Money not configured**
   - Check environment variables
   - Verify API credentials
   - Ensure network connectivity

2. **Payment failures**
   - Check amount limits (100-1,000,000 XOF)
   - Verify Orange Money account status
   - Check API response for specific errors

3. **Authentication errors**
   - Verify OM_ID and OM_ENCRYPTED_PIN_CODE
   - Check if credentials are expired
   - Ensure proper API access

## API Response Examples

### Successful Cash-in Response:
```json
{
  "reference": "0e6ddd66-a9c2-4c9f-b139-57ff65392fee",
  "transactionId": "CI250814.2053.A00043",
  "requestId": "771899696202508142053A0087",
  "status": "SUCCESS",
  "description": ""
}
```

### Authentication Response:
```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in": 299,
  "scope": "apimanagement email profile",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_expires_in": 1800
}
```

## Development Notes

- Uses sandbox API by default
- Implements automatic token refresh
- Includes comprehensive error handling
- Supports both development and production environments
- Maintains backward compatibility with existing crypto features

## Support

For issues with Orange Money integration:
1. Check the bot's debug information
2. Verify environment variable configuration
3. Test API connectivity
4. Review transaction logs
5. Contact Orange Money support if needed
