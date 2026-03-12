/**
 * Xi Dach Session Controller
 * Handles CRUD operations for Xi Dach score tracking sessions
 */
import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import XiDachSession from '../models/XiDachSession';
import User from '../models/User';
import { AuthRequest } from '../middleware/authMiddleware';
import { io } from '../server';

// Check if request is from an admin user (returns true if admin, false otherwise)
const isRequestFromAdmin = async (req: Request): Promise<boolean> => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return false;
    const { verifyToken } = await import('../utils/jwt');
    const decoded = verifyToken(token);
    const user = await User.findById(decoded.userId).select('role');
    return user?.role === 'admin';
  } catch {
    return false;
  }
};

// Generate unique 6-character session code
const generateSessionCode = async (): Promise<string> => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code: string;
  let exists = true;

  while (exists) {
    code = '';
    for (let i = 0; i < 6; i++) {
      code += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    const existingSession = await XiDachSession.findOne({ sessionCode: code });
    exists = !!existingSession;
  }

  return code!;
};

/**
 * Create a new Xi Dach session
 */
export const createSession = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, password, settings, guestId } = req.body;
    const authReq = req as AuthRequest;

    // Get user ID if authenticated
    let userId: string | null = null;
    try {
      const token = req.headers.authorization?.split(' ')[1];
      if (token) {
        const { verifyToken } = await import('../utils/jwt');
        const decoded = verifyToken(token);
        userId = decoded.userId;
      }
    } catch {
      // Continue as guest
    }

    const finalUserId = userId || authReq.user?.userId || null;
    const sessionCode = await generateSessionCode();

    // Hash password if provided
    let hashedPassword: string | null = null;
    if (password) {
      hashedPassword = await bcrypt.hash(password, 10);
    }

    const session = new XiDachSession({
      sessionCode,
      name: name || `Session ${sessionCode}`,
      password: hashedPassword,
      plainPassword: password || null,
      creatorId: finalUserId || null,
      creatorGuestId: finalUserId ? null : guestId || null,
      settings: settings || {},
      status: 'setup',
    });

    await session.save();

    // Emit socket event for new session
    io.emit('xi-dach-session-created', {
      sessionCode: session.sessionCode,
      name: session.name,
      hasPassword: !!session.password,
      status: session.status,
      createdAt: session.createdAt.toISOString(),
    });

    res.status(201).json({
      id: session._id.toString(),
      sessionCode: session.sessionCode,
      name: session.name,
      hasPassword: !!hashedPassword,
      players: session.players,
      matches: session.matches,
      currentDealerId: session.currentDealerId,
      settings: session.settings,
      status: session.status,
      version: session.version,
      createdAt: session.createdAt.toISOString(),
      startedAt: session.startedAt?.toISOString(),
      endedAt: session.endedAt?.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    });
  } catch (error: any) {
    console.error('[xiDach.createSession] Error:', error.message);
    res.status(500).json({ message: error.message || 'Failed to create session' });
  }
};

/**
 * Get session by code (requires password if set)
 */
export const getSession = async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionCode } = req.params;
    const { password } = req.query;

    const session = await XiDachSession.findOne({
      sessionCode: sessionCode.toUpperCase(),
    }).select('+password');

    if (!session) {
      res.status(404).json({ message: 'Session not found' });
      return;
    }

    // Admin users bypass password check
    const isAdmin = await isRequestFromAdmin(req);

    // Check password if set (skip for admin)
    if (session.password && !isAdmin) {
      if (!password) {
        res.status(401).json({
          message: 'Password required',
          requiresPassword: true,
          hasPassword: true,
        });
        return;
      }

      const isValid = await bcrypt.compare(password as string, session.password);
      if (!isValid) {
        res.status(401).json({ message: 'Invalid password' });
        return;
      }
    }

    res.json({
      id: session._id.toString(),
      sessionCode: session.sessionCode,
      name: session.name,
      hasPassword: !!session.password,
      players: session.players,
      matches: session.matches,
      currentDealerId: session.currentDealerId,
      settings: session.settings,
      status: session.status,
      version: session.version,
      createdAt: session.createdAt.toISOString(),
      startedAt: session.startedAt?.toISOString(),
      endedAt: session.endedAt?.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    });
  } catch (error: any) {
    console.error('[xiDach.getSession] Error:', error.message);
    res.status(500).json({ message: error.message || 'Failed to get session' });
  }
};

