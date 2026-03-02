/**
 * Tinh Tuy Dai Chien — Socket Gameplay Handlers
 * Phase 3: roll-dice (with cards + island), buy-property, skip-buy,
 * build-house, build-hotel, escape-island, surrender, chat, reactions
 */
import crypto from 'crypto';
import { Server as SocketIOServer, Socket } from 'socket.io';
import TinhTuyGame from '../models/TinhTuyGame';
import { TinhTuyCallback, ITinhTuyGame, ITinhTuyPlayer, ITinhTuyCard, CardEffectResult } from '../types/tinh-tuy.types';
import {
  rollDice, calculateNewPosition, resolveCellAction,
  getNextActivePlayer, checkGameEnd, checkNearWin, sendToIsland,
  handleIslandEscape, canBuildHouse, buildHouse, canBuildHotel, buildHotel,
  calculateRent, getSellPrice, getPropertyTotalSellValue, calculateSellableValue,
  getEffectiveGoSalary, LATE_GAME_START,
} from './tinh-tuy-engine';
import { GO_SALARY, BOARD_SIZE, getCell, ISLAND_ESCAPE_COST, getUtilityRent, getStationRent, checkMonopolyCompleted, PROPERTY_GROUPS } from './tinh-tuy-board';
import { startTurnTimer, clearTurnTimer, cleanupRoom, isRateLimited, safetyRestartTimer, negotiateTimers, clearNegotiateTimer } from './tinh-tuy-socket';
import { drawCard, getCardById, shuffleDeck, executeCardEffect, getKhiVanDeckIds, getCoHoiDeckIds, KHI_VAN_CARDS, CO_HOI_CARDS } from './tinh-tuy-cards';
import {
  abilitiesEnabled, hasPassive, getGoSalaryBonus, getRentPayMultiplier, getMoneyLossMultiplier,
  getCardMoneyMultiplier, getDoubleBonusSteps, isIslandImmune, executeChickenDrain, executeSlothAutoBuild,
  decrementCooldown, setAbilityCooldown, canUseActiveAbility,
  CHARACTER_ABILITIES, getTargetableOpponents, getKungfuTargets, getElephantBuildTargets,
  getRabbitTeleportTargets, CANOC_STEAL_AMOUNT, TRAU_ACTIVE_AMOUNT, SLOTH_HIBERNATE_AMOUNT,
  ActiveAbilityResult,
} from './tinh-tuy-abilities';

// Extra time (ms) added to card-choice timers to account for frontend animations
// (dice ~2.5s + movement ~5s + card display ~7s + transitions ~1s ≈ 15.5s)
const CARD_CHOICE_EXTRA_MS = 30_000;

// ─── Sloth Auto-Build Helper ─────────────────────────────────

/** After monopoly completion, check if player is Sloth and auto-build 1 house */
function handleSlothAutoBuild(
  io: SocketIOServer, game: ITinhTuyGame, player: ITinhTuyPlayer, group: string
): void {
  const slothResult = executeSlothAutoBuild(game, player, group);
  if (slothResult.built && slothResult.cellIndex != null) {
    game.markModified('players');
    io.to(game.roomId).emit('tinh-tuy:sloth-auto-build', {
      slot: player.slot,
      cellIndex: slothResult.cellIndex,
      houseCount: player.houses[String(slothResult.cellIndex)] || 0,
    });
  }
}

/** Execute Owl's card pick after choosing 1 of 2 cards */
async function executeOwlPick(
  io: SocketIOServer, game: ITinhTuyGame, player: ITinhTuyPlayer, chosenCardId: string
): Promise<void> {
  player.owlPendingCards = undefined;
  const card = getCardById(chosenCardId);
  if (!card) return;
  // Delegate to handleCardDraw with the pre-selected card — this ensures
  // requiresChoice, playerMoved, bankruptcy checks, etc. all work correctly.
  await handleCardDraw(io, game, player, card.type as 'KHI_VAN' | 'CO_HOI', 0, card);
}



/** After Shiba picks original or rerolled dice, execute movement + resolve */
async function executeShibaPostPick(
  io: SocketIOServer, game: ITinhTuyGame, player: ITinhTuyPlayer,
  dice: { dice1: number; dice2: number; total: number; isDouble: boolean }
): Promise<void> {
  const roomId = game.roomId;

  // Handle doubles → possible island (Pigfish immune)
  if (dice.isDouble) {
    player.consecutiveDoubles += 1;
    if (player.consecutiveDoubles >= 3 && !isIslandImmune(game, player)) {
      const oldPos = player.position;
      sendToIsland(player);
      game.turnPhase = 'END_TURN';
      game.markModified('players');
      await game.save();
      io.to(roomId).emit('tinh-tuy:player-moved', {
        slot: player.slot, from: oldPos, to: 27, passedGo: false, teleport: true,
      });
      io.to(roomId).emit('tinh-tuy:player-island', { slot: player.slot, turnsRemaining: player.islandTurns });
      await advanceTurn(io, game);
      return;
    }
    if (player.consecutiveDoubles >= 3) player.consecutiveDoubles = 0; // Pigfish: reset, proceed normally
  } else {
    player.consecutiveDoubles = 0;
  }

  // Rabbit bonus on doubles
  let moveSteps = dice.total;
  const rabbitBonus = dice.isDouble ? getDoubleBonusSteps(game, player) : 0;
  moveSteps += rabbitBonus;

  const oldPos = player.position;
  const { position: newPos, passedGo } = calculateNewPosition(oldPos, moveSteps);
  player.position = newPos;
  const goSalary = getEffectiveGoSalary(game.round || 1) + getGoSalaryBonus(game, player);
  if (passedGo) {
    player.points += goSalary;
    onPassGo(player);
  }
  game.turnPhase = 'MOVING' as any;
  game.markModified('players');
  await game.save();
  io.to(roomId).emit('tinh-tuy:player-moved', {
    slot: player.slot, from: oldPos, to: newPos, passedGo,
    goBonus: passedGo ? goSalary : 0,
  });
  await resolveAndAdvance(io, game, player, newPos, dice);
}

// ─── Helpers ──────────────────────────────────────────────────

function findPlayerBySocket(game: ITinhTuyGame, socket: Socket): ITinhTuyPlayer | undefined {
  const playerId = socket.data.tinhTuyPlayerId as string;
  return game.players.find(
    p => (p.userId?.toString() === playerId) || (p.guestId === playerId)
  );
}

function isCurrentPlayer(game: ITinhTuyGame, player: ITinhTuyPlayer): boolean {
  return game.currentPlayerSlot === player.slot && !player.isBankrupt;
}

/** Handle all pass-GO side effects (buyBlockedTurns decrement, horse passive reset) */
function onPassGo(player: ITinhTuyPlayer): void {
  if (player.buyBlockedTurns && player.buyBlockedTurns > 0) player.buyBlockedTurns--;
  player.horsePassiveUsed = false;
}

async function finishGame(
  io: SocketIOServer, game: ITinhTuyGame, winner: ITinhTuyPlayer | undefined, reason: string
): Promise<void> {
  game.gameStatus = 'finished';
  game.finishedAt = new Date();
  game.pendingNegotiate = null;
  game.markModified('pendingNegotiate');
  if (winner) {
    game.winner = {
      slot: winner.slot, userId: winner.userId,
      guestId: winner.guestId, guestName: winner.guestName,
      finalPoints: winner.points,
    };
  }
  await game.save();
  cleanupRoom(game.roomId, true);
  io.to(game.roomId).emit('tinh-tuy:game-finished', { winner: game.winner, reason });
}

/** Check bankruptcy after point loss; returns true if game ended OR sell phase started */
async function checkBankruptcy(
  io: SocketIOServer, game: ITinhTuyGame, player: ITinhTuyPlayer
): Promise<boolean> {
  if (player.points >= 0) return false;

  // Current player can sell buildings to cover debt
  if (game.currentPlayerSlot === player.slot) {
    const completedRounds = Math.max((game.round || 1) - 1, 0);
    const sellableValue = calculateSellableValue(player, completedRounds);
    const deficit = Math.abs(player.points);
    if (sellableValue > 0) {
      // Enter sell phase — player must sell buildings (may still go bankrupt if can't cover)
      game.turnPhase = 'AWAITING_SELL';
      await game.save();
      // Send exact sell prices so frontend matches backend calculations
      const sellPrices = buildSellPricesMap(player, completedRounds);
      const canCoverDebt = sellableValue >= deficit;
      io.to(game.roomId).emit('tinh-tuy:sell-prompt', { slot: player.slot, deficit, sellPrices, canCoverDebt });
      // Start timer — auto-sell cheapest on timeout
      startTurnTimer(game.roomId, game.settings.turnDuration * 1000, async () => {
        try {
          const g = await TinhTuyGame.findOne({ roomId: game.roomId });
          if (!g || g.turnPhase !== 'AWAITING_SELL') return;
          const p = g.players.find(pp => pp.slot === player.slot);
          if (!p) return;
          const soldItems = autoSellCheapest(g, p);
          io.to(game.roomId).emit('tinh-tuy:buildings-sold', {
            slot: p.slot, newPoints: p.points,
            houses: { ...p.houses }, hotels: { ...p.hotels },
            properties: [...p.properties],
            autoSold: soldItems,
            festival: g.festival,
          });
          // Still in debt after selling everything → bankruptcy
          if (p.points < 0) {
            p.isBankrupt = true;
            p.points = 0;
            p.properties = [];
            p.houses = {} as Record<string, number>;
            p.hotels = {} as Record<string, boolean>;
            if (g.festival && g.festival.slot === p.slot) {
              g.festival = null;
              g.markModified('festival');
            }
            if (g.frozenProperties?.length) {
              g.frozenProperties = g.frozenProperties.filter((fp: any) =>
                g.players.some(pl => !pl.isBankrupt && pl.properties.includes(fp.cellIndex)));
              g.markModified('frozenProperties');
            }
            g.markModified('players');
            g.turnPhase = 'END_TURN';
            await g.save();
            io.to(game.roomId).emit('tinh-tuy:player-bankrupt', { slot: p.slot });
            const endCheck = checkGameEnd(g);
            if (endCheck.ended) {
              await finishGame(io, g, endCheck.winner, endCheck.reason || 'lastStanding');
            } else {
              await advanceTurn(io, g);
            }
            return;
          }
          g.turnPhase = 'END_TURN';
          await g.save();
          await advanceTurnOrDoubles(io, g, p);
        } catch (err) { console.error('[tinh-tuy] Sell timeout:', err); }
      });
      return true; // Stop caller from advancing turn
    }
  }

  // Non-current player with sellable assets: auto-sell cheapest to cover debt
  if (game.currentPlayerSlot !== player.slot) {
    const completedRounds = Math.max((game.round || 1) - 1, 0);
    const sellableValue = calculateSellableValue(player, completedRounds);
    if (sellableValue > 0) {
      const soldItems = autoSellCheapest(game, player);
      io.to(game.roomId).emit('tinh-tuy:buildings-sold', {
        slot: player.slot, newPoints: player.points,
        houses: { ...player.houses }, hotels: { ...player.hotels },
        properties: [...player.properties],
        autoSold: soldItems,
        festival: game.festival,
      });
      if (player.points >= 0) {
        game.markModified('players');
        await game.save();
        return false; // Survived — not bankrupt
      }
    }
  }

  // Instant bankruptcy — no sellable assets left or still in debt
  player.isBankrupt = true;
  player.points = 0;
  player.properties = [];
  player.houses = {} as Record<string, number>;
  player.hotels = {} as Record<string, boolean>;
  // Auto-cancel pending negotiate if bankrupt player is involved
  if (game.pendingNegotiate &&
    (game.pendingNegotiate.fromSlot === player.slot || game.pendingNegotiate.toSlot === player.slot)) {
    game.pendingNegotiate = null;
    game.markModified('pendingNegotiate');
    clearNegotiateTimer(game.roomId);
    io.to(game.roomId).emit('tinh-tuy:negotiate-cancelled', { fromSlot: player.slot });
  }
  // Clear game-level festival if this player owned it
  if (game.festival && game.festival.slot === player.slot) {
    game.festival = null;
    game.markModified('festival');
  }
  // Clear frozen properties that were on this player's cells
  if (game.frozenProperties?.length) {
    // The player's properties were already cleared above, so filter by checking if any freeze target is no longer owned
    game.frozenProperties = game.frozenProperties.filter((fp: any) => {
      return game.players.some(p => !p.isBankrupt && p.properties.includes(fp.cellIndex));
    });
    game.markModified('frozenProperties');
  }
  game.markModified('players');
  io.to(game.roomId).emit('tinh-tuy:player-bankrupt', { slot: player.slot });

  const endCheck = checkGameEnd(game);
  if (endCheck.ended) {
    await game.save();
    await finishGame(io, game, endCheck.winner, endCheck.reason || 'lastStanding');
    return true;
  }
  return false;
}

/** Advance to next turn, handling doubles (extra turn) and skip-turn flag */
/** Build per-player buff snapshot for turn-changed event */
export function getPlayerBuffs(game: ITinhTuyGame): Array<{
  slot: number; cards: string[]; immunityNextRent: boolean; doubleRentTurns: number; skipNextTurn: boolean; buyBlockedTurns: number;
  abilityCooldown: number; abilityUsedThisTurn: boolean;
}> {
  return game.players.filter(p => !p.isBankrupt).map(p => ({
    slot: p.slot, cards: [...p.cards],
    immunityNextRent: !!p.immunityNextRent,
    doubleRentTurns: p.doubleRentTurns || 0,
    skipNextTurn: !!p.skipNextTurn,
    buyBlockedTurns: p.buyBlockedTurns || 0,
    abilityCooldown: p.abilityCooldown || 0,
    abilityUsedThisTurn: !!p.abilityUsedThisTurn,
  }));
}

async function advanceTurnOrDoubles(
  io: SocketIOServer, game: ITinhTuyGame, player: ITinhTuyPlayer
): Promise<void> {
  // Skip-next-turn flag (from card)
  if (player.skipNextTurn) {
    player.skipNextTurn = false;
    player.extraTurn = false; // cancel extra turn if skip is active
    await advanceTurn(io, game);
    return;
  }

  // Check win condition BEFORE granting any extra turn (doubles or card).
  // Without this, a player who completes edge domination mid-doubles
  // would have to finish all double rolls before the game ends.
  const endCheck = checkGameEnd(game);
  if (endCheck.ended) {
    await finishGame(io, game, endCheck.winner, endCheck.reason || 'edgeDomination');
    return;
  }

  // Extra turn from card (ch-22) — give another turn, no consecutive doubles check
  if (player.extraTurn) {
    player.extraTurn = false;
    player.consecutiveDoubles = 0;
    game.lastDiceResult = null;
    game.markModified('lastDiceResult');
    game.turnPhase = 'ROLL_DICE';
    game.turnStartedAt = new Date();
    game.markModified('players');
    await game.save();
    io.to(game.roomId).emit('tinh-tuy:turn-changed', {
      currentSlot: game.currentPlayerSlot,
      turnPhase: 'ROLL_DICE', extraTurn: true,
      buffs: getPlayerBuffs(game),
    });
    startTurnTimer(game.roomId, game.settings.turnDuration * 1000, async () => {
      try {
        const g = await TinhTuyGame.findOne({ roomId: game.roomId });
        if (!g || g.gameStatus !== 'playing') return;
        if (g.turnPhase !== 'ROLL_DICE') return;
        await advanceTurn(io, g);
      } catch (err) { console.error('[tinh-tuy] Extra turn timeout:', err); }
    });
    return;
  }

  const dice = game.lastDiceResult;
  if (dice && dice.dice1 === dice.dice2 && !player.isBankrupt && player.islandTurns === 0) {
    game.turnPhase = 'ROLL_DICE';
    game.turnStartedAt = new Date();
    await game.save();
    io.to(game.roomId).emit('tinh-tuy:turn-changed', {
      currentSlot: game.currentPlayerSlot,
      turnPhase: 'ROLL_DICE', extraTurn: true,
      buffs: getPlayerBuffs(game),
    });
    startTurnTimer(game.roomId, game.settings.turnDuration * 1000, async () => {
      try {
        const g = await TinhTuyGame.findOne({ roomId: game.roomId });
        if (!g || g.gameStatus !== 'playing') return;
        // Guard: if player already rolled (turnPhase moved past ROLL_DICE), skip
        if (g.turnPhase !== 'ROLL_DICE') return;
        await advanceTurn(io, g);
      } catch (err) { console.error('[tinh-tuy] Turn timeout:', err); }
    });
  } else {
    await advanceTurn(io, game);
  }
}

export async function advanceTurn(io: SocketIOServer, game: ITinhTuyGame, _skipRecurse = false): Promise<void> {
  const nextSlot = getNextActivePlayer(game.players, game.currentPlayerSlot);
  if (nextSlot <= game.currentPlayerSlot) {
    game.round += 1;
    // Notify clients when late-game acceleration starts
    if (game.round === LATE_GAME_START + 1) {
      io.to(game.roomId).emit('tinh-tuy:late-game-started');
    }
    // Decrement frozen property ROUNDS (not turns) — only when round increments
    if (!_skipRecurse && game.frozenProperties && game.frozenProperties.length > 0) {
      game.frozenProperties = game.frozenProperties
        .map((fp: any) => ({ ...fp, turnsRemaining: fp.turnsRemaining - 1 }))
        .filter((fp: any) => fp.turnsRemaining > 0);
      game.markModified('frozenProperties');
    }
  }

  game.currentPlayerSlot = nextSlot;
  game.turnStartedAt = new Date();
  game.lastDiceResult = null;
  game.markModified('lastDiceResult');

  // Check next player & decrement per-turn buffs at the START of their turn
  const nextPlayer = game.players.find(p => p.slot === nextSlot);

  // Decrement doubleRent buff when the player's own turn comes around
  if (nextPlayer?.doubleRentTurns && nextPlayer.doubleRentTurns > 0) {
    nextPlayer.doubleRentTurns--;
  }
  // buyBlockedTurns now decrements when the blocked player passes GO (not per turn)

  // ─── Character Ability: decrement cooldowns + Chicken drain ───
  if (nextPlayer && abilitiesEnabled(game)) {
    decrementCooldown(nextPlayer);

    // Chicken passive: drain 200 from each opponent at turn start
    const chickenDrain = executeChickenDrain(game, nextPlayer);
    if (chickenDrain.drained.length > 0) {
      game.markModified('players');
      io.to(game.roomId).emit('tinh-tuy:chicken-drain', {
        chickenSlot: nextPlayer.slot,
        drained: chickenDrain.drained,
        totalGained: chickenDrain.totalGained,
      });
      // Check if drain caused any bankruptcy
      for (const d of chickenDrain.drained) {
        const victim = game.players.find(p => p.slot === d.slot);
        if (victim && victim.points < 0) {
          const gameEnded = await checkBankruptcy(io, game, victim);
          if (gameEnded) return; // Game finished — stop advancing turn
        }
      }
    }
  }

  // skipNextTurn takes priority — keep pendingTravel for next non-skipped turn
  if (nextPlayer?.skipNextTurn) {
    nextPlayer.skipNextTurn = false;
    game.markModified('players');
    // Skip this player — advance again
    await game.save();
    io.to(game.roomId).emit('tinh-tuy:turn-changed', {
      currentSlot: nextSlot, turnPhase: 'ROLL_DICE',
      turnStartedAt: game.turnStartedAt, round: game.round, skipped: true,
      buffs: getPlayerBuffs(game),
    });
    await advanceTurn(io, game, true);
    return;
  }

  // Set phase based on player status: pendingTravel > island > normal roll
  if (nextPlayer?.pendingTravel) {
    game.turnPhase = 'AWAITING_TRAVEL';
    nextPlayer.pendingTravel = false;
    game.markModified('players');
  } else {
    game.turnPhase = (nextPlayer && nextPlayer.islandTurns > 0) ? 'ISLAND_TURN' : 'ROLL_DICE';
  }

  await game.save();

  const endCheck = checkGameEnd(game);
  if (endCheck.ended) {
    await finishGame(io, game, endCheck.winner, endCheck.reason || 'roundsComplete');
    return;
  }

  io.to(game.roomId).emit('tinh-tuy:turn-changed', {
    currentSlot: game.currentPlayerSlot,
    turnPhase: game.turnPhase,
    turnStartedAt: game.turnStartedAt,
    round: game.round,
    buffs: getPlayerBuffs(game),
    frozenProperties: game.frozenProperties || [],
  });

  // AWAITING_TRAVEL gets a dedicated timer with phase guard + auto-resolve
  if (game.turnPhase === 'AWAITING_TRAVEL') {
    const travelSlot = game.currentPlayerSlot;
    startTurnTimer(game.roomId, game.settings.turnDuration * 1000, async () => {
      try {
        const g = await TinhTuyGame.findOne({ roomId: game.roomId });
        if (!g || g.gameStatus !== 'playing') return;
        if (g.turnPhase !== 'AWAITING_TRAVEL') return; // phase guard
        const p = g.players.find(pp => pp.slot === travelSlot);
        if (!p) return;
        // Auto-pick GO (index 0) as safe default destination
        const dest = 0;
        const oldPos = p.position;
        const passedGo = dest < oldPos;
        p.position = dest;
        const goSalary = getEffectiveGoSalary(g.round || 1) + getGoSalaryBonus(g, p);
        if (passedGo) {
          p.points += goSalary;
          onPassGo(p);
        }
        g.markModified('players');
        await g.save();
        io.to(g.roomId).emit('tinh-tuy:player-moved', {
          slot: p.slot, from: oldPos, to: dest,
          passedGo, goBonus: passedGo ? goSalary : 0, isTravel: true,
        });
        await resolveAndAdvance(io, g, p, dest, { dice1: 0, dice2: 0, total: 0, isDouble: false });
      } catch (err) { console.error('[tinh-tuy] Travel timeout:', err); }
    });
  } else {
    startTurnTimer(game.roomId, game.settings.turnDuration * 1000, async () => {
      try {
        const g = await TinhTuyGame.findOne({ roomId: game.roomId });
        if (!g || g.gameStatus !== 'playing') return;
        await advanceTurn(io, g);
      } catch (err) { console.error('[tinh-tuy] Turn timeout:', err); }
    });
  }
}

