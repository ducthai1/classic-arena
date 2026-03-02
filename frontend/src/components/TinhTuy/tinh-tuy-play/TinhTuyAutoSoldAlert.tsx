/**
 * TinhTuyAutoSoldAlert — Shown when timeout auto-sells buildings/properties.
 * Lists each sold item (house/hotel/property) with cell name and price. Auto-dismiss 5s.
 */
import React from 'react';
import { Dialog, DialogTitle, DialogContent, Typography, Box } from '@mui/material';
import { useLanguage } from '../../../i18n';
import { useTinhTuy } from '../TinhTuyContext';
import { BOARD_CELLS, PLAYER_COLORS } from '../tinh-tuy-types';

const TYPE_ICON: Record<string, string> = { house: '🏠', hotel: '🏨', property: '📍' };

export const TinhTuyAutoSoldAlert: React.FC = () => {
  const { t } = useLanguage();
  const { state, clearAutoSold } = useTinhTuy();
  const alert = state.autoSoldAlert;
  if (!alert) return null;

  const player = state.players.find(p => p.slot === alert.slot);
  const totalGain = alert.items.reduce((sum, it) => sum + it.price, 0);

  return (
    <Dialog
      open={true}
      onClose={(_, reason) => { if (reason !== 'backdropClick') clearAutoSold(); }}
      maxWidth="xs"
      fullWidth
      TransitionProps={{ timeout: 400 }}
      PaperProps={{ onClick: clearAutoSold, sx: { borderRadius: 3, borderTop: `4px solid ${PLAYER_COLORS[alert.slot] || '#e74c3c'}`, cursor: 'pointer' } }}
    >
      <DialogTitle sx={{ fontWeight: 700, textAlign: 'center', pb: 0.5 }}>
        <Typography variant="h6" sx={{ fontWeight: 800, color: '#e74c3c' }}>
          ⏰ {t('tinhTuy.game.autoSoldTitle' as any)}
        </Typography>
      </DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        {/* Player name */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5, mb: 1.5 }}>
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: PLAYER_COLORS[alert.slot] }} />
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {player?.displayName || `P${alert.slot}`}
          </Typography>
        </Box>

        {/* Sold items list */}
        <Box sx={{
          bgcolor: 'rgba(231,76,60,0.06)', borderRadius: 2, p: 1.5,
          border: '1px solid rgba(231,76,60,0.15)', mb: 1.5,
        }}>
          {alert.items.map((item, i) => {
            const cell = BOARD_CELLS[item.cellIndex];
            const cellName = cell ? t(cell.name as any) : `#${item.cellIndex}`;
            const icon = TYPE_ICON[item.type] || '📦';
            return (
              <Box key={i} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 0.4 }}>
                <Typography variant="body2" sx={{ color: 'text.primary', fontWeight: 600 }}>
                  {icon} {cellName}
                  {item.type !== 'property' && (
                    <Typography component="span" variant="caption" sx={{ color: 'text.secondary', ml: 0.5 }}>
                      ({t(`tinhTuy.game.autoSold${item.type.charAt(0).toUpperCase() + item.type.slice(1)}` as any)})
                    </Typography>
                  )}
                </Typography>
                <Typography variant="body2" sx={{ color: '#27ae60', fontWeight: 700, whiteSpace: 'nowrap', ml: 1 }}>
                  +{item.price.toLocaleString()} TT
                </Typography>
              </Box>
            );
          })}
        </Box>

        {/* Total */}
        <Box sx={{ textAlign: 'center' }}>
          <Typography variant="body1" sx={{ fontWeight: 800, color: '#27ae60' }}>
            {t('tinhTuy.game.autoSoldTotal' as any)}: +{totalGain.toLocaleString()} TT
          </Typography>
        </Box>
      </DialogContent>
    </Dialog>
  );
};
