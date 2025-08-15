import dotenv from 'dotenv';

dotenv.config();

interface OrangeMoneyConfig {
  baseUrl: string;
  idType: string;
  id: string;
  encryptedPinCode: string;
  wallet: string;
}

interface OrangeMoneyAuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  refresh_token: string;
  refresh_expires_in: number;
}

interface OrangeMoneyPublicKeyResponse {
  keyId: string;
  keyType: string;
  keySize: number;
  key: string;
}

interface OrangeMoneyCashInRequest {
  partner: {
    idType: string;
    id: string;
    encryptedPinCode: string;
  };
  customer: {
    idType: string;
    id: string;
  };
  amount: {
    value: number;
    unit: string;
  };
  reference: string;
  receiveNotification: boolean;
}

interface OrangeMoneyCashInResponse {
  reference: string;
  transactionId: string;
  requestId: string;
  status: string;
  description: string;
}

interface EventPurchaseRequest {
  customerPhone: string;
  amount: number;
  eventId: string;
  eventName: string;
  customerName?: string;
}

// State variables
let accessToken: string | null = null;
let tokenExpiry: number = 0;

// Configuration
// This config is for the ADMIN's Orange Money wallet (the merchant/event organizer)
const config: OrangeMoneyConfig = {
  baseUrl: 'https://api.sandbox.orange-sonatel.com',
  idType: process.env.OM_ID_TYPE || 'MSISDN',
  id: process.env.ADMIN_OM_ID || '', // Admin's OM wallet ID
  encryptedPinCode: process.env.OM_ENCRYPTED_PIN_CODE || '', // Admin's encrypted PIN
  wallet: process.env.OM_WALLET || 'PRINCIPAL' // Admin's wallet type
};

/**
 * Get authentication token for Orange Money API
 */
