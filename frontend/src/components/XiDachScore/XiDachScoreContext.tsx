/**
 * Xì Dách Score Tracker - Context Provider
 * Manages state and actions for the score tracker
 * All sessions are online (API) - no localStorage persistence
 */

import React, { createContext, useContext, useReducer, useCallback, useEffect, useState, useMemo, useRef } from 'react';
import {
  XiDachSession,
  XiDachPlayer,
  XiDachMatch,
  XiDachPlayerResult,
  DEFAULT_XI_DACH_SETTINGS,
} from '../../types/xi-dach-score.types';
import {
  createPlayer,
  generateId,
  getTimestamp,
  recalculatePlayerScores,
  shouldAutoRotateDealer,
  getNextDealerId,
} from '../../utils/xi-dach-score-storage';
import { xiDachApi, XiDachSessionResponse } from '../../services/api';
import { getToast } from '../../contexts/ToastContext';

// ============== TYPES ==============

type ViewMode = 'list' | 'setup' | 'playing' | 'history' | 'summary';

interface XiDachState {
  sessions: XiDachSession[];
  currentSessionId: string | null;
  viewMode: ViewMode;
  loading: boolean;
  error: string | null;
}

type XiDachAction =
  | { type: 'SET_SESSIONS'; payload: XiDachSession[] }
  | { type: 'SET_CURRENT_SESSION'; payload: string | null }
  | { type: 'SET_VIEW_MODE'; payload: ViewMode }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'UPDATE_SESSION'; payload: XiDachSession }
  | { type: 'ADD_SESSION'; payload: XiDachSession }
  | { type: 'DELETE_SESSION'; payload: string };

// Pending dealer rotation info
interface PendingDealerRotation {
  suggestedDealerId: string;
  suggestedDealerName: string;
}

interface XiDachContextValue extends XiDachState {
  currentSession: XiDachSession | null;
  // Pending dealer rotation
  pendingDealerRotation: PendingDealerRotation | null;
  confirmDealerRotation: () => void;
  cancelDealerRotation: () => void;
  changePendingDealer: (playerId: string) => void;
  // Navigation
  goToList: () => void;
  goToSetup: () => void;
  goToPlaying: (sessionId: string) => void;
  goToHistory: () => void;
  goToSummary: () => void;
  // Session CRUD
  setSessionFromApi: (apiResponse: XiDachSessionResponse) => void;
  deleteSession: (id: string) => void;
  updateCurrentSession: (updates: Partial<XiDachSession>) => void;
  // Player management
  addPlayer: (name: string, baseScore?: number, betAmount?: number) => void;
  removePlayer: (playerId: string) => void;
  updatePlayer: (playerId: string, updates: Partial<XiDachPlayer>) => void;
  setDealer: (playerId: string) => void;
  // Game actions
  startGame: () => void;
  pauseGame: () => void;
  resumeGame: () => void;
  endGame: () => void;
  addMatch: (results: XiDachPlayerResult[]) => void;
  editMatch: (matchId: string, results: XiDachPlayerResult[]) => void;
  deleteLastMatch: () => void;
}

// ============== HELPERS ==============

