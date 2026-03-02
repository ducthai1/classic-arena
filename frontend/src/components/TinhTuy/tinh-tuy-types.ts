/**
 * Tinh Tuy Dai Chien — Frontend Types
 * Mirrors backend types + UI-specific extensions.
 */

// ─── Character ───────────────────────────────────────
export type TinhTuyCharacter = 'shiba' | 'kungfu' | 'fox' | 'elephant' | 'trau' | 'horse' | 'canoc' | 'seahorse' | 'pigfish' | 'chicken' | 'rabbit' | 'sloth' | 'owl';
export const VALID_CHARACTERS: TinhTuyCharacter[] = ['shiba', 'kungfu', 'fox', 'elephant', 'trau', 'horse', 'canoc', 'seahorse', 'pigfish', 'chicken', 'rabbit', 'sloth', 'owl'];
export const CHARACTER_IMAGES: Record<TinhTuyCharacter, string> = {
  shiba: '/tinh-tuy-actor/shiba.png',
  kungfu: '/tinh-tuy-actor/kungfu.png',
  fox: '/tinh-tuy-actor/fox.png',
  elephant: '/tinh-tuy-actor/elephant.png',
  trau: '/tinh-tuy-actor/trau.png',
  horse: '/tinh-tuy-actor/horse.png',
  canoc: '/tinh-tuy-actor/ca-noc.png',
  seahorse: '/tinh-tuy-actor/horse-fish.png',
  pigfish: '/tinh-tuy-actor/pig-fish.png',
  chicken: '/tinh-tuy-actor/chicken.png',
  rabbit: '/tinh-tuy-actor/rabbit.png',
  sloth: '/tinh-tuy-actor/sloth.png',
  owl: '/tinh-tuy-actor/owl.png',
};

// ─── View ─────────────────────────────────────────────
export type TinhTuyView = 'lobby' | 'waiting' | 'playing' | 'result';

// ─── Enums ────────────────────────────────────────────
export type TinhTuyGameStatus = 'waiting' | 'playing' | 'finished' | 'abandoned';
export type TinhTuyGameMode = 'classic' | 'timed' | 'rounds';
export type TurnPhase = 'ROLL_DICE' | 'MOVING' | 'AWAITING_ACTION' | 'AWAITING_BUILD' | 'AWAITING_FREE_HOUSE' | 'AWAITING_FREE_HOTEL' | 'AWAITING_CARD' | 'AWAITING_CARD_DISPLAY' | 'AWAITING_TRAVEL' | 'AWAITING_FESTIVAL' | 'AWAITING_SELL' | 'AWAITING_DESTROY_PROPERTY' | 'AWAITING_DOWNGRADE_BUILDING' | 'AWAITING_BUYBACK' | 'AWAITING_CARD_DESTINATION' | 'AWAITING_FORCED_TRADE' | 'AWAITING_RENT_FREEZE' | 'AWAITING_BUY_BLOCK_TARGET' | 'AWAITING_EMINENT_DOMAIN' | 'AWAITING_ABILITY_CHOICE' | 'AWAITING_OWL_PICK' | 'AWAITING_HORSE_ADJUST' | 'AWAITING_HORSE_MOVE' | 'AWAITING_SHIBA_REROLL_PICK' | 'AWAITING_RABBIT_BONUS' | 'ISLAND_TURN' | 'END_TURN';

export type CellType =
  | 'GO' | 'PROPERTY' | 'STATION' | 'UTILITY'
  | 'KHI_VAN' | 'CO_HOI' | 'TAX'
  | 'TRAVEL' | 'ISLAND' | 'GO_TO_ISLAND' | 'FESTIVAL';

export type PropertyGroup =
  | 'brown' | 'light_blue' | 'purple' | 'orange'
  | 'red' | 'yellow' | 'green' | 'dark_blue';

// ─── Settings ─────────────────────────────────────────
export interface TinhTuySettings {
  maxPlayers: number;
  startingPoints: number;
  gameMode: TinhTuyGameMode;
  timeLimit?: number;
  maxRounds?: number;
  turnDuration: number;
  abilitiesEnabled: boolean;
}

export const DEFAULT_SETTINGS: TinhTuySettings = {
  maxPlayers: 4,
  startingPoints: 20000,
  gameMode: 'classic',
  turnDuration: 60,
  abilitiesEnabled: true,
};

// ─── Player ───────────────────────────────────────────
export interface TinhTuyPlayer {
  slot: number;
  character: TinhTuyCharacter;
  userId?: string;
  guestId?: string;
  guestName?: string;
  displayName: string;
  points: number;
  position: number;
  properties: number[];
  houses: Record<string, number>;
  hotels: Record<string, boolean>;
  // festivals removed — now game-level state.festival
  islandTurns: number;
  cards: string[];
  immunityNextRent: boolean;
  doubleRentTurns: number;
  buyBlockedTurns: number;
  skipNextTurn: boolean;
  isBankrupt: boolean;
  isConnected: boolean;
  consecutiveDoubles: number;
  deviceType?: 'mobile' | 'tablet' | 'desktop';
  // Ability fields
  abilityCooldown: number;
  abilityUsedThisTurn: boolean;
}

// ─── Winner ───────────────────────────────────────────
export interface TinhTuyWinner {
  slot: number;
  userId?: string;
  guestId?: string;
  guestName?: string;
  finalPoints: number;
}