/**
 * Join session with password
 */
export const joinSession = async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionCode } = req.params;
    const { password } = req.body;

    const session = await XiDachSession.findOne({
      sessionCode: sessionCode.toUpperCase(),
    }).select('+password');

    if (!session) {
      res.status(404).json({ message: 'Session not found' });
      return;
    }

    // Admin users bypass password check
    const isAdmin = await isRequestFromAdmin(req);

    // Check password if set (skip for admin)
    if (session.password && !isAdmin) {
      if (!password) {
        res.status(401).json({
          message: 'Password required',
          requiresPassword: true,
        });
        return;
      }

      const isValid = await bcrypt.compare(password, session.password);
      if (!isValid) {
        res.status(401).json({ message: 'Invalid password' });
        return;
      }
    }

    res.json({
      id: session._id.toString(),
      sessionCode: session.sessionCode,
      name: session.name,
      hasPassword: !!session.password,
      players: session.players,
      matches: session.matches,
      currentDealerId: session.currentDealerId,
      settings: session.settings,
      status: session.status,
      version: session.version,
      createdAt: session.createdAt.toISOString(),
      startedAt: session.startedAt?.toISOString(),
      endedAt: session.endedAt?.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    });
  } catch (error: any) {
    console.error('[xiDach.joinSession] Error:', error.message);
    res.status(500).json({ message: error.message || 'Failed to join session' });
  }
};

/**
 * Update session (players, matches, settings, etc.)
 */
export const updateSession = async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionCode } = req.params;
    const updates = req.body;
    const clientVersion = typeof updates.version === 'number' ? updates.version : undefined;

    // Fields that can be updated
    const allowedUpdates = [
      'name',
      'players',
      'matches',
      'currentDealerId',
      'settings',
      'status',
      'startedAt',
      'endedAt',
    ];

    const updateData: Record<string, any> = {};
    for (const key of allowedUpdates) {
      if (updates[key] !== undefined) {
        updateData[key] = updates[key];
      }
    }

    // Build query — add version filter for optimistic locking when client sends it
    const query: Record<string, any> = { sessionCode: sessionCode.toUpperCase() };
    if (clientVersion !== undefined) {
      query.version = clientVersion;
    }

    const session = await XiDachSession.findOneAndUpdate(
      query,
      { $set: updateData, $inc: { version: 1 } },
      { new: true }
    );

    if (!session) {
      // Version mismatch — check if session exists at all
      if (clientVersion !== undefined) {
        const existing = await XiDachSession.findOne({ sessionCode: sessionCode.toUpperCase() });
        if (existing) {
          console.warn(
            `[xiDach.updateSession] Version conflict — sessionCode: ${sessionCode}, clientVersion: ${clientVersion}, serverVersion: ${existing.version}, serverMatchCount: ${existing.matches.length}`
          );
          res.status(409).json({
            message: 'Version conflict',
            serverVersion: existing.version,
            serverMatchCount: existing.matches.length,
          });
          return;
        }
      }
      res.status(404).json({ message: 'Session not found' });
      return;
    }

    const matchCount = session.matches.length;
    console.log(
      `[xiDach.updateSession] Saved — sessionCode: ${sessionCode}, version: ${session.version}, matchCount: ${matchCount}`
    );

    // Emit socket event for session update
    io.to(`xi-dach-${sessionCode.toUpperCase()}`).emit('xi-dach-session-updated', {
      sessionCode: session.sessionCode,
      players: session.players,
      matches: session.matches,
      currentDealerId: session.currentDealerId,
      settings: session.settings,
      status: session.status,
      version: session.version,
      updatedAt: session.updatedAt.toISOString(),
    });

    res.json({
      id: session._id.toString(),
      sessionCode: session.sessionCode,
      name: session.name,
      hasPassword: !!session.password,
      players: session.players,
      matches: session.matches,
      currentDealerId: session.currentDealerId,
      settings: session.settings,
      status: session.status,
      version: session.version,
      createdAt: session.createdAt.toISOString(),
      startedAt: session.startedAt?.toISOString(),
      endedAt: session.endedAt?.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    });
  } catch (error: any) {
    console.error('[xiDach.updateSession] Error:', error.message);
    res.status(500).json({ message: error.message || 'Failed to update session' });
  }
};

