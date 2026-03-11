/**
 * Xì Dách Score Tracker - LocalStorage Service
 * Handles persistence and score calculations
 */

import {
  XiDachSession,
  XiDachPlayer,
  XiDachPlayerResult,
  XiDachSettings,
  XiDachSettlement,
  XiDachStorageData,
  DEFAULT_XI_DACH_SETTINGS,
} from '../types/xi-dach-score.types';

// ============== CONSTANTS ==============

const STORAGE_KEY = 'xi-dach-sessions';
const STORAGE_VERSION = 1;
const MAX_SESSIONS = 50; // Maximum sessions to keep in localStorage
const SESSION_TTL_DAYS = 90; // Auto-delete sessions older than 90 days
const MAX_MATCHES_PER_SESSION = 100; // Limit matches per session to prevent memory issues

// ============== HELPERS ==============

/**
 * Generate unique ID
 */
export const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Get current ISO timestamp
 */
export const getTimestamp = (): string => {
  return new Date().toISOString();
};

/**
 * Prune matches within a session: keep only MAX_MATCHES_PER_SESSION most recent
 * Archives older matches to prevent memory exhaustion
 */
const pruneMatches = (session: XiDachSession): XiDachSession => {
  if (session.matches.length <= MAX_MATCHES_PER_SESSION) {
    return session;
  }

  // Keep only the most recent matches
  const prunedMatches = session.matches.slice(-MAX_MATCHES_PER_SESSION);

  console.warn(
    `[XiDachStorage] Pruned ${session.matches.length - MAX_MATCHES_PER_SESSION} old matches from session ${session.id}`
  );

  return {
    ...session,
    matches: prunedMatches,
  };
};

/**
 * Prune sessions: remove expired and keep only MAX_SESSIONS most recent
 * - Removes sessions older than SESSION_TTL_DAYS
 * - Keeps only MAX_SESSIONS most recently updated sessions
 */
const pruneSessions = (sessions: XiDachSession[]): XiDachSession[] => {
  const now = Date.now();
  const ttlMs = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;

  // 1. Remove expired sessions (older than TTL)
  const validSessions = sessions.filter((session) => {
    const updatedAt = new Date(session.updatedAt).getTime();
    return now - updatedAt < ttlMs;
  });

  // 2. Sort by updatedAt (most recent first)
  const sorted = validSessions.sort((a, b) =>
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  // 3. Keep only MAX_SESSIONS most recent
  return sorted.slice(0, MAX_SESSIONS);
};

// ============== STORAGE CRUD ==============

/**
 * Get all sessions from localStorage
 */
export const getAllSessions = (): XiDachSession[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];

    const parsed: XiDachStorageData = JSON.parse(data);

    // Version check - can add migration logic here if needed
    if (parsed.version !== STORAGE_VERSION) {
      console.warn('[XiDachStorage] Version mismatch, may need migration');
    }

    return parsed.sessions || [];
  } catch (error) {
    console.error('[XiDachStorage] Error reading sessions:', error);
    return [];
  }
};

/**
 * Get single session by ID
 */
export const getSession = (id: string): XiDachSession | null => {
  const sessions = getAllSessions();
  return sessions.find((s) => s.id === id) || null;
};

/**
 * Save session (create or update)
 * Automatically prunes old/expired sessions and matches before saving
 */