/** Convert API response to XiDachSession format (use sessionCode as id) */
const apiResponseToSession = (r: XiDachSessionResponse): XiDachSession => ({
  id: r.sessionCode,
  sessionCode: r.sessionCode,
  name: r.name,
  hasPassword: r.hasPassword,
  players: (r.players || []) as XiDachPlayer[],
  matches: (r.matches || []).map((m: any) => ({
    id: m.id,
    matchNumber: m.matchNumber,
    dealerId: m.dealerId,
    results: m.results || [],
    timestamp: m.timestamp || m.createdAt,
    editedAt: m.editedAt,
  })) as XiDachMatch[],
  currentDealerId: r.currentDealerId,
  settings: { ...DEFAULT_XI_DACH_SETTINGS, ...(r.settings || {}) },
  status: r.status,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

// ============== CONSTANTS ==============

const CURRENT_SESSION_KEY = 'xi-dach-current-session';

// ============== INITIAL STATE ==============

// Try to restore currentSessionId from localStorage
const getSavedSessionId = (): string | null => {
  try {
    return localStorage.getItem(CURRENT_SESSION_KEY);
  } catch {
    return null;
  }
};

const initialState: XiDachState = {
  sessions: [],
  currentSessionId: getSavedSessionId(),
  viewMode: getSavedSessionId() ? 'playing' : 'list',
  loading: false,
  error: null,
};

// ============== REDUCER ==============

function xiDachReducer(state: XiDachState, action: XiDachAction): XiDachState {
  switch (action.type) {
    case 'SET_SESSIONS':
      return { ...state, sessions: action.payload };
    case 'SET_CURRENT_SESSION':
      return { ...state, currentSessionId: action.payload };
    case 'SET_VIEW_MODE':
      return { ...state, viewMode: action.payload };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'UPDATE_SESSION':
      return {
        ...state,
        sessions: state.sessions.map((s) =>
          s.id === action.payload.id ? action.payload : s
        ),
      };
    case 'ADD_SESSION':
      return {
        ...state,
        sessions: [...state.sessions, action.payload],
      };
    case 'DELETE_SESSION':
      return {
        ...state,
        sessions: state.sessions.filter((s) => s.id !== action.payload),
        currentSessionId:
          state.currentSessionId === action.payload ? null : state.currentSessionId,
      };
    default:
      return state;
  }
}

// ============== CONTEXT ==============

const XiDachContext = createContext<XiDachContextValue | null>(null);

// ============== PROVIDER ==============

// Debounce delay for localStorage writes (ms)
const SAVE_DEBOUNCE_MS = 300;

export const XiDachScoreProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [state, dispatch] = useReducer(xiDachReducer, initialState);
  const [pendingDealerRotation, setPendingDealerRotation] = useState<PendingDealerRotation | null>(null);

  // Refs for serialized save queue — prevents race conditions where
  // out-of-order HTTP responses overwrite newer data with stale data
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const latestSessionRef = useRef<XiDachSession | null>(null);

  // Retry wrapper for critical saves — retries on failure with backoff
  const saveWithRetry = useCallback(async (
    sessionCode: string,
    data: any,
    expectedMatchCount: number | null,
    maxRetries = 2,
  ): Promise<void> => {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await xiDachApi.updateSession(sessionCode, data);
        // Verify server saved all matches (only when sending full session)
        if (expectedMatchCount !== null && response.matches) {
          const serverCount = response.matches.length;
          if (serverCount < expectedMatchCount) {
            console.warn(`[XiDach] Server returned ${serverCount} matches, sent ${expectedMatchCount}. Retrying...`);
            if (attempt < maxRetries) continue;
            // Final attempt still wrong — notify user
            getToast()?.error('toast.matchSaveFailed');
          }
        }
        return; // Success
      } catch (error) {
        console.error(`[XiDach] Save attempt ${attempt + 1}/${maxRetries + 1} failed:`, error);
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
        } else {
          throw error; // All retries exhausted
        }
      }
    }
  }, []);

  // Enqueue a save — ensures saves execute sequentially (FIFO)
  const enqueueSave = useCallback((
    sessionCode: string,
    data: any,
    isCritical: boolean,
    expectedMatchCount: number | null = null,
  ) => {
    saveQueueRef.current = saveQueueRef.current
      .then(() =>
        isCritical
          ? saveWithRetry(sessionCode, data, expectedMatchCount)
          : xiDachApi.updateSession(sessionCode, data).then(() => {})
      )
      .catch((error) => {
        console.error('[XiDach] Save failed after retries:', error);
        if (isCritical) {
          getToast()?.error('toast.matchSaveFailed');
        }
      });
  }, [saveWithRetry]);

  // Debounced save for non-critical updates (settings, players, dealer)
  // Only sends non-match fields to avoid overwriting match data
  const debouncedSave = useCallback((session: XiDachSession) => {
    if (!session.sessionCode) return;
    latestSessionRef.current = session;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      const latest = latestSessionRef.current;
      if (latest?.sessionCode) {
        // Send only non-match fields — prevents stale match overwrites
        enqueueSave(latest.sessionCode, {
          name: latest.name,
          players: latest.players,
          currentDealerId: latest.currentDealerId,
          settings: latest.settings,
        }, false);
        latestSessionRef.current = null;
      }
    }, SAVE_DEBOUNCE_MS);
  }, [enqueueSave]);

  // Immediate save for critical operations (match add/edit/delete)
  // Sends full session with retry + server verification
  const immediateSave = useCallback((session: XiDachSession) => {
    if (!session.sessionCode) return;
    // Cancel any pending debounced save — immediateSave includes all data
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    latestSessionRef.current = null;
    enqueueSave(session.sessionCode, session, true, session.matches.length);
  }, [enqueueSave]);

  // Lightweight save for status-only updates
  const saveStatusOnly = useCallback((session: XiDachSession) => {
    if (!session.sessionCode) return;
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    latestSessionRef.current = null;
    enqueueSave(session.sessionCode, { status: session.status }, false);
  }, [enqueueSave]);

  // Flush pending saves on unmount
  useEffect(() => () => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    const latest = latestSessionRef.current;
    if (latest?.sessionCode) {
      xiDachApi.updateSession(latest.sessionCode, latest).catch(() => {});
    }
  }, []);

  // Persist currentSessionId to localStorage
  useEffect(() => {
    try {
      if (state.currentSessionId) {
        localStorage.setItem(CURRENT_SESSION_KEY, state.currentSessionId);
      } else {
        localStorage.removeItem(CURRENT_SESSION_KEY);
      }
    } catch {
      // Ignore localStorage errors
    }
  }, [state.currentSessionId]);

  // Auto-fetch session on reload (when we have sessionId but no session data)
  const initialSessionId = useRef(state.currentSessionId);
  useEffect(() => {
    const fetchSavedSession = async () => {
      const sessionId = initialSessionId.current;
      if (sessionId) {
        dispatch({ type: 'SET_LOADING', payload: true });
        try {
          const response = await xiDachApi.getSession(sessionId);
          const session = apiResponseToSession(response);
          dispatch({ type: 'ADD_SESSION', payload: session });
          dispatch({ type: 'SET_VIEW_MODE', payload: session.status === 'ended' ? 'summary' : 'playing' });
        } catch (err) {
          getToast()?.error('toast.restoreFailed');
          // Clear invalid session
          dispatch({ type: 'SET_CURRENT_SESSION', payload: null });
          dispatch({ type: 'SET_VIEW_MODE', payload: 'list' });
        } finally {
          dispatch({ type: 'SET_LOADING', payload: false });
        }
      }
    };
    fetchSavedSession();
  }, []); // Only run on mount - uses ref to avoid dependency

  // Computed current session
  const currentSession = state.currentSessionId
    ? state.sessions.find((s) => s.id === state.currentSessionId) || null
    : null;

  // ============== NAVIGATION ==============

  const goToList = useCallback(() => {
    dispatch({ type: 'SET_CURRENT_SESSION', payload: null });
    dispatch({ type: 'SET_VIEW_MODE', payload: 'list' });
  }, []);

  const goToSetup = useCallback(() => {
    dispatch({ type: 'SET_VIEW_MODE', payload: 'setup' });
  }, []);

  const goToPlaying = useCallback((sessionId: string) => {
    dispatch({ type: 'SET_CURRENT_SESSION', payload: sessionId });
    const session = state.sessions.find((s) => s.id === sessionId);
    dispatch({ type: 'SET_VIEW_MODE', payload: session?.status === 'ended' ? 'summary' : 'playing' });
  }, [state.sessions]);

  const goToHistory = useCallback(() => {
    dispatch({ type: 'SET_VIEW_MODE', payload: 'history' });
  }, []);

  const goToSummary = useCallback(() => {
    dispatch({ type: 'SET_VIEW_MODE', payload: 'summary' });
  }, []);

  // ============== SESSION CRUD ==============

  const setSessionFromApi = useCallback((apiResponse: XiDachSessionResponse) => {
    const session = apiResponseToSession(apiResponse);
    dispatch({ type: 'ADD_SESSION', payload: session });
    dispatch({ type: 'SET_CURRENT_SESSION', payload: session.id });
    dispatch({ type: 'SET_VIEW_MODE', payload: session.status === 'ended' ? 'summary' : 'playing' });
  }, []);

  const deleteSessionAction = useCallback(async (id: string) => {
    const session = state.sessions.find((s) => s.id === id);
    if (session?.sessionCode) {
      try {
        await xiDachApi.deleteSession(session.sessionCode);
        getToast()?.success('toast.sessionDeleted');
      } catch (e) {
        getToast()?.error('toast.sessionDeleteFailed');
        return; // Don't remove from local state if API delete failed
      }
    }
    dispatch({ type: 'DELETE_SESSION', payload: id });
  }, [state.sessions]);

  const updateCurrentSession = useCallback(
    (updates: Partial<XiDachSession>) => {
      if (!currentSession) return;

      const updated = {
        ...currentSession,
        ...updates,
        updatedAt: getTimestamp(),
      };
      debouncedSave(updated); // Use debounced save for settings updates
      dispatch({ type: 'UPDATE_SESSION', payload: updated });
    },
    [currentSession, debouncedSave]
  );

  // ============== PLAYER MANAGEMENT ==============

  const addPlayer = useCallback(
    (name: string, baseScore: number = 0, betAmount?: number) => {
      if (!currentSession) return;

      const player = createPlayer(name, baseScore, betAmount);
      const updated = {
        ...currentSession,
        players: [...currentSession.players, player],
        updatedAt: getTimestamp(),
      };
      debouncedSave(updated); // Use debounced save for non-critical operation
      dispatch({ type: 'UPDATE_SESSION', payload: updated });
    },
    [currentSession, debouncedSave]
  );

  const removePlayer = useCallback(
    (playerId: string) => {
      if (!currentSession) return;

      const updated = {
        ...currentSession,
        players: currentSession.players.map((p) =>
          p.id === playerId ? { ...p, isActive: false } : p
        ),
        updatedAt: getTimestamp(),
      };
      debouncedSave(updated); // Use debounced save for non-critical operation
      dispatch({ type: 'UPDATE_SESSION', payload: updated });
    },
    [currentSession, debouncedSave]
  );

  const updatePlayer = useCallback(
    (playerId: string, updates: Partial<XiDachPlayer>) => {
      if (!currentSession) return;

      const updatedPlayers = currentSession.players.map((p) =>
        p.id === playerId ? { ...p, ...updates } : p
      );

      // Recalculate if baseScore changed
      let updated: XiDachSession = {
        ...currentSession,
        players: updatedPlayers,
        updatedAt: getTimestamp(),
      };

      if ('baseScore' in updates) {
        updated = recalculatePlayerScores(updated);
      }

      debouncedSave(updated); // Use debounced save for non-critical operation
      dispatch({ type: 'UPDATE_SESSION', payload: updated });
    },
    [currentSession, debouncedSave]
  );

  const setDealer = useCallback(
    (playerId: string) => {
      if (!currentSession) return;

      const updated = {
        ...currentSession,
        currentDealerId: playerId,
        updatedAt: getTimestamp(),
      };
      debouncedSave(updated); // Use debounced save for non-critical operation
      dispatch({ type: 'UPDATE_SESSION', payload: updated });
    },
    [currentSession, debouncedSave]
  );

  // ============== GAME ACTIONS ==============

  const startGame = useCallback(() => {
    if (!currentSession) return;
    if (currentSession.players.filter((p) => p.isActive).length < 2) {
      dispatch({ type: 'SET_ERROR', payload: 'Cần ít nhất 2 người chơi' });
      return;
    }

    const updated = {
      ...currentSession,
      status: 'playing' as const,
      updatedAt: getTimestamp(),
    };
    saveStatusOnly(updated); // Only send status change (lightweight)
    dispatch({ type: 'UPDATE_SESSION', payload: updated });
    getToast()?.success('toast.gameSessionStarted');
  }, [currentSession, saveStatusOnly]);

  const pauseGame = useCallback(() => {
    if (!currentSession) return;

    const updated = {
      ...currentSession,
      status: 'paused' as const,
      updatedAt: getTimestamp(),
    };
    saveStatusOnly(updated); // Only send status change (lightweight)
    dispatch({ type: 'UPDATE_SESSION', payload: updated });
  }, [currentSession, saveStatusOnly]);

  const resumeGame = useCallback(() => {
    if (!currentSession) return;

    const updated = {
      ...currentSession,
      status: 'playing' as const,
      updatedAt: getTimestamp(),
    };
    saveStatusOnly(updated); // Only send status change (lightweight)
    dispatch({ type: 'UPDATE_SESSION', payload: updated });
  }, [currentSession, saveStatusOnly]);

  const endGame = useCallback(() => {
    if (!currentSession) return;

    const updated = {
      ...currentSession,
      status: 'ended' as const,
      updatedAt: getTimestamp(),
    };
    saveStatusOnly(updated); // Only send status change (lightweight)
    dispatch({ type: 'UPDATE_SESSION', payload: updated });
  }, [currentSession, saveStatusOnly]);

  const addMatch = useCallback(
    (results: XiDachPlayerResult[]) => {
      if (!currentSession) return;

      const match: XiDachMatch = {
        id: generateId(),
        matchNumber: currentSession.matches.length + 1,
        dealerId: currentSession.currentDealerId || '',
        results,
        timestamp: getTimestamp(),
      };

      let updated: XiDachSession = {
        ...currentSession,
        matches: [...currentSession.matches, match],
        updatedAt: getTimestamp(),
      };

      // Recalculate scores
      updated = recalculatePlayerScores(updated);

      // Save session immediately (match data is critical — with retry + verification)
      immediateSave(updated);
      dispatch({ type: 'UPDATE_SESSION', payload: updated });

      // Check for auto-rotate dealer - show confirmation modal instead of auto-rotating
      if (shouldAutoRotateDealer(updated)) {
        const nextDealerId = getNextDealerId(updated);
        if (nextDealerId) {
          const nextDealer = updated.players.find(p => p.id === nextDealerId);
          if (nextDealer) {
            setPendingDealerRotation({
              suggestedDealerId: nextDealerId,
              suggestedDealerName: nextDealer.name,
            });
          }
        }
      }
    },
    [currentSession, immediateSave]
  );

  const editMatch = useCallback(
    (matchId: string, results: XiDachPlayerResult[]) => {
      if (!currentSession) return;

      const updatedMatches = currentSession.matches.map((m) =>
        m.id === matchId
          ? { ...m, results, editedAt: getTimestamp() }
          : m
      );

      let updated: XiDachSession = {
        ...currentSession,
        matches: updatedMatches,
        updatedAt: getTimestamp(),
      };

      // Recalculate all scores
      updated = recalculatePlayerScores(updated);

      immediateSave(updated); // Critical operation - save immediately
      dispatch({ type: 'UPDATE_SESSION', payload: updated });
    },
    [currentSession, immediateSave]
  );

  const deleteLastMatch = useCallback(() => {
    if (!currentSession || currentSession.matches.length === 0) return;

    const updatedMatches = currentSession.matches.slice(0, -1);

    let updated: XiDachSession = {
      ...currentSession,
      matches: updatedMatches,
      updatedAt: getTimestamp(),
    };

    // Recalculate all scores
    updated = recalculatePlayerScores(updated);

    immediateSave(updated); // Critical operation - save immediately
    dispatch({ type: 'UPDATE_SESSION', payload: updated });
  }, [currentSession, immediateSave]);

  // ============== DEALER ROTATION HANDLERS ==============

  const confirmDealerRotation = useCallback(() => {
    if (!currentSession || !pendingDealerRotation) return;

    const updated = {
      ...currentSession,
      currentDealerId: pendingDealerRotation.suggestedDealerId,
      updatedAt: getTimestamp(),
    };
    // Only send currentDealerId (lightweight, avoids sending large matches array)
    if (updated.sessionCode) {
      xiDachApi.updateSession(updated.sessionCode, { currentDealerId: updated.currentDealerId }).catch(console.error);
    }
    dispatch({ type: 'UPDATE_SESSION', payload: updated });
    setPendingDealerRotation(null);
  }, [currentSession, pendingDealerRotation]);

  const cancelDealerRotation = useCallback(() => {
    setPendingDealerRotation(null);
  }, []);

  const changePendingDealer = useCallback((playerId: string) => {
    if (!currentSession) return;
    const player = currentSession.players.find(p => p.id === playerId);
    if (player) {
      setPendingDealerRotation({
        suggestedDealerId: playerId,
        suggestedDealerName: player.name,
      });
    }
  }, [currentSession]);


  // ============== MEMOIZED VALUE ==============
  // Memoize context value to prevent unnecessary re-renders of consuming components

  const value = useMemo<XiDachContextValue>(() => ({
    ...state,
    currentSession,
    pendingDealerRotation,
    confirmDealerRotation,
    cancelDealerRotation,
    changePendingDealer,
    goToList,
    goToSetup,
    goToPlaying,
    goToHistory,
    goToSummary,
    setSessionFromApi,
    deleteSession: deleteSessionAction,
    updateCurrentSession,
    addPlayer,
    removePlayer,
    updatePlayer,
    setDealer,
    startGame,
    pauseGame,
    resumeGame,
    endGame,
    addMatch,
    editMatch,
    deleteLastMatch,
  }), [
    state,
    currentSession,
    pendingDealerRotation,
    confirmDealerRotation,
    cancelDealerRotation,
    changePendingDealer,
    goToList,
    goToSetup,
    goToPlaying,
    goToHistory,
    goToSummary,
    setSessionFromApi,
    deleteSessionAction,
    updateCurrentSession,
    addPlayer,
    removePlayer,
    updatePlayer,
    setDealer,
    startGame,
    pauseGame,
    resumeGame,
    endGame,
    addMatch,
    editMatch,
    deleteLastMatch,
  ]);

  return (
    <XiDachContext.Provider value={value}>{children}</XiDachContext.Provider>
  );
};

// ============== HOOK ==============

export const useXiDachScore = (): XiDachContextValue => {
  const context = useContext(XiDachContext);
  if (!context) {
    throw new Error('useXiDachScore must be used within XiDachScoreProvider');
  }
  return context;
};

export default XiDachScoreProvider;
