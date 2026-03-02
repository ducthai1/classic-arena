/**
 * TinhTuyTaxAlert — Modal shown when a player lands on Tax cell.
 * Displays per-building tax breakdown with auto-dismiss.
 */
import React from 'react';
import { Dialog, DialogTitle, DialogContent, Typography, Box } from '@mui/material';
import { useLanguage } from '../../../i18n';
import { useTinhTuy } from '../TinhTuyContext';
import { PLAYER_COLORS } from '../tinh-tuy-types';

export const TinhTuyTaxAlert: React.FC = () => {
  const { t } = useLanguage();
  const { state, clearTaxAlert } = useTinhTuy();

  const tax = state.taxAlert;
  if (!tax) return null;

  const player = state.players.find(p => p.slot === tax.slot);
  if (!player) return null;

  const isMe = tax.slot === state.mySlot;
  const hasBuildings = tax.houseCount > 0 || tax.hotelCount > 0;

  return (
    <Dialog
      open={true}
      onClose={(_, reason) => { if (reason !== 'backdropClick') clearTaxAlert(); }}
      maxWidth="xs"
      fullWidth
      TransitionProps={{ timeout: 400 }}
      PaperProps={{ onClick: clearTaxAlert, sx: { borderRadius: 3, borderTop: '4px solid #e74c3c', cursor: 'pointer' } }}
    >
      <DialogTitle sx={{ fontWeight: 700, textAlign: 'center', pb: 0.5 }}>
        <Box
          component="img"
          src="/location/thue.png"
          alt=""
          sx={{ width: 48, height: 48, objectFit: 'contain', display: 'block', mx: 'auto', mb: 1, borderRadius: 1 }}
        />
        {t('tinhTuy.game.taxTitle' as any)}
      </DialogTitle>
      <DialogContent sx={{ textAlign: 'center', pt: 1 }}>
        {/* Player badge */}
        <Box sx={{
          display: 'inline-flex', alignItems: 'center', gap: 0.5,
          bgcolor: `${PLAYER_COLORS[tax.slot]}15`, borderRadius: 2, px: 2, py: 0.5, mb: 1.5,
        }}>
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: PLAYER_COLORS[tax.slot] }} />
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {player.displayName}
          </Typography>
        </Box>

        {hasBuildings ? (
          <Box sx={{
            bgcolor: 'rgba(231,76,60,0.06)', borderRadius: 2, p: 1.5, mt: 1,
            border: '1px solid rgba(231,76,60,0.15)',
          }}>
            {/* Breakdown */}
            {tax.houseCount > 0 && (
              <Typography variant="body2" sx={{ color: 'text.secondary', mb: 0.5 }}>
                🏠 {tax.houseCount} {t('tinhTuy.game.taxHouses' as any)} × {tax.perHouse.toLocaleString()} = {(tax.houseCount * tax.perHouse).toLocaleString()} TT
              </Typography>
            )}
            {tax.hotelCount > 0 && (
              <Typography variant="body2" sx={{ color: 'text.secondary', mb: 0.5 }}>
                🏨 {tax.hotelCount} {t('tinhTuy.game.taxHotels' as any)} × {tax.perHotel.toLocaleString()} = {(tax.hotelCount * tax.perHotel).toLocaleString()} TT
              </Typography>
            )}
            <Box sx={{ borderTop: '1px solid rgba(0,0,0,0.1)', mt: 1, pt: 1 }}>
              <Typography variant="h6" sx={{ color: '#e74c3c', fontWeight: 800 }}>
                -{tax.amount.toLocaleString()} TT
              </Typography>
            </Box>
          </Box>
        ) : (
          <Typography variant="body2" sx={{ color: '#27ae60', fontWeight: 600, mt: 1 }}>
            {isMe
              ? t('tinhTuy.game.taxNoneYou' as any)
              : t('tinhTuy.game.taxNoneOther' as any, { name: player.displayName } as any)
            }
          </Typography>
        )}
      </DialogContent>
    </Dialog>
  );
};