export const saveSession = (session: XiDachSession): void => {
  try {
    let sessions = getAllSessions();
    const index = sessions.findIndex((s) => s.id === session.id);

    // Update timestamp
    session.updatedAt = getTimestamp();

    // Prune matches within session to prevent memory issues
    const prunedSession = pruneMatches(session);

    if (index >= 0) {
      sessions[index] = prunedSession;
    } else {
      sessions.push(prunedSession);
    }

    // Prune old/expired sessions before saving
    sessions = pruneSessions(sessions);

    const data: XiDachStorageData = {
      version: STORAGE_VERSION,
      sessions,
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('[XiDachStorage] Error saving session:', error);
    throw error;
  }
};

/**
 * Delete session by ID
 */
export const deleteSession = (id: string): void => {
  try {
    const sessions = getAllSessions().filter((s) => s.id !== id);

    const data: XiDachStorageData = {
      version: STORAGE_VERSION,
      sessions,
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('[XiDachStorage] Error deleting session:', error);
    throw error;
  }
};

/**
 * Manually cleanup old sessions
 * Removes expired sessions and enforces MAX_SESSIONS limit
 * Can be called on app start or periodically
 */
export const cleanupSessions = (): { removed: number; remaining: number } => {
  try {
    const sessions = getAllSessions();
    const originalCount = sessions.length;

    const prunedSessions = pruneSessions(sessions);
    const removedCount = originalCount - prunedSessions.length;

    if (removedCount > 0) {
      const data: XiDachStorageData = {
        version: STORAGE_VERSION,
        sessions: prunedSessions,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }

    return { removed: removedCount, remaining: prunedSessions.length };
  } catch (error) {
    console.error('[XiDachStorage] Error during cleanup:', error);
    return { removed: 0, remaining: 0 };
  }
};

// ============== SESSION FACTORY ==============

/**
 * Options for creating a session
 */
interface CreateSessionOptions {
  sessionCode?: string;
  hasPassword?: boolean;
}

/**
 * Create new session with default values
 */
export const createSession = (
  name: string,
  settings: Partial<XiDachSettings> = {},
  options: CreateSessionOptions = {}
): XiDachSession => {
  const now = getTimestamp();

  return {
    id: generateId(),
    sessionCode: options.sessionCode,
    hasPassword: options.hasPassword,
    name: name.trim() || 'Bàn mới',
    players: [],
    matches: [],
    currentDealerId: null,
    settings: { ...DEFAULT_XI_DACH_SETTINGS, ...settings },
    status: 'setup',
    createdAt: now,
    updatedAt: now,
  };
};

/**
 * Create new player
 */
export const createPlayer = (name: string, baseScore: number = 0, betAmount?: number): XiDachPlayer => {
  return {
    id: generateId(),
    name: name.trim(),
    baseScore,
    currentScore: baseScore,
    betAmount,
    isActive: true,
    createdAt: getTimestamp(),
  };
};

// ============== SCORE CALCULATION ==============

/**
 * Calculate effective tu count including multipliers
 * Formula: tuCount + xiBanCount + nguLinhCount
 * (xiBan and nguLinh each add ×2, so effectively tuCount - xiBan - nguLinh + xiBan×2 + nguLinh×2)
 */
const calculateEffectiveTu = (tuCount: number, xiBanCount: number, nguLinhCount: number): number => {
  return tuCount + xiBanCount + nguLinhCount;
};

/**
 * Calculate score change for a player result
 * New formula with separate win/lose:
 * - winScore = (winTuCount + winXiBanCount + winNguLinhCount) × pointsPerTu
 * - loseScore = (loseTuCount + loseXiBanCount + loseNguLinhCount) × pointsPerTu
 * - score = winScore - loseScore - penalty28
 */
export const calculateScoreChange = (
  result: Omit<XiDachPlayerResult, 'scoreChange'>,
  settings: XiDachSettings,
  playerBetAmount?: number // Individual player's point rate (overrides settings.pointsPerTu)
): number => {
  // Use player's point rate if provided, otherwise use session's default
  const pointsPerTu = playerBetAmount ?? settings.pointsPerTu;

  // Handle legacy data format (old format with single tuCount and outcome)
  if (result.tuCount !== undefined && result.outcome !== undefined) {
    const totalMultipliedTu = result.tuCount + (result.xiBanCount || 0) + (result.nguLinhCount || 0);
    let score = totalMultipliedTu * pointsPerTu;
    if (result.outcome === 'lose') {
      score = -score;
    }
    // Apply penalty 28
    if (result.penalty28 && result.penalty28Recipients.length > 0) {
      const betAmount = totalMultipliedTu * pointsPerTu;
      const penaltyPerRecipient = settings.penalty28Enabled
        ? settings.penalty28Amount
        : betAmount;
      score -= penaltyPerRecipient * result.penalty28Recipients.length;
    }
    return score;
  }

  // New format with separate win/lose
  const winEffectiveTu = calculateEffectiveTu(
    result.winTuCount,
    result.winXiBanCount,
    result.winNguLinhCount
  );
  const loseEffectiveTu = calculateEffectiveTu(
    result.loseTuCount,
    result.loseXiBanCount,
    result.loseNguLinhCount
  );

  const winScore = winEffectiveTu * pointsPerTu;
  const loseScore = loseEffectiveTu * pointsPerTu;
  let score = winScore - loseScore;

  // Apply penalty 28 (based on lose amount)
  if (result.penalty28 && result.penalty28Recipients.length > 0) {
    const penaltyPerRecipient = settings.penalty28Enabled
      ? settings.penalty28Amount
      : loseScore; // Use lose point rate as penalty
    score -= penaltyPerRecipient * result.penalty28Recipients.length;
  }

  return score;
};

/**
 * Create player result with calculated score (new format with separate win/lose)
 */
export const createPlayerResult = (
  playerId: string,
  input: {
    winTuCount: number;
    winXiBanCount?: number;
    winNguLinhCount?: number;
    loseTuCount: number;
    loseXiBanCount?: number;
    loseNguLinhCount?: number;
    penalty28?: boolean;
    penalty28Recipients?: string[];
  },
  settings: XiDachSettings,
  playerBetAmount?: number // Individual player's point rate
): XiDachPlayerResult => {
  const result: Omit<XiDachPlayerResult, 'scoreChange'> = {
    playerId,
    winTuCount: input.winTuCount,
    winXiBanCount: input.winXiBanCount || 0,
    winNguLinhCount: input.winNguLinhCount || 0,
    loseTuCount: input.loseTuCount,
    loseXiBanCount: input.loseXiBanCount || 0,
    loseNguLinhCount: input.loseNguLinhCount || 0,
    penalty28: input.penalty28 || false,
    penalty28Recipients: input.penalty28Recipients || [],
  };

  return {
    ...result,
    scoreChange: calculateScoreChange(result, settings, playerBetAmount),
  };
};

// ============== SETTLEMENT CALCULATION ==============

/**
 * Calculate settlement (who pays whom)
 * Uses exact-match prioritization + greedy algorithm to minimize transactions
 */
export const calculateSettlement = (session: XiDachSession): XiDachSettlement[] => {
  const settlements: XiDachSettlement[] = [];
  // Include ALL players (even removed ones) - they still have match history
  const players = session.players;

  // Calculate net balance for each player (current - base)
  const balances = players.map((p) => ({
    id: p.id,
    balance: p.currentScore - p.baseScore,
  }));

  // Separate winners (positive) and losers (negative)
  const winners = balances
    .filter((b) => b.balance > 0)
    .map((b) => ({ ...b }));

  const losers = balances
    .filter((b) => b.balance < 0)
    .map((b) => ({ ...b, balance: Math.abs(b.balance) }));

  // Step 1: Exact match — prioritize pairs with equal amounts to minimize transactions
  for (let li = 0; li < losers.length; li++) {
    if (losers[li].balance === 0) continue;
    for (let wi = 0; wi < winners.length; wi++) {
      if (winners[wi].balance === 0) continue;
      if (losers[li].balance === winners[wi].balance) {
        settlements.push({
          fromPlayerId: losers[li].id,
          toPlayerId: winners[wi].id,
          amount: losers[li].balance,
        });
        losers[li].balance = 0;
        winners[wi].balance = 0;
        break;
      }
    }
  }

  // Step 2: Greedy matching for remaining balances
  const remainingLosers = losers
    .filter((l) => l.balance > 0)
    .sort((a, b) => b.balance - a.balance);
  const remainingWinners = winners
    .filter((w) => w.balance > 0)
    .sort((a, b) => b.balance - a.balance);

  let i = 0;
  let j = 0;

  while (i < remainingLosers.length && j < remainingWinners.length) {
    const amount = Math.min(remainingLosers[i].balance, remainingWinners[j].balance);

    if (amount > 0) {
      settlements.push({
        fromPlayerId: remainingLosers[i].id,
        toPlayerId: remainingWinners[j].id,
        amount,
      });
    }

    remainingLosers[i].balance -= amount;
    remainingWinners[j].balance -= amount;

    if (remainingLosers[i].balance === 0) i++;
    if (remainingWinners[j].balance === 0) j++;
  }

  return settlements;
};

// ============== PLAYER SCORE RECALCULATION ==============

/**
 * Recalculate all player current scores from matches
 */
export const recalculatePlayerScores = (session: XiDachSession): XiDachSession => {
  // Reset to base scores
  const updatedPlayers = session.players.map((p) => ({
    ...p,
    currentScore: p.baseScore,
  }));

  // Apply all match results
  for (const match of session.matches) {
    for (const result of match.results) {
      const player = updatedPlayers.find((p) => p.id === result.playerId);
      if (player) {
        player.currentScore += result.scoreChange;
      }

      // Handle penalty 28 recipients (they receive the penalty amount)
      if (result.penalty28 && result.penalty28Recipients.length > 0) {
        // Get the penalized player's point rate (or session default)
        const penalizedPlayer = session.players.find((p) => p.id === result.playerId);
        const playerBetAmount = penalizedPlayer?.betAmount ?? session.settings.pointsPerTu;

        // Calculate penalty per recipient based on settings
        // For new format: use lose amount; for legacy: use tuCount
        let betAmount: number;
        if (result.loseTuCount !== undefined) {
          // New format - use player's individual point rate
          betAmount = (result.loseTuCount + (result.loseXiBanCount || 0) + (result.loseNguLinhCount || 0)) * playerBetAmount;
        } else {
          // Legacy format
          betAmount = ((result.tuCount || 0) + (result.xiBanCount || 0) + (result.nguLinhCount || 0)) * playerBetAmount;
        }
        const amountPerRecipient = session.settings.penalty28Enabled
          ? session.settings.penalty28Amount
          : betAmount;

        for (const recipientId of result.penalty28Recipients) {
          const recipient = updatedPlayers.find((p) => p.id === recipientId);
          if (recipient) {
            recipient.currentScore += amountPerRecipient;
          }
        }
      }
    }
  }

  return {
    ...session,
    players: updatedPlayers,
  };
};

// ============== AUTO-ROTATE DEALER ==============

/**
 * Check if dealer should auto-rotate
 */
export const shouldAutoRotateDealer = (session: XiDachSession): boolean => {
  if (!session.settings.autoRotateDealer) return false;
  if (session.matches.length === 0) return false;

  return session.matches.length % session.settings.autoRotateAfter === 0;
};

/**
 * Get next dealer ID (round-robin)
 */
export const getNextDealerId = (session: XiDachSession): string | null => {
  const activePlayers = session.players.filter((p) => p.isActive);
  if (activePlayers.length === 0) return null;

  if (!session.currentDealerId) {
    return activePlayers[0].id;
  }

  const currentIndex = activePlayers.findIndex((p) => p.id === session.currentDealerId);
  const nextIndex = (currentIndex + 1) % activePlayers.length;

  return activePlayers[nextIndex].id;
};