async function getAuthToken(): Promise<string> {
  // Check if we have a valid token
  if (accessToken && Date.now() < tokenExpiry) {
    return accessToken;
  }

  try {
    // Create form data for x-www-form-urlencoded format
    const formData = new URLSearchParams();
    formData.append('grant_type', 'client_credentials');
    formData.append('client_id', process.env.OM_CLIENT_ID || '');
    formData.append('client_secret', process.env.OM_CLIENT_SECRET || '');

    const response = await fetch(`${config.baseUrl}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData
    });

    if (!response.ok) {
      throw new Error(`Authentication failed: ${response.status} ${response.statusText}`);
    }

    const authData: OrangeMoneyAuthResponse = await response.json();

    accessToken = authData.access_token;
    // Set expiry to 5 minutes before actual expiry to be safe
    tokenExpiry = Date.now() + (authData.expires_in - 300) * 1000;

    return accessToken;
  } catch (error) {
    console.error('❌ Orange Money authentication error:', error);
    throw new Error('Failed to authenticate with Orange Money API');
  }
}

/**
 * Get public keys for encryption
 */
export async function getPublicKeys(): Promise<OrangeMoneyPublicKeyResponse> {
  try {
    const token = await getAuthToken();

    const response = await fetch(`${config.baseUrl}/api/account/v1/publicKeys`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to get public keys: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('❌ Error getting public keys:', error);
    throw error;
  }
}

/**
 * Process cash-in transaction for event purchase
 * 
 * Flow:
 * - Admin's OM wallet (config) acts as the merchant/partner
 * - Buyer's phone number (purchaseRequest.customerPhone) is the customer
 * - Money flows from buyer's phone to admin's wallet
 */
export async function processEventPurchase(
  purchaseRequest: EventPurchaseRequest
): Promise<OrangeMoneyCashInResponse> {
  try {
    // Validate input
    if (!purchaseRequest.customerPhone || !purchaseRequest.amount || !purchaseRequest.eventId) {
      throw new Error('Missing required fields: customerPhone, amount, and eventId are required');
    }

    if (purchaseRequest.amount <= 0) {
      throw new Error('Amount must be greater than 0');
    }

    // Validate phone number format (basic validation for Senegal)
    const phoneRegex = /^(77|76|70|75|78)\d{7}$/;
    if (!phoneRegex.test(purchaseRequest.customerPhone)) {
      throw new Error('Invalid phone number format. Must be a valid Senegal mobile number');
    }

    const token = await getAuthToken();

    // Generate unique reference for this transaction
    const reference = `EVENT_${purchaseRequest.eventId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const cashInRequest: OrangeMoneyCashInRequest = {
      partner: {
        idType: config.idType,
        id: config.id, // Admin's OM wallet ID
        encryptedPinCode: config.encryptedPinCode // Admin's encrypted PIN
      },
      customer: {
        idType: 'MSISDN',
        id: purchaseRequest.customerPhone // Buyer's phone number (from the purchase request)
      },
      amount: {
        value: purchaseRequest.amount,
        unit: 'XOF'
      },
      reference: reference,
      receiveNotification: true
    };

    console.log(`🔄 Processing event purchase for ${purchaseRequest.customerPhone} - Amount: ${purchaseRequest.amount} XOF - Event: ${purchaseRequest.eventName}`);
 
    console.log("cashInRequest =====", cashInRequest);
    const response = await fetch(`${config.baseUrl}/api/eWallet/v1/cashins`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(cashInRequest)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Cash-in failed for ${purchaseRequest.customerPhone}:`, errorText);
      throw new Error(`Cash-in failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const result = await response.json();

    console.log(`✅ Event purchase successful for ${purchaseRequest.customerPhone} - Transaction ID: ${result.transactionId}`);

    return result;
  } catch (error) {
    console.error('❌ Error processing event purchase:', error);
    throw error;
  }
}

/**
 * Process cash-in transaction (legacy function)
 */
export async function processCashIn(
  customerId: string,
  amount: number,
  reference?: string
): Promise<OrangeMoneyCashInResponse> {
  try {
    const token = await getAuthToken();

    const cashInRequest: OrangeMoneyCashInRequest = {
      partner: {
        idType: config.idType,
        id: config.id,
        encryptedPinCode: config.encryptedPinCode
      },
      customer: {
        idType: config.idType,
        id: customerId
      },
      amount: {
        value: amount,
        unit: 'XOF'
      },
      reference: reference || `REF_${Date.now()}`,
      receiveNotification: false
    };

    const response = await fetch(`${config.baseUrl}/api/eWallet/v1/cashins`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(cashInRequest)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Cash-in failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('❌ Error processing cash-in:', error);
    throw error;
  }
}

/**
 * Check transaction status
 */
export async function checkTransactionStatus(transactionId: string): Promise<any> {
  try {
    const token = await getAuthToken();

    const response = await fetch(`${config.baseUrl}/api/eWallet/v1/transactions/${transactionId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to check transaction status: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('❌ Error checking transaction status:', error);
    throw error;
  }
}

/**
 * Get customer balance
 */
export async function getCustomerBalance(phoneNumber: string): Promise<any> {
  try {
    const token = await getAuthToken();

    const response = await fetch(`${config.baseUrl}/api/eWallet/v1/account/retailer/balance`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        "idType": "MSISDN",
        "id": phoneNumber,
        "encryptedPinCode": config.encryptedPinCode,
        "wallet" : config.wallet
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to get customer balance: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('❌ Error getting customer balance:', error);
    throw error;
  }
}

/**
 * Check if Orange Money is properly configured
 */
export function isConfigured(): boolean {
  return !!(config.id && config.encryptedPinCode);
}

/**
 * Get configuration status
 */
export function getConfigStatus(): { configured: boolean; missing: string[] } {
  const missing: string[] = [];

  if (!config.id) missing.push('OM_ID');
  if (!config.encryptedPinCode) missing.push('OM_ENCRYPTED_PIN_CODE');

  return {
    configured: missing.length === 0,
    missing
  };
}

export type {
  OrangeMoneyCashInResponse,
  OrangeMoneyPublicKeyResponse,
  EventPurchaseRequest
};
