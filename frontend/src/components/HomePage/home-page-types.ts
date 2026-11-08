/**
 * Shared types for HomePage components
 */

export interface WaitingGame {
  _id: string;
  roomId: string;
  roomCode: string;
  boardSize: number;
  gameStatus: string;
  displayStatus?: 'waiting' | 'ready' | 'playing';
  statusLabel?: string;
  canJoin?: boolean;
  hasPlayer1: boolean;
  hasPlayer2: boolean;
  playerCount?: number;
  player1Username: string | null;
  hasPassword?: boolean; // Indicates if game has password
  createdAt: string;
}

export interface GameItem {
  id: string;
  name: string;
  icon: string;
  logo?: string;           // path to logo image in public/
  description: string;
  available: boolean;
  color: string;
}

// Games list - shared across components
export const GAMES: GameItem[] = [
  {
    id: 'caro',
    name: 'Caro',
    icon: '🎯',
    logo: '/game-logo/caro.webp',
    description: 'home.caroDescription',
    available: true,
    color: '#7ec8e3',
  },
  {
    id: 'lucky-wheel',
    name: 'games.luckyWheel',
    icon: '🎡',
    logo: '/game-logo/wheel.webp',
    description: 'home.luckyWheelDescription',
    available: true,
    color: '#f39c12',
  },
  {
    id: 'xi-dach-score',
    name: 'games.xiDachScore',
    icon: '🎴',
    logo: '/game-logo/tracker.webp',
    description: 'home.xiDachScoreDescription',
    available: true,
    color: '#e74c3c',
  },
  {
    id: 'word-chain',
    name: 'games.wordChain',
    icon: '🔤',
    logo: '/game-logo/wordchain.png',
    description: 'home.wordChainDescription',
    available: true,
    color: '#2ecc71',
  },
  {
    id: 'tinh-tuy',
    name: 'games.tinhTuy',
    icon: '🔮',
    logo: '/logo/tinh-tuy.png',
    description: 'home.tinhTuyDescription',
    available: true,
    color: '#9b59b6',
  },
  {
    id: 'go',
    name: 'games.go',
    icon: '⚫',
    description: 'home.goDescription',
    available: true,
    color: '#2c3e50',
  },
  {
    id: 'badminton',
    name: 'games.badminton',
    icon: '🏸',
    logo: '/game-logo/badminton.png',
    description: 'home.badmintonDescription',
    available: true,
    color: '#ff8fb0',
  },
  {
    id: 'werewolf',
    name: 'games.werewolf',
    icon: '🐺',
    description: 'home.werewolfDescription',
    available: false,
    color: '#9b59b6',
  },
  {
    id: 'uno',
    name: 'games.uno',
    icon: '🃏',
    description: 'home.unoDescription',
    available: false,
    color: '#e74c3c',
  },
  {
    id: 'other',
    name: 'games.otherGames',
    icon: '🎮',
    description: 'home.otherGamesDescription',
    available: false,
    color: '#95a5a6',
  },
];