// ─── Turn Phase ───────────────────────────────────────
export type PendingAction =
  | { type: 'BUY_PROPERTY'; cellIndex: number; price: number; canAfford: boolean; cellType?: string }
  | { type: 'PAY_RENT'; cellIndex: number; amount: number; toSlot: number }
  | { type: 'TAX'; cellIndex: number; amount: number }
  | null;

// ─── Board Cell (client-side reference) ───────────────
export interface BoardCellClient {
  index: number;
  type: CellType;
  name: string;
  group?: PropertyGroup;
  price?: number;
  rentBase?: number;
  rentGroup?: number;
  rentHouse?: number[];
  rentHotel?: number;
  houseCost?: number;
  hotelCost?: number;
  icon?: string;
  taxAmount?: number;
}

// ─── Waiting Room Info (lobby card) ───────────────────
export interface WaitingRoomInfo {
  roomId: string;
  roomCode: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  hasPassword: boolean;
  settings: TinhTuySettings;
  createdAt: string;
}

// ─── Create Room Payload ──────────────────────────────
export interface CreateRoomPayload {
  settings: Partial<TinhTuySettings>;
  password?: string;
}

// ─── State ────────────────────────────────────────────
export interface TinhTuyState {
  view: TinhTuyView;
  waitingRooms: WaitingRoomInfo[];
  isLoadingRooms: boolean;
  roomId: string | null;
  roomCode: string | null;
  settings: TinhTuySettings | null;
  players: TinhTuyPlayer[];
  isHost: boolean;
  mySlot: number | null;
  hasPassword: boolean;
  gameStatus: TinhTuyGameStatus;
  currentPlayerSlot: number;
  turnPhase: TurnPhase;
  turnStartedAt: number;
  lastDiceResult: { dice1: number; dice2: number } | null;
  /** True while dice roll animation is playing (blocks queued effects) */
  diceAnimating: boolean;
  round: number;
  /** True when round > LATE_GAME_START (60) — triggers UI badge */
  lateGameActive: boolean;
  pendingAction: PendingAction;
  /** Global festival — only 1 on the board at a time */
  festival: { slot: number; cellIndex: number; multiplier: number } | null;
  winner: TinhTuyWinner | null;
  /** Reason the game ended (e.g. 'lastStanding', 'roundsComplete') */
  gameEndReason: string | null;
  error: string | null;
  drawnCard: CardInfo | null;
  /** Cell index of house removed by card effect (for notification) */
  houseRemovedCell: number | null;
  chatMessages: ChatMessage[];
  reactions: Reaction[];
  pendingMove: { slot: number; path: number[]; goBonus?: number; passedGo?: boolean; fromCard?: boolean } | null;
  animatingToken: { slot: number; path: number[]; currentStep: number } | null;
  pendingCardMove: { slot: number; to: number; passedGo: boolean } | null;
  showGoPopup: boolean;
  islandAlertSlot: number | null;
  taxAlert: { slot: number; amount: number; houseCount: number; hotelCount: number; perHouse: number; perHotel: number } | null;
  rentAlert: { fromSlot: number; toSlot: number; amount: number; cellIndex: number } | null;
  /** Floating point-change notifications per player (visible) */
  pointNotifs: Array<{ id: number; slot: number; amount: number }>;
  /** Queued notifs — flushed to pointNotifs after animation completes */
  pendingNotifs: Array<{ slot: number; amount: number }>;
  /** Frozen points snapshot — shown instead of real points while notifs are pending */
  displayPoints: Record<number, number>;
  /** Queued turn change — applied after animations + modals finish */
  queuedTurnChange: { currentSlot: number; turnPhase: TurnPhase; round?: number; buffs?: Array<{ slot: number; cards: string[]; immunityNextRent: boolean; doubleRentTurns: number; buyBlockedTurns: number; skipNextTurn: boolean }> } | null;
  /** Queued travel prompt — applied after movement animation finishes */
  queuedTravelPrompt: boolean;
  /** Queued festival prompt — applied after movement animation finishes */
  queuedFestivalPrompt: boolean;
  /** Queued awaiting action — applied after movement animation finishes */
  queuedAction: { slot: number; cellIndex: number; cellType?: string; price?: number; canAfford?: boolean } | null;
  /** Build prompt — shown when landing on own buildable property */
  buildPrompt: { cellIndex: number; canBuildHouse: boolean; houseCost: number; canBuildHotel: boolean; hotelCost: number; currentHouses: number; hasHotel: boolean } | null;
  /** Queued build prompt — applied after movement animation finishes */
  queuedBuildPrompt: TinhTuyState['buildPrompt'];
  /** Queued rent alert — shown after movement animation finishes */
  queuedRentAlert: TinhTuyState['rentAlert'];
  /** Queued tax alert — shown after movement animation finishes */
  queuedTaxAlert: TinhTuyState['taxAlert'];
  /** Queued island alert — shown after movement animation finishes */
  queuedIslandAlert: number | null;
  /** Sell prompt — shown when player must sell buildings to cover debt */
  sellPrompt: { deficit: number; sellPrices?: Record<string, { property: number; house: number; hotel: number }>; canCoverDebt?: boolean } | null;
  /** Queued sell prompt — applied after animation settles */
  queuedSellPrompt: { deficit: number; sellPrices?: Record<string, { property: number; house: number; hotel: number }>; canCoverDebt?: boolean } | null;
  /** Travel pending alert — shown when landing on Travel cell */
  travelPendingSlot: number | null;
  /** Queued travel pending — applied after movement animation finishes */
  queuedTravelPending: number | null;
  /** Free house prompt — player chooses which property gets a free house (from card) */
  freeHousePrompt: { slot: number; buildableCells: number[] } | null;
  /** Queued free house prompt — applied after walk + card modal + go bonus finish */
  queuedFreeHousePrompt: { slot: number; buildableCells: number[] } | null;
  /** Free hotel prompt — player chooses which property gets instant hotel upgrade (from card) */
  freeHotelPrompt: { slot: number; buildableCells: number[] } | null;
  /** Queued free hotel prompt — applied after walk + card modal finish */
  queuedFreeHotelPrompt: { slot: number; buildableCells: number[] } | null;
  /** Deferred card effects — applied only when card modal is dismissed (prevents spoilers) */
  pendingCardEffect: {
    slot: number;
    cardHeld?: { slot: number; cardId: string };
    immunityNextRent?: boolean;
    doubleRentTurns?: number;
    skipTurn?: boolean;
    goToIsland?: boolean;
    houseRemoved?: { slot: number; cellIndex: number };
    swapPosition?: { slot: number; targetSlot: number; myNewPos: number; targetNewPos: number };
    stolenProperty?: { fromSlot: number; toSlot: number; cellIndex: number; houses?: number };
    allHousesRemoved?: Array<{ slot: number; cellIndex: number }>;
  } | null;
  /** Pending swap animation — positions applied after brief delay post card dismiss */
  pendingSwapAnim: { slot: number; targetSlot: number; myNewPos: number; targetNewPos: number } | null;
  /** Extra info shown on card modal (swap target, stolen property, taxed player, random steps) */
  cardExtraInfo: {
    swapTargetSlot?: number;
    stolenCellIndex?: number;
    stolenFromSlot?: number;
    stolenToSlot?: number;
    stolenHouses?: number;
    taxedSlot?: number;
    randomSteps?: number;
    randomPoints?: number;
    gambleWon?: boolean;
    allHousesRemoved?: Array<{ slot: number; cellIndex: number }>;
    underdogBoosted?: boolean;
    extraTurn?: boolean;
    wealthTransfer?: { richestSlot: number; poorestSlot: number; amount: number };
    teleportAll?: Array<{ slot: number; to: number }>;
    movedToFestival?: boolean;
    festivalCellIndex?: number;
    completedGroups?: number;
  } | null;
  /** Queued bankruptcy alert — shown after rent/tax alerts */
  queuedBankruptAlert: number | null;
  /** Active bankruptcy alert — slot of bankrupt player */
  bankruptAlert: number | null;
  /** Monopoly completed alert — shown when a player completes a color group */
  monopolyAlert: { slot: number; group: string; cellIndices: number[] } | null;
  /** Queued game-finished — applied after all alerts are dismissed */
  queuedGameFinished: { winner: TinhTuyWinner | null; reason: string } | null;
  /** Attack property prompt — player chooses opponent's property to attack */
  attackPrompt: { attackType: 'DESTROY_PROPERTY' | 'DOWNGRADE_BUILDING'; targetCells: number[] } | null;
  /** Attack result alert — shown to all players when property is attacked */
  attackAlert: { victimSlot: number; cellIndex: number; result: 'destroyed' | 'downgraded' | 'demolished' | 'shielded'; prevHouses: number; prevHotel: boolean; newHouses: number; newHotel: boolean } | null;
  /** Forced trade result alert — shown to all players when properties are swapped */
  forcedTradeAlert: { traderSlot: number; traderCell: number; victimSlot: number; victimCell: number } | null;
  /** Buyback prompt — shown after paying rent on opponent's property */
  buybackPrompt: { slot: number; ownerSlot: number; cellIndex: number; price: number; canAfford: boolean } | null;
  /** Queued buyback prompt — applied after animations settle */
  queuedBuybackPrompt: TinhTuyState['buybackPrompt'];
  /** GO bonus prompt — shown when landing exactly on GO */
  goBonusPrompt: { slot: number; bonusType: 'BONUS_POINTS' | 'FREE_HOUSE'; amount?: number } | null;
  /** Queued GO bonus — applied after walk animation finishes */
  queuedGoBonus: { slot: number; bonusType: 'BONUS_POINTS' | 'FREE_HOUSE'; amount?: number } | null;
  /** Auto-sold alert — shown when timeout auto-sells buildings/properties */
  autoSoldAlert: { slot: number; items: Array<{ cellIndex: number; type: string; price: number }> } | null;
  /** Forced trade prompt — player picks own property + opponent property to swap */
  forcedTradePrompt: { myCells: number[]; opponentCells: number[] } | null;
  /** Frozen properties — rent is 0 for these cells */
  frozenProperties: Array<{ cellIndex: number; turnsRemaining: number }>;
  /** Rent freeze selection prompt — pick opponent's property to freeze */
  rentFreezePrompt: { targetCells: number[] } | null;
  /** Near-win warning — shown when a player is 1 step from domination victory */
  nearWinWarning: { slot: number; type: string; missingCells?: number[]; completedGroups?: number; edgeIndex?: number } | null;
  /** Buy block prompt — player chooses opponent to block from buying */
  buyBlockPrompt: { slot: number; targets: Array<{ slot: number; displayName: string }>; turns: number } | null;
  /** Eminent domain prompt — player chooses opponent's property to force-buy */
  eminentDomainPrompt: { slot: number; targetCells: number[] } | null;
  /** Pending negotiate trade — one active at a time */
  pendingNegotiate: { fromSlot: number; toSlot: number; cellIndex: number; offerAmount: number } | null;
  /** Round when negotiate cooldown expires for this player */
  negotiateCooldownUntil: number;
  /** Whether the negotiate wizard (requester) is open */
  negotiateWizardOpen: boolean;
  // ─── Ability State ───────────────────────────────────
  /** Ability target modal — pick opponent / cell / house / steps / deck */
  abilityModal: {
    type: 'OPPONENT' | 'CELL' | 'OPPONENT_HOUSE' | 'STEPS' | 'DECK';
    targets?: Array<{ slot: number; displayName: string }>;
    cells?: number[];
    houses?: Array<{ slot: number; cellIndex: number; houses: number }>;
  } | null;
  /** Owl pick modal — choose 1 of 2 cards */
  owlPickModal: { cards: Array<{ id: string; type: string; nameKey: string; descriptionKey: string }> } | null;
  /** Horse adjust prompt — ±1 after dice */
  horseAdjustPrompt: { diceTotal: number; currentPos: number } | null;
  /** Shiba reroll pick — choose original or rerolled dice */
  shibaRerollPrompt: { original: { dice1: number; dice2: number }; rerolled: { dice1: number; dice2: number } } | null;
  /** Rabbit bonus prompt — accept or decline +3 on doubles */
  rabbitBonusPrompt: { bonus: number; dice: { dice1: number; dice2: number; total: number } } | null;
  /** Ability used notification — broadcast to all */
  abilityUsedAlert: { slot: number; abilityId: string; targetSlot?: number; cellIndex?: number; amount?: number } | null;
  /** Chicken drain notification */
  chickenDrainAlert: { chickenSlot: number; drained: Array<{ slot: number; amount: number }>; totalGained: number } | null;
  /** Sloth auto-build notification */
  slothAutoBuildAlert: { slot: number; cellIndex: number } | null;
  /** Fox swap notification — shown to both swapped players */
  foxSwapAlert: { foxSlot: number; targetSlot: number; foxNewPos: number; targetNewPos: number } | null;
}

