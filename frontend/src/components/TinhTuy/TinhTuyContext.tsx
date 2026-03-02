/**
 * TinhTuyContext — State management for Tinh Tuy Dai Chien.
 * Uses useReducer + socket listeners. Follows WordChainContext pattern.
 */
import React, { createContext, useContext, useReducer, useCallback, useEffect, useRef, useMemo, ReactNode } from 'react';
import { socketService } from '../../services/socketService';
import { getToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import { useSocket } from '../../contexts/SocketContext';
import { getGuestId } from '../../utils/guestId';
import { getGuestName } from '../../utils/guestName';
import { API_BASE_URL } from '../../utils/constants';
import {
  TinhTuyState, TinhTuyAction, TinhTuyView, TinhTuyPlayer, TinhTuyCharacter,
  TinhTuySettings, WaitingRoomInfo, CreateRoomPayload, DEFAULT_SETTINGS,
  BOARD_CELLS, Reaction,
} from './tinh-tuy-types';
import { tinhTuySounds } from './tinh-tuy-sounds';
import { CHARACTER_ABILITIES } from './tinh-tuy-abilities';

// ─── Session Storage ──────────────────────────────────
const TT_SESSION_KEY = 'tinhtuy_room';

function saveRoomSession(roomCode: string) {
  localStorage.setItem(TT_SESSION_KEY, roomCode);
}
function clearRoomSession() {
  localStorage.removeItem(TT_SESSION_KEY);
}
function getSavedRoomCode(): string | null {
  return localStorage.getItem(TT_SESSION_KEY);
}

// ─── Helper: resolve displayName from player data ─────
function resolveDisplayName(p: any): string {
  return p.displayName || p.name || p.guestName || (p.guestId ? `Guest ${p.guestId.slice(-6)}` : 'Player');
}

function mapPlayers(players: any[]): TinhTuyPlayer[] {
  return (players || []).map((p: any) => ({
    ...p,
    character: p.character || 'shiba',
    properties: p.properties || [],
    houses: p.houses || {},
    hotels: p.hotels || {},
    // festivals removed — now game-level state.festival
    cards: p.cards || [],
    immunityNextRent: !!p.immunityNextRent,
    doubleRentTurns: p.doubleRentTurns || 0,
    buyBlockedTurns: p.buyBlockedTurns || 0,
    skipNextTurn: !!p.skipNextTurn,
    displayName: resolveDisplayName(p),
    userId: p.userId?.toString?.() || p.userId,
    abilityCooldown: p.abilityCooldown || 0,
    abilityUsedThisTurn: !!p.abilityUsedThisTurn,
  }));
}

// ─── Initial State ────────────────────────────────────
const initialState: TinhTuyState = {
  view: 'lobby',
  waitingRooms: [],
  isLoadingRooms: false,
  roomId: null,
  roomCode: null,
  settings: null,
  players: [],
  isHost: false,
  mySlot: null,
  hasPassword: false,
  gameStatus: 'waiting',
  currentPlayerSlot: 1,
  turnPhase: 'ROLL_DICE',
  turnStartedAt: 0,
  lastDiceResult: null,
  diceAnimating: false,
  round: 0,
  lateGameActive: false,
  pendingAction: null,
  festival: null,
  winner: null,
  gameEndReason: null,
  error: null,
  drawnCard: null,
  houseRemovedCell: null,
  cardExtraInfo: null,
  chatMessages: [],
  reactions: [],
  pendingMove: null,
  animatingToken: null,
  pendingCardMove: null,
  showGoPopup: false,
  islandAlertSlot: null,
  taxAlert: null,
  rentAlert: null,
  pointNotifs: [],
  pendingNotifs: [],
  displayPoints: {},
  queuedTurnChange: null,
  queuedTravelPrompt: false,
  queuedFestivalPrompt: false,
  queuedAction: null,
  buildPrompt: null,
  queuedBuildPrompt: null,
  queuedRentAlert: null,
  queuedTaxAlert: null,
  queuedIslandAlert: null,
  sellPrompt: null,
  queuedSellPrompt: null,
  travelPendingSlot: null,
  queuedTravelPending: null,
  freeHousePrompt: null as { slot: number; buildableCells: number[] } | null,
  queuedFreeHousePrompt: null as { slot: number; buildableCells: number[] } | null,
  freeHotelPrompt: null as { slot: number; buildableCells: number[] } | null,
  queuedFreeHotelPrompt: null as { slot: number; buildableCells: number[] } | null,
  pendingCardEffect: null,
  pendingSwapAnim: null,
  queuedBankruptAlert: null,
  bankruptAlert: null,
  monopolyAlert: null,
  queuedGameFinished: null,
  attackPrompt: null,
  attackAlert: null,
  forcedTradeAlert: null,
  buybackPrompt: null,
  queuedBuybackPrompt: null,
  goBonusPrompt: null,
  queuedGoBonus: null as { slot: number; bonusType: 'BONUS_POINTS' | 'FREE_HOUSE'; amount?: number } | null,
  autoSoldAlert: null as { slot: number; items: Array<{ cellIndex: number; type: string; price: number }> } | null,
  forcedTradePrompt: null,
  frozenProperties: [],
  rentFreezePrompt: null,
  nearWinWarning: null as { slot: number; type: string; missingCells?: number[]; completedGroups?: number; edgeIndex?: number } | null,
  buyBlockPrompt: null,
  eminentDomainPrompt: null,
  pendingNegotiate: null,
  negotiateCooldownUntil: 0,
  negotiateWizardOpen: false,
  // Ability state
  abilityModal: null,
  owlPickModal: null,
  horseAdjustPrompt: null,
  shibaRerollPrompt: null,
  rabbitBonusPrompt: null,
  abilityUsedAlert: null,
  chickenDrainAlert: null,
  slothAutoBuildAlert: null,
  foxSwapAlert: null,
};

// ─── Point notification helpers ───────────────────────
let _notifId = 0;
/** Create point notif entries with IDs for display (capped at 20) */
function addNotifs(
  existing: TinhTuyState['pointNotifs'],
  entries: Array<{ slot: number; amount: number }>,
): TinhTuyState['pointNotifs'] {
  const newNotifs = entries
    .filter(e => e.amount !== 0)
    .map(e => ({ id: ++_notifId, slot: e.slot, amount: e.amount }));
  if (newNotifs.length === 0) return existing;
  return [...existing, ...newNotifs].slice(-20);
}
/** Queue raw notifs (no ID yet) — flushed after animation completes */
function queueNotifs(
  existing: TinhTuyState['pendingNotifs'],
  entries: Array<{ slot: number; amount: number }>,
): TinhTuyState['pendingNotifs'] {
  const filtered = entries.filter(e => e.amount !== 0);
  if (filtered.length === 0) return existing;
  return [...existing, ...filtered].slice(-20);
}
/** Snapshot player points BEFORE update — so displayed total freezes until flush */
function freezePoints(state: TinhTuyState): Record<number, number> {
  // Only snapshot on first pending notif; keep existing snapshot otherwise
  if (state.pendingNotifs.length > 0) return state.displayPoints;
  const dp: Record<number, number> = {};
  state.players.forEach(p => { dp[p.slot] = p.points; });
  return dp;
}

/** Defensive: when adding a property to a player, remove it from all other players first.
 *  Prevents stale duplicate ownership (e.g. FORCE_CLEAR_ANIM missing stolenProperty). */
function dedupeProperty(players: TinhTuyPlayer[], cellIndex: number, newOwnerSlot: number): TinhTuyPlayer[] {
  return players.map(p => {
    if (p.slot === newOwnerSlot) return p; // Skip the new owner — caller handles adding
    if (!p.properties.includes(cellIndex)) return p;
    const key = String(cellIndex);
    const newHouses = { ...p.houses }; delete newHouses[key];
    const newHotels = { ...p.hotels }; delete newHotels[key];
    return { ...p, properties: p.properties.filter(idx => idx !== cellIndex), houses: newHouses, hotels: newHotels };
  });
}

// ─── Reducer ──────────────────────────────────────────
function tinhTuyReducer(state: TinhTuyState, action: TinhTuyAction): TinhTuyState {
  switch (action.type) {
    case 'SET_VIEW':
      return { ...state, view: action.payload, error: null };

    case 'SET_ROOMS':
      return { ...state, waitingRooms: action.payload, isLoadingRooms: false };

    case 'SET_LOADING_ROOMS':
      return { ...state, isLoadingRooms: action.payload };

    case 'ROOM_CREATED':
      saveRoomSession(action.payload.roomCode);
      return {
        ...state, view: 'waiting',
        roomId: action.payload.roomId, roomCode: action.payload.roomCode,
        settings: action.payload.settings, players: mapPlayers(action.payload.players),
        isHost: true, gameStatus: 'waiting', error: null,
      };

    case 'ROOM_JOINED': {
      saveRoomSession(action.payload.roomCode);
      const isPlaying = action.payload.gameStatus === 'playing';
      // On reconnect with full game state
      if (action.payload.reconnected && action.payload.game) {
        const g = action.payload.game;
        return {
          ...state,
          view: g.gameStatus === 'playing' ? 'playing' : 'waiting',
          roomId: g.roomId, roomCode: g.roomCode,
          settings: g.settings, players: mapPlayers(g.players),
          gameStatus: g.gameStatus,
          currentPlayerSlot: g.currentPlayerSlot || 1,
          turnPhase: g.turnPhase || 'ROLL_DICE',
          turnStartedAt: g.turnStartedAt ? new Date(g.turnStartedAt).getTime() : Date.now(),
          lastDiceResult: g.lastDiceResult || null,
          round: g.round || 1,
          festival: g.festival || null,
          frozenProperties: g.frozenProperties || [],
          lateGameActive: (g.round || 0) > 60,
          // Restore sell prompt on reconnect with AWAITING_SELL phase
          sellPrompt: g.turnPhase === 'AWAITING_SELL'
            ? { deficit: Math.abs(mapPlayers(g.players).find((p: any) => p.slot === g.currentPlayerSlot)?.points ?? 0) }
            : null,
          // Restore negotiate state
          pendingNegotiate: g.pendingNegotiate || null,
          negotiateWizardOpen: false,
          // Restore ability modals on reconnect
          owlPickModal: g.turnPhase === 'AWAITING_OWL_PICK' && g._owlPendingCardsData?.length
            ? { cards: g._owlPendingCardsData }
            : null,
          horseAdjustPrompt: g.turnPhase === 'AWAITING_HORSE_ADJUST' && g.lastDiceResult
            ? { diceTotal: g.lastDiceResult.dice1 + g.lastDiceResult.dice2, currentPos: (mapPlayers(g.players).find((p: any) => p.slot === g.currentPlayerSlot)?.position ?? 0) }
            : null,
          shibaRerollPrompt: (() => {
            if (g.turnPhase !== 'AWAITING_SHIBA_REROLL_PICK') return null;
            const sp = g.players?.find((p: any) => p.slot === g.currentPlayerSlot)?.shibaRerollPending;
            return sp ? { original: sp.original, rerolled: sp.rerolled } : null;
          })(),
          error: null,
        };
      }
      return {
        ...state,
        view: isPlaying ? 'playing' : 'waiting',
        roomId: action.payload.roomId, roomCode: action.payload.roomCode,
        settings: action.payload.settings, players: mapPlayers(action.payload.players),
        gameStatus: action.payload.gameStatus,
        error: null,
      };
    }

    case 'ROOM_UPDATED': {
      const updates: Partial<TinhTuyState> = {};
      if (action.payload.players) updates.players = mapPlayers(action.payload.players);
      if (action.payload.settings) updates.settings = action.payload.settings;
      if (action.payload.gameStatus) updates.gameStatus = action.payload.gameStatus;
      return { ...state, ...updates };
    }

    case 'GAME_STARTED': {
      const g = action.payload.game;
      return {
        ...state, view: 'playing', gameStatus: 'playing',
        players: mapPlayers(g.players),
        currentPlayerSlot: g.currentPlayerSlot || 1,
        turnPhase: g.turnPhase || 'ROLL_DICE',
        turnStartedAt: Date.now(),
        round: g.round || 1,
        festival: g.festival || null,
        frozenProperties: g.frozenProperties || [],
        lastDiceResult: null, diceAnimating: false, pendingAction: null, winner: null,
        pendingCardEffect: null, pendingSwapAnim: null, gameEndReason: null,
        queuedBankruptAlert: null, bankruptAlert: null, monopolyAlert: null, queuedGameFinished: null, attackPrompt: null, attackAlert: null, forcedTradeAlert: null, buybackPrompt: null, queuedBuybackPrompt: null,
      };
    }

    case 'DICE_RESULT':
      return { ...state, lastDiceResult: { dice1: action.payload.dice1, dice2: action.payload.dice2 }, diceAnimating: true };

    case 'DICE_ANIM_DONE':
      return { ...state, diceAnimating: false };

    case 'FORCE_CLEAR_ANIM': {
      // Safety: force-clear all animation state to unblock queued effects
      // Also applies pending card effects (movement, buffs) that would otherwise be lost
      let fcPlayers = state.animatingToken
        ? state.players.map(p =>
          p.slot === state.animatingToken!.slot
            ? { ...p, position: state.animatingToken!.path[state.animatingToken!.path.length - 1] }
            : p
        )
        : [...state.players];
      // Apply pending card effects before clearing (same logic as CLEAR_CARD)
      const fcEff = state.pendingCardEffect;
      if (fcEff) {
        if (fcEff.cardHeld) {
          fcPlayers = fcPlayers.map(p =>
            p.slot === fcEff.cardHeld!.slot ? { ...p, cards: [...p.cards, fcEff.cardHeld!.cardId] } : p
          );
        }
        if (fcEff.houseRemoved) {
          fcPlayers = fcPlayers.map(p => {
            if (p.slot !== fcEff.houseRemoved!.slot) return p;
            const key = String(fcEff.houseRemoved!.cellIndex);
            const h = p.houses || {};
            return { ...p, houses: { ...h, [key]: Math.max((h[key] || 0) - 1, 0) } };
          });
        }
        if (fcEff.goToIsland) {
          fcPlayers = fcPlayers.map(p =>
            p.slot === fcEff.slot ? { ...p, position: 27, islandTurns: 3 } : p
          );
        }
        if (fcEff.immunityNextRent) {
          fcPlayers = fcPlayers.map(p =>
            p.slot === fcEff.slot ? { ...p, immunityNextRent: true } : p
          );
        }
        // doubleRentTurns applied immediately in CARD_DRAWN — no deferred action needed
        if (fcEff.skipTurn) {
          fcPlayers = fcPlayers.map(p =>
            p.slot === fcEff.slot ? { ...p, skipNextTurn: true } : p
          );
        }
        // Swap: defer actual swap via pendingSwapAnim (matches CLEAR_CARD — no position restore)
        // SWAP_ANIM_DONE will teleport both to final positions in one clean step.
        if (fcEff.stolenProperty) {
          const st = fcEff.stolenProperty;
          const key = String(st.cellIndex);
          fcPlayers = dedupeProperty(fcPlayers, st.cellIndex, st.toSlot);
          fcPlayers = fcPlayers.map(p => {
            if (p.slot === st.fromSlot) {
              const { [key]: _h, ...restHouses } = p.houses;
              const { [key]: _ht, ...restHotels } = p.hotels;
              return {
                ...p,
                properties: p.properties.filter(idx => idx !== st.cellIndex),
                houses: restHouses,
                hotels: restHotels,
              };
            }
            if (p.slot === st.toSlot) {
              const victimP = fcPlayers.find(pp => pp.slot === st.fromSlot);
              const transferHouses = victimP ? (victimP.houses[key] || 0) : 0;
              const transferHotel = victimP ? !!victimP.hotels[key] : false;
              return {
                ...p,
                properties: [...p.properties.filter(idx => idx !== st.cellIndex), st.cellIndex],
                houses: transferHouses > 0 ? { ...p.houses, [key]: transferHouses } : p.houses,
                hotels: transferHotel ? { ...p.hotels, [key]: true } : p.hotels,
              };
            }
            return p;
          });
        }
        if (fcEff.allHousesRemoved && fcEff.allHousesRemoved.length > 0) {
          for (const rem of fcEff.allHousesRemoved) {
            fcPlayers = fcPlayers.map(p => {
              if (p.slot !== rem.slot) return p;
              const key = String(rem.cellIndex);
              const h = p.houses || {};
              return { ...p, houses: { ...h, [key]: Math.max((h[key] || 0) - 1, 0) } };
            });
          }
        }
      }
      // Apply pending card movement (teleport directly)
      const fcCm = state.pendingCardMove;
      let fcPendingMove = null;
      if (fcCm) {
        const goBonus = fcCm.passedGo ? 2000 : 0;
        if (goBonus) {
          fcPlayers = fcPlayers.map(p =>
            p.slot === fcCm.slot ? { ...p, points: p.points + goBonus } : p
          );
        }
        fcPendingMove = { slot: fcCm.slot, path: [fcCm.to], goBonus, passedGo: fcCm.passedGo, fromCard: true };
      }
      return {
        ...state, players: fcPlayers,
        diceAnimating: false, drawnCard: null, animatingToken: null,
        houseRemovedCell: null, pendingCardMove: null, pendingCardEffect: null, cardExtraInfo: null,
        pendingMove: fcPendingMove,
        pendingSwapAnim: fcEff?.swapPosition ? {
          slot: fcEff.swapPosition.slot, targetSlot: fcEff.swapPosition.targetSlot,
          myNewPos: fcEff.swapPosition.myNewPos, targetNewPos: fcEff.swapPosition.targetNewPos,
        } : null,
      };
    }

    case 'PLAYER_MOVED': {
      const { slot, from, to, goBonus, isTravel, teleport } = action.payload;
      // Teleport: instant position change, no animation (e.g. triple doubles → island)
      if (teleport) {
        const updated = state.players.map(p =>
          p.slot === slot ? { ...p, position: to } : p
        );
        return { ...state, players: updated };
      }
      // Compute movement path (wrap around at 36)
      const path: number[] = [];
      let pos = from;
      if (isTravel) {
        // Travel / card: teleport directly (single step, no cell-by-cell walk)
        path.push(to);
      } else {
        while (pos !== to) { pos = (pos + 1) % 36; path.push(pos); }
      }
      // Freeze display points, update real points, queue notif (shown after animation)
      const dp1 = goBonus ? freezePoints(state) : state.displayPoints;
      // Sync position to server's `from` — ensures position is correct even if
      // a prior card-move animation didn't complete (fixes doubles + card move desync)
      const updated = state.players.map(p =>
        p.slot === slot ? { ...p, position: from, points: goBonus ? p.points + goBonus : p.points } : p
      );
      return {
        ...state,
        players: updated,
        pendingMove: { slot, path, goBonus, passedGo: action.payload.passedGo, fromCard: isTravel },
        pendingNotifs: goBonus ? queueNotifs(state.pendingNotifs, [{ slot, amount: goBonus }]) : state.pendingNotifs,
        displayPoints: dp1,
      };
    }

    case 'START_MOVE': {
      if (!state.pendingMove) return state;
      const { slot, path, passedGo } = state.pendingMove;
      return {
        ...state,
        pendingMove: null,
        animatingToken: { slot, path, currentStep: 0 },
        showGoPopup: passedGo ? true : state.showGoPopup,
      };
    }

    case 'ANIMATION_STEP': {
      if (!state.animatingToken) return state;
      const next = state.animatingToken.currentStep + 1;
      if (next >= state.animatingToken.path.length) {
        // Animation complete — update actual position
        const finalPos = state.animatingToken.path[state.animatingToken.path.length - 1];
        const updated = state.players.map(p =>
          p.slot === state.animatingToken!.slot ? { ...p, position: finalPos } : p
        );
        return { ...state, players: updated, animatingToken: null };
      }
      return { ...state, animatingToken: { ...state.animatingToken, currentStep: next } };
    }

    case 'SHOW_GO_POPUP':
      return { ...state, showGoPopup: true };

    case 'HIDE_GO_POPUP':
      return { ...state, showGoPopup: false };

    case 'AWAITING_ACTION':
      // Queue — applied after movement animation finishes
      // Clear stale queuedTurnChange to prevent it from overwriting turnPhase later
      return {
        ...state,
        queuedTurnChange: null,
        queuedAction: {
          slot: action.payload.slot,
          cellIndex: action.payload.cellIndex,
          cellType: action.payload.cellType,
          price: action.payload.price || 0,
          canAfford: action.payload.canAfford ?? true,
        },
      };

    case 'APPLY_QUEUED_ACTION': {
      const qa = state.queuedAction;
      if (!qa) return state;
      // Only show purchase modal for the player whose turn it is
      const isForMe = qa.slot === state.mySlot;
      return {
        ...state,
        turnPhase: 'AWAITING_ACTION',
        pendingAction: isForMe ? {
          type: 'BUY_PROPERTY',
          cellIndex: qa.cellIndex,
          price: qa.price || 0,
          canAfford: qa.canAfford ?? true,
          cellType: qa.cellType,
        } : null,
        queuedAction: null,
      };
    }

    case 'TRAVEL_PROMPT':
      // Queue — applied after movement animation finishes
      // Clear stale queuedTurnChange to prevent it from overwriting turnPhase later
      return { ...state, queuedTravelPrompt: true, queuedTurnChange: null };

    case 'APPLY_QUEUED_TRAVEL':
      return { ...state, turnPhase: 'AWAITING_TRAVEL', queuedTravelPrompt: false };

    case 'CARD_DESTINATION_PROMPT':
      // Clear card modal immediately so choice UI can render (no delay/race condition)
      return { ...state, turnPhase: 'AWAITING_CARD_DESTINATION', queuedTurnChange: null,
        drawnCard: null, pendingCardMove: null, pendingCardEffect: null, cardExtraInfo: null, houseRemovedCell: null };

    case 'FORCED_TRADE_PROMPT':
      return {
        ...state,
        turnPhase: 'AWAITING_FORCED_TRADE',
        forcedTradePrompt: { myCells: action.payload.myCells, opponentCells: action.payload.opponentCells },
        queuedTurnChange: null,
        // Clear card modal immediately so choice UI can render
        drawnCard: null, pendingCardMove: null, pendingCardEffect: null, cardExtraInfo: null, houseRemovedCell: null,
      };

    case 'RENT_FREEZE_PROMPT':
      return {
        ...state,
        turnPhase: 'AWAITING_RENT_FREEZE',
        rentFreezePrompt: { targetCells: action.payload.targetCells },
        queuedTurnChange: null,
        drawnCard: null, pendingCardMove: null, pendingCardEffect: null, cardExtraInfo: null, houseRemovedCell: null,
      };

    case 'RENT_FROZEN':
      return {
        ...state,
        frozenProperties: action.payload.frozenProperties,
        rentFreezePrompt: null,
      };

    case 'NEAR_WIN_WARNING':
      return { ...state, nearWinWarning: action.payload };

    case 'CLEAR_NEAR_WIN_WARNING':
      return { ...state, nearWinWarning: null };

    case 'BUY_BLOCK_PROMPT':
      return { ...state, turnPhase: 'AWAITING_BUY_BLOCK_TARGET', buyBlockPrompt: action.payload, queuedTurnChange: null,
        drawnCard: null, pendingCardMove: null, pendingCardEffect: null, cardExtraInfo: null, houseRemovedCell: null };

    case 'CLEAR_BUY_BLOCK_PROMPT':
      return { ...state, buyBlockPrompt: null };

    case 'EMINENT_DOMAIN_PROMPT':
      return { ...state, turnPhase: 'AWAITING_EMINENT_DOMAIN', eminentDomainPrompt: action.payload, queuedTurnChange: null,
        drawnCard: null, pendingCardMove: null, pendingCardEffect: null, cardExtraInfo: null, houseRemovedCell: null };

    case 'CLEAR_EMINENT_DOMAIN_PROMPT':
      return { ...state, eminentDomainPrompt: null };

    case 'NEGOTIATE_INCOMING':
      return { ...state, pendingNegotiate: action.payload, negotiateWizardOpen: false };

    case 'NEGOTIATE_COMPLETED': {
      if (action.payload.accepted && action.payload.cellIndex != null && action.payload.offerAmount != null) {
        const { fromSlot, toSlot, cellIndex: negCell, offerAmount: negPrice } = action.payload;
        const negKey = String(negCell);
        let ngPlayers = dedupeProperty(state.players, negCell!, fromSlot);
        ngPlayers = ngPlayers.map(p => {
          if (p.slot === toSlot) {
            const newHouses = { ...p.houses }; delete newHouses[negKey];
            const newHotels = { ...p.hotels }; delete newHotels[negKey];
            return { ...p, properties: p.properties.filter(idx => idx !== negCell), points: p.points + negPrice!, houses: newHouses, hotels: newHotels };
          }
          if (p.slot === fromSlot) {
            const seller = state.players.find(sp => sp.slot === toSlot);
            const sHouses = seller ? (seller.houses || {})[negKey] || 0 : 0;
            const sHotel = seller ? !!(seller.hotels || {})[negKey] : false;
            return {
              ...p, points: p.points - negPrice!,
              properties: [...p.properties.filter(idx => idx !== negCell), negCell!],
              houses: sHouses > 0 ? { ...p.houses, [negKey]: sHouses } : p.houses,
              hotels: sHotel ? { ...p.hotels, [negKey]: true } : p.hotels,
            };
          }
          return p;
        });
        const ngFestival = action.payload.festival !== undefined ? action.payload.festival : state.festival;
        const ngNotifs = addNotifs(state.pointNotifs, [{ slot: fromSlot, amount: -negPrice! }, { slot: toSlot, amount: negPrice! }]);
        return { ...state, players: ngPlayers, pendingNegotiate: null, negotiateWizardOpen: false, festival: ngFestival, pointNotifs: ngNotifs };
      }
      // Rejected
      const ngCooldown = action.payload.cooldownUntilRound && action.payload.fromSlot === state.mySlot
        ? action.payload.cooldownUntilRound
        : state.negotiateCooldownUntil;
      return { ...state, pendingNegotiate: null, negotiateWizardOpen: false, negotiateCooldownUntil: ngCooldown };
    }

    case 'NEGOTIATE_CANCELLED':
      return { ...state, pendingNegotiate: null, negotiateWizardOpen: false };

    case 'OPEN_NEGOTIATE_WIZARD':
      return { ...state, negotiateWizardOpen: true };

    case 'CLOSE_NEGOTIATE_WIZARD':
      return { ...state, negotiateWizardOpen: false };

    case 'FORCED_TRADE_DONE': {
      const { traderSlot, traderCell, victimSlot, victimCell } = action.payload;
      let ftPlayers = [...state.players];
      // Find traders
      const trader = ftPlayers.find(p => p.slot === traderSlot);
      const victim = ftPlayers.find(p => p.slot === victimSlot);
      if (trader && victim) {
        // Swap properties
        const traderKey = String(traderCell);
        const victimKey = String(victimCell);
        const traderHouses = (trader.houses || {})[traderKey] || 0;
        const traderHotel = !!(trader.hotels || {})[traderKey];
        const victimHouses = (victim.houses || {})[victimKey] || 0;
        const victimHotel = !!(victim.hotels || {})[victimKey];

        ftPlayers = ftPlayers.map(p => {
          if (p.slot === traderSlot) {
            const newProps = p.properties.filter(ci => ci !== traderCell).concat(victimCell);
            const newHouses = { ...p.houses };
            const newHotels = { ...p.hotels };
            delete newHouses[traderKey];
            delete newHotels[traderKey];
            if (victimHouses > 0) newHouses[victimKey] = victimHouses;
            if (victimHotel) newHotels[victimKey] = victimHotel;
            return { ...p, properties: newProps, houses: newHouses, hotels: newHotels };
          }
          if (p.slot === victimSlot) {
            const newProps = p.properties.filter(ci => ci !== victimCell).concat(traderCell);
            const newHouses = { ...p.houses };
            const newHotels = { ...p.hotels };
            delete newHouses[victimKey];
            delete newHotels[victimKey];
            if (traderHouses > 0) newHouses[traderKey] = traderHouses;
            if (traderHotel) newHotels[traderKey] = traderHotel;
            return { ...p, properties: newProps, houses: newHouses, hotels: newHotels };
          }
          return p;
        });
      }
      const ftFestival = action.payload.festival !== undefined ? action.payload.festival : state.festival;
      // Show alert to all players (skip if trade was skipped)
      const ftAlert = (!action.payload.skipped && traderSlot && victimSlot)
        ? { traderSlot, traderCell, victimSlot, victimCell }
        : null;
      return { ...state, players: ftPlayers, forcedTradePrompt: null, festival: ftFestival, forcedTradeAlert: ftAlert };
    }

    case 'CLEAR_FORCED_TRADE_ALERT':
      return { ...state, forcedTradeAlert: null };

    case 'PROPERTY_BOUGHT': {
      const dpBuy = freezePoints(state);
      // Defensive: remove property from any other player first (prevents stale duplicates)
      const dedupedBuy = dedupeProperty(state.players, action.payload.cellIndex, action.payload.slot);
      const updated = dedupedBuy.map(p =>
        p.slot === action.payload.slot
          ? { ...p, points: action.payload.remainingPoints, properties: [...p.properties.filter(idx => idx !== action.payload.cellIndex), action.payload.cellIndex] }
          : p
      );
      return {
        ...state, players: updated, pendingAction: null, displayPoints: dpBuy,
        pendingNotifs: queueNotifs(state.pendingNotifs, [{ slot: action.payload.slot, amount: -action.payload.price }]),
      };
    }

    case 'RENT_PAID': {
      const { fromSlot, toSlot, amount, cellIndex } = action.payload;
      const dpRent = freezePoints(state);
      const updated = state.players.map(p => {
        if (p.slot === fromSlot) return { ...p, points: p.points - amount };
        if (p.slot === toSlot) return { ...p, points: p.points + amount };
        return p;
      });
      return {
        ...state, players: updated, pendingAction: null, displayPoints: dpRent,
        queuedRentAlert: { fromSlot, toSlot, amount, cellIndex },
        pendingNotifs: queueNotifs(state.pendingNotifs, [{ slot: fromSlot, amount: -amount }, { slot: toSlot, amount }]),
      };
    }

    case 'CLEAR_RENT_ALERT':
      return { ...state, rentAlert: null };

    case 'TAX_PAID': {
      const { slot, amount, houseCount, hotelCount, perHouse, perHotel } = action.payload;
      const dpTax = amount > 0 ? freezePoints(state) : state.displayPoints;
      const updated = state.players.map(p =>
        p.slot === slot ? { ...p, points: p.points - amount } : p
      );
      return {
        ...state,
        players: updated, displayPoints: dpTax,
        queuedTaxAlert: { slot, amount, houseCount, hotelCount, perHouse, perHotel },
        pendingNotifs: amount > 0 ? queueNotifs(state.pendingNotifs, [{ slot, amount: -amount }]) : state.pendingNotifs,
      };
    }

    case 'CLEAR_TAX_ALERT':
      return { ...state, taxAlert: null };

    case 'CLEAR_POINT_NOTIFS':
      return { ...state, pointNotifs: [] };

    case 'FLUSH_NOTIFS': {
      if (state.pendingNotifs.length === 0) return state;
      return {
        ...state,
        pointNotifs: addNotifs(state.pointNotifs, state.pendingNotifs),
        pendingNotifs: [],
        displayPoints: {},  // Unfreeze — show real points alongside notifications
      };
    }

    case 'LATE_GAME_STARTED':
      return { ...state, lateGameActive: true };

    case 'TURN_CHANGED':
      // Queue turn change — applied after animations + modals + notifs settle
      return {
        ...state,
        // Sync frozen properties immediately (data sync, not visual effect)
        frozenProperties: action.payload.frozenProperties ?? state.frozenProperties,
        queuedTurnChange: {
          currentSlot: action.payload.currentSlot,
          turnPhase: action.payload.turnPhase,
          round: action.payload.round,
          buffs: action.payload.buffs,
        },
      };

    case 'APPLY_QUEUED_TURN_CHANGE': {
      const qtc = state.queuedTurnChange;
      if (!qtc) return state;
      // Sync player buffs from backend snapshot
      let updatedPlayers = state.players;
      if (qtc.buffs) {
        const buffsMap = new Map(qtc.buffs.map(b => [b.slot, b]));
        updatedPlayers = state.players.map(p => {
          const b = buffsMap.get(p.slot);
          if (!b) return p;
          return { ...p, cards: b.cards, immunityNextRent: b.immunityNextRent, doubleRentTurns: b.doubleRentTurns, buyBlockedTurns: b.buyBlockedTurns ?? p.buyBlockedTurns, skipNextTurn: b.skipNextTurn, abilityCooldown: (b as any).abilityCooldown ?? p.abilityCooldown, abilityUsedThisTurn: (b as any).abilityUsedThisTurn ?? false };
        });
      }
      // Don't clear rentAlert/taxAlert/islandAlertSlot — they have their own 4s auto-dismiss timers
      // Clear ALL stale queued effects from the previous turn to prevent them from
      // firing after the turn change and overwriting the new turnPhase (e.g. doubles → ROLL_DICE)
      return {
        ...state,
        players: updatedPlayers,
        currentPlayerSlot: qtc.currentSlot,
        turnPhase: qtc.turnPhase,
        turnStartedAt: Date.now(),
        round: qtc.round || state.round,
        pendingAction: null,
        buildPrompt: null,
        freeHousePrompt: null,
        freeHotelPrompt: null,
        sellPrompt: null,
        buybackPrompt: null,
        attackPrompt: null,
        // Clear card-choice prompts from the previous turn to prevent stale modals
        // from blocking the next turn's roll button (e.g. forced trade timeout with no valid trade)
        forcedTradePrompt: null,
        rentFreezePrompt: null,
        buyBlockPrompt: null,
        eminentDomainPrompt: null,
        // Clear ability modals from the previous turn to prevent stale prompts
        abilityModal: null,
        horseAdjustPrompt: null,
        owlPickModal: null,
        shibaRerollPrompt: null,
        rabbitBonusPrompt: null,
        // GO bonus modal has its own auto-dismiss timer (CLEAR_GO_BONUS) — do NOT
        // clear it here, because turn-changed arrives right after go-bonus and would
        // kill the modal before the user sees it.
        queuedFreeHousePrompt: null,
        queuedFreeHotelPrompt: null,
        queuedTurnChange: null,
        queuedAction: null,
        queuedBuildPrompt: null,
        queuedSellPrompt: null,
        queuedBuybackPrompt: null,
        queuedTravelPrompt: false,
        queuedFestivalPrompt: false,
      };
    }

    case 'PLAYER_BANKRUPT': {
      // Don't wipe player data immediately — queue it so token + properties remain
      // visible during walk animation + rent/tax alerts.
      // Data change applied later in APPLY_QUEUED_BANKRUPT_ALERT.
      return { ...state, queuedBankruptAlert: action.payload.slot };
    }

    case 'PLAYER_SURRENDERED': {
      const sSlot = action.payload.slot;
      const updated = state.players.map(p =>
        p.slot === sSlot ? { ...p, isBankrupt: true, points: 0, properties: [], houses: {}, hotels: {} } : p
      );
      const newFestivalS = state.festival?.slot === sSlot ? null : state.festival;
      return { ...state, players: updated, festival: newFestivalS };
    }

    case 'PLAYER_ISLAND': {
      // Only set islandTurns — position is handled by movement animation (dice),
      // teleport flag (triple doubles), or CARD_DRAWN handler (card-based island)
      const wasAlreadyOnIsland = state.players.some(
        p => p.slot === action.payload.slot && p.islandTurns > 0,
      );
      const updated = state.players.map(p =>
        p.slot === action.payload.slot ? { ...p, islandTurns: action.payload.turnsRemaining } : p
      );
      // Only show "sent to island" alert for newly trapped players, not failed escape rolls
      return {
        ...state,
        players: updated,
        queuedIslandAlert: wasAlreadyOnIsland ? state.queuedIslandAlert : action.payload.slot,
      };
    }

    case 'CLEAR_ISLAND_ALERT':
      return { ...state, islandAlertSlot: null };

    case 'APPLY_QUEUED_BANKRUPT_ALERT': {
      const bSlot = state.queuedBankruptAlert;
      if (bSlot == null) return state;
      // NOW wipe player data (deferred from PLAYER_BANKRUPT so walk animation could finish)
      const bUpdated = state.players.map(p =>
        p.slot === bSlot ? { ...p, isBankrupt: true, points: 0, properties: [], houses: {}, hotels: {} } : p
      );
      const bFestival = state.festival?.slot === bSlot ? null : state.festival;
      return { ...state, players: bUpdated, festival: bFestival, bankruptAlert: bSlot, queuedBankruptAlert: null };
    }

    case 'CLEAR_BANKRUPT_ALERT':
      return { ...state, bankruptAlert: null };

    case 'MONOPOLY_COMPLETED':
      return { ...state, monopolyAlert: action.payload };

    case 'CLEAR_MONOPOLY_ALERT':
      return { ...state, monopolyAlert: null };

    case 'ATTACK_PROPERTY_PROMPT':
      return { ...state, attackPrompt: action.payload, queuedTurnChange: null,
        drawnCard: null, pendingCardMove: null, pendingCardEffect: null, cardExtraInfo: null, houseRemovedCell: null };

    case 'PROPERTY_ATTACKED': {
      const { victimSlot, cellIndex, result: atkResult, prevHouses, prevHotel, newHouses, newHotel, festival: atkFestival } = action.payload;
      const updatedPlayers = state.players.map(p => {
        if (p.slot !== victimSlot) return p;
        if (atkResult === 'shielded') {
          // Shield consumed — remove from cards, property unchanged
          const shieldIdx = p.cards.indexOf('shield');
          return shieldIdx >= 0 ? { ...p, cards: p.cards.filter((_, i) => i !== shieldIdx) } : p;
        }
        if (atkResult === 'destroyed' || atkResult === 'demolished') {
          // Property fully removed
          const newHousesMap = { ...p.houses };
          const newHotelsMap = { ...p.hotels };
          delete newHousesMap[String(cellIndex)];
          delete newHotelsMap[String(cellIndex)];
          return { ...p, properties: p.properties.filter(idx => idx !== cellIndex), houses: newHousesMap, hotels: newHotelsMap };
        }
        // Downgraded — update buildings
        return {
          ...p,
          houses: { ...p.houses, [String(cellIndex)]: newHouses },
          hotels: { ...p.hotels, [String(cellIndex)]: newHotel },
        };
      });
      return { ...state, players: updatedPlayers, attackPrompt: null, attackAlert: action.payload, festival: atkFestival !== undefined ? atkFestival : state.festival };
    }

    case 'CLEAR_ATTACK_ALERT':
      return { ...state, attackAlert: null };

    case 'CLEAR_AUTO_SOLD':
      return { ...state, autoSoldAlert: null };

    case 'BUYBACK_PROMPT':
      return { ...state, queuedBuybackPrompt: action.payload, queuedTurnChange: null };

    case 'APPLY_QUEUED_BUYBACK':
      return { ...state, turnPhase: 'AWAITING_BUYBACK', buybackPrompt: state.queuedBuybackPrompt, queuedBuybackPrompt: null };

    case 'CLEAR_BUYBACK_PROMPT':
      return { ...state, buybackPrompt: null };

    case 'BUYBACK_COMPLETED': {
      const { buyerSlot, ownerSlot, cellIndex: bbCell, price: bbPrice, buyerPoints, ownerPoints, houses: bbHouses, hotel: bbHotel } = action.payload;
      const dpBb = freezePoints(state);
      // Defensive dedup: ensure no other player retains this property
      const dedupedBb = dedupeProperty(state.players, bbCell, buyerSlot);
      const updatedPlayers = dedupedBb.map(p => {
        if (p.slot === buyerSlot) {
          const key = String(bbCell);
          return {
            ...p,
            points: buyerPoints,
            properties: [...p.properties.filter(idx => idx !== bbCell), bbCell],
            houses: { ...p.houses, [key]: bbHouses },
            hotels: { ...p.hotels, [key]: bbHotel },
          };
        }
        if (p.slot === ownerSlot) {
          const key = String(bbCell);
          const newHouses = { ...p.houses };
          const newHotels = { ...p.hotels };
          delete newHouses[key];
          delete newHotels[key];
          return { ...p, points: ownerPoints, properties: p.properties.filter(idx => idx !== bbCell), houses: newHouses, hotels: newHotels };
        }
        return p;
      });
      // Transfer festival if needed
      let newFestival = state.festival;
      if (state.festival && state.festival.cellIndex === bbCell && state.festival.slot === ownerSlot) {
        newFestival = { ...state.festival, slot: buyerSlot };
      }
      return {
        ...state, players: updatedPlayers, buybackPrompt: null, festival: newFestival, displayPoints: dpBb,
        pendingNotifs: queueNotifs(state.pendingNotifs, [{ slot: buyerSlot, amount: -bbPrice }, { slot: ownerSlot, amount: bbPrice }]),
      };
    }

    case 'APPLY_QUEUED_GAME_FINISHED': {
      const qgf = state.queuedGameFinished;
      if (!qgf) return state;
      return {
        ...state, gameStatus: 'finished',
        winner: qgf.winner,
        gameEndReason: qgf.reason,
        queuedGameFinished: null,
      };
    }

    case 'GAME_FINISHED':
      clearRoomSession();
      // Queue — applied after all animations + alerts are dismissed
      return {
        ...state,
        queuedGameFinished: {
          winner: action.payload.winner,
          reason: action.payload.reason || 'lastStanding',
        },
      };

    case 'PLAYER_DISCONNECTED': {
      const updated = state.players.map(p =>
        p.slot === action.payload.slot ? { ...p, isConnected: false } : p
      );
      return { ...state, players: updated };
    }

    case 'PLAYER_RECONNECTED': {
      const updated = state.players.map(p =>
        p.slot === action.payload.slot ? { ...p, isConnected: true } : p
      );
      return { ...state, players: updated };
    }

    case 'SET_HOST':
      return { ...state, isHost: action.payload };

    case 'SET_MY_SLOT':
      return { ...state, mySlot: action.payload };

    case 'SET_ERROR':
      return { ...state, error: action.payload };

    case 'CARD_DRAWN': {
      const { slot, card, effect } = action.payload;
      let updated = [...state.players];
      let cardMove: TinhTuyState['pendingCardMove'] = null;
      // Collect notifs for point changes
      const cardNotifs: Array<{ slot: number; amount: number }> = [];
      // Apply point changes (exclude Go bonus for moved player — will apply after animation)
      if (effect?.pointsChanged) {
        for (const [slotStr, delta] of Object.entries(effect.pointsChanged)) {
          cardNotifs.push({ slot: Number(slotStr), amount: delta as number });
          // If player is being moved, Go bonus is included in pointsChanged — defer it
          if (effect?.playerMoved && Number(slotStr) === effect.playerMoved.slot && effect.playerMoved.passedGo) {
            const nonGoAmount = (delta as number) - 2000;
            if (nonGoAmount !== 0) {
              updated = updated.map(p =>
                p.slot === Number(slotStr) ? { ...p, points: p.points + nonGoAmount } : p
              );
            }
          } else {
            updated = updated.map(p =>
              p.slot === Number(slotStr) ? { ...p, points: p.points + (delta as number) } : p
            );
          }
        }
      }
      // Freeze display points before real update
      const dpCard = cardNotifs.length > 0 ? freezePoints(state) : state.displayPoints;
      // Apply doubleRentTurns immediately (visible on board, no spoiler concern)
      if (effect?.doubleRentTurns) {
        updated = updated.map(p =>
          p.slot === slot ? { ...p, doubleRentTurns: p.doubleRentTurns + effect.doubleRentTurns! } : p
        );
      }
      // Defer movement to after card modal dismiss — skip for swap (swap handles position directly)
      if (effect?.playerMoved && !effect?.goToIsland && !effect?.swapPosition) {
        cardMove = {
          slot: effect.playerMoved.slot,
          to: effect.playerMoved.to,
          passedGo: !!effect.playerMoved.passedGo,
        };
      }
      // Defer buff/card/island/swap/steal effects until card modal is dismissed (prevents spoilers)
      const hasDeferrable = effect?.cardHeld || effect?.immunityNextRent ||
        effect?.skipTurn || effect?.goToIsland || effect?.houseRemoved ||
        effect?.swapPosition || effect?.stolenProperty ||
        (effect?.allHousesRemoved && effect.allHousesRemoved.length > 0);
      const pendingEff: TinhTuyState['pendingCardEffect'] = hasDeferrable ? {
        slot,
        cardHeld: effect.cardHeld,
        immunityNextRent: effect.immunityNextRent,
        skipTurn: effect.skipTurn,
        goToIsland: effect.goToIsland,
        houseRemoved: effect.houseRemoved,
        swapPosition: effect.swapPosition,
        stolenProperty: effect.stolenProperty,
        allHousesRemoved: effect.allHousesRemoved,
      } : null;
      // Apply teleportAll immediately (positions are visible on board, not hidden)
      if (effect?.teleportAll && Array.isArray(effect.teleportAll)) {
        for (const tp of effect.teleportAll) {
          updated = updated.map(p => p.slot === tp.slot ? { ...p, position: tp.to } : p);
        }
      }
      // Build card extra info for visual display on card modal
      const hasExtra = effect?.swapPosition || effect?.stolenProperty || effect?.taxedSlot != null ||
        effect?.randomSteps != null || effect?.randomPoints != null || effect?.gambleWon != null ||
        (effect?.allHousesRemoved && effect.allHousesRemoved.length > 0) ||
        effect?.underdogBoosted != null || effect?.extraTurn || effect?.wealthTransfer ||
        (effect?.teleportAll && effect.teleportAll.length > 0) || effect?.movedToFestival ||
        effect?.completedGroups != null;
      const extraInfo: TinhTuyState['cardExtraInfo'] = hasExtra
          ? {
            swapTargetSlot: effect.swapPosition?.targetSlot,
            stolenCellIndex: effect.stolenProperty?.cellIndex,
            stolenFromSlot: effect.stolenProperty?.fromSlot,
            stolenToSlot: effect.stolenProperty?.toSlot,
            stolenHouses: effect.stolenProperty?.houses,
            taxedSlot: effect.taxedSlot,
            randomSteps: effect.randomSteps,
            randomPoints: effect.randomPoints,
            gambleWon: effect.gambleWon,
            allHousesRemoved: effect.allHousesRemoved,
            underdogBoosted: effect.underdogBoosted,
            extraTurn: effect.extraTurn,
            wealthTransfer: effect.wealthTransfer,
            teleportAll: effect.teleportAll,
            movedToFestival: effect.movedToFestival,
            festivalCellIndex: effect.playerMoved?.to,
            completedGroups: effect.completedGroups,
          } : null;
      return {
        ...state, players: updated, drawnCard: card, pendingCardMove: cardMove,
        pendingCardEffect: pendingEff, cardExtraInfo: extraInfo,
        houseRemovedCell: effect?.houseRemoved ? effect.houseRemoved.cellIndex : null,
        displayPoints: dpCard,
        pendingNotifs: cardNotifs.length > 0 ? queueNotifs(state.pendingNotifs, cardNotifs) : state.pendingNotifs,
      };
    }

    case 'CLEAR_CARD': {
      // Apply deferred card effects now that card modal is dismissed
      let clearPlayers = [...state.players];
      let stolenFestival: typeof state.festival | undefined;
      // Force-complete in-progress walk animation before applying deferred effects
      // (prevents swap/move from teleporting tokens before walk finishes)
      if (state.animatingToken) {
        const finalPos = state.animatingToken.path[state.animatingToken.path.length - 1];
        clearPlayers = clearPlayers.map(p =>
          p.slot === state.animatingToken!.slot ? { ...p, position: finalPos } : p
        );
      } else if (state.pendingMove) {
        const finalPos = state.pendingMove.path[state.pendingMove.path.length - 1];
        clearPlayers = clearPlayers.map(p =>
          p.slot === state.pendingMove!.slot ? { ...p, position: finalPos } : p
        );
      }
      const eff = state.pendingCardEffect;
      let clearSwapAnim: TinhTuyState['pendingSwapAnim'] = null;
      if (eff) {
        if (eff.cardHeld) {
          clearPlayers = clearPlayers.map(p =>
            p.slot === eff.cardHeld!.slot ? { ...p, cards: [...p.cards, eff.cardHeld!.cardId] } : p
          );
        }
        if (eff.houseRemoved) {
          clearPlayers = clearPlayers.map(p => {
            if (p.slot !== eff.houseRemoved!.slot) return p;
            const key = String(eff.houseRemoved!.cellIndex);
            const h = p.houses || {};
            return { ...p, houses: { ...h, [key]: Math.max((h[key] || 0) - 1, 0) } };
          });
        }
        if (eff.goToIsland) {
          clearPlayers = clearPlayers.map(p =>
            p.slot === eff.slot ? { ...p, position: 27, islandTurns: 3 } : p
          );
        }
        if (eff.immunityNextRent) {
          clearPlayers = clearPlayers.map(p =>
            p.slot === eff.slot ? { ...p, immunityNextRent: true } : p
          );
        }
        // doubleRentTurns applied immediately in CARD_DRAWN — no deferred action needed
        if (eff.skipTurn) {
          clearPlayers = clearPlayers.map(p =>
            p.slot === eff.slot ? { ...p, skipNextTurn: true } : p
          );
        }
        // Swap: apply positions immediately so queued events (rent, buyback, action) aren't blocked.
        // pendingSwapAnim still triggers the visual CSS animation, but SWAP_ANIM_DONE only clears the flag.
        if (eff.swapPosition) {
          const sw = eff.swapPosition;
          clearSwapAnim = { slot: sw.slot, targetSlot: sw.targetSlot, myNewPos: sw.myNewPos, targetNewPos: sw.targetNewPos };
          clearPlayers = clearPlayers.map(p => {
            if (p.slot === sw.slot) return { ...p, position: sw.myNewPos };
            if (p.slot === sw.targetSlot) return { ...p, position: sw.targetNewPos };
            return p;
          });
        }
        if (eff.stolenProperty) {
          const st = eff.stolenProperty;
          const key = String(st.cellIndex);
          // Read victim's buildings BEFORE dedupeProperty removes them
          const victimP = clearPlayers.find(pp => pp.slot === st.fromSlot);
          const transferHouses = victimP ? (victimP.houses[key] || 0) : 0;
          // Defensive: remove property from ALL other players first
          clearPlayers = dedupeProperty(clearPlayers, st.cellIndex, st.toSlot);
          clearPlayers = clearPlayers.map(p => {
            if (p.slot === st.toSlot) {
              // Transfer property + houses to thief
              return {
                ...p,
                properties: [...p.properties.filter(idx => idx !== st.cellIndex), st.cellIndex],
                houses: transferHouses > 0 ? { ...p.houses, [key]: transferHouses } : p.houses,
              };
            }
            return p;
          });
          // Transfer festival to new owner if stolen property hosted it
          if (state.festival?.cellIndex === st.cellIndex && state.festival?.slot === st.fromSlot) {
            stolenFestival = { ...state.festival, slot: st.toSlot };
          }
        }
        if (eff.allHousesRemoved && eff.allHousesRemoved.length > 0) {
          for (const rem of eff.allHousesRemoved) {
            clearPlayers = clearPlayers.map(p => {
              if (p.slot !== rem.slot) return p;
              const key = String(rem.cellIndex);
              const h = p.houses || {};
              return { ...p, houses: { ...h, [key]: Math.max((h[key] || 0) - 1, 0) } };
            });
          }
        }
      }

      // If card triggered a move, start movement animation now
      const cm = state.pendingCardMove;
      if (cm) {
        const player = clearPlayers.find(p => p.slot === cm.slot);
        // Card move: teleport directly (single step, no cell-by-cell walk)
        const path: number[] = [cm.to];
        const goBonus = cm.passedGo ? 2000 : 0;
        const dpCm = goBonus ? freezePoints(state) : state.displayPoints;
        if (goBonus) {
          clearPlayers = clearPlayers.map(p =>
            p.slot === cm.slot ? { ...p, points: p.points + goBonus } : p
          );
        }
        return {
          ...state,
          animatingToken: null,
          drawnCard: null, houseRemovedCell: null, pendingCardMove: null, pendingCardEffect: null, cardExtraInfo: null,
          players: clearPlayers,
          pendingSwapAnim: eff?.swapPosition ? clearSwapAnim : null,
          ...(stolenFestival !== undefined ? { festival: stolenFestival } : {}),
          pendingMove: { slot: cm.slot, path, goBonus, passedGo: cm.passedGo, fromCard: true },
          pendingNotifs: goBonus ? queueNotifs(state.pendingNotifs, [{ slot: cm.slot, amount: goBonus }]) : state.pendingNotifs,
          displayPoints: dpCm,
        };
      }
      return { ...state, animatingToken: null, pendingMove: null, drawnCard: null, houseRemovedCell: null, pendingCardMove: null, pendingCardEffect: null, cardExtraInfo: null, players: clearPlayers, pendingSwapAnim: eff?.swapPosition ? clearSwapAnim : null, ...(stolenFestival !== undefined ? { festival: stolenFestival } : {}) };
    }

    case 'SWAP_ANIM_DONE': {
      // Positions already applied in CLEAR_CARD — just clear the visual animation flag
      if (!state.pendingSwapAnim) return state;
      return { ...state, pendingSwapAnim: null };
    }

    case 'HOUSE_BUILT': {
      const hbPrev = state.players.find(p => p.slot === action.payload.slot)?.points ?? 0;
      const hbDelta = (action.payload.remainingPoints ?? hbPrev) - hbPrev;
      const dpHb = hbDelta !== 0 ? freezePoints(state) : state.displayPoints;
      const updated = state.players.map(p => {
        if (p.slot !== action.payload.slot) return p;
        const key = String(action.payload.cellIndex);
        return {
          ...p,
          houses: { ...p.houses, [key]: action.payload.houseCount },
          points: action.payload.remainingPoints ?? p.points,
        };
      });
      return {
        ...state, players: updated, displayPoints: dpHb,
        pendingNotifs: hbDelta !== 0 ? queueNotifs(state.pendingNotifs, [{ slot: action.payload.slot, amount: hbDelta }]) : state.pendingNotifs,
      };
    }

    case 'HOTEL_BUILT': {
      const htPrev = state.players.find(p => p.slot === action.payload.slot)?.points ?? 0;
      const htDelta = (action.payload.remainingPoints ?? htPrev) - htPrev;
      const dpHt = htDelta !== 0 ? freezePoints(state) : state.displayPoints;
      const updated = state.players.map(p => {
        if (p.slot !== action.payload.slot) return p;
        const key = String(action.payload.cellIndex);
        return {
          ...p,
          houses: { ...p.houses, [key]: 0 },
          hotels: { ...p.hotels, [key]: true },
          points: action.payload.remainingPoints ?? p.points,
        };
      });
      return {
        ...state, players: updated, displayPoints: dpHt,
        pendingNotifs: htDelta !== 0 ? queueNotifs(state.pendingNotifs, [{ slot: action.payload.slot, amount: htDelta }]) : state.pendingNotifs,
      };
    }

    case 'ISLAND_ESCAPED': {
      const { slot: escSlot, costPaid, method: escMethod } = action.payload;
      const dpEsc = costPaid ? freezePoints(state) : state.displayPoints;
      const updated = state.players.map(p => {
        if (p.slot !== escSlot) return p;
        const upd = { ...p, islandTurns: 0, points: costPaid ? p.points - costPaid : p.points };
        // Remove escape-island card when used
        if (escMethod === 'USE_CARD') {
          const idx = upd.cards.indexOf('escape-island');
          if (idx !== -1) upd.cards = upd.cards.filter((_, i) => i !== idx);
        }
        return upd;
      });
      // PAY/USE_CARD: player still needs to roll → set ROLL_DICE phase
      // ROLL: backend handles movement directly, no phase change needed
      const escPhase = escMethod !== 'ROLL' ? 'ROLL_DICE' : state.turnPhase;
      return {
        ...state, players: updated, turnPhase: escPhase, displayPoints: dpEsc,
        pendingNotifs: costPaid ? queueNotifs(state.pendingNotifs, [{ slot: escSlot, amount: -costPaid }]) : state.pendingNotifs,
      };
    }

    case 'FESTIVAL_PROMPT':
      // Queue — applied after movement animation finishes
      // Clear stale queuedTurnChange to prevent it from overwriting turnPhase later
      return { ...state, queuedFestivalPrompt: true, queuedTurnChange: null };

    case 'FESTIVAL_APPLIED': {
      const { slot: fSlot, cellIndex: fCell, multiplier: fMult } = action.payload;
      return { ...state, festival: { slot: fSlot, cellIndex: fCell, multiplier: fMult || 1.5 } };
    }

    case 'APPLY_QUEUED_FESTIVAL':
      return { ...state, turnPhase: 'AWAITING_FESTIVAL', queuedFestivalPrompt: false };

    case 'APPLY_QUEUED_RENT_ALERT':
      return { ...state, rentAlert: state.queuedRentAlert, queuedRentAlert: null };

    case 'APPLY_QUEUED_TAX_ALERT':
      return { ...state, taxAlert: state.queuedTaxAlert, queuedTaxAlert: null };

    case 'APPLY_QUEUED_ISLAND_ALERT':
      return { ...state, islandAlertSlot: state.queuedIslandAlert, queuedIslandAlert: null };

    case 'BUILD_PROMPT':
      // Queue — applied after movement animation finishes
      // Clear stale queuedTurnChange to prevent it from overwriting turnPhase later
      return { ...state, queuedBuildPrompt: action.payload, queuedTurnChange: null };

    case 'APPLY_QUEUED_BUILD':
      return { ...state, turnPhase: 'AWAITING_BUILD', buildPrompt: state.queuedBuildPrompt, queuedBuildPrompt: null };

    case 'CLEAR_BUILD_PROMPT':
      return { ...state, buildPrompt: null };

    case 'FREE_HOUSE_PROMPT':
      // Queue — show after walk animation + go bonus modal finish
      // Clear card modal so queued prompt applies immediately (no race with card dismiss)
      return { ...state, queuedFreeHousePrompt: action.payload, queuedTurnChange: null,
        drawnCard: null, pendingCardMove: null, pendingCardEffect: null, cardExtraInfo: null, houseRemovedCell: null };

    case 'APPLY_QUEUED_FREE_HOUSE_PROMPT':
      if (!state.queuedFreeHousePrompt) return state;
      return { ...state, freeHousePrompt: state.queuedFreeHousePrompt, queuedFreeHousePrompt: null };

    case 'CLEAR_FREE_HOUSE_PROMPT':
      return { ...state, freeHousePrompt: null };

    case 'FREE_HOTEL_PROMPT':
      // Clear card modal so queued prompt applies immediately
      return { ...state, queuedFreeHotelPrompt: action.payload, queuedTurnChange: null,
        drawnCard: null, pendingCardMove: null, pendingCardEffect: null, cardExtraInfo: null, houseRemovedCell: null };

    case 'APPLY_QUEUED_FREE_HOTEL_PROMPT':
      if (!state.queuedFreeHotelPrompt) return state;
      return { ...state, freeHotelPrompt: state.queuedFreeHotelPrompt, queuedFreeHotelPrompt: null };

    case 'CLEAR_FREE_HOTEL_PROMPT':
      return { ...state, freeHotelPrompt: null };

    case 'GO_BONUS': {
      // Queue GO bonus — show after walk animation finishes
      const gbSlot = action.payload.slot;
      const gbAmt = action.payload.bonusType === 'BONUS_POINTS' ? (action.payload.amount || 0) : 0;
      const dpGb = gbAmt ? freezePoints(state) : state.displayPoints;
      return {
        ...state,
        queuedGoBonus: action.payload,
        queuedTurnChange: null,
        players: gbAmt ? state.players.map(p => p.slot === gbSlot ? { ...p, points: p.points + gbAmt } : p) : state.players,
        displayPoints: dpGb,
        pendingNotifs: gbAmt ? queueNotifs(state.pendingNotifs, [{ slot: gbSlot, amount: gbAmt }]) : state.pendingNotifs,
      };
    }

    case 'APPLY_QUEUED_GO_BONUS':
      if (!state.queuedGoBonus) return state;
      return { ...state, goBonusPrompt: state.queuedGoBonus, queuedGoBonus: null };

    case 'CLEAR_GO_BONUS':
      return { ...state, goBonusPrompt: null };

    case 'TRAVEL_PENDING':
      return { ...state, queuedTravelPending: action.payload.slot };

    case 'APPLY_QUEUED_TRAVEL_PENDING':
      return { ...state, travelPendingSlot: state.queuedTravelPending, queuedTravelPending: null };

    case 'CLEAR_TRAVEL_PENDING':
      return { ...state, travelPendingSlot: null };

    case 'SELL_PROMPT':
      return { ...state, queuedSellPrompt: { deficit: action.payload.deficit, sellPrices: action.payload.sellPrices, canCoverDebt: action.payload.canCoverDebt ?? true }, queuedTurnChange: null };

    case 'APPLY_QUEUED_SELL':
      return { ...state, turnPhase: 'AWAITING_SELL', sellPrompt: state.queuedSellPrompt, queuedSellPrompt: null };

    case 'BUILDINGS_SOLD': {
      const { slot: bsSlot, newPoints, houses: newHouses, hotels: newHotels, properties: newProps, autoSold, festival: bsFestival } = action.payload;
      const dpBs = freezePoints(state);
      const prevPoints = state.players.find(p => p.slot === bsSlot)?.points ?? 0;
      const bsDelta = newPoints - prevPoints;
      const updated = state.players.map(p =>
        p.slot === bsSlot ? { ...p, points: newPoints, houses: newHouses, hotels: newHotels, ...(newProps ? { properties: newProps } : {}) } : p
      );
      return {
        ...state, players: updated, sellPrompt: null, displayPoints: dpBs,
        festival: bsFestival !== undefined ? bsFestival : state.festival,
        pendingNotifs: bsDelta !== 0 ? queueNotifs(state.pendingNotifs, [{ slot: bsSlot, amount: bsDelta }]) : state.pendingNotifs,
        autoSoldAlert: autoSold?.length ? { slot: bsSlot, items: autoSold } : null,
      };
    }

    case 'PLAYER_NAME_UPDATED': {
      const updated = state.players.map(p =>
        p.slot === action.payload.slot ? { ...p, displayName: action.payload.name, guestName: action.payload.name } : p
      );
      return { ...state, players: updated };
    }

    case 'CHAT_MESSAGE':
      return { ...state, chatMessages: [...state.chatMessages, action.payload].slice(-50) };

    case 'REACTION': {
      const r: Reaction = {
        id: `r-${action.payload.slot}-${action.payload.timestamp}`,
        slot: action.payload.slot,
        emoji: action.payload.emoji,
        timestamp: action.payload.timestamp,
      };
      return { ...state, reactions: [...state.reactions, r].slice(-20) };
    }

    case 'DISMISS_REACTION':
      return { ...state, reactions: state.reactions.filter(r => r.id !== action.payload) };

    case 'ROOM_RESET': {
      const rg = action.payload.game;
      saveRoomSession(rg.roomCode);
      return {
        ...initialState,
        waitingRooms: state.waitingRooms,
        view: 'waiting' as TinhTuyView,
        roomId: rg.roomId,
        roomCode: rg.roomCode,
        settings: rg.settings,
        players: mapPlayers(rg.players),
        isHost: state.isHost,
        mySlot: state.mySlot,
        gameStatus: 'waiting',
      };
    }

    case 'LEAVE_ROOM':
      clearRoomSession();
      return { ...initialState, waitingRooms: state.waitingRooms };

    // ─── Ability Reducer Cases ───────────────────────────
    case 'ABILITY_MODAL':
      return { ...state, abilityModal: action.payload };

    case 'CLEAR_ABILITY_MODAL':
      return { ...state, abilityModal: null };

    case 'OWL_PICK_MODAL':
      return { ...state, owlPickModal: action.payload };

    case 'CLEAR_OWL_PICK_MODAL':
      return { ...state, owlPickModal: null };

    case 'HORSE_ADJUST_PROMPT':
      return { ...state, horseAdjustPrompt: action.payload };

    case 'CLEAR_HORSE_ADJUST_PROMPT':
      return { ...state, horseAdjustPrompt: null };

    case 'SHIBA_REROLL_PROMPT':
      return { ...state, shibaRerollPrompt: action.payload };

    case 'CLEAR_SHIBA_REROLL_PROMPT':
      return { ...state, shibaRerollPrompt: null };

    case 'SHIBA_REROLL_PICKED':
      // Update displayed dice to the chosen result and close the modal
      return {
        ...state,
        lastDiceResult: { dice1: action.payload.dice.dice1, dice2: action.payload.dice.dice2 },
        shibaRerollPrompt: null,
        diceAnimating: true,
      };

    case 'RABBIT_BONUS_PROMPT':
      return { ...state, rabbitBonusPrompt: action.payload };

    case 'CLEAR_RABBIT_BONUS_PROMPT':
      return { ...state, rabbitBonusPrompt: null };

    case 'ABILITY_USED': {
      const { slot: auSlot, cooldown: auCd, abilityId, targetSlot, cellIndex, amount } = action.payload;
      const auPlayers = state.players.map(p => {
        let u = p;
        // Caster: cooldown + flag
        if (p.slot === auSlot) {
          u = { ...u, abilityCooldown: auCd, abilityUsedThisTurn: true };
        }
        // Ability-specific state changes
        switch (abilityId) {
          case 'kungfu-active':
            // Target loses 1 house, gains refund
            if (p.slot === targetSlot && cellIndex != null) {
              const newH = { ...u.houses, [String(cellIndex)]: Math.max(0, (u.houses[String(cellIndex)] || 0) - 1) };
              u = { ...u, houses: newH, points: u.points + (amount || 0) };
            }
            break;
          case 'trau-active':
          case 'sloth-active':
            // Caster gains points
            if (p.slot === auSlot && amount) u = { ...u, points: u.points + amount };
            break;
          case 'canoc-active':
            // Caster steals from target
            if (p.slot === auSlot && amount != null) u = { ...u, points: u.points + amount };
            else if (p.slot === targetSlot && amount != null) u = { ...u, points: u.points - amount };
            break;
          case 'pigfish-active':
            if (p.slot === auSlot) u = { ...u, immunityNextRent: true };
            break;
        }
        return u;
      });
      // Build point notifications for abilities that change points
      const auNotifEntries: Array<{ slot: number; amount: number }> = [];
      if ((abilityId === 'trau-active' || abilityId === 'sloth-active') && amount) {
        auNotifEntries.push({ slot: auSlot, amount });
      } else if (abilityId === 'canoc-active' && amount && targetSlot != null) {
        auNotifEntries.push({ slot: auSlot, amount }, { slot: targetSlot, amount: -amount });
      } else if (abilityId === 'kungfu-active' && amount && targetSlot != null) {
        auNotifEntries.push({ slot: targetSlot, amount });
      }
      const auNotifs = auNotifEntries.length > 0 ? addNotifs(state.pointNotifs, auNotifEntries) : state.pointNotifs;
      return { ...state, players: auPlayers, abilityUsedAlert: action.payload, pointNotifs: auNotifs };
    }

    case 'CLEAR_ABILITY_USED_ALERT':
      return { ...state, abilityUsedAlert: null };

    case 'CHICKEN_DRAIN': {
      const { chickenSlot, drained, totalGained } = action.payload;
      const dpCd = freezePoints(state);
      const cdNotifs: Array<{ slot: number; amount: number }> = [{ slot: chickenSlot, amount: totalGained }];
      let cdPlayers = state.players.map(p => {
        if (p.slot === chickenSlot) return { ...p, points: p.points + totalGained };
        const drain = drained.find((d: any) => d.slot === p.slot);
        if (drain) {
          cdNotifs.push({ slot: p.slot, amount: -drain.amount });
          return { ...p, points: p.points - drain.amount };
        }
        return p;
      });
      return {
        ...state, players: cdPlayers, chickenDrainAlert: action.payload,
        displayPoints: dpCd, pendingNotifs: queueNotifs(state.pendingNotifs, cdNotifs),
      };
    }

    case 'CLEAR_CHICKEN_DRAIN':
      return { ...state, chickenDrainAlert: null };

    case 'SLOTH_AUTO_BUILD': {
      const { slot: sabSlot, cellIndex: sabCell, houseCount: sabHc } = action.payload;
      const sabPlayers = state.players.map(p =>
        p.slot === sabSlot ? { ...p, houses: { ...p.houses, [String(sabCell)]: sabHc } } : p
      );
      return { ...state, players: sabPlayers, slothAutoBuildAlert: action.payload };
    }

    case 'CLEAR_SLOTH_AUTO_BUILD':
      return { ...state, slothAutoBuildAlert: null };

    case 'FOX_SWAP_ALERT':
      return { ...state, foxSwapAlert: action.payload };

    case 'CLEAR_FOX_SWAP_ALERT':
      return { ...state, foxSwapAlert: null };

    default:
      return state;
  }
}

// ─── Context Type ─────────────────────────────────────
interface TinhTuyContextValue {
  state: TinhTuyState;
  createRoom: (payload: CreateRoomPayload) => void;
  joinRoom: (roomCode: string, password?: string) => void;
  leaveRoom: () => void;
  startGame: () => Promise<boolean>;
  rollDice: () => void;
  buyProperty: () => void;
  skipBuy: () => void;
  surrender: () => void;
  refreshRooms: () => void;
  setView: (view: TinhTuyView) => void;
  updateRoom: (payload: { settings?: Partial<TinhTuySettings> }) => Promise<boolean>;
  buildHouse: (cellIndex: number) => void;
  buildHotel: (cellIndex: number) => void;
  escapeIsland: (method: 'PAY' | 'ROLL' | 'USE_CARD') => void;
  sendChat: (message: string) => void;
  sendReaction: (reaction: string) => void;
  dismissReaction: (id: string) => void;
  updateGuestName: (guestName: string) => void;
  clearCard: () => void;
  clearRentAlert: () => void;
  clearTaxAlert: () => void;
  clearIslandAlert: () => void;
  clearTravelPending: () => void;
  travelTo: (cellIndex: number) => void;
  applyFestival: (cellIndex: number) => void;
  skipBuild: () => void;
  sellBuildings: (selections: Array<{ cellIndex: number; type: 'house' | 'hotel' | 'property'; count: number }>) => void;
  chooseFreeHouse: (cellIndex: number) => void;
  chooseFreeHotel: (cellIndex: number) => void;
  attackPropertyChoose: (cellIndex: number) => void;
  chooseDestination: (cellIndex: number) => void;
  forcedTradeChoose: (myCellIndex: number, opponentCellIndex: number) => void;
  rentFreezeChoose: (cellIndex: number) => void;
  chooseBuyBlockTarget: (targetSlot: number) => void;
  chooseEminentDomain: (cellIndex: number) => void;
  clearAttackAlert: () => void;
  clearForcedTradeAlert: () => void;
  clearAutoSold: () => void;
  clearGoBonus: () => void;
  clearBankruptAlert: () => void;
  clearMonopolyAlert: () => void;
  clearNearWinWarning: () => void;
  buybackProperty: (cellIndex: number, accept: boolean) => void;
  selectCharacter: (character: TinhTuyCharacter) => void;
  playAgain: () => void;
  negotiateSend: (targetSlot: number, cellIndex: number, offerAmount: number) => void;
  negotiateRespond: (accept: boolean) => void;
  negotiateCancel: () => void;
  openNegotiateWizard: () => void;
  closeNegotiateWizard: () => void;
  // Ability actions
  activateAbility: (data?: { targetSlot?: number; cellIndex?: number; steps?: number; deck?: string }) => void;
  owlPick: (cardId: string) => void;
  horseAdjustPick: (adjust: -1 | 0 | 1) => void;
  shibaReroll: () => void;
  shibaRerollPick: (choice: 'original' | 'rerolled') => void;
  rabbitBonusPick: (accept: boolean) => void;
  clearAbilityModal: () => void;
  clearAbilityUsedAlert: () => void;
  clearChickenDrain: () => void;
  clearSlothAutoBuild: () => void;
  clearFoxSwapAlert: () => void;
}

const TinhTuyContext = createContext<TinhTuyContextValue | undefined>(undefined);

// ─── Provider ─────────────────────────────────────────
export const TinhTuyProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(tinhTuyReducer, initialState);
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const { isConnected } = useSocket();
  const stateRef = useRef(state);
  stateRef.current = state;

  const getPlayerId = useCallback(() => {
    return isAuthenticated && user ? user._id : getGuestId();
  }, [isAuthenticated, user]);

  const getPlayerName = useCallback(() => {
    return isAuthenticated && user ? user.username : (getGuestName() || `Guest ${getGuestId().slice(-6)}`);
  }, [isAuthenticated, user]);

  // ─── Socket Listeners ───────────────────────────────
  useEffect(() => {
    const socket = socketService.getSocket();
    if (!socket) return;

    const handleRoomUpdated = (data: any) => {
      dispatch({ type: 'ROOM_UPDATED', payload: data });
    };

    const handleGameStarted = (data: any) => {
      dispatch({ type: 'GAME_STARTED', payload: data });
      getToast()?.success('tinhTuy.game.gameStarted');
    };

    const handleDiceResult = (data: any) => {
      dispatch({ type: 'DICE_RESULT', payload: data });
      tinhTuySounds.playSFX('diceRoll');
    };

    const handlePlayerMoved = (data: any) => {
      dispatch({ type: 'PLAYER_MOVED', payload: data });
    };

    const handleAwaitingAction = (data: any) => {
      dispatch({ type: 'AWAITING_ACTION', payload: data });
    };

    const handlePropertyBought = (data: any) => {
      dispatch({ type: 'PROPERTY_BOUGHT', payload: data });
      tinhTuySounds.playSFX('purchase');
    };

    const handleMonopolyCompleted = (data: any) => {
      dispatch({ type: 'MONOPOLY_COMPLETED', payload: data });
    };

    const handleRentPaid = (data: any) => {
      dispatch({ type: 'RENT_PAID', payload: data });
      // Sound deferred to APPLY_QUEUED_RENT_ALERT (after movement animation)
    };

    const handleTaxPaid = (data: any) => {
      dispatch({ type: 'TAX_PAID', payload: data });
    };

    const handleTurnChanged = (data: any) => {
      dispatch({ type: 'TURN_CHANGED', payload: data });
      // Sound deferred to APPLY_QUEUED_TURN_CHANGE effect
    };

    const handlePlayerBankrupt = (data: any) => {
      dispatch({ type: 'PLAYER_BANKRUPT', payload: data });
    };

    const handlePlayerSurrendered = (data: any) => {
      dispatch({ type: 'PLAYER_SURRENDERED', payload: data });
    };

    const handlePlayerIsland = (data: any) => {
      dispatch({ type: 'PLAYER_ISLAND', payload: data });
      // Sound deferred to APPLY_QUEUED_ISLAND_ALERT (after movement animation)
    };

    const handleGameFinished = (data: any) => {
      dispatch({ type: 'GAME_FINISHED', payload: data });
      // Victory sound deferred to APPLY_QUEUED_GAME_FINISHED (after all alerts)
    };

    const handlePlayerDisconnected = (data: any) => {
      dispatch({ type: 'PLAYER_DISCONNECTED', payload: data });
    };

    const handlePlayerReconnected = (data: any) => {
      dispatch({ type: 'PLAYER_RECONNECTED', payload: data });
    };

    const handleCardDrawn = (data: any) => {
      dispatch({ type: 'CARD_DRAWN', payload: data });
      tinhTuySounds.playSFX('cardDraw');
      // Auto-dismiss moved to TinhTuyCardModal — starts when card is actually visible
    };

    const handleHouseBuilt = (data: any) => {
      dispatch({ type: 'HOUSE_BUILT', payload: data });
      tinhTuySounds.playSFX('buildHouse');
    };

    const handleHotelBuilt = (data: any) => {
      dispatch({ type: 'HOTEL_BUILT', payload: data });
      tinhTuySounds.playSFX('buildHouse');
    };

    const handleIslandEscaped = (data: any) => {
      dispatch({ type: 'ISLAND_ESCAPED', payload: data });
    };

    const handleFestivalPrompt = (data: any) => {
      dispatch({ type: 'FESTIVAL_PROMPT', payload: data });
    };

    const handleBuildPrompt = (data: any) => {
      dispatch({ type: 'BUILD_PROMPT', payload: data });
    };

    const handleFreeHousePrompt = (data: any) => {
      dispatch({ type: 'FREE_HOUSE_PROMPT', payload: data });
    };

    const handleFreeHotelPrompt = (data: any) => {
      dispatch({ type: 'FREE_HOTEL_PROMPT', payload: data });
    };

    const handleSellPrompt = (data: any) => {
      dispatch({ type: 'SELL_PROMPT', payload: data });
    };

    const handleBuildingsSold = (data: any) => {
      dispatch({ type: 'BUILDINGS_SOLD', payload: data });
    };

    const handleAttackPropertyPrompt = (data: any) => {
      // Only dispatch for the attacker — opponents keep seeing the card modal (auto-dismiss)
      if (data.slot === stateRef.current.mySlot) {
        dispatch({ type: 'ATTACK_PROPERTY_PROMPT', payload: data });
      }
    };

    const handlePropertyAttacked = (data: any) => {
      dispatch({ type: 'PROPERTY_ATTACKED', payload: data });
    };

    const handleBuybackPrompt = (data: any) => {
      dispatch({ type: 'BUYBACK_PROMPT', payload: data });
    };

    const handleBuybackCompleted = (data: any) => {
      dispatch({ type: 'BUYBACK_COMPLETED', payload: data });
      tinhTuySounds.playSFX('purchase');
    };

    const handleTravelPending = (data: any) => {
      dispatch({ type: 'TRAVEL_PENDING', payload: data });
    };

    const handleFestivalApplied = (data: any) => {
      dispatch({ type: 'FESTIVAL_APPLIED', payload: data });
    };

    const handleTravelPrompt = (data: any) => {
      dispatch({ type: 'TRAVEL_PROMPT', payload: data });
    };
    const handleCardDestinationPrompt = (data: any) => {
      if (data.slot === stateRef.current.mySlot) {
        dispatch({ type: 'CARD_DESTINATION_PROMPT', payload: data });
      }
    };
    const handleForcedTradePrompt = (data: any) => {
      if (data.slot === stateRef.current.mySlot) {
        dispatch({ type: 'FORCED_TRADE_PROMPT', payload: data });
      }
    };
    const handleForcedTradeDone = (data: any) => {
      dispatch({ type: 'FORCED_TRADE_DONE', payload: data });
    };
    const handleRentFreezePrompt = (data: any) => {
      if (data.slot === stateRef.current.mySlot) {
        dispatch({ type: 'RENT_FREEZE_PROMPT', payload: data });
      }
    };
    const handleRentFrozen = (data: any) => {
      dispatch({ type: 'RENT_FROZEN', payload: data });
    };

    const handleBuyBlockPrompt = (data: any) => {
      if (data.slot === stateRef.current.mySlot) {
        dispatch({ type: 'BUY_BLOCK_PROMPT', payload: data });
      }
    };
    const handleBuyBlocked = (data: any) => {
      // Update target's buyBlockedTurns locally
      const turnsRaw = data.turns || 2;
      const updated = stateRef.current.players.map(p =>
        p.slot === data.targetSlot ? { ...p, buyBlockedTurns: turnsRaw } : p
      );
      dispatch({ type: 'ROOM_UPDATED', payload: { players: updated } });
      dispatch({ type: 'CLEAR_BUY_BLOCK_PROMPT' });
    };
    const handleEminentDomainPrompt = (data: any) => {
      if (data.slot === stateRef.current.mySlot) {
        dispatch({ type: 'EMINENT_DOMAIN_PROMPT', payload: data });
      }
    };
    const handleEminentDomainApplied = (data: any) => {
      // Transfer property from victim to buyer
      const { buyerSlot, victimSlot, cellIndex, price, houses } = data;
      const key = String(cellIndex);
      let edPlayers = dedupeProperty(stateRef.current.players, cellIndex, buyerSlot);
      edPlayers = edPlayers.map(p => {
        if (p.slot === victimSlot) {
          const newHouses = { ...p.houses }; delete newHouses[key];
          const newHotels = { ...p.hotels }; delete newHotels[key];
          return { ...p, properties: p.properties.filter(idx => idx !== cellIndex), points: p.points + price, houses: newHouses, hotels: newHotels };
        }
        if (p.slot === buyerSlot) {
          return {
            ...p, points: p.points - price,
            properties: [...p.properties.filter(idx => idx !== cellIndex), cellIndex],
            houses: houses > 0 ? { ...p.houses, [key]: houses } : p.houses,
          };
        }
        return p;
      });
      // Transfer festival if needed
      let newFestival = stateRef.current.festival;
      if (newFestival && newFestival.cellIndex === cellIndex && newFestival.slot === victimSlot) {
        newFestival = { ...newFestival, slot: buyerSlot };
      }
      dispatch({ type: 'ROOM_UPDATED', payload: { players: edPlayers } });
      dispatch({ type: 'CLEAR_EMINENT_DOMAIN_PROMPT' });
    };

    const handleNegotiateIncoming = (data: any) => {
      dispatch({ type: 'NEGOTIATE_INCOMING', payload: data });
    };
    const handleNegotiateCompleted = (data: any) => {
      dispatch({ type: 'NEGOTIATE_COMPLETED', payload: data });
    };
    const handleNegotiateCancelled = (data: any) => {
      dispatch({ type: 'NEGOTIATE_CANCELLED', payload: data });
    };

    // Ability socket listeners
    const handleAbilityUsed = (data: any) => {
      dispatch({ type: 'ABILITY_USED', payload: data });
    };
    const handleAbilityPrompt = (data: any) => {
      dispatch({ type: 'ABILITY_MODAL', payload: data });
    };
    const handleOwlPickPrompt = (data: any) => {
      dispatch({ type: 'OWL_PICK_MODAL', payload: data });
    };
    const handleHorseAdjustPrompt = (data: any) => {
      dispatch({ type: 'HORSE_ADJUST_PROMPT', payload: data });
    };
    const handleHorseAdjustPicked = () => {
      dispatch({ type: 'CLEAR_HORSE_ADJUST_PROMPT' });
    };
    const handleShibaRerollPrompt = (data: any) => {
      dispatch({ type: 'SHIBA_REROLL_PROMPT', payload: data });
    };
    const handleShibaRerollPicked = (data: any) => {
      dispatch({ type: 'SHIBA_REROLL_PICKED', payload: data });
    };
    const handleRabbitBonusPrompt = (data: any) => {
      dispatch({ type: 'RABBIT_BONUS_PROMPT', payload: data });
    };
    const handleRabbitBonusPicked = () => {
      dispatch({ type: 'CLEAR_RABBIT_BONUS_PROMPT' });
    };
    const handleChickenDrain = (data: any) => {
      dispatch({ type: 'CHICKEN_DRAIN', payload: data });
    };
    const handleSlothAutoBuild = (data: any) => {
      dispatch({ type: 'SLOTH_AUTO_BUILD', payload: data });
    };
    const handleFoxSwap = (data: any) => {
      // Fox swap: update positions for both players
      const { mySlot, targetSlot, myNewPos, targetNewPos } = data;
      const swapped = stateRef.current.players.map(p => {
        if (p.slot === mySlot) return { ...p, position: myNewPos };
        if (p.slot === targetSlot) return { ...p, position: targetNewPos };
        return p;
      });
      dispatch({ type: 'ROOM_UPDATED', payload: { players: swapped } });
      dispatch({ type: 'FOX_SWAP_ALERT', payload: { foxSlot: mySlot, targetSlot, foxNewPos: myNewPos, targetNewPos } });
    };

    const handlePlayerNameUpdated = (data: any) => {
      dispatch({ type: 'PLAYER_NAME_UPDATED', payload: data });
    };

    const handleGoBonus = (data: any) => {
      dispatch({ type: 'GO_BONUS', payload: data });
    };

    const handleNearWinWarning = (data: any) => {
      dispatch({ type: 'NEAR_WIN_WARNING', payload: data });
    };

    const handleRoomReset = (data: any) => {
      dispatch({ type: 'ROOM_RESET', payload: data });
    };

    const handleChatMessage = (data: any) => {
      dispatch({ type: 'CHAT_MESSAGE', payload: data });
      tinhTuySounds.playSFX('chat');
    };

    const handleReaction = (data: any) => {
      dispatch({ type: 'REACTION', payload: data });
    };

    // Auto-refresh lobby
    const handleLobbyUpdated = async () => {
      if (stateRef.current.view !== 'lobby') return;
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_BASE_URL}/tinh-tuy/rooms`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const rooms: WaitingRoomInfo[] = await res.json();
          dispatch({ type: 'SET_ROOMS', payload: rooms });
        }
      } catch { /* ignore */ }
    };

    socket.on('tinh-tuy:room-updated' as any, handleRoomUpdated);
    socket.on('tinh-tuy:game-started' as any, handleGameStarted);
    socket.on('tinh-tuy:dice-result' as any, handleDiceResult);
    socket.on('tinh-tuy:player-moved' as any, handlePlayerMoved);
    socket.on('tinh-tuy:awaiting-action' as any, handleAwaitingAction);
    socket.on('tinh-tuy:property-bought' as any, handlePropertyBought);
    socket.on('tinh-tuy:monopoly-completed' as any, handleMonopolyCompleted);
    socket.on('tinh-tuy:rent-paid' as any, handleRentPaid);
    socket.on('tinh-tuy:tax-paid' as any, handleTaxPaid);
    socket.on('tinh-tuy:turn-changed' as any, handleTurnChanged);
    socket.on('tinh-tuy:player-bankrupt' as any, handlePlayerBankrupt);
    socket.on('tinh-tuy:player-surrendered' as any, handlePlayerSurrendered);
    socket.on('tinh-tuy:player-island' as any, handlePlayerIsland);
    socket.on('tinh-tuy:game-finished' as any, handleGameFinished);
    socket.on('tinh-tuy:player-disconnected' as any, handlePlayerDisconnected);
    socket.on('tinh-tuy:player-reconnected' as any, handlePlayerReconnected);
    socket.on('tinh-tuy:card-drawn' as any, handleCardDrawn);
    socket.on('tinh-tuy:house-built' as any, handleHouseBuilt);
    socket.on('tinh-tuy:hotel-built' as any, handleHotelBuilt);
    socket.on('tinh-tuy:island-escaped' as any, handleIslandEscaped);
    socket.on('tinh-tuy:festival-prompt' as any, handleFestivalPrompt);
    socket.on('tinh-tuy:festival-applied' as any, handleFestivalApplied);
    socket.on('tinh-tuy:build-prompt' as any, handleBuildPrompt);
    socket.on('tinh-tuy:free-house-prompt' as any, handleFreeHousePrompt);
    socket.on('tinh-tuy:free-hotel-prompt' as any, handleFreeHotelPrompt);
    socket.on('tinh-tuy:sell-prompt' as any, handleSellPrompt);
    socket.on('tinh-tuy:travel-pending' as any, handleTravelPending);
    socket.on('tinh-tuy:buildings-sold' as any, handleBuildingsSold);
    socket.on('tinh-tuy:attack-property-prompt' as any, handleAttackPropertyPrompt);
    socket.on('tinh-tuy:property-attacked' as any, handlePropertyAttacked);
    socket.on('tinh-tuy:buyback-prompt' as any, handleBuybackPrompt);
    socket.on('tinh-tuy:buyback-completed' as any, handleBuybackCompleted);
    socket.on('tinh-tuy:travel-prompt' as any, handleTravelPrompt);
    socket.on('tinh-tuy:card-destination-prompt' as any, handleCardDestinationPrompt);
    socket.on('tinh-tuy:forced-trade-prompt' as any, handleForcedTradePrompt);
    socket.on('tinh-tuy:forced-trade-done' as any, handleForcedTradeDone);
    socket.on('tinh-tuy:rent-freeze-prompt' as any, handleRentFreezePrompt);
    socket.on('tinh-tuy:rent-frozen' as any, handleRentFrozen);
    socket.on('tinh-tuy:buy-block-prompt' as any, handleBuyBlockPrompt);
    socket.on('tinh-tuy:buy-blocked' as any, handleBuyBlocked);
    socket.on('tinh-tuy:eminent-domain-prompt' as any, handleEminentDomainPrompt);
    socket.on('tinh-tuy:eminent-domain-applied' as any, handleEminentDomainApplied);
    socket.on('tinh-tuy:negotiate-incoming' as any, handleNegotiateIncoming);
    socket.on('tinh-tuy:negotiate-completed' as any, handleNegotiateCompleted);
    socket.on('tinh-tuy:negotiate-cancelled' as any, handleNegotiateCancelled);
    socket.on('tinh-tuy:ability-used' as any, handleAbilityUsed);
    socket.on('tinh-tuy:ability-prompt' as any, handleAbilityPrompt);
    socket.on('tinh-tuy:owl-pick-prompt' as any, handleOwlPickPrompt);
    socket.on('tinh-tuy:horse-adjust-prompt' as any, handleHorseAdjustPrompt);
    socket.on('tinh-tuy:horse-adjust-picked' as any, handleHorseAdjustPicked);
    socket.on('tinh-tuy:shiba-reroll-prompt' as any, handleShibaRerollPrompt);
    socket.on('tinh-tuy:shiba-reroll-picked' as any, handleShibaRerollPicked);
    socket.on('tinh-tuy:rabbit-bonus-prompt' as any, handleRabbitBonusPrompt);
    socket.on('tinh-tuy:rabbit-bonus-picked' as any, handleRabbitBonusPicked);
    socket.on('tinh-tuy:chicken-drain' as any, handleChickenDrain);
    socket.on('tinh-tuy:sloth-auto-build' as any, handleSlothAutoBuild);
    socket.on('tinh-tuy:fox-swap' as any, handleFoxSwap);
    socket.on('tinh-tuy:near-win-warning' as any, handleNearWinWarning);
    socket.on('tinh-tuy:player-name-updated' as any, handlePlayerNameUpdated);
    socket.on('tinh-tuy:chat-message' as any, handleChatMessage);
    socket.on('tinh-tuy:reaction' as any, handleReaction);
    socket.on('tinh-tuy:room-reset' as any, handleRoomReset);
    socket.on('tinh-tuy:go-bonus' as any, handleGoBonus);
    socket.on('tinh-tuy:late-game-started' as any, () => dispatch({ type: 'LATE_GAME_STARTED' }));
    socket.on('tinh-tuy:room-created' as any, handleLobbyUpdated);
    socket.on('tinh-tuy:lobby-room-updated' as any, handleLobbyUpdated);

    return () => {
      socket.off('tinh-tuy:room-updated' as any, handleRoomUpdated);
      socket.off('tinh-tuy:game-started' as any, handleGameStarted);
      socket.off('tinh-tuy:dice-result' as any, handleDiceResult);
      socket.off('tinh-tuy:player-moved' as any, handlePlayerMoved);
      socket.off('tinh-tuy:awaiting-action' as any, handleAwaitingAction);
      socket.off('tinh-tuy:property-bought' as any, handlePropertyBought);
      socket.off('tinh-tuy:monopoly-completed' as any, handleMonopolyCompleted);
      socket.off('tinh-tuy:rent-paid' as any, handleRentPaid);
      socket.off('tinh-tuy:tax-paid' as any, handleTaxPaid);
      socket.off('tinh-tuy:turn-changed' as any, handleTurnChanged);
      socket.off('tinh-tuy:player-bankrupt' as any, handlePlayerBankrupt);
      socket.off('tinh-tuy:player-surrendered' as any, handlePlayerSurrendered);
      socket.off('tinh-tuy:player-island' as any, handlePlayerIsland);
      socket.off('tinh-tuy:game-finished' as any, handleGameFinished);
      socket.off('tinh-tuy:player-disconnected' as any, handlePlayerDisconnected);
      socket.off('tinh-tuy:player-reconnected' as any, handlePlayerReconnected);
      socket.off('tinh-tuy:card-drawn' as any, handleCardDrawn);
      socket.off('tinh-tuy:house-built' as any, handleHouseBuilt);
      socket.off('tinh-tuy:hotel-built' as any, handleHotelBuilt);
      socket.off('tinh-tuy:island-escaped' as any, handleIslandEscaped);
      socket.off('tinh-tuy:festival-prompt' as any, handleFestivalPrompt);
      socket.off('tinh-tuy:festival-applied' as any, handleFestivalApplied);
      socket.off('tinh-tuy:build-prompt' as any, handleBuildPrompt);
      socket.off('tinh-tuy:free-house-prompt' as any, handleFreeHousePrompt);
      socket.off('tinh-tuy:free-hotel-prompt' as any, handleFreeHotelPrompt);
      socket.off('tinh-tuy:sell-prompt' as any, handleSellPrompt);
      socket.off('tinh-tuy:travel-pending' as any, handleTravelPending);
      socket.off('tinh-tuy:buildings-sold' as any, handleBuildingsSold);
      socket.off('tinh-tuy:attack-property-prompt' as any, handleAttackPropertyPrompt);
      socket.off('tinh-tuy:property-attacked' as any, handlePropertyAttacked);
      socket.off('tinh-tuy:buyback-prompt' as any, handleBuybackPrompt);
      socket.off('tinh-tuy:buyback-completed' as any, handleBuybackCompleted);
      socket.off('tinh-tuy:travel-prompt' as any, handleTravelPrompt);
      socket.off('tinh-tuy:card-destination-prompt' as any, handleCardDestinationPrompt);
      socket.off('tinh-tuy:forced-trade-prompt' as any, handleForcedTradePrompt);
      socket.off('tinh-tuy:forced-trade-done' as any, handleForcedTradeDone);
      socket.off('tinh-tuy:rent-freeze-prompt' as any, handleRentFreezePrompt);
      socket.off('tinh-tuy:rent-frozen' as any, handleRentFrozen);
      socket.off('tinh-tuy:buy-block-prompt' as any, handleBuyBlockPrompt);
      socket.off('tinh-tuy:buy-blocked' as any, handleBuyBlocked);
      socket.off('tinh-tuy:eminent-domain-prompt' as any, handleEminentDomainPrompt);
      socket.off('tinh-tuy:eminent-domain-applied' as any, handleEminentDomainApplied);
      socket.off('tinh-tuy:negotiate-incoming' as any, handleNegotiateIncoming);
      socket.off('tinh-tuy:negotiate-completed' as any, handleNegotiateCompleted);
      socket.off('tinh-tuy:negotiate-cancelled' as any, handleNegotiateCancelled);
      socket.off('tinh-tuy:ability-used' as any, handleAbilityUsed);
      socket.off('tinh-tuy:ability-prompt' as any, handleAbilityPrompt);
      socket.off('tinh-tuy:owl-pick-prompt' as any, handleOwlPickPrompt);
      socket.off('tinh-tuy:horse-adjust-prompt' as any, handleHorseAdjustPrompt);
      socket.off('tinh-tuy:horse-adjust-picked' as any, handleHorseAdjustPicked);
      socket.off('tinh-tuy:shiba-reroll-prompt' as any, handleShibaRerollPrompt);
      socket.off('tinh-tuy:shiba-reroll-picked' as any, handleShibaRerollPicked);
      socket.off('tinh-tuy:rabbit-bonus-prompt' as any, handleRabbitBonusPrompt);
      socket.off('tinh-tuy:rabbit-bonus-picked' as any, handleRabbitBonusPicked);
      socket.off('tinh-tuy:chicken-drain' as any, handleChickenDrain);
      socket.off('tinh-tuy:sloth-auto-build' as any, handleSlothAutoBuild);
      socket.off('tinh-tuy:fox-swap' as any, handleFoxSwap);
      socket.off('tinh-tuy:near-win-warning' as any, handleNearWinWarning);
      socket.off('tinh-tuy:player-name-updated' as any, handlePlayerNameUpdated);
      socket.off('tinh-tuy:chat-message' as any, handleChatMessage);
      socket.off('tinh-tuy:reaction' as any, handleReaction);
      socket.off('tinh-tuy:room-reset' as any, handleRoomReset);
      socket.off('tinh-tuy:go-bonus' as any, handleGoBonus);
      socket.off('tinh-tuy:late-game-started' as any);
      socket.off('tinh-tuy:room-created' as any, handleLobbyUpdated);
      socket.off('tinh-tuy:lobby-room-updated' as any, handleLobbyUpdated);
    };
  }, [isConnected]);

  // ─── Actions ────────────────────────────────────────

  const refreshRooms = useCallback(async () => {
    dispatch({ type: 'SET_LOADING_ROOMS', payload: true });
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/tinh-tuy/rooms`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const rooms: WaitingRoomInfo[] = await res.json();
        dispatch({ type: 'SET_ROOMS', payload: rooms });
      }
    } catch {
      dispatch({ type: 'SET_LOADING_ROOMS', payload: false });
    }
  }, []);

  const createRoom = useCallback((payload: CreateRoomPayload) => {
    const socket = socketService.getSocket();
    if (!socket) return;

    const playerId = getPlayerId();
    const playerName = getPlayerName();

    socket.emit('tinh-tuy:create-room' as any, {
      settings: { ...DEFAULT_SETTINGS, ...payload.settings },
      password: payload.password,
      userId: isAuthenticated ? playerId : undefined,
      guestId: isAuthenticated ? undefined : playerId,
      guestName: isAuthenticated ? undefined : playerName,
    }, (res: any) => {
      if (res?.success) {
        dispatch({
          type: 'ROOM_CREATED',
          payload: {
            roomId: res.roomId, roomCode: res.roomCode,
            settings: res.settings, players: res.players || [],
          },
        });
        dispatch({ type: 'SET_MY_SLOT', payload: 1 });
        dispatch({ type: 'SET_HOST', payload: true });
        getToast()?.success('tinhTuy.lobby.roomCreated');
      } else if (res) {
        dispatch({ type: 'SET_ERROR', payload: res.error || 'failedToCreate' });
      }
    });
  }, [getPlayerId, getPlayerName, isAuthenticated]);

  const joinRoom = useCallback((roomCode: string, password?: string) => {
    const socket = socketService.getSocket();
    if (!socket) {
      dispatch({ type: 'SET_ERROR', payload: 'socketNotConnected' });
      return;
    }

    const playerId = getPlayerId();
    const playerName = getPlayerName();

    socket.emit('tinh-tuy:join-room' as any, {
      roomCode: roomCode.toUpperCase(),
      password,
      userId: isAuthenticated ? playerId : undefined,
      guestId: isAuthenticated ? undefined : playerId,
      guestName: isAuthenticated ? undefined : playerName,
    }, (res: any) => {
      if (res && !res.success) {
        if (res.error === 'roomNotFound') clearRoomSession();
        dispatch({ type: 'SET_ERROR', payload: res.error || 'failedToJoin' });
      } else if (res?.success) {
        dispatch({
          type: 'ROOM_JOINED',
          payload: {
            roomId: res.roomId, roomCode: res.roomCode,
            settings: res.settings, players: res.players || [],
            gameStatus: res.game?.gameStatus || 'waiting',
            reconnected: res.reconnected, game: res.game,
          },
        });
        // Find my slot
        const me = (res.players || res.game?.players || []).find((p: any) =>
          (isAuthenticated && p.userId?.toString?.() === playerId) ||
          (!isAuthenticated && p.guestId === playerId)
        );
        if (me) {
          dispatch({ type: 'SET_MY_SLOT', payload: me.slot });
          // Restore negotiate cooldown on reconnect
          if (res.game?.negotiateCooldowns) {
            const cd = res.game.negotiateCooldowns[String(me.slot)] || 0;
            if (cd > 0) dispatch({ type: 'NEGOTIATE_COMPLETED', payload: { accepted: false, fromSlot: me.slot, toSlot: 0, cooldownUntilRound: cd } });
          }
        }
        // Check host
        const hostId = res.game?.hostPlayerId || res.hostPlayerId;
        dispatch({ type: 'SET_HOST', payload: hostId === playerId });
      }
    });
  }, [getPlayerId, getPlayerName, isAuthenticated]);

  const leaveRoom = useCallback(() => {
    const socket = socketService.getSocket();
    if (!socket || !stateRef.current.roomId) return;

    socket.emit('tinh-tuy:leave-room' as any, {}, (res: any) => {
      // ignore result
    });
    dispatch({ type: 'LEAVE_ROOM' });
    setTimeout(() => refreshRooms(), 300);
  }, [refreshRooms]);

  const startGame = useCallback((): Promise<boolean> => {
    return new Promise((resolve) => {
      const socket = socketService.getSocket();
      if (!socket || !stateRef.current.roomId) { resolve(false); return; }

      const timeout = setTimeout(() => resolve(false), 10_000);

      socket.emit('tinh-tuy:start-game' as any, {}, (res: any) => {
        clearTimeout(timeout);
        if (res && !res.success) {
          dispatch({ type: 'SET_ERROR', payload: res.error || 'failedToStart' });
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  }, []);

  const rollDice = useCallback(() => {
    const socket = socketService.getSocket();
    if (!socket) return;
    socket.emit('tinh-tuy:roll-dice' as any, {}, (res: any) => {
      if (res && !res.success) {
        dispatch({ type: 'SET_ERROR', payload: res.error });
      }
    });
  }, []);

  const buyProperty = useCallback(() => {
    const socket = socketService.getSocket();
    if (!socket) return;
    socket.emit('tinh-tuy:buy-property' as any, {}, (res: any) => {
      if (res && !res.success) {
        dispatch({ type: 'SET_ERROR', payload: res.error });
      }
    });
  }, []);

  const skipBuy = useCallback(() => {
    const socket = socketService.getSocket();
    if (!socket) return;
    socket.emit('tinh-tuy:skip-buy' as any, {}, (res: any) => {
      if (res && !res.success) {
        dispatch({ type: 'SET_ERROR', payload: res.error });
      }
    });
  }, []);

  const surrender = useCallback(() => {
    const socket = socketService.getSocket();
    if (!socket) return;
    socket.emit('tinh-tuy:surrender' as any, {}, (res: any) => {
      if (res && !res.success) {
        dispatch({ type: 'SET_ERROR', payload: res.error });
      }
    });
  }, []);

  const updateRoom = useCallback((payload: { settings?: Partial<TinhTuySettings> }): Promise<boolean> => {
    return new Promise((resolve) => {
      const socket = socketService.getSocket();
      if (!socket || !stateRef.current.roomId) { resolve(false); return; }

      socket.emit('tinh-tuy:update-room' as any, payload, (res: any) => {
        if (res?.success) {
          resolve(true);
        } else {
          dispatch({ type: 'SET_ERROR', payload: res?.error || 'failedToUpdate' });
          resolve(false);
        }
      });
    });
  }, []);

  const buildHouse = useCallback((cellIndex: number) => {
    const socket = socketService.getSocket();
    if (!socket) return;
    socket.emit('tinh-tuy:build-house' as any, { cellIndex }, (res: any) => {
      if (res && !res.success) dispatch({ type: 'SET_ERROR', payload: res.error });
    });
  }, []);

  const buildHotel = useCallback((cellIndex: number) => {
    const socket = socketService.getSocket();
    if (!socket) return;
    socket.emit('tinh-tuy:build-hotel' as any, { cellIndex }, (res: any) => {
      if (res && !res.success) dispatch({ type: 'SET_ERROR', payload: res.error });
    });
  }, []);

  const escapeIsland = useCallback((method: 'PAY' | 'ROLL' | 'USE_CARD') => {
    const socket = socketService.getSocket();
    if (!socket) return;
    socket.emit('tinh-tuy:escape-island' as any, { method }, (res: any) => {
      if (res && !res.success) dispatch({ type: 'SET_ERROR', payload: res.error });
    });
  }, []);

  const updateGuestName = useCallback((guestName: string) => {
    const socket = socketService.getSocket();
    if (!socket) return;
    socket.emit('tinh-tuy:update-guest-name' as any, { guestName }, (res: any) => {
      if (res && !res.success) {
        dispatch({ type: 'SET_ERROR', payload: res.error });
      }
    });
  }, []);

  const sendChat = useCallback((message: string) => {
    const socket = socketService.getSocket();
    if (!socket) return;
    socket.emit('tinh-tuy:send-chat' as any, { message }, (res: any) => {
      if (res && !res.success && res.error !== 'tooFast') {
        dispatch({ type: 'SET_ERROR', payload: res.error });
      }
    });
  }, []);

  const sendReaction = useCallback((reaction: string) => {
    const socket = socketService.getSocket();
    if (!socket) return;
    socket.emit('tinh-tuy:send-reaction' as any, { emoji: reaction }, (res: any) => {
      // Silently ignore reaction errors
    });
  }, []);

  const dismissReaction = useCallback((id: string) => {
    dispatch({ type: 'DISMISS_REACTION', payload: id });
  }, []);

  const setView = useCallback((view: TinhTuyView) => {
    dispatch({ type: 'SET_VIEW', payload: view });
  }, []);

  const clearCard = useCallback(() => {
    dispatch({ type: 'CLEAR_CARD' });
    // Notify backend so it can advance the turn immediately instead of waiting full timer
    if (stateRef.current.currentPlayerSlot === stateRef.current.mySlot) {
      const socket = socketService.getSocket();
      socket?.emit('tinh-tuy:card-dismiss' as any);
    }
  }, []);

  const clearRentAlert = useCallback(() => {
    dispatch({ type: 'CLEAR_RENT_ALERT' });
  }, []);

  const clearTaxAlert = useCallback(() => {
    dispatch({ type: 'CLEAR_TAX_ALERT' });
  }, []);

  const clearIslandAlert = useCallback(() => {
    dispatch({ type: 'CLEAR_ISLAND_ALERT' });
  }, []);

  const clearTravelPending = useCallback(() => {
    dispatch({ type: 'CLEAR_TRAVEL_PENDING' });
  }, []);

  const travelTo = useCallback((cellIndex: number) => {
    const socket = socketService.getSocket();
    if (!socket) return;
    socket.emit('tinh-tuy:travel-to' as any, { cellIndex }, (res: any) => {
      if (res && !res.success) dispatch({ type: 'SET_ERROR', payload: res.error });
    });
  }, []);

  const chooseDestination = useCallback((cellIndex: number) => {
    const socket = socketService.getSocket();
    if (!socket) return;
    socket.emit('tinh-tuy:card-choose-destination' as any, { cellIndex }, (res: any) => {
      if (res && !res.success) dispatch({ type: 'SET_ERROR', payload: res.error });
    });
  }, []);

  const forcedTradeChoose = useCallback((myCellIndex: number, opponentCellIndex: number) => {
    const socket = socketService.getSocket();
    if (!socket) return;
    socket.emit('tinh-tuy:forced-trade-choose' as any, { myCellIndex, opponentCellIndex }, (res: any) => {
      if (res && !res.success) dispatch({ type: 'SET_ERROR', payload: res.error });
    });
  }, []);

  const rentFreezeChoose = useCallback((cellIndex: number) => {
    const socket = socketService.getSocket();
    if (!socket) return;
    socket.emit('tinh-tuy:rent-freeze-choose' as any, { cellIndex }, (res: any) => {
      if (res && !res.success) dispatch({ type: 'SET_ERROR', payload: res.error });
    });
  }, []);

  const chooseBuyBlockTarget = useCallback((targetSlot: number) => {
    const socket = socketService.getSocket();
    if (!socket) return;
    dispatch({ type: 'CLEAR_BUY_BLOCK_PROMPT' });
    socket.emit('tinh-tuy:buy-block-choose' as any, { targetSlot }, (res: any) => {
      if (res && !res.success) dispatch({ type: 'SET_ERROR', payload: res.error });
    });
  }, []);

  const chooseEminentDomain = useCallback((cellIndex: number) => {
    const socket = socketService.getSocket();
    if (!socket) return;
    dispatch({ type: 'CLEAR_EMINENT_DOMAIN_PROMPT' });
    socket.emit('tinh-tuy:eminent-domain-choose' as any, { cellIndex }, (res: any) => {
      if (res && !res.success) dispatch({ type: 'SET_ERROR', payload: res.error });
    });
  }, []);

  const applyFestival = useCallback((cellIndex: number) => {
    const socket = socketService.getSocket();
    if (!socket) return;
    socket.emit('tinh-tuy:apply-festival' as any, { cellIndex }, (res: any) => {
      if (res && !res.success) dispatch({ type: 'SET_ERROR', payload: res.error });
    });
  }, []);

  const skipBuild = useCallback(() => {
    const socket = socketService.getSocket();
    if (!socket) return;
    socket.emit('tinh-tuy:skip-build' as any, {}, (res: any) => {
      if (res && !res.success) dispatch({ type: 'SET_ERROR', payload: res.error });
    });
  }, []);

  const chooseFreeHouse = useCallback((cellIndex: number) => {
    const socket = socketService.getSocket();
    if (!socket) return;
    dispatch({ type: 'CLEAR_FREE_HOUSE_PROMPT' });
    socket.emit('tinh-tuy:free-house-choose' as any, { cellIndex }, (res: any) => {
      if (res && !res.success) dispatch({ type: 'SET_ERROR', payload: res.error });
    });
  }, []);

  const chooseFreeHotel = useCallback((cellIndex: number) => {
    const socket = socketService.getSocket();
    if (!socket) return;
    dispatch({ type: 'CLEAR_FREE_HOTEL_PROMPT' });
    socket.emit('tinh-tuy:free-hotel-choose' as any, { cellIndex }, (res: any) => {
      if (res && !res.success) dispatch({ type: 'SET_ERROR', payload: res.error });
    });
  }, []);

  const sellBuildings = useCallback((selections: Array<{ cellIndex: number; type: 'house' | 'hotel' | 'property'; count: number }>) => {
    const socket = socketService.getSocket();
    if (!socket) return;
    socket.emit('tinh-tuy:sell-buildings' as any, { selections }, (res: any) => {
      if (res && !res.success) dispatch({ type: 'SET_ERROR', payload: res.error });
    });
  }, []);

  const attackPropertyChoose = useCallback((cellIndex: number) => {
    const socket = socketService.getSocket();
    if (!socket) return;
    socket.emit('tinh-tuy:attack-property-choose' as any, { cellIndex }, (res: any) => {
      if (res && !res.success) dispatch({ type: 'SET_ERROR', payload: res.error });
    });
  }, []);

  const clearAttackAlert = useCallback(() => {
    dispatch({ type: 'CLEAR_ATTACK_ALERT' });
  }, []);

  const clearForcedTradeAlert = useCallback(() => {
    dispatch({ type: 'CLEAR_FORCED_TRADE_ALERT' });
  }, []);

  const clearAutoSold = useCallback(() => {
    dispatch({ type: 'CLEAR_AUTO_SOLD' });
  }, []);

  const clearGoBonus = useCallback(() => {
    dispatch({ type: 'CLEAR_GO_BONUS' });
  }, []);

  const clearNearWinWarning = useCallback(() => {
    dispatch({ type: 'CLEAR_NEAR_WIN_WARNING' });
  }, []);

  const clearBankruptAlert = useCallback(() => {
    dispatch({ type: 'CLEAR_BANKRUPT_ALERT' });
  }, []);

  const clearMonopolyAlert = useCallback(() => {
    dispatch({ type: 'CLEAR_MONOPOLY_ALERT' });
  }, []);

  const buybackProperty = useCallback((cellIndex: number, accept: boolean) => {
    const socket = socketService.getSocket();
    if (!socket) return;
    dispatch({ type: 'CLEAR_BUYBACK_PROMPT' });
    socket.emit('tinh-tuy:buyback-property' as any, { cellIndex, accept }, (res: any) => {
      if (res && !res.success) dispatch({ type: 'SET_ERROR', payload: res.error });
    });
  }, []);

  const playAgain = useCallback(() => {
    const socket = socketService.getSocket();
    if (!socket) return;
    socket.emit('tinh-tuy:play-again' as any, {}, (res: any) => {
      if (res && !res.success) dispatch({ type: 'SET_ERROR', payload: res.error });
    });
  }, []);

  const selectCharacter = useCallback((character: TinhTuyCharacter) => {
    const socket = socketService.getSocket();
    if (!socket) return;
    socket.emit('tinh-tuy:select-character' as any, { character }, (res: any) => {
      if (res && !res.success) dispatch({ type: 'SET_ERROR', payload: res.error });
    });
  }, []);

  const negotiateSend = useCallback((targetSlot: number, cellIndex: number, offerAmount: number) => {
    const socket = socketService.getSocket();
    if (!socket) return;
    socket.emit('tinh-tuy:negotiate-send' as any, { targetSlot, cellIndex, offerAmount }, (res: any) => {
      if (res && !res.success) dispatch({ type: 'SET_ERROR', payload: res.error });
    });
  }, []);

  const negotiateRespond = useCallback((accept: boolean) => {
    const socket = socketService.getSocket();
    if (!socket) return;
    socket.emit('tinh-tuy:negotiate-respond' as any, { accept }, (res: any) => {
      if (res && !res.success) dispatch({ type: 'SET_ERROR', payload: res.error });
    });
  }, []);

  const negotiateCancel = useCallback(() => {
    const socket = socketService.getSocket();
    if (!socket) return;
    socket.emit('tinh-tuy:negotiate-cancel' as any, {}, (res: any) => {
      if (res && !res.success) dispatch({ type: 'SET_ERROR', payload: res.error });
    });
  }, []);

  const openNegotiateWizard = useCallback(() => {
    dispatch({ type: 'OPEN_NEGOTIATE_WIZARD' });
  }, []);

  const closeNegotiateWizard = useCallback(() => {
    dispatch({ type: 'CLOSE_NEGOTIATE_WIZARD' });
  }, []);

  // ─── Ability Actions ────────────────────────────────
  const activateAbility = useCallback((data?: { targetSlot?: number; cellIndex?: number; steps?: number; deck?: string }) => {
    const st = stateRef.current;
    const myPlayer = st.players.find(p => p.slot === st.mySlot);
    if (!myPlayer) return;

    // If no data provided, check if ability needs target selection → open modal
    if (!data) {
      const abilityDef = CHARACTER_ABILITIES[myPlayer.character];
      if (!abilityDef) return;
      const targetType = abilityDef.active.targetType;

      if (targetType === 'OPPONENT') {
        const targets = st.players
          .filter(p => p.slot !== st.mySlot && !p.isBankrupt && !(p.islandTurns > 0))
          .map(p => ({ slot: p.slot, displayName: p.displayName || p.guestName || `Player ${p.slot}` }));
        if (targets.length === 0) return;
        dispatch({ type: 'ABILITY_MODAL', payload: { type: 'OPPONENT', targets } });
        return;
      }
      if (targetType === 'CELL') {
        let cells: number[];
        if (myPlayer.character === 'elephant') {
          // Elephant: own properties where houses < 4 and no hotel
          cells = myPlayer.properties.filter(idx => {
            const key = String(idx);
            if (myPlayer.hotels[key]) return false;
            if ((myPlayer.houses[key] || 0) >= 4) return false;
            return true;
          });
        } else {
          // Rabbit: all cells except Island (27)
          cells = Array.from({ length: BOARD_CELLS.length }, (_, i) => i).filter(i => i !== 27);
        }
        if (cells.length === 0) return;
        dispatch({ type: 'ABILITY_MODAL', payload: { type: 'CELL', cells } });
        return;
      }
      if (targetType === 'OPPONENT_HOUSE') {
        // Kungfu: opponents' properties with houses > 0 (no hotel)
        const houses: Array<{ slot: number; cellIndex: number; houses: number }> = [];
        for (const p of st.players) {
          if (p.slot === st.mySlot || p.isBankrupt) continue;
          for (const idx of p.properties) {
            const key = String(idx);
            const h = p.houses[key] || 0;
            if (h > 0 && !p.hotels[key]) houses.push({ slot: p.slot, cellIndex: idx, houses: h });
          }
        }
        if (houses.length === 0) return;
        dispatch({ type: 'ABILITY_MODAL', payload: { type: 'OPPONENT_HOUSE', houses } });
        return;
      }
      if (targetType === 'STEPS') {
        dispatch({ type: 'ABILITY_MODAL', payload: { type: 'STEPS' } });
        return;
      }
      if (targetType === 'DECK') {
        dispatch({ type: 'ABILITY_MODAL', payload: { type: 'DECK' } });
        return;
      }
      // NONE — fall through to emit directly
    }

    const socket = socketService.getSocket();
    if (!socket) return;
    // Map frontend field names to backend: targetSlot→target, cellIndex→targetCell
    const payload: any = {};
    if (data) {
      if (data.targetSlot != null) {
        payload.target = data.targetSlot;
        payload.targetSlot = data.targetSlot;
      }
      if (data.cellIndex != null) {
        payload.targetCell = data.cellIndex;
      }
      if (data.steps != null) payload.steps = data.steps;
      if (data.deck != null) payload.deck = data.deck;
    }
    socket.emit('tinh-tuy:use-ability' as any, payload, (res: any) => {
      if (res && !res.success) dispatch({ type: 'SET_ERROR', payload: res.error });
    });
    dispatch({ type: 'CLEAR_ABILITY_MODAL' });
  }, []);

  const owlPick = useCallback((cardId: string) => {
    // Always clear modal immediately — even if socket is disconnected
    dispatch({ type: 'CLEAR_OWL_PICK_MODAL' });
    const socket = socketService.getSocket();
    if (!socket) return;
    socket.emit('tinh-tuy:owl-pick' as any, { cardId }, (res: any) => {
      if (res && !res.success) dispatch({ type: 'SET_ERROR', payload: res.error });
    });
  }, []);

  const horseAdjustPick = useCallback((adjust: -1 | 0 | 1) => {
    dispatch({ type: 'CLEAR_HORSE_ADJUST_PROMPT' });
    const socket = socketService.getSocket();
    if (!socket) return;
    socket.emit('tinh-tuy:horse-adjust-pick' as any, { adjust }, (res: any) => {
      if (res && !res.success) dispatch({ type: 'SET_ERROR', payload: res.error });
    });
  }, []);

  const shibaReroll = useCallback(() => {
    const socket = socketService.getSocket();
    if (!socket) return;
    socket.emit('tinh-tuy:shiba-reroll' as any, {}, (res: any) => {
      if (res && !res.success) dispatch({ type: 'SET_ERROR', payload: res.error });
    });
  }, []);

  const shibaRerollPick = useCallback((choice: 'original' | 'rerolled') => {
    // Always clear prompt immediately — even if socket is disconnected
    dispatch({ type: 'CLEAR_SHIBA_REROLL_PROMPT' });
    const socket = socketService.getSocket();
    if (!socket) return;
    socket.emit('tinh-tuy:shiba-reroll-pick' as any, { choice }, (res: any) => {
      if (res && !res.success) dispatch({ type: 'SET_ERROR', payload: res.error });
    });
  }, []);

  const rabbitBonusPick = useCallback((accept: boolean) => {
    // Always clear prompt immediately — even if socket is disconnected
    dispatch({ type: 'CLEAR_RABBIT_BONUS_PROMPT' });
    const socket = socketService.getSocket();
    if (!socket) return;
    socket.emit('tinh-tuy:rabbit-bonus-pick' as any, { accept }, (res: any) => {
      if (res && !res.success) dispatch({ type: 'SET_ERROR', payload: res.error });
    });
  }, []);

  const clearAbilityModal = useCallback(() => {
    dispatch({ type: 'CLEAR_ABILITY_MODAL' });
  }, []);

  const clearAbilityUsedAlert = useCallback(() => {
    dispatch({ type: 'CLEAR_ABILITY_USED_ALERT' });
  }, []);

  const clearChickenDrain = useCallback(() => {
    dispatch({ type: 'CLEAR_CHICKEN_DRAIN' });
  }, []);

  const clearSlothAutoBuild = useCallback(() => {
    dispatch({ type: 'CLEAR_SLOTH_AUTO_BUILD' });
  }, []);

  const clearFoxSwapAlert = useCallback(() => {
    dispatch({ type: 'CLEAR_FOX_SWAP_ALERT' });
  }, []);

  // Auto-refresh rooms on lobby view
  useEffect(() => {
    if (state.view === 'lobby') refreshRooms();
  }, [state.view, refreshRooms]);

  // Auto-rejoin logic (use stateRef to avoid re-execution loops)
  useEffect(() => {
    if (isAuthLoading || !isConnected || stateRef.current.roomId) return;
    const savedCode = getSavedRoomCode();
    if (savedCode) joinRoom(savedCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthLoading, isConnected, joinRoom]);

  // Pending move → start after dice animation (2.5s) or immediately for card moves (300ms)
  useEffect(() => {
    if (!state.pendingMove) return;
    const delay = state.pendingMove.fromCard ? 300 : 2500;
    const timer = setTimeout(() => dispatch({ type: 'START_MOVE' }), delay);
    return () => clearTimeout(timer);
  }, [state.pendingMove]); // eslint-disable-line react-hooks/exhaustive-deps

  // Movement animation driver — step every 280ms + move SFX per step
  useEffect(() => {
    if (!state.animatingToken) return;
    const timer = setInterval(() => {
      dispatch({ type: 'ANIMATION_STEP' });
      tinhTuySounds.playSFX('move');
    }, 280);
    return () => clearInterval(timer);
  }, [state.animatingToken?.slot, state.animatingToken?.path.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Go popup auto-dismiss after 1.5s
  useEffect(() => {
    if (!state.showGoPopup) return;
    const timer = setTimeout(() => dispatch({ type: 'HIDE_GO_POPUP' }), 1500);
    return () => clearTimeout(timer);
  }, [state.showGoPopup]);

  // Island alert auto-dismiss after 8s
  useEffect(() => {
    if (state.islandAlertSlot == null) return;
    const timer = setTimeout(() => dispatch({ type: 'CLEAR_ISLAND_ALERT' }), 8000);
    return () => clearTimeout(timer);
  }, [state.islandAlertSlot]);

  // Tax alert auto-dismiss after 8s
  useEffect(() => {
    if (!state.taxAlert) return;
    const timer = setTimeout(() => dispatch({ type: 'CLEAR_TAX_ALERT' }), 8000);
    return () => clearTimeout(timer);
  }, [state.taxAlert]);

  // Rent alert auto-dismiss after 8s
  useEffect(() => {
    if (!state.rentAlert) return;
    const timer = setTimeout(() => dispatch({ type: 'CLEAR_RENT_ALERT' }), 8000);
    return () => clearTimeout(timer);
  }, [state.rentAlert]);

  // Attack alert auto-dismiss (safety net — component has its own timer too).
  // Timer starts when alert is VISIBLE (card modal + animations done), not when attackAlert is set.
  const attackAlertVisible = !!state.attackAlert && !state.drawnCard && !state.pendingMove && !state.animatingToken;
  useEffect(() => {
    if (!attackAlertVisible) return;
    const timer = setTimeout(() => dispatch({ type: 'CLEAR_ATTACK_ALERT' }), 8000);
    return () => clearTimeout(timer);
  }, [attackAlertVisible]);

  // Forced trade alert auto-dismiss (safety net — component has its own timer too).
  const forcedTradeAlertVisible = !!state.forcedTradeAlert && !state.drawnCard && !state.pendingMove && !state.animatingToken;
  useEffect(() => {
    if (!forcedTradeAlertVisible) return;
    const timer = setTimeout(() => dispatch({ type: 'CLEAR_FORCED_TRADE_ALERT' }), 6000);
    return () => clearTimeout(timer);
  }, [forcedTradeAlertVisible]);

  // Auto-sold alert auto-dismiss after 10s
  useEffect(() => {
    if (!state.autoSoldAlert) return;
    const timer = setTimeout(() => dispatch({ type: 'CLEAR_AUTO_SOLD' }), 10000);
    return () => clearTimeout(timer);
  }, [state.autoSoldAlert]);

  // Near-win warning auto-dismiss after 10s
  useEffect(() => {
    if (!state.nearWinWarning) return;
    const timer = setTimeout(() => dispatch({ type: 'CLEAR_NEAR_WIN_WARNING' }), 10000);
    return () => clearTimeout(timer);
  }, [state.nearWinWarning]);

  // Flush pending notifs → visible pointNotifs when animation + modals are all done
  useEffect(() => {
    if (state.pendingNotifs.length === 0) return;
    // Wait for movement to finish
    if (state.pendingMove || state.animatingToken) return;
    // Wait for modals to close
    if (state.drawnCard || state.pendingAction || state.taxAlert || state.rentAlert || state.islandAlertSlot != null) return;
    // Small delay so the dismiss feels settled before showing
    const timer = setTimeout(() => dispatch({ type: 'FLUSH_NOTIFS' }), 400);
    return () => clearTimeout(timer);
  }, [
    state.pendingNotifs.length, state.pendingMove, state.animatingToken,
    state.drawnCard, state.pendingAction, state.taxAlert, state.rentAlert, state.islandAlertSlot,
  ]);

  // Point notifs auto-cleanup after 2.5s — only start timer when notifs first appear
  // (not on every .length change, which would reset the timer on burst additions)
  const pointNotifsActive = state.pointNotifs.length > 0;
  useEffect(() => {
    if (!pointNotifsActive) return;
    const timer = setTimeout(() => {
      dispatch({ type: 'CLEAR_POINT_NOTIFS' });
    }, 2500);
    return () => clearTimeout(timer);
  }, [pointNotifsActive]);

  // Gate: dice animation + card modal + movement animation must all finish before queued visual effects fire
  const isAnimBusy = !!(state.diceAnimating || state.drawnCard || state.pendingMove || state.animatingToken || state.pendingSwapAnim);
  // Separate gate for turn change: excludes diceAnimating (purely visual, timer can fail)
  // and pendingSwapAnim (positions applied immediately in CLEAR_CARD, animation is visual-only)
  const isTurnChangeBusy = !!(state.drawnCard || state.pendingMove || state.animatingToken);

  // Safety watchdog: force-clear stuck animation state after timeout.
  // Uses granular key so timer RESETS when busy composition changes (dice→movement→card).
  // When a card is being displayed (drawnCard !== null and no movement animation),
  // use 15s timeout so 12s detailed-info cards aren't killed prematurely.
  // Otherwise use 8s for dice/movement animations.
  const animBusyKey = `${state.diceAnimating}-${!!state.drawnCard}-${!!state.pendingMove}-${!!state.animatingToken}-${!!state.pendingSwapAnim}`;
  const isCardOnlyBusy = !!state.drawnCard && !state.pendingMove && !state.animatingToken && !state.diceAnimating;
  const safetyTimeoutMs = isCardOnlyBusy ? 12000 : 8000;
  const animBusyKeyRef = useRef(animBusyKey);
  animBusyKeyRef.current = animBusyKey; // Updated during render, before effects
  useEffect(() => {
    if (!isAnimBusy) return;
    const capturedKey = animBusyKey;
    const ms = safetyTimeoutMs;
    const timer = setTimeout(() => {
      // If animBusyKey changed since this timer was set, a newer timer handles it
      if (animBusyKeyRef.current !== capturedKey) return;
      console.warn(`[TinhTuy] Animation stuck >${ms / 1000}s — force clearing`);
      dispatch({ type: 'FORCE_CLEAR_ANIM' });
    }, ms);
    return () => clearTimeout(timer);
  }, [isAnimBusy, animBusyKey, safetyTimeoutMs]);

  // Auto-clear diceAnimating after 2.3s (matches dice CSS animation + settle time)
  useEffect(() => {
    if (!state.diceAnimating) return;
    const timer = setTimeout(() => dispatch({ type: 'DICE_ANIM_DONE' }), 2300);
    return () => clearTimeout(timer);
  }, [state.diceAnimating]);

  // Clear swap animation flag after brief visual delay (positions already applied in CLEAR_CARD)
  useEffect(() => {
    if (!state.pendingSwapAnim) return;
    const timer = setTimeout(() => dispatch({ type: 'SWAP_ANIM_DONE' }), 400);
    return () => clearTimeout(timer);
  }, [state.pendingSwapAnim]);

  // Auto-dismiss card modal early when a requiresChoice prompt arrives.
  // Normally the card auto-dismisses after 5s, but choice modals (ForcedTrade, EminentDomain, etc.)
  // are blocked by `state.drawnCard`. If the 5s timer fails (browser throttle, React edge case),
  // the game gets permanently stuck. This safety effect clears the card after 1.5s when a choice is needed.
  useEffect(() => {
    if (!state.drawnCard) return;
    const hasChoicePrompt = !!(
      state.forcedTradePrompt || state.eminentDomainPrompt ||
      state.rentFreezePrompt || state.buyBlockPrompt || state.attackPrompt ||
      state.turnPhase === 'AWAITING_CARD_DESTINATION'
    );
    if (!hasChoicePrompt) return;
    const timer = setTimeout(() => dispatch({ type: 'CLEAR_CARD' }), 1500);
    return () => clearTimeout(timer);
  }, [state.drawnCard, state.forcedTradePrompt, state.eminentDomainPrompt,
      state.rentFreezePrompt, state.buyBlockPrompt, state.attackPrompt, state.turnPhase]);

  // Apply queued GO bonus after walk animation finishes (wait for pendingMove + animatingToken only)
  useEffect(() => {
    if (!state.queuedGoBonus) return;
    if (state.pendingMove || state.animatingToken) return;
    dispatch({ type: 'APPLY_QUEUED_GO_BONUS' });
  }, [state.queuedGoBonus, state.pendingMove, state.animatingToken]);

  // Apply queued free-house prompt after walk + card modal + go bonus modal finish
  useEffect(() => {
    if (!state.queuedFreeHousePrompt) return;
    if (state.pendingMove || state.animatingToken || state.drawnCard || state.goBonusPrompt) return;
    dispatch({ type: 'APPLY_QUEUED_FREE_HOUSE_PROMPT' });
  }, [state.queuedFreeHousePrompt, state.pendingMove, state.animatingToken, state.drawnCard, state.goBonusPrompt]);

  // Apply queued free-hotel prompt after walk + card modal finish
  useEffect(() => {
    if (!state.queuedFreeHotelPrompt) return;
    if (state.pendingMove || state.animatingToken || state.drawnCard || state.goBonusPrompt) return;
    dispatch({ type: 'APPLY_QUEUED_FREE_HOTEL_PROMPT' });
  }, [state.queuedFreeHotelPrompt, state.pendingMove, state.animatingToken, state.drawnCard, state.goBonusPrompt]);

  // Apply queued travel prompt after movement animation finishes
  useEffect(() => {
    if (!state.queuedTravelPrompt || isAnimBusy) return;
    dispatch({ type: 'APPLY_QUEUED_TRAVEL' });
  }, [state.queuedTravelPrompt, isAnimBusy]);

  // Apply queued festival prompt after movement animation finishes
  // Uses isTurnChangeBusy — excludes diceAnimating to prevent stuck state
  useEffect(() => {
    if (!state.queuedFestivalPrompt || isTurnChangeBusy) return;
    dispatch({ type: 'APPLY_QUEUED_FESTIVAL' });
  }, [state.queuedFestivalPrompt, isTurnChangeBusy]);

  // Apply queued rent alert after movement animation finishes
  useEffect(() => {
    if (!state.queuedRentAlert || isAnimBusy) return;
    tinhTuySounds.playSFX('rentPay');
    dispatch({ type: 'APPLY_QUEUED_RENT_ALERT' });
  }, [state.queuedRentAlert, isAnimBusy]);

  // Apply queued tax alert after movement animation finishes
  useEffect(() => {
    if (!state.queuedTaxAlert || isAnimBusy) return;
    dispatch({ type: 'APPLY_QUEUED_TAX_ALERT' });
  }, [state.queuedTaxAlert, isAnimBusy]);

  // Apply queued island alert after movement animation finishes
  useEffect(() => {
    if (state.queuedIslandAlert == null || isAnimBusy) return;
    tinhTuySounds.playSFX('island');
    dispatch({ type: 'APPLY_QUEUED_ISLAND_ALERT' });
  }, [state.queuedIslandAlert, isAnimBusy]);

  // Apply queued bankrupt alert after animations + rent/tax alerts are done
  useEffect(() => {
    if (state.queuedBankruptAlert == null || isAnimBusy) return;
    // Wait for both queued AND active rent/tax alerts to clear
    if (state.queuedRentAlert || state.rentAlert) return;
    if (state.queuedTaxAlert || state.taxAlert) return;
    dispatch({ type: 'APPLY_QUEUED_BANKRUPT_ALERT' });
  }, [state.queuedBankruptAlert, isAnimBusy, state.queuedRentAlert, state.rentAlert, state.queuedTaxAlert, state.taxAlert]);

  // Bankrupt alert auto-dismiss after 7s
  useEffect(() => {
    if (state.bankruptAlert == null) return;
    const timer = setTimeout(() => dispatch({ type: 'CLEAR_BANKRUPT_ALERT' }), 7000);
    return () => clearTimeout(timer);
  }, [state.bankruptAlert]);

  // Monopoly alert auto-dismiss after 7s
  useEffect(() => {
    if (!state.monopolyAlert) return;
    const timer = setTimeout(() => dispatch({ type: 'CLEAR_MONOPOLY_ALERT' }), 7000);
    return () => clearTimeout(timer);
  }, [state.monopolyAlert]);

  // Apply queued game-finished after ALL animations + alerts (including bankruptcy) are dismissed
  useEffect(() => {
    if (!state.queuedGameFinished || isAnimBusy) return;
    if (state.queuedRentAlert || state.rentAlert) return;
    if (state.queuedTaxAlert || state.taxAlert) return;
    if (state.queuedIslandAlert != null || state.islandAlertSlot != null) return;
    if (state.queuedBankruptAlert != null || state.bankruptAlert != null) return;
    const timer = setTimeout(() => {
      tinhTuySounds.playSFX('victory');
      dispatch({ type: 'APPLY_QUEUED_GAME_FINISHED' });
    }, 500);
    return () => clearTimeout(timer);
  }, [state.queuedGameFinished, isAnimBusy,
    state.queuedRentAlert, state.rentAlert,
    state.queuedTaxAlert, state.taxAlert,
    state.queuedIslandAlert, state.islandAlertSlot,
    state.queuedBankruptAlert, state.bankruptAlert]);

  // Apply queued travel pending alert after movement animation finishes
  useEffect(() => {
    if (state.queuedTravelPending == null || isAnimBusy) return;
    dispatch({ type: 'APPLY_QUEUED_TRAVEL_PENDING' });
  }, [state.queuedTravelPending, isAnimBusy]);

  // Travel pending alert auto-dismiss after 8s
  useEffect(() => {
    if (state.travelPendingSlot == null) return;
    const timer = setTimeout(() => dispatch({ type: 'CLEAR_TRAVEL_PENDING' }), 8000);
    return () => clearTimeout(timer);
  }, [state.travelPendingSlot]);

  // Apply queued build prompt after movement animation finishes
  useEffect(() => {
    if (!state.queuedBuildPrompt || isTurnChangeBusy) return;
    dispatch({ type: 'APPLY_QUEUED_BUILD' });
  }, [state.queuedBuildPrompt, isTurnChangeBusy]);

  // Apply queued buyback prompt after movement + rent alert finishes
  useEffect(() => {
    if (!state.queuedBuybackPrompt || isTurnChangeBusy) return;
    // Wait for rent alert to show and dismiss first
    if (state.queuedRentAlert || state.rentAlert) return;
    dispatch({ type: 'APPLY_QUEUED_BUYBACK' });
  }, [state.queuedBuybackPrompt, isTurnChangeBusy, state.queuedRentAlert, state.rentAlert]);

  // Buyback prompt with canAfford=false auto-dismiss after 6s
  useEffect(() => {
    if (!state.buybackPrompt || state.buybackPrompt.canAfford) return;
    const timer = setTimeout(() => dispatch({ type: 'CLEAR_BUYBACK_PROMPT' }), 6000);
    return () => clearTimeout(timer);
  }, [state.buybackPrompt]);

  // Apply queued sell prompt after movement animation + rent/tax alerts finish
  useEffect(() => {
    if (!state.queuedSellPrompt || isTurnChangeBusy) return;
    if (state.queuedRentAlert || state.rentAlert) return;
    if (state.queuedTaxAlert || state.taxAlert) return;
    dispatch({ type: 'APPLY_QUEUED_SELL' });
  }, [state.queuedSellPrompt, isTurnChangeBusy, state.queuedRentAlert, state.rentAlert, state.queuedTaxAlert, state.taxAlert]);

  // Apply queued action (buy/skip modal) after movement animation finishes
  useEffect(() => {
    if (!state.queuedAction || isTurnChangeBusy) return;
    dispatch({ type: 'APPLY_QUEUED_ACTION' });
  }, [state.queuedAction, isTurnChangeBusy]);

  // Apply queued turn change after movement animation finishes (skip if game ending)
  // Uses isTurnChangeBusy (not isAnimBusy) — excludes diceAnimating to prevent stuck state
  // when dice animation timer fails (tab backgrounded, component re-mount)
  useEffect(() => {
    if (!state.queuedTurnChange || isTurnChangeBusy) return;
    if (state.queuedGameFinished) return; // Game ending — no next turn
    const timer = setTimeout(() => {
      // Play "your turn" sound when turn actually switches
      if (stateRef.current.queuedTurnChange?.currentSlot === stateRef.current.mySlot) {
        tinhTuySounds.playSFX('yourTurn');
      }
      dispatch({ type: 'APPLY_QUEUED_TURN_CHANGE' });
    }, 300);
    return () => clearTimeout(timer);
  }, [state.queuedTurnChange, isTurnChangeBusy, state.queuedGameFinished]);

  // Ability used alert auto-dismiss after 5s
  useEffect(() => {
    if (!state.abilityUsedAlert) return;
    const timer = setTimeout(() => dispatch({ type: 'CLEAR_ABILITY_USED_ALERT' }), 5000);
    return () => clearTimeout(timer);
  }, [state.abilityUsedAlert]);

  // Chicken drain alert auto-dismiss after 5s
  useEffect(() => {
    if (!state.chickenDrainAlert) return;
    const timer = setTimeout(() => dispatch({ type: 'CLEAR_CHICKEN_DRAIN' }), 5000);
    return () => clearTimeout(timer);
  }, [state.chickenDrainAlert]);

  // Sloth auto-build alert auto-dismiss after 5s
  useEffect(() => {
    if (!state.slothAutoBuildAlert) return;
    const timer = setTimeout(() => dispatch({ type: 'CLEAR_SLOTH_AUTO_BUILD' }), 5000);
    return () => clearTimeout(timer);
  }, [state.slothAutoBuildAlert]);

  // Fox swap alert auto-dismiss after 5s
  useEffect(() => {
    if (!state.foxSwapAlert) return;
    const timer = setTimeout(() => dispatch({ type: 'CLEAR_FOX_SWAP_ALERT' }), 5000);
    return () => clearTimeout(timer);
  }, [state.foxSwapAlert]);

  // Sound: iOS AudioContext unlock on first user gesture + Page Visibility
  useEffect(() => {
    const handleInit = () => tinhTuySounds.init();
    document.addEventListener('click', handleInit, { once: true });
    document.addEventListener('touchstart', handleInit, { once: true });
    document.addEventListener('visibilitychange', tinhTuySounds.handleVisibilityChange);
    return () => {
      document.removeEventListener('click', handleInit);
      document.removeEventListener('touchstart', handleInit);
      document.removeEventListener('visibilitychange', tinhTuySounds.handleVisibilityChange);
    };
  }, []);

  // Sound: BGM only plays during gameplay
  useEffect(() => {
    if (state.view === 'playing') {
      tinhTuySounds.playBGM('game');
    } else {
      tinhTuySounds.stopBGM();
    }
  }, [state.view]);

  // Sound: stop BGM on unmount only
  useEffect(() => () => tinhTuySounds.stopBGM(), []);

  // Memoize context value to prevent cascading re-renders of all consumers
  // on every provider render. Only re-creates when state or callbacks change.
  const contextValue = useMemo<TinhTuyContextValue>(() => ({
    state, createRoom, joinRoom, leaveRoom, startGame,
    rollDice, buyProperty, skipBuy, surrender,
    refreshRooms, setView, updateRoom,
    buildHouse, buildHotel, escapeIsland, sendChat, sendReaction, dismissReaction, updateGuestName,
    clearCard, clearRentAlert, clearTaxAlert, clearIslandAlert, clearTravelPending,
    travelTo, applyFestival, skipBuild, sellBuildings, chooseFreeHouse, chooseFreeHotel, attackPropertyChoose, chooseDestination, forcedTradeChoose, rentFreezeChoose, chooseBuyBlockTarget, chooseEminentDomain, clearAttackAlert, clearForcedTradeAlert, clearAutoSold, clearGoBonus, clearBankruptAlert, clearMonopolyAlert, clearNearWinWarning, buybackProperty, selectCharacter, playAgain,
    negotiateSend, negotiateRespond, negotiateCancel, openNegotiateWizard, closeNegotiateWizard,
    activateAbility, owlPick, horseAdjustPick, shibaReroll, shibaRerollPick, rabbitBonusPick, clearAbilityModal, clearAbilityUsedAlert, clearChickenDrain, clearSlothAutoBuild, clearFoxSwapAlert,
  }), [
    state, createRoom, joinRoom, leaveRoom, startGame,
    rollDice, buyProperty, skipBuy, surrender,
    refreshRooms, setView, updateRoom,
    buildHouse, buildHotel, escapeIsland, sendChat, sendReaction, dismissReaction, updateGuestName,
    clearCard, clearRentAlert, clearTaxAlert, clearIslandAlert, clearTravelPending,
    travelTo, applyFestival, skipBuild, sellBuildings, chooseFreeHouse, chooseFreeHotel, attackPropertyChoose, chooseDestination, forcedTradeChoose, rentFreezeChoose, chooseBuyBlockTarget, chooseEminentDomain, clearAttackAlert, clearForcedTradeAlert, clearAutoSold, clearGoBonus, clearBankruptAlert, clearMonopolyAlert, clearNearWinWarning, buybackProperty, selectCharacter, playAgain,
    negotiateSend, negotiateRespond, negotiateCancel, openNegotiateWizard, closeNegotiateWizard,
    activateAbility, owlPick, horseAdjustPick, shibaReroll, shibaRerollPick, rabbitBonusPick, clearAbilityModal, clearAbilityUsedAlert, clearChickenDrain, clearSlothAutoBuild, clearFoxSwapAlert,
  ]);

  return (
    <TinhTuyContext.Provider value={contextValue}>
      {children}
    </TinhTuyContext.Provider>
  );
};

// ─── Hook ─────────────────────────────────────────────
export const useTinhTuy = (): TinhTuyContextValue => {
  const context = useContext(TinhTuyContext);
  if (!context) throw new Error('useTinhTuy must be used within TinhTuyProvider');
  return context;
};
