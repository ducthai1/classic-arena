/**
 * TinhTuyForcedTradeAlert — Alert shown to all players when a forced trade completes.
 * Shows who traded, which properties were swapped.
 * Auto-dismisses after 6 seconds.
 */
import React, { useEffect, useRef } from 'react';
import { Dialog, Typography, Box } from '@mui/material';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import { useLanguage } from '../../../i18n';
import { useTinhTuy } from '../TinhTuyContext';
import { BOARD_CELLS, PLAYER_COLORS, GROUP_COLORS, PropertyGroup } from '../tinh-tuy-types';

const ALERT_DURATION_MS = 6000;

export const TinhTuyForcedTradeAlert: React.FC = () => {
  const { t } = useLanguage();
  const { state, clearForcedTradeAlert } = useTinhTuy();
  const clearRef = useRef(clearForcedTradeAlert);
  clearRef.current = clearForcedTradeAlert;

  const alert = state.forcedTradeAlert;
  const canShow = !!alert && !state.drawnCard && !state.pendingMove && !state.animatingToken;

  useEffect(() => {
    if (!canShow) return;
    const timer = setTimeout(() => clearRef.current(), ALERT_DURATION_MS);
    return () => clearTimeout(timer);
  }, [canShow]);

  if (!canShow) return null;

  const accentColor = '#9b59b6';
  const trader = state.players.find(p => p.slot === alert.traderSlot);
  const victim = state.players.find(p => p.slot === alert.victimSlot);
  const traderCell = BOARD_CELLS[alert.traderCell];
  const victimCell = BOARD_CELLS[alert.victimCell];

  const renderProperty = (cell: typeof BOARD_CELLS[0] | undefined, ownerSlot: number) => {
    if (!cell) return null;
    const groupColor = cell.group ? GROUP_COLORS[cell.group as PropertyGroup] : '#666';
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1, borderRadius: 1.5, bgcolor: 'rgba(155,89,182,0.06)' }}>
        <Box sx={{ width: 5, height: 32, bgcolor: groupColor, borderRadius: 1, flexShrink: 0 }} />
        {cell.icon && (
          <Box component="img" src={`/location/${cell.icon}`} alt=""
            sx={{ width: 32, height: 32, objectFit: 'contain', borderRadius: 0.5, flexShrink: 0 }} />
        )}
        <Typography variant="body2" sx={{ fontWeight: 700, flex: 1 }}>
          {t(cell.name as any)}
        </Typography>
        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: PLAYER_COLORS[ownerSlot] }} />
      </Box>
    );
  };

  return (
    <Dialog
      open={true}
      onClose={(_, reason) => { if (reason !== 'backdropClick') clearForcedTradeAlert(); }}
      maxWidth="xs"
      fullWidth
      TransitionProps={{ timeout: 400 }}
      PaperProps={{
        onClick: clearForcedTradeAlert,
        sx: {
          borderRadius: 3, overflow: 'hidden',
          borderTop: `4px solid ${accentColor}`,
          animation: 'tt-travel-pulse 1.5s ease-in-out infinite',
          cursor: 'pointer',
        },
      }}
    >
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <SwapHorizIcon sx={{ fontSize: 48, color: accentColor, mb: 0.5 }} />
        <Typography variant="h6" sx={{ fontWeight: 800, color: accentColor, mb: 1.5 }}>
          {t('tinhTuy.cards.ch23.name' as any)}
        </Typography>

        {/* Trader gives → Victim gets */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: PLAYER_COLORS[alert.traderSlot] }} />
          <Typography variant="body2" sx={{ fontWeight: 700, color: PLAYER_COLORS[alert.traderSlot] }}>
            {trader?.displayName || `P${alert.traderSlot}`}
          </Typography>
        </Box>
        {renderProperty(traderCell, alert.victimSlot)}

        <Typography variant="h6" sx={{ my: 1, color: accentColor }}>⇅</Typography>

        {/* Victim gives → Trader gets */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: PLAYER_COLORS[alert.victimSlot] }} />
          <Typography variant="body2" sx={{ fontWeight: 700, color: PLAYER_COLORS[alert.victimSlot] }}>
            {victim?.displayName || `P${alert.victimSlot}`}
          </Typography>
        </Box>
        {renderProperty(victimCell, alert.traderSlot)}
      </Box>
    </Dialog>
  );
};
