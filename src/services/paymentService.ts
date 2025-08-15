import { getUserWalletInfo } from './userService';
import { isConfigured as isOrangeMoneyConfigured, getConfigStatus as getOrangeMoneyConfigStatus, processCashIn as processOrangeMoneyCashIn } from './orangeMoneyService';

export interface PaymentMethod {
  id: string;
  name: string;
  type: 'crypto' | 'orange_money';
  icon: string;
  description: string;
  enabled: boolean;
}

export interface PaymentRequest {
  userId: number;
  amount: number;
  currency: 'SOL' | 'XOF';
  description: string;
  reference?: string;
  paymentMethod: string;
}

export interface PaymentResult {
  success: boolean;
  transactionId?: string;
  reference?: string;
  message: string;
  error?: string;
  paymentMethod: string;
  amount: number;
  currency: string;
}

export interface PaymentMethodConfig {
  crypto: {
    enabled: boolean;
    supportedTokens: string[];
    network: string;
  };
  orangeMoney: {
    enabled: boolean;
    supportedCurrencies: string[];
    minAmount: number;
    maxAmount: number;
  };
}

// Shared configuration
const paymentConfig: PaymentMethodConfig = {
  crypto: {
    enabled: true,
    supportedTokens: ['SOL', 'USDC', 'USDT'],
    network: 'Solana'
  },
  orangeMoney: {
    enabled: isOrangeMoneyConfigured(),
    supportedCurrencies: ['XOF'],
    minAmount: 100, // 100 XOF minimum
    maxAmount: 1000000 // 1,000,000 XOF maximum
  }
};

/**
 * Check if user has a crypto wallet
 */
async function checkUserWallet(userId: number): Promise<boolean> {
  try {
    const walletInfo = await getUserWalletInfo(userId);
    return !!walletInfo;
  } catch (error) {
    console.error('Error checking user wallet:', error);
    return false;
  }
}

/**
 * Get available payment methods for a user
 */
export async function getAvailablePaymentMethods(userId: number): Promise<PaymentMethod[]> {
  const methods: PaymentMethod[] = [];

  // Crypto payment method
  if (paymentConfig.crypto.enabled) {
    const hasWallet = await checkUserWallet(userId);
    methods.push({
      id: 'crypto',
      name: 'Crypto Wallet',
      type: 'crypto',
      icon: '💰',
      description: `Pay with ${paymentConfig.crypto.supportedTokens.join(', ')} on ${paymentConfig.crypto.network}`,
      enabled: hasWallet
    });
  }

  // Orange Money payment method
  if (paymentConfig.orangeMoney.enabled) {
    methods.push({
      id: 'orange_money',
      name: 'Orange Money',
      type: 'orange_money',
      icon: '🟠',
      description: `Pay with Orange Money (XOF) - Mobile Money`,
      enabled: true
    });
  }

  return methods;
}

/**
 * Process crypto payment
 */
async function processCryptoPayment(paymentRequest: PaymentRequest): Promise<PaymentResult> {
  try {
    // For crypto payments, we'll return success immediately
    // The actual crypto transaction should be handled by the calling function
    // This is just a placeholder for the payment service integration
    
    return {
      success: true,
      transactionId: `CRYPTO_${Date.now()}`,
      reference: paymentRequest.reference || `CRYPTO_REF_${Date.now()}`,
      message: 'Crypto payment processed successfully',
      paymentMethod: 'crypto',
      amount: paymentRequest.amount,
      currency: paymentRequest.currency
    };
  } catch (error) {
    return {
      success: false,
      message: 'Crypto payment failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      paymentMethod: 'crypto',
      amount: paymentRequest.amount,
      currency: paymentRequest.currency
    };
  }
}

/**
 * Process Orange Money payment
 */
async function processOrangeMoneyPayment(paymentRequest: PaymentRequest): Promise<PaymentResult> {
  try {
    // Validate amount for Orange Money
    if (paymentRequest.currency !== 'XOF') {
      return {
        success: false,
        message: 'Orange Money only supports XOF currency',
        error: 'Invalid currency for Orange Money payment',
        paymentMethod: 'orange_money',
        amount: paymentRequest.amount,
        currency: paymentRequest.currency
      };
    }

    if (paymentRequest.amount < paymentConfig.orangeMoney.minAmount) {
      return {
        success: false,
        message: `Amount too low. Minimum amount is ${paymentConfig.orangeMoney.minAmount} XOF`,
        error: 'Amount below minimum threshold',
        paymentMethod: 'orange_money',
        amount: paymentRequest.amount,
        currency: paymentRequest.currency
      };
    }

    if (paymentRequest.amount > paymentConfig.orangeMoney.maxAmount) {
      return {
        success: false,
        message: `Amount too high. Maximum amount is ${paymentConfig.orangeMoney.maxAmount} XOF`,
        error: 'Amount above maximum threshold',
        paymentMethod: 'orange_money',
        amount: paymentRequest.amount,
        currency: paymentRequest.currency
      };
    }

    // Process Orange Money cash-in
    const result = await processOrangeMoneyCashIn(
      paymentRequest.userId.toString(),
      paymentRequest.amount,
      paymentRequest.reference
    );

    if (result.status === 'SUCCESS') {
      return {
        success: true,
        transactionId: result.transactionId,
        reference: result.reference,
        message: 'Orange Money payment processed successfully',
        paymentMethod: 'orange_money',
        amount: paymentRequest.amount,
        currency: paymentRequest.currency
      };
    } else {
      return {
        success: false,
        message: 'Orange Money payment failed',
        error: result.description || 'Payment status not successful',
        paymentMethod: 'orange_money',
        amount: paymentRequest.amount,
        currency: paymentRequest.currency
      };
    }
  } catch (error) {
    return {
      success: false,
      message: 'Orange Money payment failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      paymentMethod: 'orange_money',
      amount: paymentRequest.amount,
      currency: paymentRequest.currency
    };
  }
}

/**
 * Process payment using the specified method
 */
export async function processPayment(paymentRequest: PaymentRequest): Promise<PaymentResult> {
  try {
    switch (paymentRequest.paymentMethod) {
      case 'crypto':
        return await processCryptoPayment(paymentRequest);
      
      case 'orange_money':
        return await processOrangeMoneyPayment(paymentRequest);
      
      default:
        return {
          success: false,
          message: 'Unsupported payment method',
          error: 'Invalid payment method specified',
          paymentMethod: paymentRequest.paymentMethod,
          amount: paymentRequest.amount,
          currency: paymentRequest.currency
        };
    }
  } catch (error) {
    console.error('Payment processing error:', error);
    return {
      success: false,
      message: 'Payment processing failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      paymentMethod: paymentRequest.paymentMethod,
      amount: paymentRequest.amount,
      currency: paymentRequest.currency
    };
  }
}

/**
 * Get payment configuration
 */
export function getPaymentConfig(): PaymentMethodConfig {
  return paymentConfig;
}

/**
 * Check if Orange Money is available
 */
export function isOrangeMoneyAvailable(): boolean {
  return paymentConfig.orangeMoney.enabled;
}

/**
 * Get Orange Money configuration status
 */
export function getOrangeMoneyStatus() {
  return getOrangeMoneyConfigStatus();
}