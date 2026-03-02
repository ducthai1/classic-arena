/**
 * TinhTuyMonopolyAlert — Notification when a player completes a color group (monopoly).
 * Shows player name, group color, property names, and +15% bonus info.
 * Auto-dismiss 7s (handled by TinhTuyContext), also dismissible by backdrop click.
 */
import React from 'react';
import { Dialog, DialogContent, Typography, Box } from '@mui/material';
import { useLanguage } from '../../../i18n';
import { useTinhTuy } from '../TinhTuyContext';
import { BOARD_CELLS, GROUP_COLORS, PLAYER_COLORS, PROPERTY_GROUPS, PropertyGroup } from '../tinh-tuy-types';

const ALL_GROUPS = Object.keys(PROPERTY_GROUPS) as PropertyGroup[];

export const TinhTuyMonopolyAlert: React.FC = () => {
  const { t } = useLanguage();
  const { state, clearMonopolyAlert } = useTinhTuy();

  const alert = state.monopolyAlert;
  if (!alert) return null;

  const player = state.players.find(p => p.slot === alert.slot);
  if (!player) return null;

  const playerColor = PLAYER_COLORS[alert.slot] || '#f39c12';
  const groupColor = GROUP_COLORS[alert.group as PropertyGroup] || '#f39c12';

  // Count how many groups this player has completed
  const completedGroups = ALL_GROUPS.filter(g =>
    PROPERTY_GROUPS[g].every(idx => player.properties.includes(idx))
  ).length;

  return (
    <Dialog
      open
      onClose={(_, reason) => { if (reason !== 'backdropClick') clearMonopolyAlert(); }}
      maxWidth="xs"
      fullWidth
      TransitionProps={{ timeout: 400 }}
      PaperProps={{
        onClick: clearMonopolyAlert,
        sx: {
          borderRadius: 3,
          borderTop: `4px solid ${groupColor}`,
          overflow: 'visible',
          cursor: 'pointer',
        },
      }}
      slotProps={{
        backdrop: { sx: { backgroundColor: 'rgba(0,0,0,0.4)' } },
      }}
    >
      <DialogContent sx={{ textAlign: 'center', py: 3 }}>
        {/* Crown icon */}
        <Box sx={{
          width: 64, height: 64, borderRadius: '50%', mx: 'auto', mb: 2,
          background: `rgba(243,156,18,0.15)`,
          border: `2px solid ${groupColor}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Typography sx={{ fontSize: 32, lineHeight: 1 }}>👑</Typography>
        </Box>

        {/* Player name */}
        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.8, mb: 1 }}>
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: playerColor }} />
          <Typography variant="h6" sx={{ fontWeight: 700, color: playerColor }}>
            {player.displayName}
          </Typography>
        </Box>

        {/* Monopoly title */}
        <Typography variant="h6" sx={{ fontWeight: 800, color: groupColor, mb: 1.5 }}>
          {t('tinhTuy.game.monopolyTitle' as any)}
        </Typography>

        {/* Property list with group color bar */}
        <Box sx={{
          display: 'flex', flexDirection: 'column', gap: 0.5, mb: 1.5,
          p: 1.5, borderRadius: 2, bgcolor: 'rgba(243,156,18,0.08)',
          border: `1px solid rgba(243,156,18,0.2)`,
        }}>
          {alert.cellIndices.map(cellIdx => {
            const cell = BOARD_CELLS[cellIdx];
            if (!cell) return null;
            return (
              <Box key={cellIdx} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{ width: 6, height: 24, bgcolor: groupColor, borderRadius: 1, flexShrink: 0 }} />
                {cell.icon && (
                  <Box component="img" src={`/location/${cell.icon}`} alt=""
                    sx={{ width: 28, height: 28, objectFit: 'contain', borderRadius: 0.5, flexShrink: 0 }} />
                )}
                <Typography variant="body2" sx={{ fontWeight: 600, textAlign: 'left' }}>
                  {t(cell.name as any)}
                </Typography>
              </Box>
            );
          })}
        </Box>

        {/* Bonus info */}
        <Box sx={{
          p: 1, borderRadius: 1.5, mb: 1.5,
          bgcolor: 'rgba(39,174,96,0.1)', border: '1px solid rgba(39,174,96,0.3)',
        }}>
          <Typography variant="body2" sx={{ color: '#27ae60', fontWeight: 700 }}>
            ⚡ {t('tinhTuy.game.monopolyBonus' as any)}
          </Typography>
        </Box>

        {/* Victory progress */}
        <Box sx={{
          p: 1, borderRadius: 1.5,
          bgcolor: 'rgba(155,89,182,0.08)', border: '1px solid rgba(155,89,182,0.2)',
        }}>
          <Typography variant="body2" sx={{ color: '#7b2d8e', fontWeight: 700, mb: 0.3 }}>
            🏆 {t('tinhTuy.game.monopolyProgress' as any, { current: String(completedGroups), total: '8' } as any)}
          </Typography>
          <Typography variant="caption" sx={{ color: '#888' }}>
            {t('tinhTuy.game.monopolyVictoryHint' as any)}
          </Typography>
        </Box>
      </DialogContent>
    </Dialog>
  );
};