// ─── Reducer Actions ──────────────────────────────────
export type TinhTuyAction =
  | { type: 'SET_VIEW'; payload: TinhTuyView }
  | { type: 'SET_ROOMS'; payload: WaitingRoomInfo[] }
  | { type: 'SET_LOADING_ROOMS'; payload: boolean }
  | { type: 'ROOM_CREATED'; payload: { roomId: string; roomCode: string; settings: TinhTuySettings; players: TinhTuyPlayer[] } }
  | { type: 'ROOM_JOINED'; payload: { roomId: string; roomCode: string; settings: TinhTuySettings; players: TinhTuyPlayer[]; gameStatus: TinhTuyGameStatus; game?: any; reconnected?: boolean } }
  | { type: 'ROOM_UPDATED'; payload: { players?: TinhTuyPlayer[]; settings?: TinhTuySettings; gameStatus?: TinhTuyGameStatus; hostPlayerId?: string } }
  | { type: 'GAME_STARTED'; payload: { game: any } }
  | { type: 'DICE_RESULT'; payload: { dice1: number; dice2: number; total: number; isDouble: boolean } }
  | { type: 'PLAYER_MOVED'; payload: { slot: number; from: number; to: number; passedGo: boolean; goBonus?: number; isTravel?: boolean; teleport?: boolean } }
  | { type: 'AWAITING_ACTION'; payload: { slot: number; cellIndex: number; cellType?: string; price?: number; canAfford?: boolean } }
  | { type: 'PROPERTY_BOUGHT'; payload: { slot: number; cellIndex: number; price: number; remainingPoints: number } }
  | { type: 'RENT_PAID'; payload: { fromSlot: number; toSlot: number; amount: number; cellIndex: number } }
  | { type: 'TAX_PAID'; payload: { slot: number; amount: number; cellIndex: number; houseCount: number; hotelCount: number; perHouse: number; perHotel: number } }
  | { type: 'TURN_CHANGED'; payload: { currentSlot: number; turnPhase: TurnPhase; turnStartedAt?: any; round?: number; extraTurn?: boolean; buffs?: Array<{ slot: number; cards: string[]; immunityNextRent: boolean; doubleRentTurns: number; buyBlockedTurns: number; skipNextTurn: boolean }>; frozenProperties?: Array<{ cellIndex: number; turnsRemaining: number }> } }
  | { type: 'LATE_GAME_STARTED' }
  | { type: 'PLAYER_BANKRUPT'; payload: { slot: number } }
  | { type: 'PLAYER_SURRENDERED'; payload: { slot: number } }
  | { type: 'PLAYER_ISLAND'; payload: { slot: number; turnsRemaining: number } }
  | { type: 'GAME_FINISHED'; payload: { winner: TinhTuyWinner | null; reason: string } }
  | { type: 'PLAYER_DISCONNECTED'; payload: { slot: number } }
  | { type: 'PLAYER_RECONNECTED'; payload: { slot: number } }
  | { type: 'SET_HOST'; payload: boolean }
  | { type: 'SET_MY_SLOT'; payload: number | null }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'LEAVE_ROOM' }
  | { type: 'CARD_DRAWN'; payload: { slot: number; card: CardInfo; effect: any } }
  | { type: 'CLEAR_CARD' }
  | { type: 'HOUSE_BUILT'; payload: { slot: number; cellIndex: number; houseCount: number; remainingPoints?: number } }
  | { type: 'HOTEL_BUILT'; payload: { slot: number; cellIndex: number; remainingPoints?: number } }
  | { type: 'ISLAND_ESCAPED'; payload: { slot: number; method: string; costPaid?: number } }
  | { type: 'FESTIVAL_PROMPT'; payload: { slot: number } }
  | { type: 'FESTIVAL_APPLIED'; payload: { slot: number; cellIndex: number; multiplier: number } }
  | { type: 'APPLY_QUEUED_FESTIVAL' }
  | { type: 'CHAT_MESSAGE'; payload: ChatMessage }
  | { type: 'REACTION'; payload: { slot: number; emoji: string; timestamp: number } }
  | { type: 'DISMISS_REACTION'; payload: string }
  | { type: 'PLAYER_NAME_UPDATED'; payload: { slot: number; name: string } }
  | { type: 'TRAVEL_PROMPT'; payload: { slot: number } }
  | { type: 'START_MOVE' }
  | { type: 'ANIMATION_STEP' }
  | { type: 'SHOW_GO_POPUP' }
  | { type: 'HIDE_GO_POPUP' }
  | { type: 'CLEAR_ISLAND_ALERT' }
  | { type: 'CLEAR_TAX_ALERT' }
  | { type: 'CLEAR_RENT_ALERT' }
  | { type: 'CLEAR_POINT_NOTIFS' }
  | { type: 'FLUSH_NOTIFS' }
  | { type: 'APPLY_QUEUED_TURN_CHANGE' }
  | { type: 'APPLY_QUEUED_TRAVEL' }
  | { type: 'APPLY_QUEUED_ACTION' }
  | { type: 'APPLY_QUEUED_RENT_ALERT' }
  | { type: 'APPLY_QUEUED_TAX_ALERT' }
  | { type: 'APPLY_QUEUED_ISLAND_ALERT' }
  | { type: 'BUILD_PROMPT'; payload: { cellIndex: number; canBuildHouse: boolean; houseCost: number; canBuildHotel: boolean; hotelCost: number; currentHouses: number; hasHotel: boolean } }
  | { type: 'APPLY_QUEUED_BUILD' }
  | { type: 'CLEAR_BUILD_PROMPT' }
  | { type: 'SELL_PROMPT'; payload: { slot: number; deficit: number; sellPrices?: Record<string, { property: number; house: number; hotel: number }>; canCoverDebt?: boolean } }
  | { type: 'BUILDINGS_SOLD'; payload: { slot: number; newPoints: number; houses: Record<string, number>; hotels: Record<string, boolean>; properties?: number[]; autoSold?: Array<{ cellIndex: number; type: string; price: number }>; festival?: { slot: number; cellIndex: number; multiplier: number } | null } }
  | { type: 'APPLY_QUEUED_SELL' }
  | { type: 'TRAVEL_PENDING'; payload: { slot: number } }
  | { type: 'APPLY_QUEUED_TRAVEL_PENDING' }
  | { type: 'CLEAR_TRAVEL_PENDING' }
  | { type: 'FREE_HOUSE_PROMPT'; payload: { slot: number; buildableCells: number[] } }
  | { type: 'APPLY_QUEUED_FREE_HOUSE_PROMPT' }
  | { type: 'CLEAR_FREE_HOUSE_PROMPT' }
  | { type: 'FREE_HOTEL_PROMPT'; payload: { slot: number; buildableCells: number[] } }
  | { type: 'APPLY_QUEUED_FREE_HOTEL_PROMPT' }
  | { type: 'CLEAR_FREE_HOTEL_PROMPT' }
  | { type: 'DICE_ANIM_DONE' }
  | { type: 'APPLY_QUEUED_BANKRUPT_ALERT' }
  | { type: 'CLEAR_BANKRUPT_ALERT' }
  | { type: 'MONOPOLY_COMPLETED'; payload: { slot: number; group: string; cellIndices: number[] } }
  | { type: 'CLEAR_MONOPOLY_ALERT' }
  | { type: 'APPLY_QUEUED_GAME_FINISHED' }
  | { type: 'ATTACK_PROPERTY_PROMPT'; payload: { attackType: 'DESTROY_PROPERTY' | 'DOWNGRADE_BUILDING'; targetCells: number[] } }
  | { type: 'PROPERTY_ATTACKED'; payload: { victimSlot: number; cellIndex: number; result: 'destroyed' | 'downgraded' | 'demolished' | 'shielded'; prevHouses: number; prevHotel: boolean; newHouses: number; newHotel: boolean; festival?: { slot: number; cellIndex: number; multiplier: number } | null } }
  | { type: 'CLEAR_ATTACK_ALERT' }
  | { type: 'CLEAR_FORCED_TRADE_ALERT' }
  | { type: 'BUYBACK_PROMPT'; payload: { slot: number; ownerSlot: number; cellIndex: number; price: number; canAfford: boolean } }
  | { type: 'APPLY_QUEUED_BUYBACK' }
  | { type: 'CLEAR_BUYBACK_PROMPT' }
  | { type: 'BUYBACK_COMPLETED'; payload: { buyerSlot: number; ownerSlot: number; cellIndex: number; price: number; buyerPoints: number; ownerPoints: number; houses: number; hotel: boolean } }
  | { type: 'FORCE_CLEAR_ANIM' }
  | { type: 'SWAP_ANIM_DONE' }
  | { type: 'ROOM_RESET'; payload: { game: any } }
  | { type: 'GO_BONUS'; payload: { slot: number; bonusType: 'BONUS_POINTS' | 'FREE_HOUSE'; amount?: number } }
  | { type: 'APPLY_QUEUED_GO_BONUS' }
  | { type: 'CLEAR_GO_BONUS' }
  | { type: 'CLEAR_AUTO_SOLD' }
  | { type: 'CARD_DESTINATION_PROMPT'; payload: { slot: number } }
  | { type: 'FORCED_TRADE_PROMPT'; payload: { slot: number; myCells: number[]; opponentCells: number[] } }
  | { type: 'FORCED_TRADE_DONE'; payload: { traderSlot: number; traderCell: number; victimSlot: number; victimCell: number; skipped?: boolean; festival?: { slot: number; cellIndex: number; multiplier: number } | null } }
  | { type: 'RENT_FREEZE_PROMPT'; payload: { slot: number; targetCells: number[] } }
  | { type: 'RENT_FROZEN'; payload: { cellIndex: number; turnsRemaining: number; frozenProperties: Array<{ cellIndex: number; turnsRemaining: number }> } }
  | { type: 'NEAR_WIN_WARNING'; payload: { slot: number; type: string; missingCells?: number[]; completedGroups?: number; edgeIndex?: number } }
  | { type: 'CLEAR_NEAR_WIN_WARNING' }
  | { type: 'BUY_BLOCK_PROMPT'; payload: { slot: number; targets: Array<{ slot: number; displayName: string }>; turns: number } }
  | { type: 'CLEAR_BUY_BLOCK_PROMPT' }
  | { type: 'EMINENT_DOMAIN_PROMPT'; payload: { slot: number; targetCells: number[] } }
  | { type: 'CLEAR_EMINENT_DOMAIN_PROMPT' }
  | { type: 'NEGOTIATE_INCOMING'; payload: { fromSlot: number; toSlot: number; cellIndex: number; offerAmount: number } }
  | { type: 'NEGOTIATE_COMPLETED'; payload: { accepted: boolean; fromSlot: number; toSlot: number; cellIndex?: number; offerAmount?: number; cooldownUntilRound?: number; festival?: any } }
  | { type: 'NEGOTIATE_CANCELLED'; payload: { fromSlot: number } }
  | { type: 'OPEN_NEGOTIATE_WIZARD' }
  | { type: 'CLOSE_NEGOTIATE_WIZARD' }
  // ─── Ability Actions ───────────────────────────────
  | { type: 'ABILITY_MODAL'; payload: TinhTuyState['abilityModal'] }
  | { type: 'CLEAR_ABILITY_MODAL' }
  | { type: 'OWL_PICK_MODAL'; payload: TinhTuyState['owlPickModal'] }
  | { type: 'CLEAR_OWL_PICK_MODAL' }
  | { type: 'HORSE_ADJUST_PROMPT'; payload: TinhTuyState['horseAdjustPrompt'] }
  | { type: 'CLEAR_HORSE_ADJUST_PROMPT' }
  | { type: 'SHIBA_REROLL_PROMPT'; payload: TinhTuyState['shibaRerollPrompt'] }
  | { type: 'CLEAR_SHIBA_REROLL_PROMPT' }
  | { type: 'SHIBA_REROLL_PICKED'; payload: { slot: number; kept: string; dice: { dice1: number; dice2: number } } }
  | { type: 'RABBIT_BONUS_PROMPT'; payload: TinhTuyState['rabbitBonusPrompt'] }
  | { type: 'CLEAR_RABBIT_BONUS_PROMPT' }
  | { type: 'ABILITY_USED'; payload: { slot: number; abilityId: string; cooldown: number; targetSlot?: number; cellIndex?: number; amount?: number } }
  | { type: 'CLEAR_ABILITY_USED_ALERT' }
  | { type: 'CHICKEN_DRAIN'; payload: { chickenSlot: number; drained: Array<{ slot: number; amount: number }>; totalGained: number } }
  | { type: 'CLEAR_CHICKEN_DRAIN' }
  | { type: 'SLOTH_AUTO_BUILD'; payload: { slot: number; cellIndex: number; houseCount: number } }
  | { type: 'CLEAR_SLOTH_AUTO_BUILD' }
  | { type: 'FOX_SWAP_ALERT'; payload: { foxSlot: number; targetSlot: number; foxNewPos: number; targetNewPos: number } }
  | { type: 'CLEAR_FOX_SWAP_ALERT' };

