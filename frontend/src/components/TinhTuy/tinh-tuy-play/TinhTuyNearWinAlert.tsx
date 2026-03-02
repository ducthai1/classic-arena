/**
 * TinhTuyNearWinAlert — Warning when a player is 1 property away from domination victory.
 * Shows which player, what type of near-win, and the missing cell(s).
 * Auto-dismiss 10s (handled by TinhTuyContext), dismissible by backdrop click.
 */
import React from 'react';
import { Dialog, DialogContent, Typography, Box } from '@mui/material';
import { useLanguage } from '../../../i18n';
import { useTinhTuy } from '../TinhTuyContext';
import { BOARD_CELLS, PLAYER_COLORS } from '../tinh-tuy-types';
import './tinh-tuy-board.css'; // tt-nearwin-pulse keyframes

const EDGE_LABELS = ['⬆️', '➡️', '⬇️', '⬅️'];

export const TinhTuyNearWinAlert: React.FC = () => {
  const { t } = useLanguage();
  const { state, clearNearWinWarning } = useTinhTuy();

  const warning = state.nearWinWarning;
  if (!warning) return null;

  const player = state.players.find(p => p.slot === warning.slot);
  if (!player) return null;

  const playerColor = PLAYER_COLORS[warning.slot] || '#e74c3c';
  const isEdgeBuy = warning.type === 'nearEdgeDomination';
  const isEdgeHouse = warning.type === 'nearEdgeHouseDomination';
  const isEdge = isEdgeBuy || isEdgeHouse;

  return (
    <Dialog
      open
      onClose={(_, reason) => { if (reason !== 'backdropClick') clearNearWinWarning(); }}
      maxWidth="xs"
      fullWidth
      TransitionProps={{ timeout: 400 }}
      PaperProps={{
        onClick: clearNearWinWarning,
        sx: {
          borderRadius: 3,
          borderTop: '4px solid #e74c3c',
          overflow: 'visible',
          cursor: 'pointer',
        },
      }}
      slotProps={{
        backdrop: { sx: { backgroundColor: 'rgba(0,0,0,0.45)' } },
      }}
    >
      <DialogContent sx={{ textAlign: 'center', py: 3 }}>
        {/* Warning icon */}
        <Box sx={{
          width: 64, height: 64, borderRadius: '50%', mx: 'auto', mb: 2,
          background: 'rgba(231,76,60,0.12)',
          border: '2px solid rgba(231,76,60,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'tt-nearwin-pulse 1.5s ease-in-out infinite',
        }}>
          <Typography sx={{ fontSize: 32, lineHeight: 1 }}>⚠️</Typography>
        </Box>

        {/* Player name */}
        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.8, mb: 1 }}>
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: playerColor }} />
          <Typography variant="h6" sx={{ fontWeight: 700, color: playerColor }}>
            {player.displayName}
          </Typography>
        </Box>

        {/* Warning title */}
        <Typography variant="h6" sx={{ fontWeight: 800, color: '#c0392b', mb: 1 }}>
          {t('tinhTuy.nearWin.title' as any)}
        </Typography>

        {/* Description */}
        <Typography variant="body2" sx={{ color: '#555', mb: 1.5, px: 1 }}>
          {isEdgeHouse
            ? t('tinhTuy.nearWin.edgeHouseDesc' as any, {
                edge: EDGE_LABELS[warning.edgeIndex ?? 0],
              } as any)
            : isEdgeBuy
            ? t('tinhTuy.nearWin.edgeDesc' as any, {
                edge: EDGE_LABELS[warning.edgeIndex ?? 0],
              } as any)
            : t('tinhTuy.nearWin.groupDesc' as any, {
                count: String(warning.completedGroups ?? 0),
              } as any)
          }
        </Typography>

        {/* Missing cell(s) — shown for both edge-buy and edge-house cases */}
        {isEdge && warning.missingCells && warning.missingCells.length > 0 && (
          <Box sx={{
            p: 1.5, borderRadius: 2,
            bgcolor: 'rgba(231,76,60,0.06)',
            border: '1px solid rgba(231,76,60,0.2)',
          }}>
            <Typography variant="caption" sx={{ color: '#999', fontWeight: 600, display: 'block', mb: 0.5 }}>
              {isEdgeHouse
                ? t('tinhTuy.nearWin.missingHouse' as any)
                : t('tinhTuy.nearWin.missingCell' as any)
              }
            </Typography>
            {warning.missingCells.map(cellIdx => {
              const cell = BOARD_CELLS[cellIdx];
              if (!cell) return null;
              return (
                <Box key={cellIdx} sx={{ display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'center' }}>
                  {cell.icon && (
                    <Box component="img" src={`/location/${cell.icon}`} alt=""
                      sx={{ width: 28, height: 28, objectFit: 'contain', borderRadius: 0.5 }} />
                  )}
                  <Typography variant="body2" sx={{ fontWeight: 700, color: '#c0392b' }}>
                    {t(cell.name as any)}
                  </Typography>
                </Box>
              );
            })}
          </Box>
        )}

        {!isEdge && (
          <Box sx={{
            p: 1.5, borderRadius: 2,
            bgcolor: 'rgba(231,76,60,0.06)',
            border: '1px solid rgba(231,76,60,0.2)',
          }}>
            <Typography variant="body2" sx={{ fontWeight: 700, color: '#c0392b' }}>
              {t('tinhTuy.nearWin.groupProgress' as any, {
                current: String(warning.completedGroups ?? 0),
                target: '6',
              } as any)}
            </Typography>
          </Box>
        )}
      </DialogContent>

    </Dialog>
  );
};
