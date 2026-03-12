/**
 * Xi Dach Session Model
 * Stores multiplayer Xi Dach score tracking sessions with password protection
 */
import mongoose, { Document, Schema } from 'mongoose';

// ============== INTERFACES ==============

export interface IXiDachPlayer {
  id: string;
  name: string;
  baseScore: number;
  currentScore: number;
  betAmount?: number;     // Individual point rate per hand (optional)
  isActive: boolean;
  createdAt: string;
}

export interface IXiDachPlayerResult {
  playerId: string;
  winTuCount: number;
  winXiBanCount: number;
  winNguLinhCount: number;
  loseTuCount: number;
  loseXiBanCount: number;
  loseNguLinhCount: number;
  penalty28: boolean;
  penalty28Recipients: string[];
  scoreChange: number;
}

export interface IXiDachMatch {
  id: string;
  matchNumber: number;
  dealerId: string;
  results: IXiDachPlayerResult[];
  timestamp: string;
  durationMs?: number;
  editedAt?: string;
}

export interface IXiDachSettings {
  pointsPerTu: number;
  penalty28Enabled: boolean;
  penalty28Amount: number;
  autoRotateDealer: boolean;
  autoRotateAfter: number;
}

export type XiDachSessionStatus = 'setup' | 'playing' | 'paused' | 'ended';

export interface IXiDachSession extends Document {
  sessionCode: string;
  name: string;
  password: string | null;
  creatorId: mongoose.Types.ObjectId | null;
  creatorGuestId: string | null;
  players: IXiDachPlayer[];
  matches: IXiDachMatch[];
  currentDealerId: string | null;
  settings: IXiDachSettings;
  status: XiDachSessionStatus;
  version: number;
  createdAt: Date;
  startedAt?: Date;
  endedAt?: Date;
  updatedAt: Date;
}

// ============== SCHEMAS ==============

const XiDachPlayerSchema: Schema = new Schema({
  id: { type: String, required: true },
  name: { type: String, required: true, maxlength: 50 },
  baseScore: { type: Number, default: 0 },
  currentScore: { type: Number, default: 0 },
  betAmount: { type: Number, default: null }, // Individual point rate per hand
  isActive: { type: Boolean, default: true },
  createdAt: { type: String, required: true },
}, { _id: false });

const XiDachPlayerResultSchema: Schema = new Schema({
  playerId: { type: String, required: true },
  winTuCount: { type: Number, default: 0 },
  winXiBanCount: { type: Number, default: 0 },
  winNguLinhCount: { type: Number, default: 0 },
  loseTuCount: { type: Number, default: 0 },
  loseXiBanCount: { type: Number, default: 0 },
  loseNguLinhCount: { type: Number, default: 0 },
  penalty28: { type: Boolean, default: false },
  penalty28Recipients: { type: [String], default: [] },
  scoreChange: { type: Number, default: 0 },
}, { _id: false });

const XiDachMatchSchema: Schema = new Schema({
  id: { type: String, required: true },
  matchNumber: { type: Number, required: true },
  dealerId: { type: String, required: true },
  results: { type: [XiDachPlayerResultSchema], default: [] },
  timestamp: { type: String, required: true },
  durationMs: { type: Number, default: null },
  editedAt: { type: String, default: null },
}, { _id: false });

const XiDachSettingsSchema: Schema = new Schema({
  pointsPerTu: { type: Number, default: 10 },
  penalty28Enabled: { type: Boolean, default: false },
  penalty28Amount: { type: Number, default: 50 },
  autoRotateDealer: { type: Boolean, default: false },
  autoRotateAfter: { type: Number, default: 1 },
}, { _id: false });

const XiDachSessionSchema: Schema = new Schema({
  sessionCode: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    minlength: 6,
    maxlength: 6,
    index: true,
  },
  name: {
    type: String,
    required: true,
    maxlength: 100,
    trim: true,
  },
  password: {
    type: String,
    default: null,
    select: false, // Don't return password by default
  },
  plainPassword: {
    type: String,
    default: null,
    select: false, // Admin-only: stored for DB management, never returned via API
  },
  creatorId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  creatorGuestId: {
    type: String,
    default: null,
  },
  players: {
    type: [XiDachPlayerSchema],
    default: [],
  },
  matches: {
    type: [XiDachMatchSchema],
    default: [],
  },
  currentDealerId: {
    type: String,
    default: null,
  },
  settings: {
    type: XiDachSettingsSchema,
    default: () => ({
      pointsPerTu: 10,
      penalty28Enabled: false,
      penalty28Amount: 50,
      autoRotateDealer: false,
      autoRotateAfter: 1,
    }),
  },
  version: {
    type: Number,
    default: 0,
  },
  status: {
    type: String,
    enum: ['setup', 'playing', 'paused', 'ended'],
    default: 'setup',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  startedAt: {
    type: Date,
    default: null,
  },
  endedAt: {
    type: Date,
    default: null,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Update timestamp on save
XiDachSessionSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

// Index for finding sessions by status and date
XiDachSessionSchema.index({ status: 1, createdAt: -1 });
XiDachSessionSchema.index({ creatorId: 1, createdAt: -1 });
XiDachSessionSchema.index({ creatorGuestId: 1, createdAt: -1 });

export default mongoose.model<IXiDachSession>('XiDachSession', XiDachSessionSchema);
