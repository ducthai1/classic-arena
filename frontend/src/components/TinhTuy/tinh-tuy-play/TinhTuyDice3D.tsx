/**
 * TinhTuyDice3D — 3D dice cubes with roll animation.
 * Each cube has 6 faces with dot patterns, rotates to show correct value.
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Box, Button, Typography } from '@mui/material';
import CasinoIcon from '@mui/icons-material/Casino';
import FlightTakeoffIcon from '@mui/icons-material/FlightTakeoff';
import CelebrationIcon from '@mui/icons-material/Celebration';
import { useLanguage } from '../../../i18n';
import { useTinhTuy } from '../TinhTuyContext';
import './tinh-tuy-board.css';

// ─── Dot patterns for each face (3×3 grid positions) ────
const DOT_PATTERNS: Record<number, number[][]> = {
  1: [[1,1]],
  2: [[0,2],[2,0]],
  3: [[0,2],[1,1],[2,0]],
  4: [[0,0],[0,2],[2,0],[2,2]],
  5: [[0,0],[0,2],[1,1],[2,0],[2,2]],
  6: [[0,0],[0,2],[1,0],[1,2],[2,0],[2,2]],
};

const DiceDots: React.FC<{ count: number }> = ({ count }) => {
  const dots = DOT_PATTERNS[count] || [];
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gridTemplateRows: 'repeat(3, 1fr)',
        width: '100%',
        height: '100%',
        placeItems: 'center',
      }}
    >
      {Array.from({ length: 9 }).map((_, i) => {
        const r = Math.floor(i / 3);
        const c = i % 3;
        const hasDot = dots.some(([dr, dc]) => dr === r && dc === c);
        return hasDot ? (
          <Box key={i} className="tt-dice-dot" />
        ) : (
          <Box key={i} />
        );
      })}
    </Box>
  );
};

// ─── Face transforms: position each face of the cube ────
// Uses CSS var(--tt-dice-half) so faces adapt to mobile size (see tinh-tuy-board.css)
const FACE_TRANSFORMS: Record<number, string> = {
  1: 'rotateY(0deg)   translateZ(var(--tt-dice-half))',
  6: 'rotateY(180deg) translateZ(var(--tt-dice-half))',
  2: 'rotateY(90deg)  translateZ(var(--tt-dice-half))',
  5: 'rotateY(-90deg) translateZ(var(--tt-dice-half))',
  3: 'rotateX(-90deg) translateZ(var(--tt-dice-half))',
  4: 'rotateX(90deg)  translateZ(var(--tt-dice-half))',
};

// To show face N facing viewer — with slight 3D tilt so edges are visible
const TILT_X = -12;
const TILT_Y = 15;
const VALUE_ROTATIONS: Record<number, string> = {
  1: `rotateX(${TILT_X}deg)        rotateY(${TILT_Y}deg)`,
  2: `rotateX(${TILT_X}deg)        rotateY(${-90 + TILT_Y}deg)`,
  3: `rotateX(${90 + TILT_X}deg)   rotateY(${TILT_Y}deg)`,
  4: `rotateX(${-90 + TILT_X}deg)  rotateY(${TILT_Y}deg)`,
  5: `rotateX(${TILT_X}deg)        rotateY(${90 + TILT_Y}deg)`,
  6: `rotateX(${TILT_X}deg)        rotateY(${180 + TILT_Y}deg)`,
};

// Idle tilt — slightly more angled than result for a "resting on table" feel
const IDLE_ROTATION = 'rotateX(-20deg) rotateY(28deg)';

// ─── Single Dice Cube ───────────────────────────────────
const DiceCube: React.FC<{ value: number; isRolling: boolean; isIdle: boolean }> = ({ value, isRolling, isIdle }) => {
  return (
    <Box
      className={`tt-dice-cube ${isRolling ? 'rolling' : ''}`}
      sx={{
        transform: isRolling ? undefined : isIdle ? IDLE_ROTATION : VALUE_ROTATIONS[value] || VALUE_ROTATIONS[1],
      }}
    >
      {[1, 2, 3, 4, 5, 6].map((face) => (
        <Box
          key={face}
          className="tt-dice-face"
          sx={{ transform: FACE_TRANSFORMS[face] }}
        >
          <DiceDots count={face} />
        </Box>
      ))}
    </Box>
  );
};

// ─── Dice 3D Component ──────────────────────────────────
export const TinhTuyDice3D: React.FC = () => {
  const { t } = useLanguage();
  const { state, rollDice } = useTinhTuy();
  const [isRolling, setIsRolling] = useState(false);
  const rollTimerRef = useRef<number | null>(null);

  const isMyTurn = state.currentPlayerSlot === state.mySlot;
  const isAnimating = !!(state.pendingMove || state.animatingToken);
  const canRoll = isMyTurn && state.turnPhase === 'ROLL_DICE' && !isAnimating;

  const handleRoll = useCallback(() => {
    if (isRolling) return;
    setIsRolling(true);
    rollDice();
    // End rolling after CSS animation (1.5s) — then 0.8s CSS transition settles to result
    if (rollTimerRef.current) clearTimeout(rollTimerRef.current);
    rollTimerRef.current = window.setTimeout(() => {
      setIsRolling(false);
      rollTimerRef.current = null;
    }, 1550);
  }, [rollDice, isRolling]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (rollTimerRef.current) clearTimeout(rollTimerRef.current);
    };
  }, []);

  const dice1 = state.lastDiceResult?.dice1 || 1;
  const dice2 = state.lastDiceResult?.dice2 || 1;
  const isIdle = !state.lastDiceResult && !isRolling;
  const isDouble = state.lastDiceResult && state.lastDiceResult.dice1 === state.lastDiceResult.dice2;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
      {/* 3D Dice — shifted up to match board position */}
      <Box sx={{ display: 'flex', gap: 3, perspective: 600, py: 1, mt: { md: -4 } }}>
        <DiceCube value={dice1} isRolling={isRolling} isIdle={isIdle} />
        <DiceCube value={dice2} isRolling={isRolling} isIdle={isIdle} />
      </Box>

      {/* Doubles indicator */}
      {isDouble && !isRolling && (
        <Typography variant="caption" sx={{ color: '#e74c3c', fontWeight: 700, fontSize: '0.75rem' }}>
          DOUBLES!
        </Typography>
      )}

      {/* Roll button */}
      {canRoll && (
        <Button
          variant="contained"
          startIcon={<CasinoIcon />}
          onClick={handleRoll}
          disabled={isRolling}
          sx={{
            background: 'linear-gradient(135deg, #9b59b6 0%, #8e44ad 100%)',
            '&:hover': { background: 'linear-gradient(135deg, #8e44ad 0%, #7d3c98 100%)' },
            px: 3, py: 1, fontWeight: 700, fontSize: '0.9rem',
            borderRadius: 3,
            boxShadow: '0 4px 12px rgba(155, 89, 182, 0.4)',
          }}
        >
          {isRolling ? t('tinhTuy.game.waitingPhase') : t('tinhTuy.game.rollDice')}
        </Button>
      )}

      {/* Travel prompt */}
      {state.turnPhase === 'AWAITING_TRAVEL' && isMyTurn && !isAnimating && (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
          <Box sx={{
            display: 'flex', alignItems: 'center', gap: 1,
            bgcolor: 'rgba(46,204,113,0.12)', borderRadius: 2, px: 2, py: 1,
            border: '1px solid rgba(46,204,113,0.3)',
          }}>
            <FlightTakeoffIcon sx={{ color: '#2ecc71', fontSize: '1.2rem' }} />
            <Typography variant="body2" sx={{ color: '#27ae60', fontWeight: 700, fontSize: '0.85rem' }}>
              {t('tinhTuy.game.travelChoose' as any)}
            </Typography>
          </Box>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
            {t('tinhTuy.game.travelHint' as any)}
          </Typography>
        </Box>
      )}

      {/* Card destination prompt (Du Lich Xuyen Viet) */}
      {state.turnPhase === 'AWAITING_CARD_DESTINATION' && isMyTurn && !isAnimating && !state.drawnCard && (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
          <Box sx={{
            display: 'flex', alignItems: 'center', gap: 1,
            bgcolor: 'rgba(155,89,182,0.12)', borderRadius: 2, px: 2, py: 1,
            border: '1px solid rgba(155,89,182,0.3)',
          }}>
            <FlightTakeoffIcon sx={{ color: '#9b59b6', fontSize: '1.2rem' }} />
            <Typography variant="body2" sx={{ color: '#8e44ad', fontWeight: 700, fontSize: '0.85rem' }}>
              {t('tinhTuy.cards.chooseDestination' as any)}
            </Typography>
          </Box>
        </Box>
      )}

      {/* Festival prompt */}
      {state.turnPhase === 'AWAITING_FESTIVAL' && isMyTurn && !isAnimating && (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
          <Box sx={{
            display: 'flex', alignItems: 'center', gap: 1,
            bgcolor: 'rgba(243,156,18,0.12)', borderRadius: 2, px: 2, py: 1,
            border: '1px solid rgba(243,156,18,0.3)',
          }}>
            <CelebrationIcon sx={{ color: '#f39c12', fontSize: '1.2rem' }} />
            <Typography variant="body2" sx={{ color: '#e67e22', fontWeight: 700, fontSize: '0.85rem' }}>
              {t('tinhTuy.game.festivalPrompt' as any)}
            </Typography>
          </Box>
        </Box>
      )}

      {/* Status text */}
      {!canRoll && !isRolling && !(state.turnPhase === 'AWAITING_TRAVEL' && isMyTurn) && !(state.turnPhase === 'AWAITING_FESTIVAL' && isMyTurn) && !(state.turnPhase === 'AWAITING_CARD_DESTINATION' && isMyTurn) && !(state.turnPhase === 'AWAITING_BUILD' && isMyTurn) && !(state.turnPhase === 'AWAITING_BUYBACK' && isMyTurn) && !(state.turnPhase === 'AWAITING_SELL' && isMyTurn) && (
        <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>
          {isMyTurn
            ? state.turnPhase === 'AWAITING_ACTION'
              ? t('tinhTuy.game.chooseAction')
              : t('tinhTuy.game.waitingPhase')
            : t('tinhTuy.game.waitingTurn')
          }
        </Typography>
      )}
    </Box>
  );
};
