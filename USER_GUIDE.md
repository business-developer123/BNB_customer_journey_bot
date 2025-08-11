# 🎫 NFT Event Bot - User Guide

## 🚀 Getting Started

### 1. **Start the Bot**
- Send `/start` to the bot
- You'll see the main menu with options

### 2. **Create a Wallet** (Required for purchases)
- Click "🆕 Create Wallet" from the main menu
- The bot will generate a new Solana wallet for you
- **Important**: Save your private key securely!

### 3. **Import Existing Wallet** (Alternative)
- Click "📥 Import Wallet" from the main menu
- Send your private key when prompted

## 🎫 How to Buy Event Tickets

### **Step 1: Browse Events**
1. Click "🎫 Events" from the main menu
2. Click "📋 Browse Events"
3. You'll see a list of all available events

### **Step 2: Select an Event**
1. Click on any event name (e.g., "🎫 Test Concert 2025")
2. You'll see event details and available ticket categories

### **Step 3: Choose Ticket Category**
- **VIP**: Premium tickets (0.1 SOL)
- **Standard**: Regular tickets (0.05 SOL)  
- **Group**: Budget tickets (0.03 SOL)

### **Step 4: Purchase Ticket**
1. Click the "Buy" button for your preferred category
2. The bot will check your wallet balance
3. If sufficient funds, the ticket will be transferred to your wallet
4. You'll receive confirmation and ticket details

## 💰 Wallet Management

### **View Balance**
- Click "💰 Wallet" from main menu
- Click "🪙 All Tokens" to see your SOL and other tokens

### **Refresh Balance**
- Click "🔄 Refresh Tokens" to update your latest balances

### **Transfer Tokens**
- **To Address**: Send SOL to any Solana wallet address
- **P2P Transfer**: Send SOL to other bot users by Telegram ID

## 🖼️ View Your NFTs

### **My Tickets**
- Click "🖼️ My NFTs" from main menu
- Click "🎫 My Tickets" to see all your event tickets

### **Ticket Details**
- Click on any ticket to view details
- See event information, purchase date, and usage status

## 🔧 For Administrators

### **Create Events**
1. Send `/create_event` command
2. Follow the prompts to enter:
   - Event name
   - Description
   - Date and time
   - Venue
   - Event image
   - Ticket categories and prices

### **Event Management**
- View event statistics
- Debug event issues
- Fix pricing problems

## ❓ Troubleshooting

### **"Event not found" Error**
- This usually means no events exist yet
- Ask an admin to create events
- Check if you're using the latest event list

### **"Wallet not found" Error**
- Create or import a wallet first
- Use "🆕 Create Wallet" or "📥 Import Wallet"

### **"Insufficient balance" Error**
- Add SOL to your wallet
- Check your current balance in "💰 Wallet"

### **"Event ID: event" Error**
- This indicates a database issue
- Contact an administrator to check the system

## 🔒 Security Notes

- **Never share your private key** with anyone
- **Keep your wallet secure** - it contains your funds
- **Verify event details** before purchasing
- **Check ticket authenticity** using the validation feature

## 📱 Supported Commands

- `/start` - Start the bot
- `/help` - Show help information
- `/create_event` - Create new event (Admin only)
- `/wallet` - Access wallet functions
- `/events` - Browse available events

## 🌐 Network Information

The bot automatically detects if you're using:
- 🟢 **Solana Mainnet** (real SOL)
- 🟡 **Solana Testnet** (test SOL)

## 💡 Tips

1. **Always verify event details** before purchasing
2. **Keep your private key safe** - you can't recover it if lost
3. **Check ticket availability** before making plans
4. **Use P2P transfers** for easy payments between users
5. **Refresh your wallet** regularly to see latest balances

---

**Need Help?** Contact an administrator or use the `/help` command for assistance.