/** Apply card effect results to game state */
function applyCardEffect(game: ITinhTuyGame, player: ITinhTuyPlayer, effect: CardEffectResult): void {
  // Apply point changes
  for (const [slotStr, delta] of Object.entries(effect.pointsChanged)) {
    const p = game.players.find(pp => pp.slot === Number(slotStr));
    if (p) p.points += delta;
  }

  // Move player
  if (effect.playerMoved) {
    const p = game.players.find(pp => pp.slot === effect.playerMoved!.slot);
    if (p) {
      p.position = effect.playerMoved.to;
      // Decrement buyBlocked on GO pass (card movement)
      if (effect.playerMoved.passedGo) onPassGo(p);
    }
  }

  // Hold card
  if (effect.cardHeld) {
    const p = game.players.find(pp => pp.slot === effect.cardHeld!.slot);
    if (p) p.cards.push(effect.cardHeld.cardId);
  }

  // Remove house
  if (effect.houseRemoved) {
    const p = game.players.find(pp => pp.slot === effect.houseRemoved!.slot);
    if (p) {
      const key = String(effect.houseRemoved.cellIndex);
      p.houses[key] = Math.max((p.houses[key] || 0) - 1, 0);
    }
  }

  // Skip turn
  if (effect.skipTurn) player.skipNextTurn = true;

  // Go to island (Pigfish immune — clear the flag so frontend doesn't animate)
  if (effect.goToIsland) {
    if (isIslandImmune(game, player)) {
      effect.goToIsland = false;
    } else {
      sendToIsland(player);
    }
  }

  // Double rent — card specifies rounds. Decremented once per owner's own turn in advanceTurn,
  // so the value directly represents the number of the owner's turns the buff persists.
  if (effect.doubleRentTurns) {
    player.doubleRentTurns = (player.doubleRentTurns || 0) + effect.doubleRentTurns;
  }

  // Immunity
  if (effect.immunityNextRent) player.immunityNextRent = true;

  // Extra turn
  if (effect.extraTurn) player.extraTurn = true;

  // Swap position — teleport both players
  if (effect.swapPosition) {
    const me = game.players.find(p => p.slot === effect.swapPosition!.slot);
    const target = game.players.find(p => p.slot === effect.swapPosition!.targetSlot);
    if (me && target) {
      me.position = effect.swapPosition.myNewPos;
      target.position = effect.swapPosition.targetNewPos;
    }
  }

  // Teleport all players to new positions
  if (effect.teleportAll) {
    for (const tp of effect.teleportAll) {
      const p = game.players.find(pp => pp.slot === tp.slot);
      if (p) {
        p.position = tp.to;
        // Clear pending travel if player was waiting for travel
        if (p.pendingTravel) p.pendingTravel = false;
      }
    }
  }

  // Steal property — transfer ownership + buildings (houses/hotel preserved)
  if (effect.stolenProperty) {
    const victim = game.players.find(p => p.slot === effect.stolenProperty!.fromSlot);
    const thief = game.players.find(p => p.slot === effect.stolenProperty!.toSlot);
    if (victim && thief) {
      const cellIdx = effect.stolenProperty.cellIndex;
      const key = String(cellIdx);
      // Transfer houses from victim to thief
      const houses = victim.houses[key] || 0;
      victim.properties = victim.properties.filter(idx => idx !== cellIdx);
      delete victim.houses[key];
      delete victim.hotels[key];
      thief.properties.push(cellIdx);
      if (houses > 0) thief.houses[key] = houses;
      // Transfer festival to new owner if stolen property hosted it
      if (game.festival && game.festival.cellIndex === cellIdx && game.festival.slot === effect.stolenProperty.fromSlot) {
        game.festival = { ...game.festival, slot: effect.stolenProperty.toSlot };
        game.markModified('festival');
      }
    }
  }

  // All lose one house (storm) — remove 1 random house from each player
  if (effect.allHousesRemoved) {
    for (const rem of effect.allHousesRemoved) {
      const p = game.players.find(pp => pp.slot === rem.slot);
      if (p) {
        const key = String(rem.cellIndex);
        p.houses[key] = Math.max((p.houses[key] || 0) - 1, 0);
      }
    }
  }
}

/** Draw card and resolve — handles most card types immediately */
async function handleCardDraw(
  io: SocketIOServer, game: ITinhTuyGame, player: ITinhTuyPlayer,
  cellType: 'KHI_VAN' | 'CO_HOI', depth = 0, preSelectedCard?: ITinhTuyCard
): Promise<void> {
  const isKhiVan = cellType === 'KHI_VAN';
  let card: ITinhTuyCard | undefined;

  // Pre-selected card (from Owl pick) — skip deck draw and owl passive
  if (preSelectedCard) {
    card = preSelectedCard;
  } else {

  let deck = isKhiVan ? game.luckCardDeck : game.opportunityCardDeck;
  let currentIndex = isKhiVan ? game.luckCardIndex : game.opportunityCardIndex;

  // Safety: rebuild deck if empty, corrupted, or contains invalid entries
  const deckCorrupted = !deck || deck.length === 0
    || typeof currentIndex !== 'number' || isNaN(currentIndex)
    || deck.some((id: any) => !id || typeof id !== 'string');
  if (deckCorrupted) {
    console.warn(`[tinh-tuy:handleCardDraw] ${cellType} deck invalid for room ${game.roomId} (deckLen=${deck?.length}, idx=${currentIndex}) — rebuilding`);
    deck = shuffleDeck(isKhiVan ? getKhiVanDeckIds() : getCoHoiDeckIds());
    currentIndex = 0;
    if (isKhiVan) {
      game.luckCardDeck = deck; game.luckCardIndex = 0;
      game.markModified('luckCardDeck'); game.markModified('luckCardIndex');
    } else {
      game.opportunityCardDeck = deck; game.opportunityCardIndex = 0;
      game.markModified('opportunityCardDeck'); game.markModified('opportunityCardIndex');
    }
  }

  const { cardId, newIndex, reshuffle } = drawCard(deck, currentIndex, isKhiVan);

  // Safety: protect against NaN propagation
  const safeNewIndex = (typeof newIndex === 'number' && !isNaN(newIndex)) ? newIndex : 0;

  // Update deck index + explicitly mark modified so Mongoose persists changes
  if (isKhiVan) {
    game.luckCardIndex = safeNewIndex;
    game.markModified('luckCardIndex');
    if (reshuffle) {
      game.luckCardDeck = shuffleDeck([...game.luckCardDeck]);
      game.markModified('luckCardDeck');
    }
  } else {
    game.opportunityCardIndex = safeNewIndex;
    game.markModified('opportunityCardIndex');
    if (reshuffle) {
      game.opportunityCardDeck = shuffleDeck([...game.opportunityCardDeck]);
      game.markModified('opportunityCardDeck');
    }
  }

  card = getCardById(cardId);
  if (!card) {
    console.error(`[tinh-tuy:handleCardDraw] Card not found: "${cardId}", deck: [${deck.slice(0, 5).join(',')}...], index: ${currentIndex}, room: ${game.roomId}`);
    // Rebuild the entire deck from source and retry once (depth guard prevents infinite loop)
    if (depth < 1) {
      const freshDeck = shuffleDeck(isKhiVan ? getKhiVanDeckIds() : getCoHoiDeckIds());
      if (isKhiVan) {
        game.luckCardDeck = freshDeck; game.luckCardIndex = 0;
        game.markModified('luckCardDeck'); game.markModified('luckCardIndex');
      } else {
        game.opportunityCardDeck = freshDeck; game.opportunityCardIndex = 0;
        game.markModified('opportunityCardDeck'); game.markModified('opportunityCardIndex');
      }
      await game.save();
      return handleCardDraw(io, game, player, cellType, depth + 1);
    }
    // Final fallback — force pick the first unrestricted card so player always sees something
    const sourceCards = isKhiVan ? KHI_VAN_CARDS : CO_HOI_CARDS;
    card = sourceCards.find(c => !c.minRound || game.round >= c.minRound) || sourceCards[0];
    console.warn(`[tinh-tuy:handleCardDraw] Forced fallback card: ${card.id} for room ${game.roomId}`);
  }

  // Round-restricted card: skip and redraw (max 10 retries to avoid infinite loop)
  if (card.minRound && game.round < card.minRound) {
    if (depth < 10) {
      await game.save();
      return handleCardDraw(io, game, player, cellType, depth + 1);
    }
    // Exceeded retries — force pick an unrestricted card so player always sees something
    const sourceCards = isKhiVan ? KHI_VAN_CARDS : CO_HOI_CARDS;
    const unrestricted = sourceCards.find(c => !c.minRound || game.round >= c.minRound);
    if (unrestricted) {
      card = unrestricted;
      console.warn(`[tinh-tuy:handleCardDraw] minRound retries exhausted, forced: ${card.id} for room ${game.roomId}`);
    } else {
      // All cards restricted (shouldn't happen) — skip and advance turn
      console.error(`[tinh-tuy:handleCardDraw] ALL cards restricted at round ${game.round} — skipping`);
      game.turnPhase = 'END_TURN';
      await game.save();
      await advanceTurnOrDoubles(io, game, player);
      return;
    }
  }

  // ─── Owl passive: draw 2, pick 1 ───
  if (hasPassive(game, player, 'CARD_DRAW_PICK_TWO')) {
    // Draw a second card
    const deck2 = isKhiVan ? game.luckCardDeck : game.opportunityCardDeck;
    const idx2 = isKhiVan ? game.luckCardIndex : game.opportunityCardIndex;
    const draw2 = drawCard(deck2, idx2, isKhiVan);
    let card2 = getCardById(draw2.cardId);
    // Update deck index for second draw
    if (isKhiVan) {
      game.luckCardIndex = draw2.newIndex;
      game.markModified('luckCardIndex');
      if (draw2.reshuffle) { game.luckCardDeck = shuffleDeck([...game.luckCardDeck]); game.markModified('luckCardDeck'); }
    } else {
      game.opportunityCardIndex = draw2.newIndex;
      game.markModified('opportunityCardIndex');
      if (draw2.reshuffle) { game.opportunityCardDeck = shuffleDeck([...game.opportunityCardDeck]); game.markModified('opportunityCardDeck'); }
    }
    if (card2 && card2.minRound && game.round < card2.minRound) card2 = null as any;
    if (card2) {
      // Present both cards to Owl for picking
      player.owlPendingCards = [card.id, card2.id];
      game.turnPhase = 'AWAITING_OWL_PICK' as any;
      game.markModified('players');
      // Emit prompt BEFORE save — ensures frontend receives it even if save fails
      io.to(game.roomId).emit('tinh-tuy:owl-pick-prompt', {
        slot: player.slot,
        cards: [
          { id: card.id, type: card.type, nameKey: card.nameKey, descriptionKey: card.descriptionKey },
          { id: card2.id, type: card2.type, nameKey: card2.nameKey, descriptionKey: card2.descriptionKey },
        ],
      });
      try { await game.save(); } catch (err) {
        console.error('[tinh-tuy] AWAITING_OWL_PICK save failed:', err);
      }
      // Safety timer: auto-pick first card if player doesn't respond
      startTurnTimer(game.roomId, game.settings.turnDuration * 1000 + CARD_CHOICE_EXTRA_MS, async () => {
        try {
          const g = await TinhTuyGame.findOne({ roomId: game.roomId });
          if (!g || g.turnPhase !== 'AWAITING_OWL_PICK') return;
          const p = g.players.find(pp => pp.slot === player.slot);
          if (!p || !p.owlPendingCards?.length) return;
          await executeOwlPick(io, g, p, p.owlPendingCards[0]);
        } catch (err) { console.error('[tinh-tuy] Owl pick timeout:', err); }
      });
      return; // Wait for owl pick
    }
    // If second card is invalid, proceed with single card normally
  }

  } // end else (normal deck draw path)

  if (!card) return; // safety: should never happen

  let effect: CardEffectResult;
  try {
    effect = executeCardEffect(game, player.slot, card);
    applyCardEffect(game, player, effect);
  } catch (effectErr) {
    // Card effect crashed — emit a no-op card so frontend at least shows something
    console.error(`[tinh-tuy:handleCardDraw] Card effect crashed for ${card.id}, room ${game.roomId}:`, effectErr);
    effect = { pointsChanged: {} };
  }
  // Mark ALL modified Mixed/nested fields so Mongoose persists every change
  game.markModified('players');
  if (game.festival !== undefined) game.markModified('festival');
  if (game.frozenProperties !== undefined) game.markModified('frozenProperties');

  // Build card-drawn payload BEFORE save — so we can emit even if save fails
  const cardDrawnPayload = {
    slot: player.slot,
    card: { id: card.id, type: card.type, nameKey: card.nameKey, descriptionKey: card.descriptionKey },
    effect,
  };

  // Persist deck index + card effects — emit card-drawn even if save fails
  try {
    await game.save();
  } catch (saveErr: any) {
    console.error(`[tinh-tuy:handleCardDraw] game.save() FAILED for room ${game.roomId}, card ${card.id}:`, saveErr.message);
    // Still emit card-drawn so frontend shows the card
    io.to(game.roomId).emit('tinh-tuy:card-drawn', cardDrawnPayload);
    // Force-advance turn to prevent stuck game
    game.turnPhase = 'END_TURN';
    try { await game.save(); } catch (e) { /* last resort — safetyRestartTimer will handle */ }
    return;
  }

  // Broadcast card drawn
  io.to(game.roomId).emit('tinh-tuy:card-drawn', cardDrawnPayload);

  // Check if stolen property completes a monopoly for the thief
  if (effect.stolenProperty) {
    const thief = game.players.find(p => p.slot === effect.stolenProperty!.toSlot);
    if (thief) {
      const group = checkMonopolyCompleted(effect.stolenProperty.cellIndex, thief.properties);
      if (group) {
        io.to(game.roomId).emit('tinh-tuy:monopoly-completed', {
          slot: thief.slot, group, cellIndices: PROPERTY_GROUPS[group],
        });
        handleSlothAutoBuild(io, game, thief, group);
      }
      emitNearWinWarning(io, game, thief);
    }
    // Also re-check victim (stale keys cleared if near-win was broken)
    const stealVictim = game.players.find(p => p.slot === effect.stolenProperty!.fromSlot);
    if (stealVictim) emitNearWinWarning(io, game, stealVictim);
  }

  // Check bankruptcy for point loss
  for (const [slotStr, delta] of Object.entries(effect.pointsChanged)) {
    if (delta < 0) {
      const p = game.players.find(pp => pp.slot === Number(slotStr));
      if (p && p.points < 0) {
        const gameEnded = await checkBankruptcy(io, game, p);
        if (gameEnded) return;
      }
    }
  }

  // If card moved player, resolve the landing cell (max 1 level deep)
  if (effect.playerMoved && !effect.goToIsland) {
    const landingAction = resolveCellAction(game, player.slot, effect.playerMoved.to, 0);
    // Auto-resolve landing cell (rent, tax, etc) — but NOT another card (prevent recursion)
    if (landingAction.action === 'rent' && landingAction.amount && landingAction.ownerSlot) {
      // Check immunity
      if (player.immunityNextRent) {
        player.immunityNextRent = false;
        // Immune — no rent paid, but still offer buyback
        const bb = await emitBuybackPrompt(io, game, player, effect.playerMoved.to, landingAction.ownerSlot);
        if (bb) return;
      } else {
        player.points -= landingAction.amount;
        const owner = game.players.find(p => p.slot === landingAction.ownerSlot);
        if (owner) owner.points += landingAction.amount;
        io.to(game.roomId).emit('tinh-tuy:rent-paid', {
          fromSlot: player.slot, toSlot: landingAction.ownerSlot,
          amount: landingAction.amount, cellIndex: effect.playerMoved.to,
        });
        const gameEnded = await checkBankruptcy(io, game, player);
        if (gameEnded) return;
        // Offer buyback after rent
        const bb = await emitBuybackPrompt(io, game, player, effect.playerMoved.to, landingAction.ownerSlot);
        if (bb) return;
      }
    } else if (landingAction.action === 'buy') {
      // Player can buy — show action prompt
      game.turnPhase = 'AWAITING_ACTION';
      await game.save();
      io.to(game.roomId).emit('tinh-tuy:awaiting-action', {
        slot: player.slot, cellIndex: effect.playerMoved.to,
        cellType: getCell(effect.playerMoved.to)?.type, price: landingAction.amount,
        canAfford: player.points >= (landingAction.amount || 0),
      });
      startTurnTimer(game.roomId, game.settings.turnDuration * 1000, async () => {
        try {
          const g = await TinhTuyGame.findOne({ roomId: game.roomId });
          if (!g || g.turnPhase !== 'AWAITING_ACTION') return;
          g.turnPhase = 'END_TURN';
          await g.save();
          const p = g.players.find(pp => pp.slot === player.slot)!;
          await advanceTurnOrDoubles(io, g, p);
        } catch (err) { console.error('[tinh-tuy] Card action timeout:', err); }
      });
      return; // Don't auto-advance — waiting for player
    } else if (landingAction.action === 'tax') {
      const taxAmt = landingAction.amount || 0;
      if (taxAmt > 0) player.points -= taxAmt;
      io.to(game.roomId).emit('tinh-tuy:tax-paid', {
        slot: player.slot, amount: taxAmt, cellIndex: effect.playerMoved.to,
        houseCount: landingAction.houseCount || 0,
        hotelCount: landingAction.hotelCount || 0,
        perHouse: landingAction.perHouse || 500,
        perHotel: landingAction.perHotel || 1000,
      });
      const gameEnded = await checkBankruptcy(io, game, player);
      if (gameEnded) return;
    } else if (landingAction.action === 'go_to_island') {
      // resolveCellAction already returns 'none' for Pigfish, but guard here too
      if (!isIslandImmune(game, player)) {
        sendToIsland(player);
        io.to(game.roomId).emit('tinh-tuy:player-island', { slot: player.slot, turnsRemaining: player.islandTurns });
      }
    } else if (landingAction.action === 'travel') {
      // Card moved player to Travel cell — defer travel to next turn, break doubles
      player.pendingTravel = true;
      player.consecutiveDoubles = 0;
      game.lastDiceResult = null;
      game.markModified('lastDiceResult');
    } else if (landingAction.action === 'build') {
      // Card moved player to own property — let them build
      game.turnPhase = 'AWAITING_BUILD';
      await game.save();
      io.to(game.roomId).emit('tinh-tuy:build-prompt', {
        slot: player.slot, cellIndex: effect.playerMoved.to,
        canBuildHouse: landingAction.canBuildHouse,
        houseCost: landingAction.houseCost,
        canBuildHotel: landingAction.canBuildHotel,
        hotelCost: landingAction.hotelCost,
        currentHouses: landingAction.currentHouses,
        hasHotel: landingAction.hasHotel,
      });
      startTurnTimer(game.roomId, game.settings.turnDuration * 1000, async () => {
        try {
          const g = await TinhTuyGame.findOne({ roomId: game.roomId });
          if (!g || g.turnPhase !== 'AWAITING_BUILD') return;
          g.turnPhase = 'END_TURN';
          await g.save();
          const p = g.players.find(pp => pp.slot === player.slot)!;
          await advanceTurnOrDoubles(io, g, p);
        } catch (err) { console.error('[tinh-tuy] Card build timeout:', err); }
      });
      return; // Wait for player choice
    } else if (landingAction.action === 'festival') {
      // Card moved player to festival cell — let them choose
      game.turnPhase = 'AWAITING_FESTIVAL';
      await game.save();
      io.to(game.roomId).emit('tinh-tuy:festival-prompt', { slot: player.slot });
      startTurnTimer(game.roomId, game.settings.turnDuration * 1000, async () => {
        try {
          const g = await TinhTuyGame.findOne({ roomId: game.roomId });
          if (!g || g.turnPhase !== 'AWAITING_FESTIVAL') return;
          // Auto-pick: apply festival to first owned property
          const p = g.players.find(pp => pp.slot === player.slot)!;
          if (p.properties.length > 0) {
            const autoCell = p.properties[0];
            const autoMult = 1.5;
            g.festival = { slot: p.slot, cellIndex: autoCell, multiplier: autoMult };
            g.markModified('festival');
          }
          g.turnPhase = 'END_TURN';
          await g.save();
          if (p.properties.length > 0) {
            io.to(game.roomId).emit('tinh-tuy:festival-applied', { slot: p.slot, cellIndex: p.properties[0], multiplier: 1.5 });
          }
          await advanceTurnOrDoubles(io, g, p);
        } catch (err) { console.error('[tinh-tuy] Card festival timeout:', err); }
      });
      return; // Wait for player choice
    }
    // Card moved player to another KHI_VAN/CO_HOI cell — skip (no chain draw)
    // Previously drew another card recursively, but this was confusing for players
  }

  // If go to island from card
  if (effect.goToIsland) {
    io.to(game.roomId).emit('tinh-tuy:player-island', { slot: player.slot, turnsRemaining: 3 });
  }

  // FREE_HOUSE: let player choose which property to build on
  if (effect.requiresChoice === 'FREE_HOUSE') {
    const buildableCells = player.properties.filter(idx => {
      // Free house ignores cost — only check structural constraints
      const cell = getCell(idx);
      if (!cell || cell.type !== 'PROPERTY' || !cell.group) return false;
      if ((player.houses[String(idx)] || 0) >= 4) return false;
      if (player.hotels[String(idx)]) return false;
      return true;
    });
    if (buildableCells.length > 0) {
      game.turnPhase = 'AWAITING_FREE_HOUSE';
      // Emit prompt BEFORE save — ensures frontend receives it even if save fails
      io.to(game.roomId).emit('tinh-tuy:free-house-prompt', {
        slot: player.slot, buildableCells,
      });
      try { await game.save(); } catch (err) {
        console.error('[tinh-tuy] FREE_HOUSE save failed:', err);
      }
      startTurnTimer(game.roomId, game.settings.turnDuration * 1000, async () => {
        try {
          const g = await TinhTuyGame.findOne({ roomId: game.roomId });
          if (!g || g.turnPhase !== 'AWAITING_FREE_HOUSE') return;
          // Auto-pick first buildable on timeout
          const p = g.players.find(pp => pp.slot === player.slot)!;
          p.houses[String(buildableCells[0])] = (p.houses[String(buildableCells[0])] || 0) + 1;
          g.markModified('players');
          g.turnPhase = 'END_TURN';
          await g.save();
          io.to(game.roomId).emit('tinh-tuy:house-built', {
            slot: p.slot, cellIndex: buildableCells[0],
            houseCount: p.houses[String(buildableCells[0])], free: true,
          });
          await advanceTurnOrDoubles(io, g, p);
        } catch (err) { console.error('[tinh-tuy] Free house timeout:', err); }
      });
      return; // Wait for player choice
    }
  }

  // FREE_HOTEL: let player choose which property to upgrade to hotel (skip 4-houses + cost)
  if (effect.requiresChoice === 'FREE_HOTEL') {
    const hotelCells = player.properties.filter(idx => {
      const cell = getCell(idx);
      if (!cell || cell.type !== 'PROPERTY' || !cell.group) return false;
      if (player.hotels[String(idx)]) return false; // already has hotel
      return true;
    });
    if (hotelCells.length > 0) {
      game.turnPhase = 'AWAITING_FREE_HOTEL';
      // Emit prompt BEFORE save — ensures frontend receives it even if save fails
      io.to(game.roomId).emit('tinh-tuy:free-hotel-prompt', {
        slot: player.slot, buildableCells: hotelCells,
      });
      try { await game.save(); } catch (err) {
        console.error('[tinh-tuy] FREE_HOTEL save failed:', err);
      }
      startTurnTimer(game.roomId, game.settings.turnDuration * 1000, async () => {
        try {
          const g = await TinhTuyGame.findOne({ roomId: game.roomId });
          if (!g || g.turnPhase !== 'AWAITING_FREE_HOTEL') return;
          // Auto-pick first cell on timeout
          const p = g.players.find(pp => pp.slot === player.slot)!;
          p.houses[String(hotelCells[0])] = 0;
          p.hotels[String(hotelCells[0])] = true;
          g.markModified('players');
          g.turnPhase = 'END_TURN';
          await g.save();
          io.to(game.roomId).emit('tinh-tuy:hotel-built', {
            slot: p.slot, cellIndex: hotelCells[0], free: true,
          });
          await advanceTurnOrDoubles(io, g, p);
        } catch (err) { console.error('[tinh-tuy] Free hotel timeout:', err); }
      });
      return; // Wait for player choice
    }
  }

  // BUY_BLOCK_TARGET: player chooses an opponent to block from buying
  if (effect.requiresChoice === 'BUY_BLOCK_TARGET') {
    const opponents = game.players.filter(p => !p.isBankrupt && p.slot !== player.slot);
    if (opponents.length > 0) {
      game.turnPhase = 'AWAITING_BUY_BLOCK_TARGET';
      // Emit prompt BEFORE save — ensures frontend receives it even if save fails
      io.to(game.roomId).emit('tinh-tuy:buy-block-prompt', {
        slot: player.slot,
        targets: opponents.map(p => ({ slot: p.slot, displayName: p.guestName || `Player ${p.slot}` })),
        turns: effect.buyBlockedTurns || 1,
      });
      try { await game.save(); } catch (err) {
        console.error('[tinh-tuy] BUY_BLOCK_TARGET save failed:', err);
      }
      startTurnTimer(game.roomId, game.settings.turnDuration * 1000 + CARD_CHOICE_EXTRA_MS, async () => {
        try {
          const g = await TinhTuyGame.findOne({ roomId: game.roomId });
          if (!g || g.turnPhase !== 'AWAITING_BUY_BLOCK_TARGET') return;
          // Auto-pick random opponent on timeout
          const randomTarget = opponents[crypto.randomInt(0, opponents.length)];
          const target = g.players.find(p => p.slot === randomTarget.slot);
          if (target) {
            target.buyBlockedTurns = effect.buyBlockedTurns || 1;
            g.markModified('players');
          }
          g.turnPhase = 'END_TURN';
          await g.save();
          io.to(game.roomId).emit('tinh-tuy:buy-blocked', {
            blockerSlot: player.slot, targetSlot: randomTarget.slot,
            turns: effect.buyBlockedTurns || 1,
          });
          const p = g.players.find(pp => pp.slot === player.slot)!;
          await advanceTurnOrDoubles(io, g, p);
        } catch (err) { console.error('[tinh-tuy] Buy block timeout:', err); }
      });
      return;
    }
  }

  // EMINENT_DOMAIN: player chooses opponent's property to force-buy at original price
  if (effect.requiresChoice === 'EMINENT_DOMAIN') {
    const targetCells = effect.targetableCells || [];
    if (targetCells.length > 0) {
      game.turnPhase = 'AWAITING_EMINENT_DOMAIN';
      io.to(game.roomId).emit('tinh-tuy:eminent-domain-prompt', {
        slot: player.slot, targetCells,
      });
      try { await game.save(); } catch (err) {
        console.error('[tinh-tuy] EMINENT_DOMAIN save failed:', err);
      }
      startTurnTimer(game.roomId, game.settings.turnDuration * 1000 + CARD_CHOICE_EXTRA_MS, async () => {
        try {
          const g = await TinhTuyGame.findOne({ roomId: game.roomId });
          if (!g || g.turnPhase !== 'AWAITING_EMINENT_DOMAIN') return;
          // Auto-pick random on timeout
          const randomCell = targetCells[crypto.randomInt(0, targetCells.length)];
          applyEminentDomain(g, player.slot, randomCell, io);
          g.turnPhase = 'END_TURN';
          g.markModified('players');
          await g.save();
          const p = g.players.find(pp => pp.slot === player.slot)!;
          await advanceTurnOrDoubles(io, g, p);
        } catch (err) { console.error('[tinh-tuy] Eminent domain timeout:', err); }
      });
      return;
    }
  }

  // SELF_FESTIVAL: player chooses own property to host festival (same as landing on festival cell)
  if (effect.requiresChoice === 'SELF_FESTIVAL') {
    if (player.properties.length > 0) {
      game.turnPhase = 'AWAITING_FESTIVAL';
      io.to(game.roomId).emit('tinh-tuy:festival-prompt', { slot: player.slot });
      try { await game.save(); } catch (err) {
        console.error('[tinh-tuy] SELF_FESTIVAL save failed:', err);
      }
      startTurnTimer(game.roomId, game.settings.turnDuration * 1000, async () => {
        try {
          const g = await TinhTuyGame.findOne({ roomId: game.roomId });
          if (!g || g.turnPhase !== 'AWAITING_FESTIVAL') return;
          const p = g.players.find(pp => pp.slot === player.slot)!;
          const autoCell = p.properties[0];
          let autoMult = 1.5;
          if (g.festival && g.festival.slot === p.slot && g.festival.cellIndex === autoCell) {
            autoMult = g.festival.multiplier + 0.5;
          }
          g.festival = { slot: p.slot, cellIndex: autoCell, multiplier: autoMult };
          g.markModified('festival');
          g.turnPhase = 'END_TURN';
          await g.save();
          io.to(g.roomId).emit('tinh-tuy:festival-applied', { slot: p.slot, cellIndex: autoCell, multiplier: autoMult });
          await advanceTurnOrDoubles(io, g, p);
        } catch (err) { console.error('[tinh-tuy] Self festival timeout:', err); }
      });
      return;
    }
    // No properties → card has no effect, fall through to normal advance
  }

  // DESTROY_PROPERTY / DOWNGRADE_BUILDING: let player choose opponent's property
  if (effect.requiresChoice === 'DESTROY_PROPERTY' || effect.requiresChoice === 'DOWNGRADE_BUILDING') {
    const targetCells = effect.targetableCells || [];
    if (targetCells.length > 0) {
      const phase = effect.requiresChoice === 'DESTROY_PROPERTY' ? 'AWAITING_DESTROY_PROPERTY' : 'AWAITING_DOWNGRADE_BUILDING';
      game.turnPhase = phase;
      io.to(game.roomId).emit('tinh-tuy:attack-property-prompt', {
        slot: player.slot, attackType: effect.requiresChoice, targetCells,
      });
      try { await game.save(); } catch (err) {
        console.error(`[tinh-tuy] ${phase} save failed:`, err);
      }
      // Auto-pick random on timeout (extra time for frontend animations: dice + move + card display)
      startTurnTimer(game.roomId, game.settings.turnDuration * 1000 + CARD_CHOICE_EXTRA_MS, async () => {
        try {
          const g = await TinhTuyGame.findOne({ roomId: game.roomId });
          if (!g || (g.turnPhase !== 'AWAITING_DESTROY_PROPERTY' && g.turnPhase !== 'AWAITING_DOWNGRADE_BUILDING')) return;
          const p = g.players.find(pp => pp.slot === player.slot)!;
          const randomCell = targetCells[crypto.randomInt(0, targetCells.length)];
          applyPropertyAttack(g, g.turnPhase === 'AWAITING_DESTROY_PROPERTY' ? 'DESTROY_PROPERTY' : 'DOWNGRADE_BUILDING', randomCell, io);
          g.turnPhase = 'END_TURN';
          g.markModified('players');
          await g.save();
          await advanceTurnOrDoubles(io, g, p);
        } catch (err) { console.error('[tinh-tuy] Attack property timeout:', err); }
      });
      return; // Wait for player choice
    }
  }

  // CHOOSE_DESTINATION: let player pick any cell on the board
  if (effect.requiresChoice === 'CHOOSE_DESTINATION') {
    game.turnPhase = 'AWAITING_CARD_DESTINATION';
    io.to(game.roomId).emit('tinh-tuy:card-destination-prompt', { slot: player.slot });
    try { await game.save(); } catch (err) {
      console.error('[tinh-tuy] CHOOSE_DESTINATION save failed:', err);
    }
    // Auto-pick random on timeout (extra time for frontend animations: dice + move + card display)
    startTurnTimer(game.roomId, game.settings.turnDuration * 1000 + CARD_CHOICE_EXTRA_MS, async () => {
      try {
        const g = await TinhTuyGame.findOne({ roomId: game.roomId });
        if (!g || g.turnPhase !== 'AWAITING_CARD_DESTINATION') return;
        const p = g.players.find(pp => pp.slot === player.slot)!;
        const randomDest = crypto.randomInt(0, BOARD_SIZE);
        const oldPos = p.position;
        p.position = randomDest;
        g.turnPhase = 'END_TURN';
        g.markModified('players');
        await g.save();
        io.to(g.roomId).emit('tinh-tuy:player-moved', {
          slot: p.slot, from: oldPos, to: randomDest, passedGo: false, goBonus: 0, isTravel: true,
        });
        await resolveAndAdvance(io, g, p, randomDest, { dice1: 0, dice2: 0, total: 0, isDouble: false });
      } catch (err) { console.error('[tinh-tuy] Card destination timeout:', err); }
    });
    return; // Wait for player choice
  }

  // RENT_FREEZE: player picks an opponent's property to freeze rent for 2 rounds
  if (effect.requiresChoice === 'RENT_FREEZE') {
    const freezeTargets = effect.targetableCells || [];
    game.turnPhase = 'AWAITING_RENT_FREEZE';
    // Emit prompt BEFORE save — ensures frontend receives it even if save fails
    io.to(game.roomId).emit('tinh-tuy:rent-freeze-prompt', {
      slot: player.slot, targetCells: freezeTargets,
    });
    try { await game.save(); } catch (err) {
      console.error('[tinh-tuy] RENT_FREEZE save failed:', err);
    }
    // Auto-pick random on timeout (extra time for frontend animations)
    startTurnTimer(game.roomId, game.settings.turnDuration * 1000 + CARD_CHOICE_EXTRA_MS, async () => {
      try {
        const g = await TinhTuyGame.findOne({ roomId: game.roomId });
        if (!g || g.turnPhase !== 'AWAITING_RENT_FREEZE') return;
        const p = g.players.find(pp => pp.slot === player.slot)!;
        if (freezeTargets.length > 0) {
          const target = freezeTargets[crypto.randomInt(0, freezeTargets.length)];
          if (!g.frozenProperties) g.frozenProperties = [];
          // Remove existing freeze on same cell, add new
          g.frozenProperties = g.frozenProperties.filter((fp: any) => fp.cellIndex !== target);
          // +1 to compensate for the immediate advanceTurn decrement that follows
          g.frozenProperties.push({ cellIndex: target, turnsRemaining: 3 });
          g.markModified('frozenProperties');
          io.to(g.roomId).emit('tinh-tuy:rent-frozen', { cellIndex: target, turnsRemaining: 2, frozenProperties: g.frozenProperties });
        }
        g.turnPhase = 'END_TURN';
        g.markModified('players');
        await g.save();
        await advanceTurnOrDoubles(io, g, p);
      } catch (err) { console.error('[tinh-tuy] Rent freeze timeout:', err); }
    });
    return;
  }

  // FORCED_TRADE: player picks own property + opponent property to swap
  if (effect.requiresChoice === 'FORCED_TRADE') {
    // Compute tradeable cells for UI
    const myCells = player.properties.filter(ci => !player.hotels?.[String(ci)]);
    const opponentCells = game.players
      .filter(p => !p.isBankrupt && p.slot !== player.slot)
      .flatMap(p => p.properties.filter(ci => !p.hotels?.[String(ci)]));
    game.turnPhase = 'AWAITING_FORCED_TRADE';
    // Emit prompt BEFORE save — ensures frontend receives it even if save fails
    io.to(game.roomId).emit('tinh-tuy:forced-trade-prompt', {
      slot: player.slot, myCells, opponentCells,
    });
    try { await game.save(); } catch (err) {
      console.error('[tinh-tuy] FORCED_TRADE save failed:', err);
    }
    // Auto-pick random on timeout (extra time for frontend animations)
    startTurnTimer(game.roomId, game.settings.turnDuration * 1000 + CARD_CHOICE_EXTRA_MS, async () => {
      try {
        const g = await TinhTuyGame.findOne({ roomId: game.roomId });
        if (!g || g.turnPhase !== 'AWAITING_FORCED_TRADE') return;
        const p = g.players.find(pp => pp.slot === player.slot)!;
        const myProps = p.properties.filter(ci => !p.hotels?.[String(ci)]);
        const oppProps = g.players
          .filter(pp => !pp.isBankrupt && pp.slot !== p.slot)
          .flatMap(pp => pp.properties.filter(ci => !pp.hotels?.[String(ci)]));
        if (myProps.length > 0 && oppProps.length > 0) {
          const myCell = myProps[crypto.randomInt(0, myProps.length)];
          const oppCell = oppProps[crypto.randomInt(0, oppProps.length)];
          applyForcedTrade(g, p.slot, myCell, oppCell, io);
        } else {
          // No valid trade — still emit forced-trade-done so frontend clears the prompt
          io.to(g.roomId).emit('tinh-tuy:forced-trade-done', {
            traderSlot: p.slot, traderCell: -1, victimSlot: -1, victimCell: -1, skipped: true,
          });
        }
        g.turnPhase = 'END_TURN';
        g.markModified('players');
        await g.save();
        await advanceTurnOrDoubles(io, g, p);
      } catch (err) { console.error('[tinh-tuy] Forced trade timeout:', err); }
    });
    return; // Wait for player choice
  }

  // Hold turn so frontend card modal can display before turn advances.
  // Cards with detailed multi-player effects (storm, teleport, steal, wealth transfer)
  // need longer display for players to read. Frontend uses 8s for these, 5s for others.
  // Backend delay is a safety fallback — current player can dismiss early via card-dismiss event.
  const hasDetailedInfo = (effect.allHousesRemoved && effect.allHousesRemoved.length > 0) ||
    (effect.teleportAll && effect.teleportAll.length > 0) ||
    !!effect.stolenProperty || !!effect.wealthTransfer;
  const CARD_DISPLAY_DELAY = hasDetailedInfo ? 10000 : 6000;
  game.turnPhase = 'AWAITING_CARD_DISPLAY';
  try {
    await game.save();
  } catch (saveErr: any) {
    console.error(`[tinh-tuy:handleCardDraw] AWAITING_CARD_DISPLAY save failed for room ${game.roomId}:`, saveErr.message);
    // Fall through — timer will still fire and reload from DB
  }
  startTurnTimer(game.roomId, CARD_DISPLAY_DELAY, async () => {
    try {
      const g = await TinhTuyGame.findOne({ roomId: game.roomId });
      if (!g || g.gameStatus !== 'playing') return;
      if (g.turnPhase !== 'AWAITING_CARD_DISPLAY') return;
      g.turnPhase = 'END_TURN';
      await g.save();
      const p = g.players.find(pp => pp.slot === player.slot)!;
      await advanceTurnOrDoubles(io, g, p);
    } catch (err) { console.error('[tinh-tuy] Card display timeout:', err); }
  });
}

