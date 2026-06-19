export interface DeviceTelemetry {
  deviceId: string;
  timestamp: number;
  metrics: {
    powerUsage: number;
    signalStrength: number;
    temperature: number;
    batteryLevel: number;
  };
  location?: {
    lat: number;
    lng: number;
  };
  metadata?: Record<string, string>;
}

export interface Transaction {
  hash: string;
  type: 'escrow_deposit' | 'escrow_withdrawal' | 'device_registration' | 'billing_payment';
  status: 'pending' | 'confirmed' | 'failed' | 'retrying';
  amount: string;
  asset: string;
  source: string;
  destination: string;
  timestamp: number;
  memo?: string;
  signature?: string;
  ledger?: number;
}

export interface WalletMetrics {
  publicKey: string;
  balances: AssetBalance[];
  network: 'testnet' | 'mainnet' | 'futurenet';
  isConnected: boolean;
  chainId?: string;
}

export interface AssetBalance {
  asset: string;
  issuer?: string;
  balance: string;
  decimals: number;
}

export interface EscrowBalance {
  totalLocked: string;
  available: string;
  pendingRelease: string;
  asset: string;
  contractId: string;
}

export interface FleetView {
  fleetId: string;
  name: string;
  deviceCount: number;
  activeCount: number;
  totalPowerOutput: number;
  status: 'active' | 'inactive' | 'degraded';
}

export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  pageSize: number;
  totalCount: number;
  hasNextPage: boolean;
}

export interface TelemetryHistoryPoint {
  timestamp: number;
  value: number;
  deviceId?: string;
}

export interface ProcessedHistoryChunk {
  averages: number[];
  totals: number[];
  timestamps: number[];
  startTime: number;
  endTime: number;
}

export interface ChunkedHistoryState {
  data: TelemetryHistoryPoint[];
  isLoading: boolean;
  progress: number;
  error: Error | null;
}

export interface Web3AuthSession {
  nonce: string;
  signedChallenge: string;
  jwt: string;
  expiresAt: number;
  publicKey: string;
}

export interface SorobanEvent {
  contractId: string;
  topic: string;
  data: string;
  ledger: number;
  timestamp: number;
  decoded?: Record<string, unknown>;
}
