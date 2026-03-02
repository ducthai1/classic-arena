/**
 * TinhTuyTravelPendingAlert — Shown when a player lands on Travel cell.
 * Tells the player they'll get to fly on their next turn.
 */
import React from 'react';
import {
  Dialog, DialogTitle, DialogContent,
  Typography, Box,
} from '@mui/material';
import FlightTakeoffIcon from '@mui/icons-material/FlightTakeoff';
import { useLanguage } from '../../../i18n';
import { useTinhTuy } from '../TinhTuyContext';
import { PLAYER_COLORS } from '../tinh-tuy-types';

export const TinhTuyTravelPendingAlert: React.FC = () => {
  const { t } = useLanguage();
  const { state, clearTravelPending } = useTinhTuy();

  const slot = state.travelPendingSlot;
  if (slot == null) return null;

  const player = state.players.find(p => p.slot === slot);
  if (!player) return null;

  const isMe = slot === state.mySlot;

  return (
    <Dialog
      open={true}
      onClose={(_, reason) => { if (reason !== 'backdropClick') clearTravelPending(); }}
      maxWidth="xs"
      fullWidth
      TransitionProps={{ timeout: 400 }}
      PaperProps={{ onClick: clearTravelPending, sx: { borderRadius: 3, borderTop: '4px solid #2ecc71', cursor: 'pointer' } }}
    >
      <DialogTitle sx={{ fontWeight: 700, textAlign: 'center', pb: 0.5 }}>
        <FlightTakeoffIcon sx={{ fontSize: 36, color: '#2ecc71', mb: 0.5 }} />
        <br />
        {isMe
          ? t('tinhTuy.game.travelPendingYou' as any)
          : t('tinhTuy.game.travelPendingOther' as any, { name: player.displayName } as any)
        }
      </DialogTitle>
      <DialogContent sx={{ textAlign: 'center', pt: 1, pb: 2.5 }}>
        <Box sx={{
          display: 'inline-flex', alignItems: 'center', gap: 0.5,
          bgcolor: `${PLAYER_COLORS[slot]}15`, borderRadius: 2, px: 2, py: 0.5, mb: 1.5,
        }}>
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: PLAYER_COLORS[slot] }} />
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {player.displayName}
          </Typography>
        </Box>

        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {isMe
            ? t('tinhTuy.game.travelPendingDescYou' as any)
            : t('tinhTuy.game.travelPendingDescOther' as any, { name: player.displayName } as any)
          }
        </Typography>
      </DialogContent>
    </Dialog>
  );
};