/** Build a map of exact sell prices for each property/building the player owns.
 *  Sent to frontend so it displays the same values the backend uses. */
function buildSellPricesMap(
  player: ITinhTuyPlayer, completedRounds: number,
): Record<string, { property: number; house: number; hotel: number }> {
  const map: Record<string, { property: number; house: number; hotel: number }> = {};
  for (const cellIdx of player.properties) {
    map[String(cellIdx)] = {
      property: getPropertyTotalSellValue(player, cellIdx, completedRounds),
      house: getSellPrice(cellIdx, 'house'),
      hotel: getSellPrice(cellIdx, 'hotel'),
    };
  }
  return map;
}

/** Auto-sell cheapest assets (buildings first, then properties) until player points >= 0.
 *  Returns list of sold items for frontend display. */
function autoSellCheapest(
  game: ITinhTuyGame, player: ITinhTuyPlayer,
): Array<{ cellIndex: number; type: 'house' | 'hotel' | 'property'; price: number }> {
  const completedRounds = Math.max((game.round || 1) - 1, 0);
  const soldItems: Array<{ cellIndex: number; type: 'house' | 'hotel' | 'property'; price: number }> = [];

  // Phase 1: sell buildings (cheapest first)
  const buildings: Array<{ cellIndex: number; type: 'house' | 'hotel'; price: number }> = [];
  for (const cellIdx of player.properties) {
    const key = String(cellIdx);
    if (player.hotels[key]) {
      buildings.push({ cellIndex: cellIdx, type: 'hotel', price: getSellPrice(cellIdx, 'hotel') });
    }
    const houses = player.houses[key] || 0;
    for (let i = 0; i < houses; i++) {
      buildings.push({ cellIndex: cellIdx, type: 'house', price: getSellPrice(cellIdx, 'house') });
    }
  }
  buildings.sort((a, b) => a.price - b.price);
  for (const item of buildings) {
    if (player.points >= 0) break;
    const key = String(item.cellIndex);
    if (item.type === 'hotel') {
      player.hotels[key] = false;
    } else {
      player.houses[key] = (player.houses[key] || 0) - 1;
    }
    player.points += item.price;
    soldItems.push(item);
  }

  // Phase 2: sell properties (cheapest land first) if still in debt
  if (player.points < 0) {
    const props = player.properties
      .map(idx => ({ cellIndex: idx, price: getSellPrice(idx, 'property', completedRounds, player) }))
      .sort((a, b) => a.price - b.price);
    for (const prop of props) {
      if (player.points >= 0) break;
      const key = String(prop.cellIndex);
      delete player.houses[key];
      delete player.hotels[key];
      player.properties = player.properties.filter(idx => idx !== prop.cellIndex);
      player.points += prop.price;
      soldItems.push({ cellIndex: prop.cellIndex, type: 'property', price: prop.price });
      // Clear festival if this property hosted it
      if (game.festival && game.festival.cellIndex === prop.cellIndex && game.festival.slot === player.slot) {
        game.festival = null;
        game.markModified('festival');
      }
      // Clear frozen rent on sold property
      if (game.frozenProperties?.length) {
        game.frozenProperties = game.frozenProperties.filter((fp: any) => fp.cellIndex !== prop.cellIndex);
        game.markModified('frozenProperties');
      }
    }
  }
  game.markModified('players');
  return soldItems;
}

// ─── GO Bonus (landing exactly on cell 0) ────────────────────

const GO_BONUS_MIN = 3000;
const GO_BONUS_MAX = 5000;

/** Handle landing exactly on GO: 70% random 3000-5000 TT bonus, 30% free house upgrade */
async function handleGoBonus(
  io: SocketIOServer, game: ITinhTuyGame, player: ITinhTuyPlayer,
): Promise<void> {
  const roomId = game.roomId;

  // Check if player has any buildable properties (houses < 4, no hotel)
  const buildableCells = player.properties.filter(idx => {
    const cell = getCell(idx);
    if (!cell || cell.type !== 'PROPERTY' || !cell.group) return false;
    if ((player.houses[String(idx)] || 0) >= 4) return false;
    if (player.hotels[String(idx)]) return false;
    return true;
  });

  // 30% chance FREE_HOUSE if player has buildable properties
  const isFreeHouse = buildableCells.length > 0 && crypto.randomInt(100) < 30;

  if (isFreeHouse) {
    game.turnPhase = 'AWAITING_FREE_HOUSE';
    await game.save();

    io.to(roomId).emit('tinh-tuy:go-bonus', { slot: player.slot, bonusType: 'FREE_HOUSE' });
    io.to(roomId).emit('tinh-tuy:free-house-prompt', { slot: player.slot, buildableCells });

    // Auto-pick first buildable on timeout
    startTurnTimer(roomId, game.settings.turnDuration * 1000, async () => {
      try {
        const g = await TinhTuyGame.findOne({ roomId });
        if (!g || g.turnPhase !== 'AWAITING_FREE_HOUSE') return;
        const p = g.players.find(pp => pp.slot === player.slot)!;
        p.houses[String(buildableCells[0])] = (p.houses[String(buildableCells[0])] || 0) + 1;
        g.markModified('players');
        g.turnPhase = 'END_TURN';
        await g.save();
        io.to(roomId).emit('tinh-tuy:house-built', {
          slot: p.slot, cellIndex: buildableCells[0],
          houseCount: p.houses[String(buildableCells[0])], free: true,
        });
        await advanceTurnOrDoubles(io, g, p);
      } catch (err) { console.error('[tinh-tuy] GO free house timeout:', err); }
    });
    return; // Wait for player choice
  }

  // Regular BONUS_POINTS flow
  const steps = Math.floor((GO_BONUS_MAX - GO_BONUS_MIN) / 500) + 1; // 3000,3500,4000,4500,5000
  const baseAmount = GO_BONUS_MIN + crypto.randomInt(steps) * 500;
  const decayFactor = getEffectiveGoSalary(game.round || 1) / GO_SALARY;
  const amount = Math.floor(baseAmount * decayFactor);

  player.points += amount;
  game.markModified('players');
  game.turnPhase = 'END_TURN';
  await game.save();

  io.to(roomId).emit('tinh-tuy:go-bonus', {
    slot: player.slot, bonusType: 'BONUS_POINTS', amount,
  });

  await advanceTurnOrDoubles(io, game, player);
}

// ─── Near-Win Warning ────────────────────────────────────────

/** Emit near-win warning if a player is 1 step from domination victory.
 *  Deduped: each unique warning fires once, but resets if condition is broken
 *  (e.g. opponent steals/swaps/destroys) so it can fire again when rebuilt. */
function emitNearWinWarning(io: SocketIOServer, game: ITinhTuyGame, player: ITinhTuyPlayer) {
  const warning = checkNearWin(player);
  if (!game.nearWinAlerted) game.nearWinAlerted = {};

  const currentKey = warning
    ? `${player.slot}:${warning.type}:${warning.edgeIndex ?? -1}`
    : null;

  // Clear stale keys for this slot — if condition was broken, allow re-alert later
  const slotPrefix = `${player.slot}:`;
  let dirty = false;
  for (const key of Object.keys(game.nearWinAlerted)) {
    if (key.startsWith(slotPrefix) && key !== currentKey) {
      delete game.nearWinAlerted[key];
      dirty = true;
    }
  }
  if (dirty) game.markModified('nearWinAlerted');

  if (!warning || !currentKey) return;
  if (game.nearWinAlerted[currentKey]) return; // already emitted this exact warning

  game.nearWinAlerted[currentKey] = true;
  game.markModified('nearWinAlerted');

  io.to(game.roomId).emit('tinh-tuy:near-win-warning', {
    slot: player.slot,
    type: warning.type,
    missingCells: warning.missingCells,
    completedGroups: warning.completedGroups,
    edgeIndex: warning.edgeIndex,
  });
}

// ─── Property Attack Helpers ─────────────────────────────────

/**
 * Apply a property attack (DESTROY_PROPERTY or DOWNGRADE_BUILDING) to a target cell.
 * Returns the result details for the notification event.
 */
/** Swap ownership of two properties. Houses stay on cells, just change owner. */
function applyForcedTrade(
  game: ITinhTuyGame, mySlot: number, myCellIndex: number, oppCellIndex: number, io: SocketIOServer
) {
  const me = game.players.find(p => p.slot === mySlot);
  const oppOwner = game.players.find(p => p.properties.includes(oppCellIndex) && p.slot !== mySlot);
  if (!me || !oppOwner) return;

  // Remove from original owners
  me.properties = me.properties.filter(ci => ci !== myCellIndex);
  oppOwner.properties = oppOwner.properties.filter(ci => ci !== oppCellIndex);

  // Swap houses/hotels data
  const myKey = String(myCellIndex);
  const oppKey = String(oppCellIndex);
  const myHouses = (me.houses || {})[myKey] || 0;
  const myHotel = !!(me.hotels || {})[myKey];
  const oppHouses = (oppOwner.houses || {})[oppKey] || 0;
  const oppHotel = !!(oppOwner.hotels || {})[oppKey];

  // Clear old owner's building data
  delete (me.houses as any)[myKey];
  delete (me.hotels as any)[myKey];
  delete (oppOwner.houses as any)[oppKey];
  delete (oppOwner.hotels as any)[oppKey];

  // Add to new owners with swapped buildings
  me.properties.push(oppCellIndex);
  oppOwner.properties.push(myCellIndex);
  if (oppHouses > 0) (me.houses as any)[oppKey] = oppHouses;
  if (oppHotel) (me.hotels as any)[oppKey] = oppHotel;
  if (myHouses > 0) (oppOwner.houses as any)[myKey] = myHouses;
  if (myHotel) (oppOwner.hotels as any)[myKey] = myHotel;

  // Transfer festival if either cell hosts it
  if (game.festival) {
    if (game.festival.cellIndex === myCellIndex && game.festival.slot === mySlot) {
      game.festival = { ...game.festival, slot: oppOwner.slot };
      game.markModified('festival');
    } else if (game.festival.cellIndex === oppCellIndex && game.festival.slot === oppOwner.slot) {
      game.festival = { ...game.festival, slot: mySlot };
      game.markModified('festival');
    }
  }

  io.to(game.roomId).emit('tinh-tuy:forced-trade-done', {
    traderSlot: mySlot,
    traderCell: myCellIndex,
    victimSlot: oppOwner.slot,
    victimCell: oppCellIndex,
    festival: game.festival,
  });

  // Check if trade completes a monopoly for either party
  const meGroup = checkMonopolyCompleted(oppCellIndex, me.properties);
  if (meGroup) {
    io.to(game.roomId).emit('tinh-tuy:monopoly-completed', {
      slot: mySlot, group: meGroup, cellIndices: PROPERTY_GROUPS[meGroup],
    });
    handleSlothAutoBuild(io, game, me, meGroup);
  }
  const oppGroup = checkMonopolyCompleted(myCellIndex, oppOwner.properties);
  if (oppGroup) {
    io.to(game.roomId).emit('tinh-tuy:monopoly-completed', {
      slot: oppOwner.slot, group: oppGroup, cellIndices: PROPERTY_GROUPS[oppGroup],
    });
    handleSlothAutoBuild(io, game, oppOwner, oppGroup);
  }

  emitNearWinWarning(io, game, me);
  emitNearWinWarning(io, game, oppOwner);
}

