/**
 * TinhTuyBankruptAlert — Modal shown when a player goes bankrupt.
 * Shows the player name and a clear "total assets insufficient" message.
 * Auto-dismiss 3.5s (handled by TinhTuyContext).
 */
import React from 'react';
import { Dialog, DialogContent, Typography, Box } from '@mui/material';
import { useLanguage } from '../../../i18n';
import { useTinhTuy } from '../TinhTuyContext';
import { PLAYER_COLORS } from '../tinh-tuy-types';

export const TinhTuyBankruptAlert: React.FC = () => {
  const { t } = useLanguage();
  const { state, clearBankruptAlert } = useTinhTuy();

  const slot = state.bankruptAlert;
  if (slot == null) return null;

  const player = state.players.find(p => p.slot === slot);
  if (!player) return null;

  const isMe = slot === state.mySlot;
  const color = PLAYER_COLORS[slot] || '#e74c3c';

  return (
    <Dialog
      open
      onClose={(_, reason) => { if (reason !== 'backdropClick') clearBankruptAlert(); }}
      maxWidth="xs"
      fullWidth
      TransitionProps={{ timeout: 400 }}
      PaperProps={{
        onClick: clearBankruptAlert,
        sx: {
          borderRadius: 3,
          borderTop: `4px solid #e74c3c`,
          overflow: 'visible',
          cursor: 'pointer',
        },
      }}
      slotProps={{
        backdrop: { sx: { backgroundColor: 'rgba(0,0,0,0.4)' } },
      }}
    >
      <DialogContent sx={{ textAlign: 'center', py: 3 }}>
        {/* Bankrupt icon */}
        <Box sx={{
          width: 64, height: 64, borderRadius: '50%', mx: 'auto', mb: 2,
          background: 'rgba(231,76,60,0.1)',
          border: '2px solid rgba(231,76,60,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Typography sx={{ fontSize: 32, lineHeight: 1 }}>💸</Typography>
        </Box>

        {/* Player name with color */}
        <Box sx={{
          display: 'inline-flex', alignItems: 'center', gap: 0.8,
          mb: 1.5,
        }}>
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: color }} />
          <Typography variant="h6" sx={{ fontWeight: 700, color }}>
            {player.displayName}
          </Typography>
        </Box>

        {/* Bankrupt title */}
        <Typography variant="h6" sx={{
          fontWeight: 800, color: '#e74c3c', mb: 1,
        }}>
          {t('tinhTuy.game.bankruptTitle' as any)}
        </Typography>

        {/* Reason */}
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {isMe
            ? t('tinhTuy.game.bankruptReasonYou' as any)
            : t('tinhTuy.game.bankruptReasonOther' as any, { name: player.displayName } as any)
          }
        </Typography>
      </DialogContent>
    </Dialog>
  );
};
