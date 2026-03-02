/**
 * TinhTuyAttackAlert — Alert shown to all players when a property is attacked.
 * Shows victim name, property name, and what happened (destroyed/downgraded/shielded).
 * Waits until card modal is dismissed before rendering to avoid z-index/overlap issues.
 * Auto-dismisses after 8 seconds (timer starts when actually visible).
 */
import React, { useEffect, useRef } from 'react';
import { Dialog, Typography, Box } from '@mui/material';
import WhatshotIcon from '@mui/icons-material/Whatshot';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import ShieldIcon from '@mui/icons-material/Shield';
import { useLanguage } from '../../../i18n';
import { useTinhTuy } from '../TinhTuyContext';
import { BOARD_CELLS, PLAYER_COLORS } from '../tinh-tuy-types';

const ALERT_DURATION_MS = 8000;

export const TinhTuyAttackAlert: React.FC = () => {
  const { t } = useLanguage();
  const { state, clearAttackAlert } = useTinhTuy();
  const clearRef = useRef(clearAttackAlert);
  clearRef.current = clearAttackAlert;

  const alert = state.attackAlert;
  // Gate: don't show while card modal or movement animation is still active
  const canShow = !!alert && !state.drawnCard && !state.pendingMove && !state.animatingToken;

  // Auto-dismiss timer starts when alert becomes VISIBLE (canShow), not when attackAlert is set.
  // This ensures full 8s display time even if the alert was set while card modal was still open.
  useEffect(() => {
    if (!canShow) return;
    const timer = setTimeout(() => clearRef.current(), ALERT_DURATION_MS);
    return () => clearTimeout(timer);
  }, [canShow]);

  if (!canShow) return null;

  const victim = state.players.find(p => p.slot === alert.victimSlot);
  const cell = BOARD_CELLS.find(c => c.index === alert.cellIndex);
  const victimColor = PLAYER_COLORS[alert.victimSlot] || '#999';
  const isShielded = alert.result === 'shielded';
  const isDestroy = alert.result === 'destroyed' || alert.result === 'demolished';
  const accentColor = isShielded ? '#3498db' : isDestroy ? '#e74c3c' : '#e67e22';

  // Build description
  let description: string;
  if (isShielded) {
    description = t('tinhTuy.game.attackResultShielded' as any);
  } else if (alert.result === 'destroyed') {
    description = t('tinhTuy.game.attackResultDestroyed' as any);
  } else if (alert.result === 'demolished') {
    description = t('tinhTuy.game.attackResultDemolished' as any);
  } else {
    // downgraded
    if (alert.prevHotel) {
      description = t('tinhTuy.game.attackResultHotelRemoved' as any);
    } else {
      description = t('tinhTuy.game.attackResultHouseRemoved' as any);
    }
  }

  return (
    <Dialog
      open={true}
      onClose={(_, reason) => { if (reason !== 'backdropClick') clearAttackAlert(); }}
      maxWidth="xs"
      fullWidth
      TransitionProps={{ timeout: 400 }}
      PaperProps={{
        onClick: clearAttackAlert,
        sx: {
          borderRadius: 3, overflow: 'hidden',
          borderTop: `4px solid ${accentColor}`,
          animation: 'tt-travel-pulse 1.5s ease-in-out infinite',
          cursor: 'pointer',
        },
      }}
    >
      <Box sx={{ p: 3, textAlign: 'center' }}>
        {/* Icon */}
        {isShielded
          ? <ShieldIcon sx={{ fontSize: 48, color: accentColor, mb: 1 }} />
          : isDestroy
            ? <WhatshotIcon sx={{ fontSize: 48, color: accentColor, mb: 1 }} />
            : <TrendingDownIcon sx={{ fontSize: 48, color: accentColor, mb: 1 }} />
        }

        {/* Title */}
        <Typography variant="h6" sx={{ fontWeight: 800, color: accentColor, mb: 1 }}>
          {isShielded
            ? t('tinhTuy.game.attackAlertShieldedTitle' as any)
            : isDestroy
              ? t('tinhTuy.game.attackAlertDestroyTitle' as any)
              : t('tinhTuy.game.attackAlertDowngradeTitle' as any)}
        </Typography>

        {/* Victim */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5, mb: 1 }}>
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: victimColor }} />
          <Typography variant="body1" sx={{ fontWeight: 700, color: victimColor }}>
            {victim?.displayName || `P${alert.victimSlot}`}
          </Typography>
        </Box>

        {/* Property */}
        <Box sx={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1,
          p: 1.5, borderRadius: 2, bgcolor: `${accentColor}10`, mb: 1.5,
        }}>
          {cell?.icon && (
            <Box component="img" src={`/location/${cell.icon}`} alt=""
              sx={{ width: 40, height: 40, objectFit: 'contain', borderRadius: 1 }} />
          )}
          <Typography variant="body1" sx={{ fontWeight: 700 }}>
            {cell ? t(cell.name as any) : `Cell #${alert.cellIndex}`}
          </Typography>
        </Box>

        {/* Description */}
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {description}
        </Typography>

        {/* Before → After */}
        {alert.result === 'downgraded' && (
          <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
            <Typography variant="caption" sx={{ color: 'text.disabled' }}>
              {alert.prevHotel ? '🏨' : `🏠 x${alert.prevHouses}`}
            </Typography>
            <Typography variant="caption" sx={{ color: accentColor, fontWeight: 700 }}>→</Typography>
            <Typography variant="caption" sx={{ fontWeight: 600 }}>
              {alert.newHotel ? '🏨' : alert.newHouses > 0 ? `🏠 x${alert.newHouses}` : '📍'}
            </Typography>
          </Box>
        )}
      </Box>
    </Dialog>
  );
};