/** Negotiate trade: buyer purchases a property from seller at offered price. One-directional buy. */
function applyNegotiateTrade(
  game: ITinhTuyGame, buyerSlot: number, sellerSlot: number, cellIndex: number, price: number, io: SocketIOServer
): boolean {
  const buyer = game.players.find(p => p.slot === buyerSlot);
  const seller = game.players.find(p => p.slot === sellerSlot);
  if (!buyer || !seller) return false;
  if (buyer.points < price) return false;
  if (!seller.properties.includes(cellIndex)) return false;

  // Transfer money
  buyer.points -= price;
  seller.points += price;

  // Transfer property + buildings
  const key = String(cellIndex);
  const houses = (seller.houses || {})[key] || 0;
  const hotel = !!(seller.hotels || {})[key];
  seller.properties = seller.properties.filter(idx => idx !== cellIndex);
  delete (seller.houses as any)[key];
  delete (seller.hotels as any)[key];
  buyer.properties.push(cellIndex);
  if (houses > 0) (buyer.houses as any)[key] = houses;
  if (hotel) (buyer.hotels as any)[key] = true;

  // Transfer festival if on this cell
  if (game.festival && game.festival.cellIndex === cellIndex && game.festival.slot === sellerSlot) {
    game.festival = { ...game.festival, slot: buyerSlot };
    game.markModified('festival');
  }

  game.markModified('players');

  // Check monopoly completion for buyer
  const buyerGroup = checkMonopolyCompleted(cellIndex, buyer.properties);
  if (buyerGroup) {
    io.to(game.roomId).emit('tinh-tuy:monopoly-completed', {
      slot: buyerSlot, group: buyerGroup, cellIndices: PROPERTY_GROUPS[buyerGroup],
    });
    handleSlothAutoBuild(io, game, buyer, buyerGroup);
  }

  emitNearWinWarning(io, game, buyer);
  emitNearWinWarning(io, game, seller); // Clear stale keys if seller's near-win was broken
  return true;
}

/** Eminent Domain: force-buy opponent's property at original price, transfer with houses */
function applyEminentDomain(
  game: ITinhTuyGame,
  buyerSlot: number,
  cellIndex: number,
  io: SocketIOServer,
): boolean {
  const cell = getCell(cellIndex);
  if (!cell) return false;
  const price = cell.price || 0;
  const buyer = game.players.find(p => p.slot === buyerSlot);
  const victim = game.players.find(p => p.properties.includes(cellIndex));
  if (!buyer || !victim || victim.slot === buyerSlot) return false;
  if (buyer.points < price) return false;
  if (victim.hotels[String(cellIndex)]) return false; // hotels immune

  // Transfer money
  buyer.points -= price;
  victim.points += price;

  // Transfer property + buildings
  const houses = victim.houses[String(cellIndex)] || 0;
  victim.properties = victim.properties.filter(idx => idx !== cellIndex);
  delete victim.houses[String(cellIndex)];
  buyer.properties.push(cellIndex);
  buyer.houses[String(cellIndex)] = houses;

  // Transfer festival if on this cell
  if (game.festival && game.festival.cellIndex === cellIndex && game.festival.slot === victim.slot) {
    game.festival.slot = buyer.slot;
    game.markModified('festival');
  }

  io.to(game.roomId).emit('tinh-tuy:eminent-domain-applied', {
    buyerSlot, victimSlot: victim.slot, cellIndex, price, houses,
  });

  return true;
}

function applyPropertyAttack(
  game: ITinhTuyGame,
  attackType: 'DESTROY_PROPERTY' | 'DOWNGRADE_BUILDING',
  cellIndex: number,
  io: SocketIOServer,
): { victimSlot: number; cellIndex: number; result: 'destroyed' | 'downgraded' | 'demolished' | 'shielded'; prevHouses: number; prevHotel: boolean; newHouses: number; newHotel: boolean } | null {
  // Find the owner of this cell
  const victim = game.players.find(p => p.properties.includes(cellIndex));
  if (!victim) return null;

  // Shield check — if victim holds a shield card, consume it and block the attack
  const shieldIdx = victim.cards.indexOf('shield');
  if (shieldIdx >= 0) {
    victim.cards.splice(shieldIdx, 1);
    const key = String(cellIndex);
    const result = {
      victimSlot: victim.slot, cellIndex, result: 'shielded' as const,
      prevHouses: victim.houses[key] || 0, prevHotel: !!victim.hotels[key],
      newHouses: victim.houses[key] || 0, newHotel: !!victim.hotels[key],
      festival: game.festival,
    };
    io.to(game.roomId).emit('tinh-tuy:property-attacked', result);
    return result;
  }

  const key = String(cellIndex);
  const prevHouses = victim.houses[key] || 0;
  const prevHotel = !!victim.hotels[key];

  if (attackType === 'DESTROY_PROPERTY') {
    // Destroy entirely: remove property + all buildings
    delete victim.houses[key];
    delete victim.hotels[key];
    victim.properties = victim.properties.filter(idx => idx !== cellIndex);
    // Clear game-level festival if on this cell
    if (game.festival && game.festival.cellIndex === cellIndex && game.festival.slot === victim.slot) {
      game.festival = null;
      game.markModified('festival');
    }
    // Clear frozen rent on destroyed property
    if (game.frozenProperties?.length) {
      game.frozenProperties = game.frozenProperties.filter((fp: any) => fp.cellIndex !== cellIndex);
      game.markModified('frozenProperties');
    }
    const result = { victimSlot: victim.slot, cellIndex, result: 'destroyed' as const, prevHouses, prevHotel, newHouses: 0, newHotel: false, festival: game.festival };
    io.to(game.roomId).emit('tinh-tuy:property-attacked', result);
    return result;
  }

  // DOWNGRADE_BUILDING: reduce 1 level
  if (prevHotel) {
    // Hotel → remove hotel, land only
    victim.hotels[key] = false;
    const result = { victimSlot: victim.slot, cellIndex, result: 'downgraded' as const, prevHouses, prevHotel, newHouses: prevHouses, newHotel: false, festival: game.festival };
    io.to(game.roomId).emit('tinh-tuy:property-attacked', result);
    return result;
  } else if (prevHouses > 0) {
    // N houses → N-1
    victim.houses[key] = prevHouses - 1;
    const result = { victimSlot: victim.slot, cellIndex, result: 'downgraded' as const, prevHouses, prevHotel, newHouses: prevHouses - 1, newHotel: false, festival: game.festival };
    io.to(game.roomId).emit('tinh-tuy:property-attacked', result);
    return result;
  } else {
    // Just land → destroy (unowned)
    delete victim.houses[key];
    delete victim.hotels[key];
    victim.properties = victim.properties.filter(idx => idx !== cellIndex);
    if (game.festival && game.festival.cellIndex === cellIndex && game.festival.slot === victim.slot) {
      game.festival = null;
      game.markModified('festival');
    }
    // Clear frozen rent on demolished property
    if (game.frozenProperties?.length) {
      game.frozenProperties = game.frozenProperties.filter((fp: any) => fp.cellIndex !== cellIndex);
      game.markModified('frozenProperties');
    }
    const result = { victimSlot: victim.slot, cellIndex, result: 'demolished' as const, prevHouses, prevHotel, newHouses: 0, newHotel: false, festival: game.festival };
    io.to(game.roomId).emit('tinh-tuy:property-attacked', result);
    return result;
  }
}

// ─── Buyback Price Calculation ────────────────────────────────

/** Calculate buyback price = total property value × 1.1
 *  For utilities: uses current rent value (scales with round) as base
 *  For stations: uses rent value (scales with stations owned) as base */
function calculateBuybackPrice(owner: ITinhTuyPlayer, cellIndex: number, completedRounds: number): number {
  const cell = getCell(cellIndex);
  if (!cell || !cell.price) return 0;
  const key = String(cellIndex);

  let total: number;
  if (cell.type === 'UTILITY') {
    // Utility value scales with rounds — use current rent as base
    total = getUtilityRent(cell.price, completedRounds);
  } else if (cell.type === 'STATION') {
    // Station value scales with how many stations owned
    const stationsOwned = owner.properties.filter(i => getCell(i)?.type === 'STATION').length;
    total = cell.price + getStationRent(stationsOwned);
  } else {
    total = cell.price;
    const houses = owner.houses[key] || 0;
    if (houses > 0) total += houses * (cell.houseCost || 0);
    if (owner.hotels[key]) total += (cell.hotelCost || 0);
  }
  return Math.ceil(total * 1.1);
}

/**
 * Emit buyback prompt after rent payment.
 * If player can't afford, still emit with canAfford=false for frontend notification.
 * Returns true if we entered AWAITING_BUYBACK phase (caller should return/not advance).
 */
async function emitBuybackPrompt(
  io: SocketIOServer, game: ITinhTuyGame, player: ITinhTuyPlayer,
  cellIndex: number, ownerSlot: number,
): Promise<boolean> {
  const owner = game.players.find(p => p.slot === ownerSlot);
  if (!owner || owner.isBankrupt) return false;
  // Buy-blocked players cannot buy back either
  if (player.buyBlockedTurns && player.buyBlockedTurns > 0) return false;
  // Hotel properties cannot be bought back
  if (owner.hotels[String(cellIndex)]) return false;
  const completedRounds = Math.max((game.round || 1) - 1, 0);
  const price = calculateBuybackPrice(owner, cellIndex, completedRounds);
  if (price <= 0) return false;
  const canAfford = player.points >= price;

  if (!canAfford) {
    // Just notify — not enough money, don't enter waiting phase
    io.to(game.roomId).emit('tinh-tuy:buyback-prompt', {
      slot: player.slot, ownerSlot, cellIndex, price, canAfford: false,
    });
    return false;
  }

  // Enter buyback phase
  game.turnPhase = 'AWAITING_BUYBACK';
  await game.save();
  io.to(game.roomId).emit('tinh-tuy:buyback-prompt', {
    slot: player.slot, ownerSlot, cellIndex, price, canAfford: true,
  });

  startTurnTimer(game.roomId, game.settings.turnDuration * 1000, async () => {
    try {
      const g = await TinhTuyGame.findOne({ roomId: game.roomId });
      if (!g || g.turnPhase !== 'AWAITING_BUYBACK') return;
      // Auto-decline on timeout
      g.turnPhase = 'END_TURN';
      await g.save();
      const p = g.players.find(pp => pp.slot === player.slot)!;
      await advanceTurnOrDoubles(io, g, p);
    } catch (err) { console.error('[tinh-tuy] Buyback timeout:', err); }
  });
  return true;
}

// ─── Chat Rate Limiting ──────────────────────────────────────
const chatLastMessage = new Map<string, number>();
const CHAT_RATE_MS = 1000;
const REACTION_RATE_MS = 500;

/** Clean up chat rate-limit entries for a disconnected socket */
export function cleanupChatRateLimit(socketId: string): void {
  chatLastMessage.delete(socketId);
  chatLastMessage.delete(`react:${socketId}`);
}

// ─── Gameplay Event Registration ──────────────────────────────