/**
 * Set/change session password
 */
export const setPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionCode } = req.params;
    const { password } = req.body;

    let hashedPassword: string | null = null;
    if (password && password.length >= 4) {
      hashedPassword = await bcrypt.hash(password, 10);
    }

    const session = await XiDachSession.findOneAndUpdate(
      { sessionCode: sessionCode.toUpperCase() },
      { $set: { password: hashedPassword, plainPassword: (password && password.length >= 4) ? password : null } },
      { new: true }
    );

    if (!session) {
      res.status(404).json({ message: 'Session not found' });
      return;
    }

    res.json({
      message: hashedPassword ? 'Password set successfully' : 'Password removed',
      hasPassword: !!hashedPassword,
    });
  } catch (error: any) {
    console.error('[xiDach.setPassword] Error:', error.message);
    res.status(500).json({ message: error.message || 'Failed to set password' });
  }
};

/**
 * Delete session (only creator can delete)
 */
export const deleteSession = async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionCode } = req.params;
    const { guestId } = req.body;
    const authReq = req as AuthRequest;

    // Get user ID if authenticated
    let userId: string | null = null;
    try {
      const token = req.headers.authorization?.split(' ')[1];
      if (token) {
        const { verifyToken } = await import('../utils/jwt');
        const decoded = verifyToken(token);
        userId = decoded.userId;
      }
    } catch {
      // Continue as guest
    }

    const finalUserId = userId || authReq.user?.userId || null;

    const session = await XiDachSession.findOne({
      sessionCode: sessionCode.toUpperCase(),
    });

    if (!session) {
      res.status(404).json({ message: 'Session not found' });
      return;
    }

    // Check if user is the creator
    const isCreator = finalUserId
      ? session.creatorId && session.creatorId.toString() === finalUserId.toString()
      : session.creatorGuestId === guestId;

    if (!isCreator) {
      res.status(403).json({ message: 'Only the creator can delete this session' });
      return;
    }

    await XiDachSession.findOneAndDelete({
      sessionCode: sessionCode.toUpperCase(),
    });

    // Emit socket event for session deletion
    io.emit('xi-dach-session-deleted', {
      sessionCode: session.sessionCode,
    });

    console.log(`[xiDach.deleteSession] Session deleted by creator - sessionCode: ${sessionCode}, userId: ${finalUserId}, guestId: ${guestId}`);

    res.json({ message: 'Session deleted successfully' });
  } catch (error: any) {
    console.error('[xiDach.deleteSession] Error:', error.message);
    res.status(500).json({ message: error.message || 'Failed to delete session' });
  }
};

/**
 * Get all public sessions (for session list)
 */
export const getSessions = async (req: Request, res: Response): Promise<void> => {
  try {
    const { limit = 50, status } = req.query;

    const query: Record<string, any> = {};
    if (status) {
      query.status = status;
    }

    const sessions = await XiDachSession.find(query)
      .select('+password') // Include password to check hasPassword
      .sort({ updatedAt: -1 })
      .limit(Number(limit));

    res.json({
      sessions: sessions.map((s) => ({
        id: s._id.toString(),
        sessionCode: s.sessionCode,
        name: s.name,
        hasPassword: !!s.password, // Check if password exists (don't return actual password)
        playerCount: s.players.filter((p) => p.isActive).length,
        matchCount: s.matches.length,
        status: s.status,
        version: s.version,
        creatorId: s.creatorId ? s.creatorId.toString() : null,
        creatorGuestId: s.creatorGuestId || null,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      })),
    });
  } catch (error: any) {
    console.error('[xiDach.getSessions] Error:', error.message);
    res.status(500).json({ message: error.message || 'Failed to get sessions' });
  }
};
