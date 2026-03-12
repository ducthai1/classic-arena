/**
 * Xì Dách Score Tracker - TypeScript Types
 * Used for tracking scores in Vietnamese Blackjack card games
 */

// ============== PLAYER ==============

export interface XiDachPlayer {
  id: string;
  name: string;
  baseScore: number;      // Starting score (can be edited)
  currentScore: number;   // Calculated from baseScore + all match results
  betAmount?: number;     // Individual point rate per hand (optional, uses session's pointsPerTu if not set)
  isActive: boolean;      // False if player left mid-game
  createdAt: string;      // ISO string
}

// ============== MATCH RESULT ==============

export interface XiDachPlayerResult {
  playerId: string;
  // Win side
  winTuCount: number;                 // Number of hands won
  winXiBanCount: number;              // Number of xì bàn in wins (×2 each)
  winNguLinhCount: number;            // Number of ngũ linh in wins (×2 each)
  // Lose side
  loseTuCount: number;                // Number of hands lost
  loseXiBanCount: number;             // Number of xì bàn in losses (×2 each)
  loseNguLinhCount: number;           // Number of ngũ linh in losses (×2 each)
  // Penalty
  penalty28: boolean;                 // Has to pay penalty for >28 points
  penalty28Recipients: string[];      // Player IDs who receive penalty
  // Calculated
  scoreChange: number;                // Final calculated score change

  // Legacy fields (for backwards compatibility with old data)
  /** @deprecated Use winTuCount/loseTuCount instead */
  tuCount?: number;
  /** @deprecated Calculated from result */
  outcome?: 'win' | 'lose';
  /** @deprecated Use winXiBanCount/loseXiBanCount instead */
  xiBanCount?: number;
  /** @deprecated Use winNguLinhCount/loseNguLinhCount instead */
  nguLinhCount?: number;
}

// ============== MATCH ==============

export interface XiDachMatch {
  id: string;
  matchNumber: number;
  dealerId: string;                   // Dealer for this match
  results: XiDachPlayerResult[];
  timestamp: string;                  // ISO string
  durationMs?: number;                // Duration in milliseconds
  editedAt?: string;                  // ISO string if edited
}

// ============== SETTINGS ==============

export interface XiDachSettings {
  pointsPerTu: number;                // Points per hand (e.g., 10)
  penalty28Enabled: boolean;          // Enable fixed penalty 28 amount
  penalty28Amount: number;            // Penalty amount for >28 (e.g., 50) - only used if penalty28Enabled
  autoRotateDealer: boolean;          // Auto-rotate dealer after N matches
  autoRotateAfter: number;            // Number of matches before rotation
}

export const DEFAULT_XI_DACH_SETTINGS: XiDachSettings = {
  pointsPerTu: 10,
  penalty28Enabled: false,            // Default: penalty uses player's point rate
  penalty28Amount: 50,
  autoRotateDealer: false,
  autoRotateAfter: 1,
};

// ============== SESSION ==============

export type XiDachSessionStatus = 'setup' | 'playing' | 'paused' | 'ended';

export interface XiDachSession {
  id: string;
  sessionCode?: string;               // 6-char code for multiplayer sharing
  name: string;
  hasPassword?: boolean;              // Whether session requires password
  players: XiDachPlayer[];
  matches: XiDachMatch[];
  currentDealerId: string | null;
  settings: XiDachSettings;
  status: XiDachSessionStatus;
  version?: number;                   // Optimistic locking version
  createdAt: string;                  // ISO string
  startedAt?: string;                 // ISO string
  endedAt?: string;                   // ISO string
  updatedAt: string;                  // ISO string
}

// ============== SETTLEMENT ==============

export interface XiDachSettlement {
  fromPlayerId: string;
  toPlayerId: string;
  amount: number;
}

// ============== STORAGE ==============

export interface XiDachStorageData {
  version: number;
  sessions: XiDachSession[];
}