export function registerGameplayHandlers(io: SocketIOServer, socket: Socket): void {

  // ── Roll Dice ────────────────────────────────────────────────
  socket.on('tinh-tuy:roll-dice', async (_data: any, callback: TinhTuyCallback) => {
    try {
      if (isRateLimited(socket.id)) return callback({ success: false, error: 'tooFast' });
      const roomId = socket.data.tinhTuyRoomId as string;
      if (!roomId) return callback({ success: false, error: 'notInRoom' });

      const game = await TinhTuyGame.findOne({ roomId });
      if (!game || game.gameStatus !== 'playing') {
        return callback({ success: false, error: 'gameNotActive' });
      }

      const player = findPlayerBySocket(game, socket);
      if (!player || !isCurrentPlayer(game, player)) {
        return callback({ success: false, error: 'notYourTurn' });
      }

      // Allow ROLL_DICE or ISLAND_TURN (rolling to escape island)
      if (game.turnPhase !== 'ROLL_DICE' && game.turnPhase !== 'ISLAND_TURN') {
        return callback({ success: false, error: 'invalidPhase' });
      }

      clearTurnTimer(roomId);
      // Check admin dice override for current player
      const override = game.diceOverrides?.[String(player.slot)];
      const dice = override
        ? { dice1: override.dice1, dice2: override.dice2, total: override.dice1 + override.dice2, isDouble: override.dice1 === override.dice2 }
        : rollDice();
      game.lastDiceResult = { dice1: dice.dice1, dice2: dice.dice2 };
      game.markModified('lastDiceResult');

      // === Island escape via roll ===
      if (player.islandTurns > 0 && game.turnPhase === 'ISLAND_TURN') {
        const escapeResult = handleIslandEscape(player, 'ROLL', dice);
        await game.save();

        io.to(roomId).emit('tinh-tuy:dice-result', dice);

        if (escapeResult.escaped) {
          io.to(roomId).emit('tinh-tuy:island-escaped', {
            slot: player.slot, method: 'ROLL',
            costPaid: escapeResult.costPaid || 0,
          });

          // Check if forced-pay bankrupted the player before moving
          if (escapeResult.costPaid && player.points < 0) {
            const gameEnded = await checkBankruptcy(io, game, player);
            if (gameEnded) { callback({ success: true }); return; }
            // Player went bankrupt (no sellable assets) but game continues — skip move
            if (player.isBankrupt) {
              await game.save();
              await advanceTurn(io, game);
              callback({ success: true });
              return;
            }
          }

          // Player is free — move with dice result
          const oldPos = player.position;
          const { position: newPos, passedGo } = calculateNewPosition(oldPos, dice.total);
          player.position = newPos;
          const goSalary1 = getEffectiveGoSalary(game.round || 1) + getGoSalaryBonus(game, player);
          if (passedGo) {
            player.points += goSalary1;
            onPassGo(player);
          }
          await game.save();

          io.to(roomId).emit('tinh-tuy:player-moved', {
            slot: player.slot, from: oldPos, to: newPos, passedGo,
            goBonus: passedGo ? goSalary1 : 0,
          });

          // Resolve landing cell
          await resolveAndAdvance(io, game, player, newPos, dice);
        } else {
          // Still trapped
          io.to(roomId).emit('tinh-tuy:player-island', {
            slot: player.slot, turnsRemaining: player.islandTurns,
          });
          await advanceTurn(io, game);
        }

        callback({ success: true });
        return;
      }

      // === Normal dice roll ===

      // Handle doubles (Pigfish immune to island penalty)
      if (dice.isDouble) {
        player.consecutiveDoubles += 1;
        if (player.consecutiveDoubles >= 3 && !isIslandImmune(game, player)) {
          const oldPos = player.position;
          sendToIsland(player);
          game.turnPhase = 'END_TURN';
          await game.save();

          io.to(roomId).emit('tinh-tuy:dice-result', dice);
          io.to(roomId).emit('tinh-tuy:player-moved', {
            slot: player.slot, from: oldPos, to: 27, passedGo: false, teleport: true,
          });
          io.to(roomId).emit('tinh-tuy:player-island', { slot: player.slot, turnsRemaining: 3 });
          callback({ success: true });
          await advanceTurn(io, game);
          return;
        }
        if (player.consecutiveDoubles >= 3) player.consecutiveDoubles = 0; // Pigfish: reset, proceed normally
      } else {
        player.consecutiveDoubles = 0;
      }

      // ─── Horse passive: ±1 step choice (once per GO cycle) ───
      if (hasPassive(game, player, 'MOVE_ADJUST') && !player.horsePassiveUsed) {
        player.horsePassiveUsed = true;
        player.horseAdjustPending = true;
        game.turnPhase = 'AWAITING_HORSE_ADJUST' as any;
        game.markModified('players');
        await game.save();
        io.to(roomId).emit('tinh-tuy:dice-result', dice);
        io.to(roomId).emit('tinh-tuy:horse-adjust-prompt', {
          slot: player.slot, diceTotal: dice.total,
        });
        // Safety timer: auto-pick +0 if player doesn't respond
        startTurnTimer(roomId, game.settings.turnDuration * 1000, async () => {
          try {
            const g = await TinhTuyGame.findOne({ roomId });
            if (!g || g.turnPhase !== 'AWAITING_HORSE_ADJUST') return;
            const p = g.players.find(pp => pp.slot === player.slot);
            if (!p) return;
            p.horseAdjustPending = false;
            const moveSteps = dice.total; // +0 default
            const oldP = p.position;
            const { position: newP, passedGo: pg } = calculateNewPosition(oldP, moveSteps);
            p.position = newP;
            const goS = getEffectiveGoSalary(g.round || 1) + getGoSalaryBonus(g, p);
            if (pg) { p.points += goS; onPassGo(p); }
            g.markModified('players');
            await g.save();
            io.to(roomId).emit('tinh-tuy:player-moved', { slot: p.slot, from: oldP, to: newP, passedGo: pg, goBonus: pg ? goS : 0 });
            await resolveAndAdvance(io, g, p, newP, dice);
          } catch (err) { console.error('[tinh-tuy] Horse adjust timeout:', err); safetyRestartTimer(io, roomId); }
        });
        callback({ success: true });
        return;
      }

      // ─── Shiba passive-like: reroll prompt after dice (PRE-MOVE) ───
      if (player.character === 'shiba' && !player.abilityUsedThisTurn
          && player.abilityCooldown <= 0 && abilitiesEnabled(game)) {
        const newDice = rollDice();
        player.shibaRerollPending = {
          original: { dice1: dice.dice1, dice2: dice.dice2 },
          rerolled: { dice1: newDice.dice1, dice2: newDice.dice2 },
        };
        setAbilityCooldown(player);
        game.turnPhase = 'AWAITING_SHIBA_REROLL_PICK' as any;
        game.markModified('players');
        await game.save();
        io.to(roomId).emit('tinh-tuy:dice-result', dice);
        io.to(roomId).emit('tinh-tuy:ability-used', {
          slot: player.slot, abilityId: 'shiba-active', cooldown: player.abilityCooldown,
        });
        io.to(roomId).emit('tinh-tuy:shiba-reroll-prompt', {
          slot: player.slot,
          original: player.shibaRerollPending.original,
          rerolled: player.shibaRerollPending.rerolled,
        });
        // Safety timer: auto-keep original dice if player doesn't respond
        startTurnTimer(roomId, game.settings.turnDuration * 1000, async () => {
          try {
            const g = await TinhTuyGame.findOne({ roomId });
            if (!g || g.turnPhase !== 'AWAITING_SHIBA_REROLL_PICK') return;
            const p = g.players.find(pp => pp.slot === player.slot);
            if (!p || !p.shibaRerollPending) return;
            const chosen = p.shibaRerollPending.original;
            g.lastDiceResult = { dice1: chosen.dice1, dice2: chosen.dice2 };
            g.markModified('lastDiceResult');
            p.shibaRerollPending = undefined as any;
            io.to(roomId).emit('tinh-tuy:shiba-reroll-picked', { slot: p.slot, kept: 'original', dice: chosen });
            const d = { dice1: chosen.dice1, dice2: chosen.dice2, total: chosen.dice1 + chosen.dice2, isDouble: chosen.dice1 === chosen.dice2 };
            await executeShibaPostPick(io, g, p, d);
          } catch (err) { console.error('[tinh-tuy] Shiba reroll timeout:', err); safetyRestartTimer(io, roomId); }
        });
        callback({ success: true });
        return;
      }

      // ─── Rabbit passive: +3 bonus steps on doubles (player chooses) ───
      const rabbitBonus = dice.isDouble ? getDoubleBonusSteps(game, player) : 0;
      if (rabbitBonus > 0) {
        player.rabbitBonusPending = { dice: { ...dice }, bonus: rabbitBonus };
        game.turnPhase = 'AWAITING_RABBIT_BONUS' as any;
        game.markModified('players');
        await game.save();
        io.to(roomId).emit('tinh-tuy:dice-result', dice);
        io.to(roomId).emit('tinh-tuy:rabbit-bonus-prompt', {
          slot: player.slot, bonus: rabbitBonus, dice,
        });
        // Safety timer: auto-decline bonus if player doesn't respond
        startTurnTimer(roomId, game.settings.turnDuration * 1000, async () => {
          try {
            const g = await TinhTuyGame.findOne({ roomId });
            if (!g || g.turnPhase !== 'AWAITING_RABBIT_BONUS') return;
            const p = g.players.find(pp => pp.slot === player.slot);
            if (!p || !p.rabbitBonusPending) return;
            const { dice: d } = p.rabbitBonusPending;
            const moveSteps = d.total; // decline bonus
            p.rabbitBonusPending = undefined as any;
            io.to(roomId).emit('tinh-tuy:rabbit-bonus-picked', { slot: p.slot, accepted: false, totalSteps: moveSteps });
            const oldP = p.position;
            const { position: newP, passedGo: pg } = calculateNewPosition(oldP, moveSteps);
            p.position = newP;
            const goS = getEffectiveGoSalary(g.round || 1) + getGoSalaryBonus(g, p);
            if (pg) { p.points += goS; onPassGo(p); }
            g.markModified('players');
            await g.save();
            io.to(roomId).emit('tinh-tuy:player-moved', { slot: p.slot, from: oldP, to: newP, passedGo: pg, goBonus: pg ? goS : 0 });
            await resolveAndAdvance(io, g, p, newP, { ...d, total: moveSteps });
          } catch (err) { console.error('[tinh-tuy] Rabbit bonus timeout:', err); safetyRestartTimer(io, roomId); }
        });
        callback({ success: true });
        return;
      }

      // Calculate movement
      const moveSteps = dice.total;
      const oldPos = player.position;
      const { position: newPos, passedGo } = calculateNewPosition(oldPos, moveSteps);
      player.position = newPos;

      const goSalary2 = getEffectiveGoSalary(game.round || 1) + getGoSalaryBonus(game, player);
      if (passedGo) {
        player.points += goSalary2;
        onPassGo(player);
      }

      await game.save();

      // Broadcast
      io.to(roomId).emit('tinh-tuy:dice-result', dice);
      io.to(roomId).emit('tinh-tuy:player-moved', {
        slot: player.slot, from: oldPos, to: newPos, passedGo,
        goBonus: passedGo ? goSalary2 : 0,
      });

      // Resolve landing cell
      await resolveAndAdvance(io, game, player, newPos, dice);

      callback({ success: true });
    } catch (err: any) {
      console.error('[tinh-tuy:roll-dice]', err.message);
      callback({ success: false, error: 'rollFailed' });
      const roomId = socket.data.tinhTuyRoomId as string;
      if (roomId) safetyRestartTimer(io, roomId);
    }
  });

  // ── Card Dismiss (early turn advance) ────────────────────────
  // Current player dismissed the card modal early — skip remaining display timer
  socket.on('tinh-tuy:card-dismiss', async () => {
    try {
      const roomId = socket.data.tinhTuyRoomId as string;
      if (!roomId) return;

      const game = await TinhTuyGame.findOne({ roomId });
      if (!game || game.gameStatus !== 'playing') return;
      if (game.turnPhase !== 'AWAITING_CARD_DISPLAY') return;

      const player = findPlayerBySocket(game, socket);
      if (!player || !isCurrentPlayer(game, player)) return;

      clearTurnTimer(roomId);
      game.turnPhase = 'END_TURN';
      await game.save();
      await advanceTurnOrDoubles(io, game, player);
    } catch (err) {
      console.error('[tinh-tuy] card-dismiss error:', err);
    }
  });

  // ── Buy Property ─────────────────────────────────────────────
  socket.on('tinh-tuy:buy-property', async (_data: any, callback: TinhTuyCallback) => {
    try {
      if (isRateLimited(socket.id)) return callback({ success: false, error: 'tooFast' });
      const roomId = socket.data.tinhTuyRoomId as string;
      if (!roomId) return callback({ success: false, error: 'notInRoom' });

      const game = await TinhTuyGame.findOne({ roomId });
      if (!game || game.gameStatus !== 'playing') {
        return callback({ success: false, error: 'gameNotActive' });
      }

      const player = findPlayerBySocket(game, socket);
      if (!player || !isCurrentPlayer(game, player)) {
        return callback({ success: false, error: 'notYourTurn' });
      }
      if (game.turnPhase !== 'AWAITING_ACTION') {
        return callback({ success: false, error: 'invalidPhase' });
      }

      // Check buy block
      if (player.buyBlockedTurns && player.buyBlockedTurns > 0) {
        return callback({ success: false, error: 'buyBlocked' });
      }

      const cell = getCell(player.position);
      if (!cell || !cell.price) return callback({ success: false, error: 'notBuyable' });

      const alreadyOwned = game.players.some(p => p.properties.includes(player.position));
      if (alreadyOwned) return callback({ success: false, error: 'alreadyOwned' });

      if (player.points < cell.price) {
        return callback({ success: false, error: 'cantAfford' });
      }

      clearTurnTimer(roomId);

      player.points -= cell.price;
      player.properties.push(player.position);
      game.turnPhase = 'END_TURN';
      await game.save();

      io.to(roomId).emit('tinh-tuy:property-bought', {
        slot: player.slot, cellIndex: player.position,
        price: cell.price, remainingPoints: player.points,
      });

      // Check if buying this property completes a monopoly
      const completedGroup = checkMonopolyCompleted(player.position, player.properties);
      if (completedGroup) {
        io.to(roomId).emit('tinh-tuy:monopoly-completed', {
          slot: player.slot, group: completedGroup,
          cellIndices: PROPERTY_GROUPS[completedGroup],
        });
        handleSlothAutoBuild(io, game, player, completedGroup);
      }

      // Check near-win warning (1 step from domination victory)
      emitNearWinWarning(io, game, player);

      await advanceTurnOrDoubles(io, game, player);
      callback({ success: true });
    } catch (err: any) {
      console.error('[tinh-tuy:buy-property]', err.message);
      callback({ success: false, error: 'buyFailed' });
      const roomId = socket.data.tinhTuyRoomId as string;
      if (roomId) safetyRestartTimer(io, roomId);
    }
  });

  // ── Skip Buy ─────────────────────────────────────────────────
  socket.on('tinh-tuy:skip-buy', async (_data: any, callback: TinhTuyCallback) => {
    try {
      if (isRateLimited(socket.id)) return callback({ success: false, error: 'tooFast' });
      const roomId = socket.data.tinhTuyRoomId as string;
      if (!roomId) return callback({ success: false, error: 'notInRoom' });

      const game = await TinhTuyGame.findOne({ roomId });
      if (!game || game.gameStatus !== 'playing') {
        return callback({ success: false, error: 'gameNotActive' });
      }

      const player = findPlayerBySocket(game, socket);
      if (!player || !isCurrentPlayer(game, player)) {
        return callback({ success: false, error: 'notYourTurn' });
      }
      if (game.turnPhase !== 'AWAITING_ACTION') {
        return callback({ success: false, error: 'invalidPhase' });
      }

      clearTurnTimer(roomId);
      game.turnPhase = 'END_TURN';
      await game.save();

      await advanceTurnOrDoubles(io, game, player);
      callback({ success: true });
    } catch (err: any) {
      console.error('[tinh-tuy:skip-buy]', err.message);
      callback({ success: false, error: 'skipFailed' });
      const roomId = socket.data.tinhTuyRoomId as string;
      if (roomId) safetyRestartTimer(io, roomId);
    }
  });

  // ── Travel To (choose destination from Travel cell) ─────────
  socket.on('tinh-tuy:travel-to', async (data: any, callback: TinhTuyCallback) => {
    try {
      if (isRateLimited(socket.id)) return callback({ success: false, error: 'tooFast' });
      const roomId = socket.data.tinhTuyRoomId as string;
      if (!roomId) return callback({ success: false, error: 'notInRoom' });

      const { cellIndex } = data || {};
      if (typeof cellIndex !== 'number' || cellIndex < 0 || cellIndex > 35) {
        return callback({ success: false, error: 'invalidCell' });
      }

      const game = await TinhTuyGame.findOne({ roomId });
      if (!game || game.gameStatus !== 'playing') {
        return callback({ success: false, error: 'gameNotActive' });
      }

      const player = findPlayerBySocket(game, socket);
      if (!player || !isCurrentPlayer(game, player)) {
        return callback({ success: false, error: 'notYourTurn' });
      }
      if (game.turnPhase !== 'AWAITING_TRAVEL') {
        return callback({ success: false, error: 'invalidPhase' });
      }

      // Validate destination: GO, unowned buyable cells, or own properties only
      const destCell = getCell(cellIndex);
      if (!destCell) return callback({ success: false, error: 'invalidCell' });
      if (cellIndex === player.position) return callback({ success: false, error: 'sameCell' });
      const isBuyable = destCell.type === 'PROPERTY' || destCell.type === 'STATION' || destCell.type === 'UTILITY';
      const owner = isBuyable ? game.players.find(p => p.properties.includes(cellIndex)) : undefined;
      const isGo = destCell.type === 'GO';
      const isUnowned = isBuyable && !owner;
      const isOwnProperty = isBuyable && owner?.slot === player.slot;
      if (!isGo && !isUnowned && !isOwnProperty) {
        return callback({ success: false, error: 'invalidDestination' });
      }

      clearTurnTimer(roomId);

      // Move player to destination — always forward (clockwise), may pass GO
      const oldPos = player.position;
      const passedGo = cellIndex < oldPos; // forward wrap = passed GO
      player.position = cellIndex;
      const goSalary3 = getEffectiveGoSalary(game.round || 1) + getGoSalaryBonus(game, player);
      if (passedGo) {
        player.points += goSalary3;
        onPassGo(player);
      }
      await game.save();

      io.to(roomId).emit('tinh-tuy:player-moved', {
        slot: player.slot, from: oldPos, to: cellIndex,
        passedGo, goBonus: passedGo ? goSalary3 : 0, isTravel: true,
      });

      // Resolve destination cell
      await resolveAndAdvance(io, game, player, cellIndex, { dice1: 0, dice2: 0, total: 0, isDouble: false });
      callback({ success: true });
    } catch (err: any) {
      console.error('[tinh-tuy:travel-to]', err.message);
      callback({ success: false, error: 'travelFailed' });
      const roomId = socket.data.tinhTuyRoomId as string;
      if (roomId) safetyRestartTimer(io, roomId);
    }
  });

  // ── Apply Festival (choose property to host festival) ────────
  socket.on('tinh-tuy:apply-festival', async (data: any, callback: TinhTuyCallback) => {
    try {
      if (isRateLimited(socket.id)) return callback({ success: false, error: 'tooFast' });
      const roomId = socket.data.tinhTuyRoomId as string;
      if (!roomId) return callback({ success: false, error: 'notInRoom' });

      const { cellIndex } = data || {};
      if (typeof cellIndex !== 'number' || cellIndex < 0 || cellIndex > 35) {
        return callback({ success: false, error: 'invalidCell' });
      }

      const game = await TinhTuyGame.findOne({ roomId });
      if (!game || game.gameStatus !== 'playing') {
        return callback({ success: false, error: 'gameNotActive' });
      }

      const player = findPlayerBySocket(game, socket);
      if (!player || !isCurrentPlayer(game, player)) {
        return callback({ success: false, error: 'notYourTurn' });
      }
      if (game.turnPhase !== 'AWAITING_FESTIVAL') {
        return callback({ success: false, error: 'invalidPhase' });
      }

      // Must own the property
      if (!player.properties.includes(cellIndex)) {
        return callback({ success: false, error: 'notOwned' });
      }

      clearTurnTimer(roomId);

      // Compute new festival state (global — only 1 on board)
      let newMultiplier = 1.5;
      if (game.festival && game.festival.slot === player.slot && game.festival.cellIndex === cellIndex) {
        // Same player, same cell → stack +0.5
        newMultiplier = game.festival.multiplier + 0.5;
      }
      // Any other case (different cell, different player, or no festival) → reset to 1.5
      game.festival = { slot: player.slot, cellIndex, multiplier: newMultiplier };
      game.markModified('festival');

      game.turnPhase = 'END_TURN';
      await game.save();

      io.to(roomId).emit('tinh-tuy:festival-applied', {
        slot: player.slot, cellIndex, multiplier: newMultiplier,
      });
      await advanceTurnOrDoubles(io, game, player);
      callback({ success: true });
    } catch (err: any) {
      console.error('[tinh-tuy:apply-festival]', err.message);
      callback({ success: false, error: 'festivalFailed' });
      const roomId = socket.data.tinhTuyRoomId as string;
      if (roomId) safetyRestartTimer(io, roomId);
    }
  });

  // ── Build House ──────────────────────────────────────────────
  socket.on('tinh-tuy:build-house', async (data: any, callback: TinhTuyCallback) => {
    try {
      if (isRateLimited(socket.id)) return callback({ success: false, error: 'tooFast' });
      const roomId = socket.data.tinhTuyRoomId as string;
      if (!roomId) return callback({ success: false, error: 'notInRoom' });

      const { cellIndex } = data || {};
      if (typeof cellIndex !== 'number') return callback({ success: false, error: 'invalidCell' });

      const game = await TinhTuyGame.findOne({ roomId });
      if (!game || game.gameStatus !== 'playing') {
        return callback({ success: false, error: 'gameNotActive' });
      }

      const player = findPlayerBySocket(game, socket);
      if (!player || player.isBankrupt || !isCurrentPlayer(game, player)) {
        return callback({ success: false, error: 'cannotBuild' });
      }

      const check = canBuildHouse(game, player.slot, cellIndex);
      if (!check.valid) return callback({ success: false, error: check.error || 'cannotBuild' });

      const wasAwaitingBuild = game.turnPhase === 'AWAITING_BUILD';
      if (wasAwaitingBuild) clearTurnTimer(roomId);

      buildHouse(game, player.slot, cellIndex);
      game.markModified('players');

      if (wasAwaitingBuild) game.turnPhase = 'END_TURN';
      await game.save();

      io.to(roomId).emit('tinh-tuy:house-built', {
        slot: player.slot, cellIndex,
        houseCount: player.houses[String(cellIndex)],
        remainingPoints: player.points,
      });

      // Advance turn if this was the landing build prompt
      if (wasAwaitingBuild) await advanceTurnOrDoubles(io, game, player);

      callback({ success: true });
    } catch (err: any) {
      console.error('[tinh-tuy:build-house]', err.message);
      callback({ success: false, error: 'buildFailed' });
      const roomId = socket.data.tinhTuyRoomId as string;
      if (roomId) safetyRestartTimer(io, roomId);
    }
  });

  // ── Build Hotel ──────────────────────────────────────────────
  socket.on('tinh-tuy:build-hotel', async (data: any, callback: TinhTuyCallback) => {
    try {
      if (isRateLimited(socket.id)) return callback({ success: false, error: 'tooFast' });
      const roomId = socket.data.tinhTuyRoomId as string;
      if (!roomId) return callback({ success: false, error: 'notInRoom' });

      const { cellIndex } = data || {};
      if (typeof cellIndex !== 'number') return callback({ success: false, error: 'invalidCell' });

      const game = await TinhTuyGame.findOne({ roomId });
      if (!game || game.gameStatus !== 'playing') {
        return callback({ success: false, error: 'gameNotActive' });
      }

      const player = findPlayerBySocket(game, socket);
      if (!player || player.isBankrupt || !isCurrentPlayer(game, player)) {
        return callback({ success: false, error: 'cannotBuild' });
      }

      const check = canBuildHotel(game, player.slot, cellIndex);
      if (!check.valid) return callback({ success: false, error: check.error || 'cannotBuild' });

      const wasAwaitingBuild = game.turnPhase === 'AWAITING_BUILD';
      if (wasAwaitingBuild) clearTurnTimer(roomId);

      buildHotel(game, player.slot, cellIndex);
      game.markModified('players');

      if (wasAwaitingBuild) game.turnPhase = 'END_TURN';
      await game.save();

      io.to(roomId).emit('tinh-tuy:hotel-built', {
        slot: player.slot, cellIndex,
        remainingPoints: player.points,
      });

      if (wasAwaitingBuild) await advanceTurnOrDoubles(io, game, player);

      callback({ success: true });
    } catch (err: any) {
      console.error('[tinh-tuy:build-hotel]', err.message);
      callback({ success: false, error: 'buildFailed' });
      const roomId = socket.data.tinhTuyRoomId as string;
      if (roomId) safetyRestartTimer(io, roomId);
    }
  });

  // ── Skip Build ────────────────────────────────────────────────
  socket.on('tinh-tuy:skip-build', async (_data: any, callback: TinhTuyCallback) => {
    try {
      if (isRateLimited(socket.id)) return callback({ success: false, error: 'tooFast' });
      const roomId = socket.data.tinhTuyRoomId as string;
      if (!roomId) return callback({ success: false, error: 'notInRoom' });

      const game = await TinhTuyGame.findOne({ roomId });
      if (!game || game.gameStatus !== 'playing') {
        return callback({ success: false, error: 'gameNotActive' });
      }

      const player = findPlayerBySocket(game, socket);
      if (!player || !isCurrentPlayer(game, player)) {
        return callback({ success: false, error: 'notYourTurn' });
      }
      if (game.turnPhase !== 'AWAITING_BUILD') {
        return callback({ success: false, error: 'invalidPhase' });
      }

      clearTurnTimer(roomId);
      game.turnPhase = 'END_TURN';
      await game.save();

      await advanceTurnOrDoubles(io, game, player);
      callback({ success: true });
    } catch (err: any) {
      console.error('[tinh-tuy:skip-build]', err.message);
      callback({ success: false, error: 'skipFailed' });
      const roomId = socket.data.tinhTuyRoomId as string;
      if (roomId) safetyRestartTimer(io, roomId);
    }
  });

  // ── Free House Choose (from Co Hoi card) ─────────────────────
  socket.on('tinh-tuy:free-house-choose', async (data: any, callback: TinhTuyCallback) => {
    try {
      if (isRateLimited(socket.id)) return callback({ success: false, error: 'tooFast' });
      const roomId = socket.data.tinhTuyRoomId as string;
      if (!roomId) return callback({ success: false, error: 'notInRoom' });

      const game = await TinhTuyGame.findOne({ roomId });
      if (!game || game.gameStatus !== 'playing') {
        return callback({ success: false, error: 'gameNotActive' });
      }

      const player = findPlayerBySocket(game, socket);
      if (!player || !isCurrentPlayer(game, player)) {
        return callback({ success: false, error: 'notYourTurn' });
      }
      if (game.turnPhase !== 'AWAITING_FREE_HOUSE') {
        return callback({ success: false, error: 'invalidPhase' });
      }

      const cellIndex = data?.cellIndex;
      if (typeof cellIndex !== 'number') return callback({ success: false, error: 'invalidCell' });

      // Validate: must be own property, buildable (ignoring cost)
      const cell = getCell(cellIndex);
      if (!cell || cell.type !== 'PROPERTY' || !cell.group) {
        return callback({ success: false, error: 'notBuildable' });
      }
      if (!player.properties.includes(cellIndex)) {
        return callback({ success: false, error: 'notOwned' });
      }
      if ((player.houses[String(cellIndex)] || 0) >= 4 || player.hotels[String(cellIndex)]) {
        return callback({ success: false, error: 'maxBuildings' });
      }

      clearTurnTimer(roomId);

      player.houses[String(cellIndex)] = (player.houses[String(cellIndex)] || 0) + 1;
      game.markModified('players');
      game.turnPhase = 'END_TURN';
      await game.save();

      io.to(roomId).emit('tinh-tuy:house-built', {
        slot: player.slot, cellIndex,
        houseCount: player.houses[String(cellIndex)], free: true,
      });

      await advanceTurnOrDoubles(io, game, player);
      callback({ success: true });
    } catch (err: any) {
      console.error('[tinh-tuy:free-house-choose]', err.message);
      callback({ success: false, error: 'freeHouseFailed' });
      const roomId = socket.data.tinhTuyRoomId as string;
      if (roomId) safetyRestartTimer(io, roomId);
    }
  });

  // ── Free Hotel Choose (from Co Hoi card — instant hotel upgrade) ─
  socket.on('tinh-tuy:free-hotel-choose', async (data: any, callback: TinhTuyCallback) => {
    try {
      if (isRateLimited(socket.id)) return callback({ success: false, error: 'tooFast' });
      const roomId = socket.data.tinhTuyRoomId as string;
      if (!roomId) return callback({ success: false, error: 'notInRoom' });

      const game = await TinhTuyGame.findOne({ roomId });
      if (!game || game.gameStatus !== 'playing') {
        return callback({ success: false, error: 'gameNotActive' });
      }

      const player = findPlayerBySocket(game, socket);
      if (!player || !isCurrentPlayer(game, player)) {
        return callback({ success: false, error: 'notYourTurn' });
      }
      if (game.turnPhase !== 'AWAITING_FREE_HOTEL') {
        return callback({ success: false, error: 'invalidPhase' });
      }

      const cellIndex = data?.cellIndex;
      if (typeof cellIndex !== 'number') return callback({ success: false, error: 'invalidCell' });

      // Validate: must be own PROPERTY, no existing hotel
      const cell = getCell(cellIndex);
      if (!cell || cell.type !== 'PROPERTY' || !cell.group) {
        return callback({ success: false, error: 'notBuildable' });
      }
      if (!player.properties.includes(cellIndex)) {
        return callback({ success: false, error: 'notOwned' });
      }
      if (player.hotels[String(cellIndex)]) {
        return callback({ success: false, error: 'hasHotel' });
      }

      clearTurnTimer(roomId);

      // Place hotel directly — remove any existing houses
      player.houses[String(cellIndex)] = 0;
      player.hotels[String(cellIndex)] = true;
      game.markModified('players');
      game.turnPhase = 'END_TURN';
      await game.save();

      io.to(roomId).emit('tinh-tuy:hotel-built', {
        slot: player.slot, cellIndex, free: true,
      });

      await advanceTurnOrDoubles(io, game, player);
      callback({ success: true });
    } catch (err: any) {
      console.error('[tinh-tuy:free-hotel-choose]', err.message);
      callback({ success: false, error: 'freeHotelFailed' });
      const roomId = socket.data.tinhTuyRoomId as string;
      if (roomId) safetyRestartTimer(io, roomId);
    }
  });

  // ── Buy Block Choose (Economic Sanction — pick opponent to block) ─
  socket.on('tinh-tuy:buy-block-choose', async (data: any, callback: TinhTuyCallback) => {
    try {
      if (isRateLimited(socket.id)) return callback({ success: false, error: 'tooFast' });
      const roomId = socket.data.tinhTuyRoomId as string;
      if (!roomId) return callback({ success: false, error: 'notInRoom' });

      const game = await TinhTuyGame.findOne({ roomId });
      if (!game || game.gameStatus !== 'playing') {
        return callback({ success: false, error: 'gameNotActive' });
      }

      const player = findPlayerBySocket(game, socket);
      if (!player || !isCurrentPlayer(game, player)) {
        return callback({ success: false, error: 'notYourTurn' });
      }
      if (game.turnPhase !== 'AWAITING_BUY_BLOCK_TARGET') {
        return callback({ success: false, error: 'invalidPhase' });
      }

      const targetSlot = data?.targetSlot;
      if (typeof targetSlot !== 'number') return callback({ success: false, error: 'invalidTarget' });

      const target = game.players.find(p => p.slot === targetSlot && !p.isBankrupt && p.slot !== player.slot);
      if (!target) return callback({ success: false, error: 'invalidTarget' });

      clearTurnTimer(roomId);

      target.buyBlockedTurns = data?.turns || 1;
      game.markModified('players');
      game.turnPhase = 'END_TURN';
      await game.save();

      io.to(roomId).emit('tinh-tuy:buy-blocked', {
        blockerSlot: player.slot, targetSlot: target.slot,
        turns: data?.turns || 2,
      });

      await advanceTurnOrDoubles(io, game, player);
      callback({ success: true });
    } catch (err: any) {
      console.error('[tinh-tuy:buy-block-choose]', err.message);
      callback({ success: false, error: 'buyBlockFailed' });
      const roomId = socket.data.tinhTuyRoomId as string;
      if (roomId) safetyRestartTimer(io, roomId);
    }
  });

  // ── Eminent Domain Choose (force-buy opponent's property at original price) ─
  socket.on('tinh-tuy:eminent-domain-choose', async (data: any, callback: TinhTuyCallback) => {
    try {
      if (isRateLimited(socket.id)) return callback({ success: false, error: 'tooFast' });
      const roomId = socket.data.tinhTuyRoomId as string;
      if (!roomId) return callback({ success: false, error: 'notInRoom' });

      const game = await TinhTuyGame.findOne({ roomId });
      if (!game || game.gameStatus !== 'playing') {
        return callback({ success: false, error: 'gameNotActive' });
      }

      const player = findPlayerBySocket(game, socket);
      if (!player || !isCurrentPlayer(game, player)) {
        return callback({ success: false, error: 'notYourTurn' });
      }
      if (game.turnPhase !== 'AWAITING_EMINENT_DOMAIN') {
        return callback({ success: false, error: 'invalidPhase' });
      }

      const cellIndex = data?.cellIndex;
      if (typeof cellIndex !== 'number') return callback({ success: false, error: 'invalidCell' });

      clearTurnTimer(roomId);

      // Find victim before transfer (loses ownership after applyEminentDomain)
      const edVictim = game.players.find(p => p.properties.includes(cellIndex) && p.slot !== player.slot);
      const success = applyEminentDomain(game, player.slot, cellIndex, io);
      if (!success) return callback({ success: false, error: 'eminentDomainFailed' });

      game.markModified('players');
      game.turnPhase = 'END_TURN';
      await game.save();

      // Check monopoly + near-win after acquiring property
      const completedGroup = checkMonopolyCompleted(cellIndex, player.properties);
      if (completedGroup) {
        io.to(roomId).emit('tinh-tuy:monopoly-completed', {
          slot: player.slot, group: completedGroup,
          cellIndices: PROPERTY_GROUPS[completedGroup],
        });
        handleSlothAutoBuild(io, game, player, completedGroup);
      }
      emitNearWinWarning(io, game, player);
      if (edVictim) emitNearWinWarning(io, game, edVictim);

      await advanceTurnOrDoubles(io, game, player);
      callback({ success: true });
    } catch (err: any) {
      console.error('[tinh-tuy:eminent-domain-choose]', err.message);
      callback({ success: false, error: 'eminentDomainFailed' });
      const roomId = socket.data.tinhTuyRoomId as string;
      if (roomId) safetyRestartTimer(io, roomId);
    }
  });

  // ── Attack Property (destroy or downgrade opponent's property) ─
  socket.on('tinh-tuy:attack-property-choose', async (data: any, callback: TinhTuyCallback) => {
    try {
      if (isRateLimited(socket.id)) return callback({ success: false, error: 'tooFast' });
      const roomId = socket.data.tinhTuyRoomId as string;
      if (!roomId) return callback({ success: false, error: 'notInRoom' });

      const game = await TinhTuyGame.findOne({ roomId });
      if (!game || game.gameStatus !== 'playing') {
        return callback({ success: false, error: 'gameNotActive' });
      }

      const player = findPlayerBySocket(game, socket);
      if (!player || !isCurrentPlayer(game, player)) {
        return callback({ success: false, error: 'notYourTurn' });
      }

      const { cellIndex } = data || {};
      if (typeof cellIndex !== 'number') {
        return callback({ success: false, error: 'invalidCell' });
      }

      // Validate phase
      const isDestroy = game.turnPhase === 'AWAITING_DESTROY_PROPERTY';
      const isDowngrade = game.turnPhase === 'AWAITING_DOWNGRADE_BUILDING';
      if (!isDestroy && !isDowngrade) {
        return callback({ success: false, error: 'invalidPhase' });
      }

      // Validate target is an opponent's property
      const victim = game.players.find(p => !p.isBankrupt && p.slot !== player.slot && p.properties.includes(cellIndex));
      if (!victim) {
        return callback({ success: false, error: 'invalidTarget' });
      }

      clearTurnTimer(roomId);
      const attackType = isDestroy ? 'DESTROY_PROPERTY' : 'DOWNGRADE_BUILDING';
      applyPropertyAttack(game, attackType, cellIndex, io);
      // Clear victim's stale near-win keys (property/house destroyed)
      emitNearWinWarning(io, game, victim);
      game.turnPhase = 'END_TURN';
      game.markModified('players');
      await game.save();

      if (game.turnPhase !== 'END_TURN') return; // guard
      await advanceTurnOrDoubles(io, game, player);
      callback({ success: true });
    } catch (err: any) {
      console.error('[tinh-tuy:attack-property-choose]', err.message);
      callback({ success: false, error: 'attackFailed' });
      const roomId = socket.data.tinhTuyRoomId as string;
      if (roomId) safetyRestartTimer(io, roomId);
    }
  });

  // ── Card Choose Destination (kv-23) ─────────────────────────
  socket.on('tinh-tuy:card-choose-destination', async (data: any, callback: TinhTuyCallback) => {
    try {
      if (isRateLimited(socket.id)) return callback({ success: false, error: 'tooFast' });
      const roomId = socket.data.tinhTuyRoomId as string;
      if (!roomId) return callback({ success: false, error: 'notInRoom' });

      const game = await TinhTuyGame.findOne({ roomId });
      if (!game || game.gameStatus !== 'playing') {
        return callback({ success: false, error: 'gameNotActive' });
      }
      const player = findPlayerBySocket(game, socket);
      if (!player || !isCurrentPlayer(game, player)) {
        return callback({ success: false, error: 'notYourTurn' });
      }
      if (game.turnPhase !== 'AWAITING_CARD_DESTINATION') {
        return callback({ success: false, error: 'invalidPhase' });
      }
      const { cellIndex } = data || {};
      if (typeof cellIndex !== 'number' || cellIndex < 0 || cellIndex >= BOARD_SIZE) {
        return callback({ success: false, error: 'invalidCell' });
      }

      clearTurnTimer(roomId);
      const oldPos = player.position;
      player.position = cellIndex;
      // No GO salary for card destination
      game.markModified('players');
      await game.save();

      io.to(roomId).emit('tinh-tuy:player-moved', {
        slot: player.slot, from: oldPos, to: cellIndex, passedGo: false, goBonus: 0, isTravel: true,
      });

      await resolveAndAdvance(io, game, player, cellIndex, { dice1: 0, dice2: 0, total: 0, isDouble: false });
      callback({ success: true });
    } catch (err: any) {
      console.error('[tinh-tuy:card-choose-destination]', err.message);
      callback({ success: false, error: 'destinationFailed' });
      const roomId = socket.data.tinhTuyRoomId as string;
      if (roomId) safetyRestartTimer(io, roomId);
    }
  });

  // ── Rent Freeze (ch-25) ─────────────────────────────────────
  socket.on('tinh-tuy:rent-freeze-choose', async (data: any, callback: TinhTuyCallback) => {
    try {
      if (isRateLimited(socket.id)) return callback({ success: false, error: 'tooFast' });
      const roomId = socket.data.tinhTuyRoomId as string;
      if (!roomId) return callback({ success: false, error: 'notInRoom' });

      const game = await TinhTuyGame.findOne({ roomId });
      if (!game || game.gameStatus !== 'playing') {
        return callback({ success: false, error: 'gameNotActive' });
      }
      const player = findPlayerBySocket(game, socket);
      if (!player || !isCurrentPlayer(game, player)) {
        return callback({ success: false, error: 'notYourTurn' });
      }
      if (game.turnPhase !== 'AWAITING_RENT_FREEZE') {
        return callback({ success: false, error: 'invalidPhase' });
      }

      const { cellIndex } = data || {};
      // Validate target is opponent's property
      const oppOwner = game.players.find(p => !p.isBankrupt && p.slot !== player.slot && p.properties.includes(cellIndex));
      if (!oppOwner) {
        return callback({ success: false, error: 'invalidTarget' });
      }

      clearTurnTimer(roomId);
      if (!game.frozenProperties) game.frozenProperties = [];
      game.frozenProperties = game.frozenProperties.filter((fp: any) => fp.cellIndex !== cellIndex);
      // +1 to compensate for the immediate advanceTurn decrement that follows
      game.frozenProperties.push({ cellIndex, turnsRemaining: 3 });
      game.markModified('frozenProperties');
      game.turnPhase = 'END_TURN';
      game.markModified('players');
      await game.save();

      io.to(roomId).emit('tinh-tuy:rent-frozen', { cellIndex, turnsRemaining: 2, frozenProperties: game.frozenProperties });
      await advanceTurnOrDoubles(io, game, player);
      callback({ success: true });
    } catch (err: any) {
      console.error('[tinh-tuy:rent-freeze-choose]', err.message);
      callback({ success: false, error: 'freezeFailed' });
      const roomId = socket.data.tinhTuyRoomId as string;
      if (roomId) safetyRestartTimer(io, roomId);
    }
  });

  // ── Forced Trade (ch-23) ────────────────────────────────────
  socket.on('tinh-tuy:forced-trade-choose', async (data: any, callback: TinhTuyCallback) => {
    try {
      if (isRateLimited(socket.id)) return callback({ success: false, error: 'tooFast' });
      const roomId = socket.data.tinhTuyRoomId as string;
      if (!roomId) return callback({ success: false, error: 'notInRoom' });

      const game = await TinhTuyGame.findOne({ roomId });
      if (!game || game.gameStatus !== 'playing') {
        return callback({ success: false, error: 'gameNotActive' });
      }
      const player = findPlayerBySocket(game, socket);
      if (!player || !isCurrentPlayer(game, player)) {
        return callback({ success: false, error: 'notYourTurn' });
      }
      if (game.turnPhase !== 'AWAITING_FORCED_TRADE') {
        return callback({ success: false, error: 'invalidPhase' });
      }

      const { myCellIndex, opponentCellIndex } = data || {};
      // Validate: myCellIndex belongs to current player and has no hotel
      if (!player.properties.includes(myCellIndex)) {
        return callback({ success: false, error: 'notYourProperty' });
      }
      if (player.hotels?.[String(myCellIndex)]) {
        return callback({ success: false, error: 'cannotTradeHotel' });
      }
      // Validate: opponentCellIndex belongs to an opponent (no hotel)
      const oppOwner = game.players.find(p => !p.isBankrupt && p.slot !== player.slot && p.properties.includes(opponentCellIndex));
      if (!oppOwner) {
        return callback({ success: false, error: 'invalidTarget' });
      }
      if (oppOwner.hotels?.[String(opponentCellIndex)]) {
        return callback({ success: false, error: 'cannotTradeHotel' });
      }

      clearTurnTimer(roomId);
      applyForcedTrade(game, player.slot, myCellIndex, opponentCellIndex, io);
      game.turnPhase = 'END_TURN';
      game.markModified('players');
      await game.save();

      await advanceTurnOrDoubles(io, game, player);
      callback({ success: true });
    } catch (err: any) {
      console.error('[tinh-tuy:forced-trade-choose]', err.message);
      callback({ success: false, error: 'tradeFailed' });
      const roomId = socket.data.tinhTuyRoomId as string;
      if (roomId) safetyRestartTimer(io, roomId);
    }
  });

  // ── Buyback Property (after paying rent) ─────────────────────
  socket.on('tinh-tuy:buyback-property', async (data: any, callback: TinhTuyCallback) => {
    try {
      if (isRateLimited(socket.id)) return callback({ success: false, error: 'tooFast' });
      const roomId = socket.data.tinhTuyRoomId as string;
      if (!roomId) return callback({ success: false, error: 'notInRoom' });

      const game = await TinhTuyGame.findOne({ roomId });
      if (!game || game.gameStatus !== 'playing') {
        return callback({ success: false, error: 'gameNotActive' });
      }

      const player = findPlayerBySocket(game, socket);
      if (!player || !isCurrentPlayer(game, player)) {
        return callback({ success: false, error: 'notYourTurn' });
      }
      if (game.turnPhase !== 'AWAITING_BUYBACK') {
        return callback({ success: false, error: 'invalidPhase' });
      }
      if (player.buyBlockedTurns && player.buyBlockedTurns > 0) {
        return callback({ success: false, error: 'buyBlocked' });
      }

      const { accept, cellIndex } = data || {};
      if (typeof cellIndex !== 'number') {
        return callback({ success: false, error: 'invalidCell' });
      }

      clearTurnTimer(roomId);

      if (!accept) {
        // Decline — just advance turn
        game.turnPhase = 'END_TURN';
        await game.save();
        await advanceTurnOrDoubles(io, game, player);
        callback({ success: true });
        return;
      }

      // Accept — transfer property from owner to buyer
      const owner = game.players.find(p => !p.isBankrupt && p.properties.includes(cellIndex));
      if (!owner) {
        game.turnPhase = 'END_TURN';
        await game.save();
        await advanceTurnOrDoubles(io, game, player);
        return callback({ success: false, error: 'propertyNotFound' });
      }

      const completedRounds = Math.max((game.round || 1) - 1, 0);
      const price = calculateBuybackPrice(owner, cellIndex, completedRounds);
      if (player.points < price) {
        game.turnPhase = 'END_TURN';
        await game.save();
        await advanceTurnOrDoubles(io, game, player);
        return callback({ success: false, error: 'cantAfford' });
      }

      // Transfer payment
      player.points -= price;
      owner.points += price;

      // Transfer property + buildings
      const key = String(cellIndex);
      owner.properties = owner.properties.filter(idx => idx !== cellIndex);
      player.properties.push(cellIndex);
      player.houses[key] = owner.houses[key] || 0;
      player.hotels[key] = !!owner.hotels[key];
      delete owner.houses[key];
      delete owner.hotels[key];

      // Transfer festival if on this cell
      if (game.festival && game.festival.cellIndex === cellIndex && game.festival.slot === owner.slot) {
        game.festival.slot = player.slot;
        game.markModified('festival');
      }

      game.turnPhase = 'END_TURN';
      game.markModified('players');
      await game.save();

      io.to(roomId).emit('tinh-tuy:buyback-completed', {
        buyerSlot: player.slot,
        ownerSlot: owner.slot,
        cellIndex,
        price,
        buyerPoints: player.points,
        ownerPoints: owner.points,
        houses: player.houses[key] || 0,
        hotel: !!player.hotels[key],
      });

      // Check if buyback completes a monopoly
      const completedGroup = checkMonopolyCompleted(cellIndex, player.properties);
      if (completedGroup) {
        io.to(roomId).emit('tinh-tuy:monopoly-completed', {
          slot: player.slot, group: completedGroup,
          cellIndices: PROPERTY_GROUPS[completedGroup],
        });
        handleSlothAutoBuild(io, game, player, completedGroup);
      }

      emitNearWinWarning(io, game, player);
      emitNearWinWarning(io, game, owner); // Clear stale keys if owner's near-win was broken

      await advanceTurnOrDoubles(io, game, player);
      callback({ success: true });
    } catch (err: any) {
      console.error('[tinh-tuy:buyback-property]', err.message);
      callback({ success: false, error: 'buybackFailed' });
      const roomId = socket.data.tinhTuyRoomId as string;
      if (roomId) safetyRestartTimer(io, roomId);
    }
  });

  // ── Sell Buildings (to avoid bankruptcy) ─────────────────────
  socket.on('tinh-tuy:sell-buildings', async (data: any, callback: TinhTuyCallback) => {
    try {
      if (isRateLimited(socket.id)) return callback({ success: false, error: 'tooFast' });
      const roomId = socket.data.tinhTuyRoomId as string;
      if (!roomId) return callback({ success: false, error: 'notInRoom' });

      const game = await TinhTuyGame.findOne({ roomId });
      if (!game || game.gameStatus !== 'playing') {
        return callback({ success: false, error: 'gameNotActive' });
      }

      const player = findPlayerBySocket(game, socket);
      if (!player || !isCurrentPlayer(game, player)) {
        return callback({ success: false, error: 'notYourTurn' });
      }
      if (game.turnPhase !== 'AWAITING_SELL') {
        return callback({ success: false, error: 'invalidPhase' });
      }

      const selections: Array<{ cellIndex: number; type: 'house' | 'hotel' | 'property'; count: number }> = data?.selections;
      if (!Array.isArray(selections) || selections.length === 0) {
        return callback({ success: false, error: 'noSelections' });
      }

      // Deduplicate: aggregate house counts per cell, reject conflicting hotel+property for same cell
      const cellPropertySells = new Set<number>();
      const cellHotelSells = new Set<number>();
      const cellHouseCounts = new Map<number, number>();
      for (const sel of selections) {
        if (sel.type === 'property') {
          if (cellPropertySells.has(sel.cellIndex)) continue; // ignore duplicate
          cellPropertySells.add(sel.cellIndex);
        } else if (sel.type === 'hotel') {
          cellHotelSells.add(sel.cellIndex);
        } else {
          cellHouseCounts.set(sel.cellIndex, (cellHouseCounts.get(sel.cellIndex) || 0) + (sel.count || 1));
        }
      }

      // Validate and calculate total
      const completedRounds = Math.max((game.round || 1) - 1, 0);
      let totalSellValue = 0;
      for (const sel of selections) {
        const { cellIndex, type } = sel;
        if (!player.properties.includes(cellIndex)) {
          return callback({ success: false, error: 'notOwned' });
        }
        const key = String(cellIndex);
        if (type === 'property') {
          if (!cellPropertySells.has(cellIndex)) continue; // already processed as duplicate
          cellPropertySells.delete(cellIndex); // process only once
          // Selling whole property includes all buildings — reject separate hotel/house sell on same cell
          cellHotelSells.delete(cellIndex);
          cellHouseCounts.delete(cellIndex);
          totalSellValue += getPropertyTotalSellValue(player, cellIndex, completedRounds);
        } else if (type === 'hotel') {
          if (!cellHotelSells.has(cellIndex)) continue; // already consumed by property sell
          cellHotelSells.delete(cellIndex); // process only once
          if (!player.hotels[key]) return callback({ success: false, error: 'noHotel' });
          totalSellValue += getSellPrice(cellIndex, 'hotel');
        } else {
          // House sells: use aggregated count (handles duplicate entries)
          const totalCount = cellHouseCounts.get(cellIndex);
          if (!totalCount) continue; // already consumed
          cellHouseCounts.delete(cellIndex); // process only once per cell
          const available = player.houses[key] || 0;
          if (totalCount > available || totalCount <= 0) return callback({ success: false, error: 'notEnoughHouses' });
          totalSellValue += totalCount * getSellPrice(cellIndex, 'house');
        }
      }

      // Must cover deficit — only reject if player COULD cover by selling more
      const deficit = Math.abs(player.points);
      const totalSellable = calculateSellableValue(player, completedRounds);
      if (totalSellValue < deficit && totalSellable >= deficit) {
        return callback({ success: false, error: 'insufficientSell' });
      }

      // Apply sells — deduplicate: aggregate houses per cell, process property sells last
      const propertySells = new Set<number>();
      const hotelSells = new Set<number>();
      const houseSells = new Map<number, number>();
      for (const sel of selections) {
        if (sel.type === 'property') propertySells.add(sel.cellIndex);
        else if (sel.type === 'hotel' && !propertySells.has(sel.cellIndex)) hotelSells.add(sel.cellIndex);
        else if (sel.type === 'house' && !propertySells.has(sel.cellIndex)) {
          houseSells.set(sel.cellIndex, (houseSells.get(sel.cellIndex) || 0) + (sel.count || 1));
        }
      }
      // Apply building sells first
      for (const cellIndex of hotelSells) {
        player.hotels[String(cellIndex)] = false;
      }
      for (const [cellIndex, count] of houseSells) {
        const key = String(cellIndex);
        player.houses[key] = Math.max((player.houses[key] || 0) - count, 0);
      }
      for (const cellIndex of propertySells) {
        const key = String(cellIndex);
        delete player.houses[key];
        delete player.hotels[key];
        player.properties = player.properties.filter(idx => idx !== cellIndex);
        // Clear festival if this property hosted it
        if (game.festival && game.festival.cellIndex === cellIndex && game.festival.slot === player.slot) {
          game.festival = null;
          game.markModified('festival');
        }
        // Clear frozen rent if this property had a freeze
        if (game.frozenProperties?.length) {
          game.frozenProperties = game.frozenProperties.filter((fp: any) => fp.cellIndex !== cellIndex);
          game.markModified('frozenProperties');
        }
      }
      player.points += totalSellValue;
      clearTurnTimer(roomId);

      io.to(roomId).emit('tinh-tuy:buildings-sold', {
        slot: player.slot, newPoints: player.points,
        houses: { ...player.houses }, hotels: { ...player.hotels },
        properties: [...player.properties],
        festival: game.festival,
      });

      // Still in debt after selling → bankruptcy
      if (player.points < 0) {
        player.isBankrupt = true;
        player.points = 0;
        player.properties = [];
        player.houses = {} as Record<string, number>;
        player.hotels = {} as Record<string, boolean>;
        if (game.festival && game.festival.slot === player.slot) {
          game.festival = null;
          game.markModified('festival');
        }
        if (game.frozenProperties?.length) {
          game.frozenProperties = game.frozenProperties.filter((fp: any) =>
            game.players.some(p => !p.isBankrupt && p.properties.includes(fp.cellIndex)));
          game.markModified('frozenProperties');
        }
        game.markModified('players');
        game.turnPhase = 'END_TURN';
        await game.save();
        io.to(roomId).emit('tinh-tuy:player-bankrupt', { slot: player.slot });
        const endCheck = checkGameEnd(game);
        if (endCheck.ended) {
          await finishGame(io, game, endCheck.winner, endCheck.reason || 'lastStanding');
        } else {
          await advanceTurn(io, game);
        }
        callback({ success: true });
        return;
      }

      game.turnPhase = 'END_TURN';
      game.markModified('players');
      await game.save();
      await advanceTurnOrDoubles(io, game, player);
      callback({ success: true });
    } catch (err: any) {
      console.error('[tinh-tuy:sell-buildings]', err.message);
      callback({ success: false, error: 'sellFailed' });
      const roomId = socket.data.tinhTuyRoomId as string;
      if (roomId) safetyRestartTimer(io, roomId);
    }
  });

  // ── Escape Island ────────────────────────────────────────────
  socket.on('tinh-tuy:escape-island', async (data: any, callback: TinhTuyCallback) => {
    try {
      if (isRateLimited(socket.id)) return callback({ success: false, error: 'tooFast' });
      const roomId = socket.data.tinhTuyRoomId as string;
      if (!roomId) return callback({ success: false, error: 'notInRoom' });

      const { method } = data || {};
      if (!['PAY', 'USE_CARD'].includes(method)) {
        return callback({ success: false, error: 'invalidMethod' });
      }

      const game = await TinhTuyGame.findOne({ roomId });
      if (!game || game.gameStatus !== 'playing') {
        return callback({ success: false, error: 'gameNotActive' });
      }

      const player = findPlayerBySocket(game, socket);
      if (!player || !isCurrentPlayer(game, player)) {
        return callback({ success: false, error: 'notYourTurn' });
      }
      if (player.islandTurns <= 0) {
        return callback({ success: false, error: 'notOnIsland' });
      }

      clearTurnTimer(roomId);
      const result = handleIslandEscape(player, method);

      if (!result.escaped) {
        return callback({ success: false, error: method === 'PAY' ? 'cannotAfford' : 'noEscapeCard' });
      }

      // Player escaped — now they get to roll dice normally
      game.turnPhase = 'ROLL_DICE';
      game.turnStartedAt = new Date();
      await game.save();

      io.to(roomId).emit('tinh-tuy:island-escaped', {
        slot: player.slot, method,
        costPaid: result.costPaid || 0,
      });

      // Start turn timer for the roll
      startTurnTimer(roomId, game.settings.turnDuration * 1000, async () => {
        try {
          const g = await TinhTuyGame.findOne({ roomId });
          if (!g || g.gameStatus !== 'playing') return;
          await advanceTurn(io, g);
        } catch (err) { console.error('[tinh-tuy] Escape timeout:', err); }
      });

      callback({ success: true });
    } catch (err: any) {
      console.error('[tinh-tuy:escape-island]', err.message);
      callback({ success: false, error: 'escapeFailed' });
      const roomId = socket.data.tinhTuyRoomId as string;
      if (roomId) safetyRestartTimer(io, roomId);
    }
  });

  // ── Surrender ────────────────────────────────────────────────
  socket.on('tinh-tuy:surrender', async (_data: any, callback: TinhTuyCallback) => {
    try {
      if (isRateLimited(socket.id)) return callback({ success: false, error: 'tooFast' });
      const roomId = socket.data.tinhTuyRoomId as string;
      if (!roomId) return callback({ success: false, error: 'notInRoom' });

      const game = await TinhTuyGame.findOne({ roomId });
      if (!game || game.gameStatus !== 'playing') {
        return callback({ success: false, error: 'gameNotActive' });
      }

      const player = findPlayerBySocket(game, socket);
      if (!player || player.isBankrupt) {
        return callback({ success: false, error: 'alreadyBankrupt' });
      }

      player.isBankrupt = true;
      player.points = 0;
      player.properties = [];
      player.houses = {} as Record<string, number>;
      player.hotels = {} as Record<string, boolean>;
      // Clear game-level festival if this player owned it
  if (game.festival && game.festival.slot === player.slot) {
    game.festival = null;
    game.markModified('festival');
  }
      game.markModified('players');
      await game.save();

      io.to(roomId).emit('tinh-tuy:player-surrendered', { slot: player.slot });

      const endCheck = checkGameEnd(game);
      if (endCheck.ended) {
        await finishGame(io, game, endCheck.winner, endCheck.reason || 'lastStanding');
      } else if (game.currentPlayerSlot === player.slot) {
        await advanceTurn(io, game);
      }

      callback({ success: true });
    } catch (err: any) {
      console.error('[tinh-tuy:surrender]', err.message);
      callback({ success: false, error: 'surrenderFailed' });
      const roomId = socket.data.tinhTuyRoomId as string;
      if (roomId) safetyRestartTimer(io, roomId);
    }
  });

  // ── Chat Message ─────────────────────────────────────────────
  socket.on('tinh-tuy:send-chat', async (data: any, callback?: TinhTuyCallback) => {
    const cb = typeof callback === 'function' ? callback : () => {};
    try {
      const roomId = socket.data.tinhTuyRoomId as string;
      if (!roomId) return cb({ success: false, error: 'notInRoom' });

      // Rate limit: 1 msg per second
      const now = Date.now();
      const lastMsg = chatLastMessage.get(socket.id) || 0;
      if (now - lastMsg < CHAT_RATE_MS) return cb({ success: false, error: 'tooFast' });
      chatLastMessage.set(socket.id, now);

      const { message } = data || {};
      if (!message || typeof message !== 'string') return cb({ success: false, error: 'invalidMessage' });

      const trimmed = message.trim().slice(0, 200);
      if (!trimmed) return cb({ success: false, error: 'emptyMessage' });

      const game = await TinhTuyGame.findOne({ roomId }).lean();
      if (!game) return cb({ success: false, error: 'roomNotFound' });

      const playerId = socket.data.tinhTuyPlayerId as string;
      const player = game.players.find(
        p => (p.userId?.toString() === playerId) || (p.guestId === playerId)
      );
      if (!player) return cb({ success: false, error: 'notInRoom' });

      io.to(roomId).emit('tinh-tuy:chat-message', {
        slot: player.slot, message: trimmed, timestamp: now,
      });
      cb({ success: true });
    } catch (err: any) {
      console.error('[tinh-tuy:send-chat]', err.message);
      cb({ success: false, error: 'chatFailed' });
    }
  });

  // ── Reaction ─────────────────────────────────────────────────
  socket.on('tinh-tuy:send-reaction', async (data: any, callback?: TinhTuyCallback) => {
    const cb = typeof callback === 'function' ? callback : () => {};
    try {
      const roomId = socket.data.tinhTuyRoomId as string;
      if (!roomId) return cb({ success: false, error: 'notInRoom' });

      // Rate limit: 1 per 500ms
      const now = Date.now();
      const lastReact = chatLastMessage.get(`react:${socket.id}`) || 0;
      if (now - lastReact < REACTION_RATE_MS) return cb({ success: false, error: 'tooFast' });
      chatLastMessage.set(`react:${socket.id}`, now);

      const { emoji, reaction } = data || {};
      const emojiVal = emoji || reaction;
      if (!emojiVal || typeof emojiVal !== 'string' || emojiVal.length > 8) {
        return cb({ success: false, error: 'invalidEmoji' });
      }

      const playerId = socket.data.tinhTuyPlayerId as string;
      const game = await TinhTuyGame.findOne({ roomId }).lean();
      if (!game) return cb({ success: false, error: 'roomNotFound' });

      const player = game.players.find(
        p => (p.userId?.toString() === playerId) || (p.guestId === playerId)
      );
      if (!player) return cb({ success: false, error: 'notInRoom' });

      io.to(roomId).emit('tinh-tuy:reaction', {
        slot: player.slot, emoji: emojiVal, timestamp: now,
      });
      cb({ success: true });
    } catch (err: any) {
      console.error('[tinh-tuy:send-reaction]', err.message);
      cb({ success: false, error: 'reactionFailed' });
    }
  });

  // ── Negotiate: Send Offer ──────────────────────────────────────
  socket.on('tinh-tuy:negotiate-send', async (data: any, callback: TinhTuyCallback) => {
    try {
      if (isRateLimited(socket.id)) return callback({ success: false, error: 'tooFast' });
      const roomId = socket.data.tinhTuyRoomId as string;
      if (!roomId) return callback({ success: false, error: 'notInRoom' });

      const game = await TinhTuyGame.findOne({ roomId });
      if (!game || game.gameStatus !== 'playing') return callback({ success: false, error: 'gameNotActive' });

      const player = findPlayerBySocket(game, socket);
      if (!player || player.isBankrupt) return callback({ success: false, error: 'notAllowed' });

      // Must be round >= 40
      if ((game.round || 0) < 40) return callback({ success: false, error: 'negotiateTooEarly' });

      // No pending negotiate
      if (game.pendingNegotiate) return callback({ success: false, error: 'negotiateAlreadyPending' });

      // Check cooldown
      const cd = (game.negotiateCooldowns || {})[String(player.slot)] || 0;
      if (cd > (game.round || 0)) return callback({ success: false, error: 'negotiateCooldown' });

      const { targetSlot, cellIndex, offerAmount } = data || {};
      if (typeof targetSlot !== 'number' || typeof cellIndex !== 'number' || typeof offerAmount !== 'number') {
        return callback({ success: false, error: 'invalidPayload' });
      }

      // Validate offer amount
      if (offerAmount < 1 || offerAmount > player.points) {
        return callback({ success: false, error: 'negotiateInsufficientFunds' });
      }

      // Validate target
      const target = game.players.find(p => p.slot === targetSlot);
      if (!target || target.isBankrupt || target.slot === player.slot) {
        return callback({ success: false, error: 'negotiateInvalidTarget' });
      }

      // Validate target owns cell
      if (!target.properties.includes(cellIndex)) {
        return callback({ success: false, error: 'negotiatePropertyGone' });
      }

      // Set pending negotiate
      game.pendingNegotiate = { fromSlot: player.slot, toSlot: targetSlot, cellIndex, offerAmount };
      game.markModified('pendingNegotiate');
      await game.save();

      io.to(roomId).emit('tinh-tuy:negotiate-incoming', {
        fromSlot: player.slot, toSlot: targetSlot, cellIndex, offerAmount,
      });

      // 60s timeout — auto-cancel if no response
      negotiateTimers.set(roomId, setTimeout(async () => {
        negotiateTimers.delete(roomId);
        try {
          const g = await TinhTuyGame.findOne({ roomId });
          if (!g || !g.pendingNegotiate) return;
          g.pendingNegotiate = null;
          g.markModified('pendingNegotiate');
          await g.save();
          io.to(roomId).emit('tinh-tuy:negotiate-cancelled', { fromSlot: player.slot });
        } catch (err) { console.error('[tinh-tuy] Negotiate timeout error:', err); }
      }, 60_000));

      callback({ success: true });
    } catch (err: any) {
      console.error('[tinh-tuy:negotiate-send]', err.message);
      callback({ success: false, error: 'negotiateFailed' });
    }
  });

  // ── Negotiate: Respond (Accept/Reject) ─────────────────────────
  socket.on('tinh-tuy:negotiate-respond', async (data: any, callback: TinhTuyCallback) => {
    try {
      if (isRateLimited(socket.id)) return callback({ success: false, error: 'tooFast' });
      const roomId = socket.data.tinhTuyRoomId as string;
      if (!roomId) return callback({ success: false, error: 'notInRoom' });

      const game = await TinhTuyGame.findOne({ roomId });
      if (!game || game.gameStatus !== 'playing') return callback({ success: false, error: 'gameNotActive' });
      if (!game.pendingNegotiate) return callback({ success: false, error: 'noPendingNegotiate' });

      const player = findPlayerBySocket(game, socket);
      if (!player || player.slot !== game.pendingNegotiate.toSlot) {
        return callback({ success: false, error: 'notNegotiateTarget' });
      }

      const { accept } = data || {};
      const { fromSlot, toSlot, cellIndex, offerAmount } = game.pendingNegotiate;
      clearNegotiateTimer(roomId);

      if (accept) {
        // Re-validate before executing
        const buyer = game.players.find(p => p.slot === fromSlot);
        const seller = game.players.find(p => p.slot === toSlot);
        if (!buyer || !seller || buyer.isBankrupt || seller.isBankrupt) {
          game.pendingNegotiate = null;
          game.markModified('pendingNegotiate');
          await game.save();
          io.to(roomId).emit('tinh-tuy:negotiate-cancelled', { fromSlot });
          return callback({ success: false, error: 'negotiateInvalidTarget' });
        }
        if (buyer.points < offerAmount) {
          game.pendingNegotiate = null;
          game.markModified('pendingNegotiate');
          await game.save();
          io.to(roomId).emit('tinh-tuy:negotiate-cancelled', { fromSlot });
          return callback({ success: false, error: 'negotiateInsufficientFunds' });
        }
        if (!seller.properties.includes(cellIndex)) {
          game.pendingNegotiate = null;
          game.markModified('pendingNegotiate');
          await game.save();
          io.to(roomId).emit('tinh-tuy:negotiate-cancelled', { fromSlot });
          return callback({ success: false, error: 'negotiatePropertyGone' });
        }

        // Execute trade
        const success = applyNegotiateTrade(game, fromSlot, toSlot, cellIndex, offerAmount, io);
        if (!success) {
          game.pendingNegotiate = null;
          game.markModified('pendingNegotiate');
          await game.save();
          io.to(roomId).emit('tinh-tuy:negotiate-cancelled', { fromSlot });
          return callback({ success: false, error: 'negotiateFailed' });
        }

        game.pendingNegotiate = null;
        game.markModified('pendingNegotiate');
        await game.save();

        io.to(roomId).emit('tinh-tuy:negotiate-completed', {
          accepted: true, fromSlot, toSlot, cellIndex, offerAmount,
          festival: game.festival,
        });
      } else {
        // Rejected — set cooldown for requester (5 rounds)
        const cooldowns = game.negotiateCooldowns || {};
        cooldowns[String(fromSlot)] = (game.round || 0) + 5;
        game.negotiateCooldowns = cooldowns;
        game.markModified('negotiateCooldowns');

        game.pendingNegotiate = null;
        game.markModified('pendingNegotiate');
        await game.save();

        io.to(roomId).emit('tinh-tuy:negotiate-completed', {
          accepted: false, fromSlot, toSlot, cooldownUntilRound: cooldowns[String(fromSlot)],
        });
      }

      callback({ success: true });
    } catch (err: any) {
      console.error('[tinh-tuy:negotiate-respond]', err.message);
      callback({ success: false, error: 'negotiateFailed' });
    }
  });

  // ── Negotiate: Cancel (requester cancels) ──────────────────────
  socket.on('tinh-tuy:negotiate-cancel', async (_data: any, callback: TinhTuyCallback) => {
    try {
      if (isRateLimited(socket.id)) return callback({ success: false, error: 'tooFast' });
      const roomId = socket.data.tinhTuyRoomId as string;
      if (!roomId) return callback({ success: false, error: 'notInRoom' });

      const game = await TinhTuyGame.findOne({ roomId });
      if (!game || !game.pendingNegotiate) return callback({ success: false, error: 'noPendingNegotiate' });

      const player = findPlayerBySocket(game, socket);
      if (!player || player.slot !== game.pendingNegotiate.fromSlot) {
        return callback({ success: false, error: 'notNegotiateRequester' });
      }

      clearNegotiateTimer(roomId);
      game.pendingNegotiate = null;
      game.markModified('pendingNegotiate');
      await game.save();

      io.to(roomId).emit('tinh-tuy:negotiate-cancelled', { fromSlot: player.slot });
      callback({ success: true });
    } catch (err: any) {
      console.error('[tinh-tuy:negotiate-cancel]', err.message);
      callback({ success: false, error: 'negotiateFailed' });
    }
  });

  // ── Use Active Ability ──────────────────────────────────────
  socket.on('tinh-tuy:use-ability', async (data: any, callback: TinhTuyCallback) => {
    try {
      if (isRateLimited(socket.id)) return callback({ success: false, error: 'tooFast' });
      const roomId = socket.data.tinhTuyRoomId as string;
      if (!roomId) return callback({ success: false, error: 'notInRoom' });

      const game = await TinhTuyGame.findOne({ roomId });
      if (!game || game.gameStatus !== 'playing') return callback({ success: false, error: 'gameNotActive' });

      const player = findPlayerBySocket(game, socket);
      if (!player || !isCurrentPlayer(game, player)) return callback({ success: false, error: 'notYourTurn' });

      const validation = canUseActiveAbility(game, player);
      if (!validation.valid) return callback({ success: false, error: validation.error });

      const abilityDef = CHARACTER_ABILITIES[player.character];
      if (!abilityDef) return callback({ success: false, error: 'noAbility' });

      // Phase check
      if (abilityDef.active.phase === 'ROLL_DICE' && game.turnPhase !== 'ROLL_DICE') {
        return callback({ success: false, error: 'invalidPhase' });
      }

      const { target, targetCell, steps, deck } = data || {};

      // Pre-validate target data for targeted abilities to avoid clearing timer on bad input
      const needsTarget = ['fox', 'canoc', 'chicken', 'owl'];
      const needsCell = ['kungfu', 'elephant', 'rabbit'];
      if (needsTarget.includes(player.character) && target == null) {
        return callback({ success: false, error: 'invalidTarget' });
      }
      if (needsCell.includes(player.character) && targetCell == null) {
        return callback({ success: false, error: 'invalidCell' });
      }
      if (player.character === 'kungfu' && data.targetSlot == null) {
        return callback({ success: false, error: 'invalidTarget' });
      }
      if (player.character === 'horse' && (steps == null || steps < 2 || steps > 12)) {
        return callback({ success: false, error: 'invalidSteps' });
      }

      clearTurnTimer(roomId);

      // Execute ability based on character
      switch (player.character) {
        case 'trau': {
          // +1000 TT from bank
          player.points += TRAU_ACTIVE_AMOUNT;
          setAbilityCooldown(player);
          game.markModified('players');
          await game.save();
          io.to(roomId).emit('tinh-tuy:ability-used', {
            slot: player.slot, abilityId: 'trau-active', amount: TRAU_ACTIVE_AMOUNT,
            cooldown: player.abilityCooldown,
          });
          // Resume normal turn
          startTurnTimer(roomId, game.settings.turnDuration * 1000, async () => {
            try {
              const g = await TinhTuyGame.findOne({ roomId });
              if (!g || g.turnPhase !== 'ROLL_DICE') return;
              await advanceTurn(io, g);
            } catch (err) { console.error('[tinh-tuy] ability timeout:', err); }
          });
          callback({ success: true });
          break;
        }
        case 'pigfish': {
          // Next rent immunity
          player.immunityNextRent = true;
          setAbilityCooldown(player);
          game.markModified('players');
          await game.save();
          io.to(roomId).emit('tinh-tuy:ability-used', {
            slot: player.slot, abilityId: 'pigfish-active', cooldown: player.abilityCooldown,
          });
          startTurnTimer(roomId, game.settings.turnDuration * 1000, async () => {
            try {
              const g = await TinhTuyGame.findOne({ roomId });
              if (!g || g.turnPhase !== 'ROLL_DICE') return;
              await advanceTurn(io, g);
            } catch (err) { console.error('[tinh-tuy] ability timeout:', err); }
          });
          callback({ success: true });
          break;
        }
        case 'sloth': {
          // Skip turn, +1500 TT
          player.points += SLOTH_HIBERNATE_AMOUNT;
          player.skipNextTurn = true;
          setAbilityCooldown(player);
          game.turnPhase = 'END_TURN';
          game.markModified('players');
          await game.save();
          io.to(roomId).emit('tinh-tuy:ability-used', {
            slot: player.slot, abilityId: 'sloth-active', amount: SLOTH_HIBERNATE_AMOUNT,
            cooldown: player.abilityCooldown,
          });
          await advanceTurn(io, game);
          callback({ success: true });
          break;
        }
        case 'fox': {
          // Swap position with target opponent
          const targetSlot = Number(target);
          const targetPlayer = game.players.find(p => p.slot === targetSlot && !p.isBankrupt);
          if (!targetPlayer) return callback({ success: false, error: 'invalidTarget' });
          if (targetPlayer.islandTurns > 0) return callback({ success: false, error: 'targetOnIsland' });
          const myOldPos = player.position;
          const targetOldPos = targetPlayer.position;
          player.position = targetOldPos;
          targetPlayer.position = myOldPos;
          // Transfer pendingTravel: if target had it (was on travel cell), give it to fox
          if (targetPlayer.pendingTravel) {
            targetPlayer.pendingTravel = false;
            player.pendingTravel = true;
          }
          setAbilityCooldown(player);
          game.markModified('players');
          await game.save();
          io.to(roomId).emit('tinh-tuy:ability-used', {
            slot: player.slot, abilityId: 'fox-active', targetSlot,
            cooldown: player.abilityCooldown,
          });
          io.to(roomId).emit('tinh-tuy:fox-swap', {
            mySlot: player.slot, targetSlot,
            myNewPos: targetOldPos, targetNewPos: myOldPos,
          });
          startTurnTimer(roomId, game.settings.turnDuration * 1000, async () => {
            try {
              const g = await TinhTuyGame.findOne({ roomId });
              if (!g || g.turnPhase !== 'ROLL_DICE') return;
              await advanceTurn(io, g);
            } catch (err) { console.error('[tinh-tuy] ability timeout:', err); }
          });
          callback({ success: true });
          break;
        }
        case 'canoc': {
          // Steal 1000 TT from target
          const cTargetSlot = Number(target);
          const cTarget = game.players.find(p => p.slot === cTargetSlot && !p.isBankrupt);
          if (!cTarget) return callback({ success: false, error: 'invalidTarget' });
          const stealAmount = Math.max(0, Math.min(CANOC_STEAL_AMOUNT, cTarget.points));
          cTarget.points -= stealAmount;
          player.points += stealAmount;
          setAbilityCooldown(player);
          game.markModified('players');
          await game.save();
          io.to(roomId).emit('tinh-tuy:ability-used', {
            slot: player.slot, abilityId: 'canoc-active', targetSlot: cTargetSlot,
            amount: stealAmount, cooldown: player.abilityCooldown,
          });
          // Check if steal caused bankruptcy
          if (cTarget.points < 0) await checkBankruptcy(io, game, cTarget);
          startTurnTimer(roomId, game.settings.turnDuration * 1000, async () => {
            try {
              const g = await TinhTuyGame.findOne({ roomId });
              if (!g || g.turnPhase !== 'ROLL_DICE') return;
              await advanceTurn(io, g);
            } catch (err) { console.error('[tinh-tuy] ability timeout:', err); }
          });
          callback({ success: true });
          break;
        }
        case 'chicken': {
          // Skip opponent's next turn
          const skipSlot = Number(target);
          const skipTarget = game.players.find(p => p.slot === skipSlot && !p.isBankrupt);
          if (!skipTarget) return callback({ success: false, error: 'invalidTarget' });
          skipTarget.skipNextTurn = true;
          setAbilityCooldown(player);
          game.markModified('players');
          await game.save();
          io.to(roomId).emit('tinh-tuy:ability-used', {
            slot: player.slot, abilityId: 'chicken-active', targetSlot: skipSlot,
            cooldown: player.abilityCooldown,
          });
          startTurnTimer(roomId, game.settings.turnDuration * 1000, async () => {
            try {
              const g = await TinhTuyGame.findOne({ roomId });
              if (!g || g.turnPhase !== 'ROLL_DICE') return;
              await advanceTurn(io, g);
            } catch (err) { console.error('[tinh-tuy] ability timeout:', err); }
          });
          callback({ success: true });
          break;
        }
        case 'kungfu': {
          // Destroy 1 opponent house (refund 50%)
          const kTargetSlot = Number(data.targetSlot);
          const kCellIndex = Number(targetCell);
          const kTarget = game.players.find(p => p.slot === kTargetSlot && !p.isBankrupt);
          if (!kTarget) return callback({ success: false, error: 'invalidTarget' });
          if (!kTarget.properties.includes(kCellIndex)) return callback({ success: false, error: 'invalidTarget' });
          const key = String(kCellIndex);
          const houses = kTarget.houses[key] || 0;
          if (houses <= 0 || kTarget.hotels[key]) return callback({ success: false, error: 'noHouseToDestroy' });
          kTarget.houses[key] = houses - 1;
          const cell = getCell(kCellIndex);
          const refund = Math.floor((cell?.houseCost || 0) * 0.5);
          kTarget.points += refund;
          setAbilityCooldown(player);
          game.markModified('players');
          await game.save();
          io.to(roomId).emit('tinh-tuy:ability-used', {
            slot: player.slot, abilityId: 'kungfu-active', targetSlot: kTargetSlot,
            cellIndex: kCellIndex, amount: refund, cooldown: player.abilityCooldown,
          });
          startTurnTimer(roomId, game.settings.turnDuration * 1000, async () => {
            try {
              const g = await TinhTuyGame.findOne({ roomId });
              if (!g || g.turnPhase !== 'ROLL_DICE') return;
              await advanceTurn(io, g);
            } catch (err) { console.error('[tinh-tuy] ability timeout:', err); }
          });
          callback({ success: true });
          break;
        }
        case 'elephant': {
          // Free house build on owned property
          const eCellIndex = Number(targetCell);
          const buildTargets = getElephantBuildTargets(game, player);
          if (!buildTargets.includes(eCellIndex)) return callback({ success: false, error: 'invalidCell' });
          player.houses[String(eCellIndex)] = (player.houses[String(eCellIndex)] || 0) + 1;
          setAbilityCooldown(player);
          game.markModified('players');
          await game.save();
          io.to(roomId).emit('tinh-tuy:ability-used', {
            slot: player.slot, abilityId: 'elephant-active', cellIndex: eCellIndex,
            cooldown: player.abilityCooldown,
          });
          io.to(roomId).emit('tinh-tuy:house-built', {
            slot: player.slot, cellIndex: eCellIndex,
            houseCount: player.houses[String(eCellIndex)],
            remainingPoints: player.points,
          });
          startTurnTimer(roomId, game.settings.turnDuration * 1000, async () => {
            try {
              const g = await TinhTuyGame.findOne({ roomId });
              if (!g || g.turnPhase !== 'ROLL_DICE') return;
              await advanceTurn(io, g);
            } catch (err) { console.error('[tinh-tuy] ability timeout:', err); }
          });
          callback({ success: true });
          break;
        }
        case 'rabbit': {
          // Teleport to any cell (except Island cell 27)
          const rCellIndex = Number(targetCell);
          if (rCellIndex < 0 || rCellIndex >= BOARD_SIZE || rCellIndex === 27) return callback({ success: false, error: 'invalidCell' });
          const rOldPos = player.position;
          player.position = rCellIndex;
          const rPassedGo = rCellIndex === 0 || (rCellIndex < rOldPos && rCellIndex !== 27);
          const rGoSalary = getEffectiveGoSalary(game.round || 1) + getGoSalaryBonus(game, player);
          if (rPassedGo) {
            player.points += rGoSalary;
            onPassGo(player);
          }
          setAbilityCooldown(player);
          game.markModified('players');
          await game.save();
          io.to(roomId).emit('tinh-tuy:ability-used', {
            slot: player.slot, abilityId: 'rabbit-active', cellIndex: rCellIndex,
            cooldown: player.abilityCooldown,
          });
          io.to(roomId).emit('tinh-tuy:player-moved', {
            slot: player.slot, from: rOldPos, to: rCellIndex, passedGo: rPassedGo,
            goBonus: rPassedGo ? rGoSalary : 0, teleport: true,
          });
          // Resolve landing cell
          await resolveAndAdvance(io, game, player, rCellIndex, { dice1: 0, dice2: 0, total: 0, isDouble: false });
          callback({ success: true });
          break;
        }
        case 'horse': {
          // Choose exact steps 2-12
          const hSteps = Number(steps);
          if (hSteps < 2 || hSteps > 12) return callback({ success: false, error: 'invalidSteps' });
          setAbilityCooldown(player);
          game.markModified('players');
          io.to(roomId).emit('tinh-tuy:ability-used', {
            slot: player.slot, abilityId: 'horse-active', amount: hSteps,
            cooldown: player.abilityCooldown,
          });
          // Execute movement
          const hOldPos = player.position;
          const hMove = calculateNewPosition(hOldPos, hSteps);
          player.position = hMove.position;
          const hGoSalary = getEffectiveGoSalary(game.round || 1) + getGoSalaryBonus(game, player);
          if (hMove.passedGo) {
            player.points += hGoSalary;
            onPassGo(player);
          }
          game.lastDiceResult = null; // No real dice — null prevents false doubles
          game.markModified('lastDiceResult');
          await game.save();
          io.to(roomId).emit('tinh-tuy:player-moved', {
            slot: player.slot, from: hOldPos, to: hMove.position, passedGo: hMove.passedGo,
            goBonus: hMove.passedGo ? hGoSalary : 0,
          });
          await resolveAndAdvance(io, game, player, hMove.position, { dice1: 0, dice2: 0, total: hSteps, isDouble: false });
          callback({ success: true });
          break;
        }
        case 'seahorse': {
          // Draw extra card from chosen deck
          const sDeck = deck === 'CO_HOI' ? 'CO_HOI' : 'KHI_VAN';
          setAbilityCooldown(player);
          game.markModified('players');
          io.to(roomId).emit('tinh-tuy:ability-used', {
            slot: player.slot, abilityId: 'seahorse-active',
            cooldown: player.abilityCooldown,
          });
          await handleCardDraw(io, game, player, sDeck);
          if (game.turnPhase === 'END_TURN') {
            await advanceTurnOrDoubles(io, game, player);
          }
          callback({ success: true });
          break;
        }
        case 'owl': {
          // Force opponent to draw KHI_VAN card
          const oTargetSlot = Number(target);
          const oTarget = game.players.find(p => p.slot === oTargetSlot && !p.isBankrupt);
          if (!oTarget) return callback({ success: false, error: 'invalidTarget' });
          setAbilityCooldown(player);
          game.markModified('players');
          io.to(roomId).emit('tinh-tuy:ability-used', {
            slot: player.slot, abilityId: 'owl-active', targetSlot: oTargetSlot,
            cooldown: player.abilityCooldown,
          });
          await handleCardDraw(io, game, oTarget, 'KHI_VAN');
          // Guard: if handleCardDraw left game in a choice phase meant for the opponent
          // (e.g. CHOOSE_DESTINATION), the opponent can't respond since it's not their turn.
          // Reset to ROLL_DICE for the current player to prevent stuck game.
          const stuckPhases = [
            'AWAITING_CARD_DESTINATION', 'AWAITING_FREE_HOUSE', 'AWAITING_FREE_HOTEL',
            'AWAITING_FORCED_TRADE', 'AWAITING_RENT_FREEZE', 'AWAITING_BUY_BLOCK_TARGET',
            'AWAITING_EMINENT_DOMAIN', 'AWAITING_DESTROY_PROPERTY', 'AWAITING_DOWNGRADE_BUILDING',
          ];
          if (stuckPhases.includes(game.turnPhase)) {
            game.turnPhase = 'ROLL_DICE';
            game.markModified('turnPhase');
            await game.save();
          }
          if (game.turnPhase === 'END_TURN' || game.turnPhase === 'AWAITING_CARD_DISPLAY' || game.turnPhase === 'ROLL_DICE') {
            // Return to roll phase for the current player after card display
            if (game.turnPhase !== 'ROLL_DICE') {
              game.turnPhase = 'ROLL_DICE';
              await game.save();
            }
            startTurnTimer(roomId, game.settings.turnDuration * 1000, async () => {
              try {
                const g = await TinhTuyGame.findOne({ roomId });
                if (!g || g.turnPhase !== 'ROLL_DICE') return;
                await advanceTurn(io, g);
              } catch (err) { console.error('[tinh-tuy] ability timeout:', err); }
            });
          }
          callback({ success: true });
          break;
        }
        case 'shiba': {
          // Shiba reroll is auto-triggered PRE-MOVE in roll-dice handler, not via use-ability
          callback({ success: false, error: 'shibaAutoTriggered' });
          break;
        }
        default:
          callback({ success: false, error: 'unknownAbility' });
      }
    } catch (err: any) {
      console.error('[tinh-tuy:use-ability]', err.message);
      callback({ success: false, error: 'abilityFailed' });
    }
  });

  // ── Owl Pick Card (choose 1 of 2) ────────────────────────────
  socket.on('tinh-tuy:owl-pick', async (data: any, callback: TinhTuyCallback) => {
    try {
      const roomId = socket.data.tinhTuyRoomId as string;
      if (!roomId) return callback({ success: false, error: 'notInRoom' });

      const game = await TinhTuyGame.findOne({ roomId });
      if (!game || game.turnPhase !== 'AWAITING_OWL_PICK') return callback({ success: false, error: 'invalidPhase' });

      const player = findPlayerBySocket(game, socket);
      if (!player || !isCurrentPlayer(game, player)) return callback({ success: false, error: 'notYourTurn' });
      if (!player.owlPendingCards?.length) return callback({ success: false, error: 'noPendingCards' });

      clearTurnTimer(roomId);
      const chosenCardId = data?.cardId;
      if (!player.owlPendingCards.includes(chosenCardId)) return callback({ success: false, error: 'invalidCard' });

      await executeOwlPick(io, game, player, chosenCardId);
      callback({ success: true });
    } catch (err: any) {
      console.error('[tinh-tuy:owl-pick]', err.message);
      callback({ success: false, error: 'owlPickFailed' });
      const rid = socket.data.tinhTuyRoomId as string;
      if (rid) safetyRestartTimer(io, rid);
    }
  });

  // ── Shiba Reroll Pick (choose original or new) ────────────────
  // Note: shiba-reroll trigger event removed — reroll is now auto-triggered PRE-MOVE in roll-dice handler
  socket.on('tinh-tuy:shiba-reroll-pick', async (data: any, callback: TinhTuyCallback) => {
    try {
      const roomId = socket.data.tinhTuyRoomId as string;
      if (!roomId) return callback({ success: false, error: 'notInRoom' });

      const game = await TinhTuyGame.findOne({ roomId });
      if (!game || game.turnPhase !== 'AWAITING_SHIBA_REROLL_PICK') return callback({ success: false, error: 'invalidPhase' });

      const player = findPlayerBySocket(game, socket);
      if (!player || !isCurrentPlayer(game, player)) return callback({ success: false, error: 'notYourTurn' });
      if (!player.shibaRerollPending) return callback({ success: false, error: 'noPendingReroll' });

      clearTurnTimer(roomId);
      const choice = data?.choice; // 'original' or 'rerolled'
      const chosen = choice === 'rerolled' ? player.shibaRerollPending.rerolled : player.shibaRerollPending.original;
      game.lastDiceResult = { dice1: chosen.dice1, dice2: chosen.dice2 };
      game.markModified('lastDiceResult');
      player.shibaRerollPending = undefined as any;

      io.to(roomId).emit('tinh-tuy:shiba-reroll-picked', {
        slot: player.slot, kept: choice === 'rerolled' ? 'rerolled' : 'original',
        dice: chosen,
      });

      // Execute movement with chosen dice
      const dice = { dice1: chosen.dice1, dice2: chosen.dice2, total: chosen.dice1 + chosen.dice2, isDouble: chosen.dice1 === chosen.dice2 };
      await executeShibaPostPick(io, game, player, dice);
      callback({ success: true });
    } catch (err: any) {
      console.error('[tinh-tuy:shiba-reroll-pick]', err.message);
      callback({ success: false, error: 'rerollPickFailed' });
      const rid = socket.data.tinhTuyRoomId as string;
      if (rid) safetyRestartTimer(io, rid);
    }
  });

  // ── Horse Adjust Pick (choose -1, 0, or +1) ────────────────────
  socket.on('tinh-tuy:horse-adjust-pick', async (data: any, callback: TinhTuyCallback) => {
    try {
      const roomId = socket.data.tinhTuyRoomId as string;
      if (!roomId) return callback({ success: false, error: 'notInRoom' });

      const game = await TinhTuyGame.findOne({ roomId });
      if (!game || game.turnPhase !== 'AWAITING_HORSE_ADJUST') return callback({ success: false, error: 'invalidPhase' });

      const player = findPlayerBySocket(game, socket);
      if (!player || !isCurrentPlayer(game, player)) return callback({ success: false, error: 'notYourTurn' });
      if (!player.horseAdjustPending) return callback({ success: false, error: 'noPendingAdjust' });

      clearTurnTimer(roomId);
      const adj = Number(data?.adjust);
      if (![-1, 0, 1].includes(adj)) return callback({ success: false, error: 'invalidAdjust' });

      player.horseAdjustPending = false;
      const dice = game.lastDiceResult!;
      const diceTotal = dice.dice1 + dice.dice2;
      const finalTotal = Math.max(2, diceTotal + adj);
      const isDouble = dice.dice1 === dice.dice2;

      io.to(roomId).emit('tinh-tuy:horse-adjust-picked', {
        slot: player.slot, adjust: adj, finalTotal,
      });

      // ── Check consecutive doubles → island (Pigfish immune) ──
      if (isDouble) {
        player.consecutiveDoubles += 1;
        if (player.consecutiveDoubles >= 3 && !isIslandImmune(game, player)) {
          const oldPos = player.position;
          sendToIsland(player);
          game.turnPhase = 'END_TURN';
          game.markModified('players');
          await game.save();
          io.to(roomId).emit('tinh-tuy:player-moved', {
            slot: player.slot, from: oldPos, to: 27, passedGo: false, teleport: true,
          });
          io.to(roomId).emit('tinh-tuy:player-island', { slot: player.slot, turnsRemaining: player.islandTurns });
          await advanceTurn(io, game);
          callback({ success: true });
          return;
        }
        if (player.consecutiveDoubles >= 3) player.consecutiveDoubles = 0; // Pigfish: reset
      } else {
        player.consecutiveDoubles = 0;
      }

      // ── Rabbit bonus on doubles ──
      const rabbitBonus = isDouble ? getDoubleBonusSteps(game, player) : 0;
      if (rabbitBonus > 0) {
        player.rabbitBonusPending = {
          dice: { dice1: dice.dice1, dice2: dice.dice2, total: finalTotal, isDouble },
          bonus: rabbitBonus,
        };
        game.turnPhase = 'AWAITING_RABBIT_BONUS' as any;
        game.markModified('players');
        await game.save();
        io.to(roomId).emit('tinh-tuy:rabbit-bonus-prompt', {
          slot: player.slot, bonus: rabbitBonus,
          dice: { dice1: dice.dice1, dice2: dice.dice2, total: finalTotal },
        });
        // Safety timer: auto-decline bonus if player doesn't respond
        startTurnTimer(roomId, game.settings.turnDuration * 1000, async () => {
          try {
            const g2 = await TinhTuyGame.findOne({ roomId });
            if (!g2 || g2.turnPhase !== 'AWAITING_RABBIT_BONUS') return;
            const p2 = g2.players.find(pp => pp.slot === player.slot);
            if (!p2 || !p2.rabbitBonusPending) return;
            const { dice: d2 } = p2.rabbitBonusPending;
            const moveSteps2 = d2.total; // decline bonus
            p2.rabbitBonusPending = undefined as any;
            io.to(roomId).emit('tinh-tuy:rabbit-bonus-picked', { slot: p2.slot, accepted: false, totalSteps: moveSteps2 });
            const oldP2 = p2.position;
            const { position: newP2, passedGo: pg2 } = calculateNewPosition(oldP2, moveSteps2);
            p2.position = newP2;
            const goS2 = getEffectiveGoSalary(g2.round || 1) + getGoSalaryBonus(g2, p2);
            if (pg2) { p2.points += goS2; onPassGo(p2); }
            g2.markModified('players');
            await g2.save();
            io.to(roomId).emit('tinh-tuy:player-moved', { slot: p2.slot, from: oldP2, to: newP2, passedGo: pg2, goBonus: pg2 ? goS2 : 0 });
            await resolveAndAdvance(io, g2, p2, newP2, { ...d2, total: moveSteps2 });
          } catch (err) { console.error('[tinh-tuy] Rabbit bonus timeout (horse):', err); safetyRestartTimer(io, roomId); }
        });
        callback({ success: true });
        return;
      }

      // ── Execute movement ──
      const moveSteps = finalTotal;
      const oldPos = player.position;
      const { position: newPos, passedGo } = calculateNewPosition(oldPos, moveSteps);
      player.position = newPos;
      const goSalary = getEffectiveGoSalary(game.round || 1) + getGoSalaryBonus(game, player);
      if (passedGo) {
        player.points += goSalary;
        onPassGo(player);
      }
      game.markModified('players');
      await game.save();
      io.to(roomId).emit('tinh-tuy:player-moved', {
        slot: player.slot, from: oldPos, to: newPos, passedGo,
        goBonus: passedGo ? goSalary : 0,
      });
      await resolveAndAdvance(io, game, player, newPos, { dice1: dice.dice1, dice2: dice.dice2, total: finalTotal, isDouble });
      callback({ success: true });
    } catch (err: any) {
      console.error('[tinh-tuy:horse-adjust-pick]', err.message);
      callback({ success: false, error: 'horseAdjustPickFailed' });
      const rid = socket.data.tinhTuyRoomId as string;
      if (rid) safetyRestartTimer(io, rid);
    }
  });

  // ── Rabbit Bonus Pick (accept or decline +3 on doubles) ────────
  socket.on('tinh-tuy:rabbit-bonus-pick', async (data: any, callback: TinhTuyCallback) => {
    try {
      const roomId = socket.data.tinhTuyRoomId as string;
      if (!roomId) return callback({ success: false, error: 'notInRoom' });

      const game = await TinhTuyGame.findOne({ roomId });
      if (!game || game.turnPhase !== 'AWAITING_RABBIT_BONUS') return callback({ success: false, error: 'invalidPhase' });

      const player = findPlayerBySocket(game, socket);
      if (!player || !isCurrentPlayer(game, player)) return callback({ success: false, error: 'notYourTurn' });
      if (!player.rabbitBonusPending) return callback({ success: false, error: 'noPendingBonus' });

      clearTurnTimer(roomId);
      const accept = data?.accept === true;
      const { dice, bonus } = player.rabbitBonusPending;
      const moveSteps = accept ? dice.total + bonus : dice.total;
      player.rabbitBonusPending = undefined as any;

      io.to(roomId).emit('tinh-tuy:rabbit-bonus-picked', {
        slot: player.slot, accepted: accept, totalSteps: moveSteps,
      });

      // Execute movement
      const oldPos = player.position;
      const { position: newPos, passedGo } = calculateNewPosition(oldPos, moveSteps);
      player.position = newPos;
      const goSalary = getEffectiveGoSalary(game.round || 1) + getGoSalaryBonus(game, player);
      if (passedGo) {
        player.points += goSalary;
        onPassGo(player);
      }
      game.markModified('players');
      await game.save();
      io.to(roomId).emit('tinh-tuy:player-moved', {
        slot: player.slot, from: oldPos, to: newPos, passedGo,
        goBonus: passedGo ? goSalary : 0,
      });
      await resolveAndAdvance(io, game, player, newPos, { ...dice, total: moveSteps });
      callback({ success: true });
    } catch (err: any) {
      console.error('[tinh-tuy:rabbit-bonus-pick]', err.message);
      callback({ success: false, error: 'rabbitBonusPickFailed' });
      const rid = socket.data.tinhTuyRoomId as string;
      if (rid) safetyRestartTimer(io, rid);
    }
  });
}

