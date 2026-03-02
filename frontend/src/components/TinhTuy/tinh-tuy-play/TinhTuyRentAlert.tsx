/**
 * TinhTuyRentAlert — Modal shown when a player lands on another's property.
 * Shows who pays whom, the property cell icon, and the rent amount. Auto-dismiss 4s.
 */
import React from 'react';
import { Dialog, DialogTitle, DialogContent, Typography, Box } from '@mui/material';
import { useLanguage } from '../../../i18n';
import { useTinhTuy } from '../TinhTuyContext';
import { PLAYER_COLORS, BOARD_CELLS } from '../tinh-tuy-types';

export const TinhTuyRentAlert: React.FC = () => {
  const { t } = useLanguage();
  const { state, clearRentAlert } = useTinhTuy();

  const rent = state.rentAlert;
  if (!rent) return null;

  const payer = state.players.find(p => p.slot === rent.fromSlot);
  const owner = state.players.find(p => p.slot === rent.toSlot);
  if (!payer || !owner) return null;

  const cell = BOARD_CELLS[rent.cellIndex];
  const isMe = rent.fromSlot === state.mySlot;
  const cellName = cell ? t(cell.name as any) : '';

  return (
    <Dialog
      open={true}
      onClose={(_, reason) => { if (reason !== 'backdropClick') clearRentAlert(); }}
      maxWidth="xs"
      fullWidth
      TransitionProps={{ timeout: 400 }}
      PaperProps={{ onClick: clearRentAlert, sx: { borderRadius: 3, borderTop: `4px solid ${PLAYER_COLORS[rent.toSlot] || '#9b59b6'}`, cursor: 'pointer' } }}
    >
      <DialogTitle sx={{ fontWeight: 700, textAlign: 'center', pb: 0.5 }}>
        {cell?.icon && (
          <Box
            component="img"
            src={`/location/${cell.icon}`}
            alt=""
            sx={{ width: 48, height: 48, objectFit: 'contain', display: 'block', mx: 'auto', mb: 1, borderRadius: 1 }}
          />
        )}
        {t('tinhTuy.game.rentTitle' as any)}
      </DialogTitle>
      <DialogContent sx={{ textAlign: 'center', pt: 1 }}>
        {/* Description: who pays whom */}
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
          {isMe
            ? t('tinhTuy.game.rentYouPay' as any)
            : t('tinhTuy.game.rentOtherPays' as any, { name: payer.displayName } as any)
          }
        </Typography>

        {/* Owner badge */}
        <Box sx={{
          display: 'inline-flex', alignItems: 'center', gap: 0.5,
          bgcolor: `${PLAYER_COLORS[rent.toSlot]}15`, borderRadius: 2, px: 2, py: 0.5, mb: 1.5,
        }}>
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: PLAYER_COLORS[rent.toSlot] }} />
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {owner.displayName}
          </Typography>
        </Box>

        {/* Property + amount */}
        <Box sx={{
          bgcolor: 'rgba(155,89,182,0.06)', borderRadius: 2, p: 1.5, mt: 1,
          border: '1px solid rgba(155,89,182,0.15)',
        }}>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 0.5 }}>
            🏘️ {cellName}
          </Typography>
          <Typography variant="h6" sx={{ color: '#e74c3c', fontWeight: 800 }}>
            -{rent.amount.toLocaleString()} TT
          </Typography>
        </Box>
      </DialogContent>
    </Dialog>
  );
};