// ─── Card Types ──────────────────────────────────────
export interface CardInfo {
  id: string;
  type: 'KHI_VAN' | 'CO_HOI';
  nameKey: string;
  descriptionKey: string;
}

export interface ChatMessage {
  slot: number;
  message: string;
  timestamp: number;
}

export interface Reaction {
  id: string;       // `r-${slot}-${timestamp}`
  slot: number;
  emoji: string;
  timestamp: number;
}

// ─── Player Colors ────────────────────────────────────
export const PLAYER_COLORS: Record<number, string> = {
  1: '#e74c3c',
  2: '#3498db',
  3: '#2ecc71',
  4: '#f39c12',
};

// ─── Player 3D Actor Images ──────────────────────────
export const PLAYER_ACTORS: Record<number, string> = {
  1: '/tinh-tuy-actor/shiba.png',
  2: '/tinh-tuy-actor/kungfu.png',
  3: '/tinh-tuy-actor/fox.png',
  4: '/tinh-tuy-actor/elephant.png',
};

// ─── Property Group Colors ────────────────────────────
export const GROUP_COLORS: Record<PropertyGroup, string> = {
  brown: '#8B4513',
  light_blue: '#87CEEB',
  purple: '#9B59B6',
  orange: '#E67E22',
  red: '#E74C3C',
  yellow: '#F1C40F',
  green: '#27AE60',
  dark_blue: '#2C3E50',
};