// ─── Cell Resolution (after movement) ─────────────────────────

async function resolveAndAdvance(
  io: SocketIOServer, game: ITinhTuyGame, player: ITinhTuyPlayer,
  cellIndex: number, dice: { dice1: number; dice2: number; total: number; isDouble: boolean }
): Promise<void> {
  const cellAction = resolveCellAction(game, player.slot, cellIndex, dice.total);
  const roomId = game.roomId;

  // ── GO Bonus: landing exactly on cell 0 triggers random bonus ──
  if (cellIndex === 0) {
    await handleGoBonus(io, game, player);
    return;
  }

  switch (cellAction.action) {
    case 'rent': {
      if (!cellAction.amount || !cellAction.ownerSlot) break;
      // Check immunity
      if (player.immunityNextRent) {
        player.immunityNextRent = false;
        // Immune — skip rent, but still offer buyback
        const buybackStarted = await emitBuybackPrompt(io, game, player, cellIndex, cellAction.ownerSlot);
        if (buybackStarted) return;
        break;
      }
      // Apply Fox passive (-15% rent) + Suu Nhi passive (-10% losses)
      let rentToPay = cellAction.amount;
      rentToPay = Math.floor(rentToPay * getRentPayMultiplier(game, player));
      rentToPay = Math.floor(rentToPay * getMoneyLossMultiplier(game, player));
      player.points -= rentToPay;
      const owner = game.players.find(p => p.slot === cellAction.ownerSlot);
      if (owner) owner.points += rentToPay;

      io.to(roomId).emit('tinh-tuy:rent-paid', {
        fromSlot: player.slot, toSlot: cellAction.ownerSlot,
        amount: rentToPay, cellIndex,
      });

      const gameEnded = await checkBankruptcy(io, game, player);
      if (gameEnded) return;

      // Offer buyback after paying rent (if still solvent)
      const buybackStarted = await emitBuybackPrompt(io, game, player, cellIndex, cellAction.ownerSlot);
      if (buybackStarted) return;
      break;
    }
    case 'tax': {
      // Per-building tax — 0 if no buildings; Suu Nhi passive: -10%
      let taxAmount = cellAction.amount || 0;
      taxAmount = Math.floor(taxAmount * getMoneyLossMultiplier(game, player));
      if (taxAmount > 0) player.points -= taxAmount;
      io.to(roomId).emit('tinh-tuy:tax-paid', {
        slot: player.slot, amount: taxAmount, cellIndex,
        houseCount: cellAction.houseCount || 0,
        hotelCount: cellAction.hotelCount || 0,
        perHouse: cellAction.perHouse || 500,
        perHotel: cellAction.perHotel || 1000,
      });
      if (taxAmount > 0) {
        const gameEnded = await checkBankruptcy(io, game, player);
        if (gameEnded) return;
      }
      break;
    }
    case 'go_to_island': {
      // resolveCellAction already returns 'none' for Pigfish, but guard here too
      if (isIslandImmune(game, player)) break; // Skip island — proceed to advanceTurn
      sendToIsland(player);
      await game.save();
      io.to(roomId).emit('tinh-tuy:player-island', { slot: player.slot, turnsRemaining: player.islandTurns });
      await advanceTurn(io, game);
      return;
    }
    case 'festival': {
      // If player has no properties, skip festival (no effect)
      if (player.properties.length === 0) {
        break; // falls to advanceTurn
      }
      game.turnPhase = 'AWAITING_FESTIVAL';
      await game.save();
      io.to(roomId).emit('tinh-tuy:festival-prompt', { slot: player.slot });
      startTurnTimer(roomId, game.settings.turnDuration * 1000, async () => {
        try {
          const g = await TinhTuyGame.findOne({ roomId });
          if (!g || g.turnPhase !== 'AWAITING_FESTIVAL') return;
          const p = g.players.find(pp => pp.slot === player.slot)!;
          const autoCell = p.properties[0];
          // Auto-pick: stack if same cell, otherwise new at 1.5x
          let autoMult = 1.5;
          if (g.festival && g.festival.slot === p.slot && g.festival.cellIndex === autoCell) {
            autoMult = g.festival.multiplier + 0.5;
          }
          g.festival = { slot: p.slot, cellIndex: autoCell, multiplier: autoMult };
          g.markModified('festival');
          g.turnPhase = 'END_TURN';
          await g.save();
          io.to(roomId).emit('tinh-tuy:festival-applied', { slot: p.slot, cellIndex: autoCell, multiplier: autoMult });
          await advanceTurnOrDoubles(io, g, p);
        } catch (err) { console.error('[tinh-tuy] Festival timeout:', err); }
      });
      return;
    }
    case 'card': {
      const cell = getCell(cellIndex);
      if (cell && (cell.type === 'KHI_VAN' || cell.type === 'CO_HOI')) {
        await handleCardDraw(io, game, player, cell.type);
        // handleCardDraw may set a waiting phase (AWAITING_ACTION, AWAITING_FREE_HOUSE, etc.)
        // Only advance turn if it completed with END_TURN
        if (game.turnPhase !== 'END_TURN') return;
        await advanceTurnOrDoubles(io, game, player);
        return;
      }
      break;
    }
    case 'travel': {
      // Deferred travel: end turn now, next turn starts as AWAITING_TRAVEL
      player.pendingTravel = true;
      player.consecutiveDoubles = 0; // break doubles chain
      game.lastDiceResult = null; // prevent doubles extra turn
      game.markModified('lastDiceResult');
      game.turnPhase = 'END_TURN';
      game.markModified('players');
      await game.save();
      io.to(roomId).emit('tinh-tuy:travel-pending', { slot: player.slot });
      await advanceTurn(io, game); // force advance, no doubles
      return;
    }
    case 'build': {
      game.turnPhase = 'AWAITING_BUILD';
      await game.save();
      io.to(roomId).emit('tinh-tuy:build-prompt', {
        slot: player.slot, cellIndex,
        canBuildHouse: cellAction.canBuildHouse,
        houseCost: cellAction.houseCost,
        canBuildHotel: cellAction.canBuildHotel,
        hotelCost: cellAction.hotelCost,
        currentHouses: cellAction.currentHouses,
        hasHotel: cellAction.hasHotel,
      });
      startTurnTimer(roomId, game.settings.turnDuration * 1000, async () => {
        try {
          const g = await TinhTuyGame.findOne({ roomId });
          if (!g || g.turnPhase !== 'AWAITING_BUILD') return;
          g.turnPhase = 'END_TURN';
          await g.save();
          const p = g.players.find(pp => pp.slot === player.slot)!;
          await advanceTurnOrDoubles(io, g, p);
        } catch (err) { console.error('[tinh-tuy] Build timeout:', err); }
      });
      return;
    }
    case 'buy': {
      game.turnPhase = 'AWAITING_ACTION';
      await game.save();
      io.to(roomId).emit('tinh-tuy:awaiting-action', {
        slot: player.slot, cellIndex,
        cellType: getCell(cellIndex)?.type, price: cellAction.amount,
        canAfford: player.points >= (cellAction.amount || 0),
      });
      startTurnTimer(roomId, game.settings.turnDuration * 1000, async () => {
        try {
          const g = await TinhTuyGame.findOne({ roomId });
          if (!g || g.turnPhase !== 'AWAITING_ACTION') return;
          g.turnPhase = 'END_TURN';
          await g.save();
          const p = g.players.find(pp => pp.slot === player.slot)!;
          await advanceTurnOrDoubles(io, g, p);
        } catch (err) { console.error('[tinh-tuy] Action timeout:', err); }
      });
      return; // Waiting for player action
    }
    default:
      break;
  }

  // Default: advance turn (with doubles check)
  game.turnPhase = 'END_TURN';
  await game.save();
  await advanceTurnOrDoubles(io, game, player);
}