// ─── Property Groups (cell indices per color group) ───
export const PROPERTY_GROUPS: Record<PropertyGroup, number[]> = {
  brown: [1, 3],
  light_blue: [5, 7],
  purple: [10, 11],
  orange: [13, 15],
  red: [17, 19],
  yellow: [21, 23],
  green: [25, 26, 29, 30],
  dark_blue: [31, 33, 35],
};

// ─── Board Definition (client-side) ───────────────────
export const BOARD_CELLS: BoardCellClient[] = [
  // TOP (0-8)
  { index: 0, type: 'GO', name: 'tinhTuy.cells.go', icon: 'bat-dau.png' },
  { index: 1, type: 'PROPERTY', name: 'tinhTuy.cells.benThanh', group: 'brown', price: 600, rentBase: 20, rentGroup: 40, rentHouse: [100, 300, 900, 1600], rentHotel: 2500, houseCost: 500, hotelCost: 500, icon: 'ben-thanh.png' },
  { index: 2, type: 'STATION', name: 'tinhTuy.cells.canTho', price: 2000, rentBase: 250, icon: 'can-tho.png' },
  { index: 3, type: 'PROPERTY', name: 'tinhTuy.cells.hoGuom', group: 'brown', price: 600, rentBase: 40, rentGroup: 80, rentHouse: [200, 600, 1800, 3200], rentHotel: 4500, houseCost: 500, hotelCost: 500, icon: 'ho-guom.png' },
  { index: 4, type: 'KHI_VAN', name: 'tinhTuy.cells.khiVan', icon: 'khi-van.png' },
  { index: 5, type: 'PROPERTY', name: 'tinhTuy.cells.hoiAn', group: 'light_blue', price: 1000, rentBase: 60, rentGroup: 120, rentHouse: [300, 900, 2700, 4000], rentHotel: 5500, houseCost: 500, hotelCost: 500, icon: 'hoi-an.png' },
  { index: 6, type: 'UTILITY', name: 'tinhTuy.cells.electric', price: 1500, icon: 'dien-luc.png' },
  { index: 7, type: 'PROPERTY', name: 'tinhTuy.cells.hue', group: 'light_blue', price: 1000, rentBase: 60, rentGroup: 120, rentHouse: [300, 900, 2700, 4000], rentHotel: 5500, houseCost: 500, hotelCost: 500, icon: 'hue.png' },
  { index: 8, type: 'CO_HOI', name: 'tinhTuy.cells.coHoi', icon: 'co-hoi.png' },
  // RIGHT (9-17)
  { index: 9, type: 'TRAVEL', name: 'tinhTuy.cells.travel', icon: 'du-lich.png' },
  { index: 10, type: 'PROPERTY', name: 'tinhTuy.cells.ducBa', group: 'purple', price: 1400, rentBase: 100, rentGroup: 200, rentHouse: [500, 1500, 4500, 6250], rentHotel: 7500, houseCost: 1000, hotelCost: 1000, icon: 'duc-ba.png' },
  { index: 11, type: 'PROPERTY', name: 'tinhTuy.cells.vanMieu', group: 'purple', price: 1400, rentBase: 100, rentGroup: 200, rentHouse: [500, 1500, 4500, 6250], rentHotel: 7500, houseCost: 1000, hotelCost: 1000, icon: 'quoc-tu-giam.png' },
  { index: 12, type: 'CO_HOI', name: 'tinhTuy.cells.coHoi', icon: 'co-hoi.png' },
  { index: 13, type: 'PROPERTY', name: 'tinhTuy.cells.cauVang', group: 'orange', price: 1800, rentBase: 140, rentGroup: 280, rentHouse: [700, 2000, 5500, 7500], rentHotel: 9500, houseCost: 1000, hotelCost: 1000, icon: 'cau-vang.png' },
  { index: 14, type: 'KHI_VAN', name: 'tinhTuy.cells.khiVan', icon: 'khi-van.png' },
  { index: 15, type: 'PROPERTY', name: 'tinhTuy.cells.muiNe', group: 'orange', price: 1800, rentBase: 140, rentGroup: 280, rentHouse: [700, 2000, 5500, 7500], rentHotel: 9500, houseCost: 1000, hotelCost: 1000, icon: 'mui-ne.png' },
  { index: 16, type: 'KHI_VAN', name: 'tinhTuy.cells.khiVan', icon: 'khi-van.png' },
  { index: 17, type: 'PROPERTY', name: 'tinhTuy.cells.nhaTrang', group: 'red', price: 2200, rentBase: 180, rentGroup: 360, rentHouse: [900, 2500, 7000, 8750], rentHotel: 10500, houseCost: 1500, hotelCost: 1500, icon: 'nha-trang.png' },
  // BOTTOM (18-26)
  { index: 18, type: 'FESTIVAL', name: 'tinhTuy.cells.festival', icon: 'le-hoi.png' },
  { index: 19, type: 'PROPERTY', name: 'tinhTuy.cells.phongNha', group: 'red', price: 2200, rentBase: 180, rentGroup: 360, rentHouse: [900, 2500, 7000, 8750], rentHotel: 10500, houseCost: 1500, hotelCost: 1500, icon: 'phong-nha.png' },
  { index: 20, type: 'CO_HOI', name: 'tinhTuy.cells.coHoi', icon: 'co-hoi.png' },
  { index: 21, type: 'PROPERTY', name: 'tinhTuy.cells.daLat', group: 'yellow', price: 2600, rentBase: 220, rentGroup: 440, rentHouse: [1100, 3300, 8000, 9750], rentHotel: 11500, houseCost: 1500, hotelCost: 1500, icon: 'da-lat.png' },
  { index: 22, type: 'UTILITY', name: 'tinhTuy.cells.nhaNuoc', price: 1500, icon: 'thuy-dien.png' },
  { index: 23, type: 'PROPERTY', name: 'tinhTuy.cells.sapa', group: 'yellow', price: 2600, rentBase: 220, rentGroup: 440, rentHouse: [1100, 3300, 8000, 9750], rentHotel: 11500, houseCost: 1500, hotelCost: 1500, icon: 'sapa.png' },
  { index: 24, type: 'KHI_VAN', name: 'tinhTuy.cells.khiVan', icon: 'khi-van.png' },
  { index: 25, type: 'PROPERTY', name: 'tinhTuy.cells.haLong', group: 'green', price: 3000, rentBase: 260, rentGroup: 520, rentHouse: [1300, 3900, 9000, 11000], rentHotel: 12750, houseCost: 2000, hotelCost: 2000, icon: 'ha-long.png' },
  { index: 26, type: 'PROPERTY', name: 'tinhTuy.cells.phuQuoc', group: 'green', price: 3000, rentBase: 260, rentGroup: 520, rentHouse: [1300, 3900, 9000, 11000], rentHotel: 12750, houseCost: 2000, hotelCost: 2000, icon: 'phu-quoc.png' },
  // LEFT (27-35)
  { index: 27, type: 'ISLAND', name: 'tinhTuy.cells.island', icon: 'ra-dao.png' },
  { index: 28, type: 'KHI_VAN', name: 'tinhTuy.cells.khiVan', icon: 'khi-van.png' },
  { index: 29, type: 'PROPERTY', name: 'tinhTuy.cells.conDao', group: 'green', price: 3200, rentBase: 280, rentGroup: 560, rentHouse: [1500, 4500, 10000, 12000], rentHotel: 14000, houseCost: 2000, hotelCost: 2000, icon: 'con-dao.png' },
  { index: 30, type: 'PROPERTY', name: 'tinhTuy.cells.bienHo', group: 'green', price: 3200, rentBase: 280, rentGroup: 560, rentHouse: [1500, 4500, 10000, 12000], rentHotel: 14000, houseCost: 2000, hotelCost: 2000, icon: 'pleiku.png' },
  { index: 31, type: 'PROPERTY', name: 'tinhTuy.cells.trangAn', group: 'dark_blue', price: 3500, rentBase: 350, rentGroup: 700, rentHouse: [1750, 5000, 11000, 13000], rentHotel: 15000, houseCost: 2000, hotelCost: 2000, icon: 'ninh-binh.png' },
  { index: 32, type: 'CO_HOI', name: 'tinhTuy.cells.coHoi', icon: 'co-hoi.png' },
  { index: 33, type: 'PROPERTY', name: 'tinhTuy.cells.quangTri', group: 'dark_blue', price: 3500, rentBase: 350, rentGroup: 700, rentHouse: [1750, 5000, 11000, 13000], rentHotel: 15000, houseCost: 2000, hotelCost: 2000, icon: 'quang-tri.png' },
  { index: 34, type: 'TAX', name: 'tinhTuy.cells.tax', icon: 'thue.png' },
  { index: 35, type: 'PROPERTY', name: 'tinhTuy.cells.landmark81', group: 'dark_blue', price: 4000, rentBase: 500, rentGroup: 1000, rentHouse: [2000, 6000, 14000, 17000], rentHotel: 20000, houseCost: 2000, hotelCost: 2000, icon: 'landmark.png' },
];

/** Get cell position on 10x10 CSS grid (36 cells on perimeter) */
export function getCellPosition(index: number): { col: number; row: number } {
  if (index <= 9) return { col: index + 1, row: 1 };          // top row (L→R)
  if (index <= 17) return { col: 10, row: index - 8 };         // right col (T→B)
  if (index <= 27) return { col: 28 - index, row: 10 };        // bottom row (R→L)
  return { col: 1, row: 37 - index };                           // left col (B→T)
}
