/**
 * TinhTuyAbilityUsedAlert — Dialog modal notification when any ability is used.
 * Shows caster avatar, ability name, target (when applicable), and effect details.
 * Auto-dismiss handled by parent context (5s timer).
 * Fox active is skipped here — handled by TinhTuyFoxSwapAlert with position data.
 */
import React from 'react';
import { Dialog, DialogTitle, DialogContent, Typography, Box } from '@mui/material';
import { useTinhTuy } from '../TinhTuyContext';
import { useLanguage } from '../../../i18n';
import { CHARACTER_IMAGES, PLAYER_COLORS, BOARD_CELLS } from '../tinh-tuy-types';
import { CHARACTER_ABILITIES } from '../tinh-tuy-abilities';

/** Accent color per ability type */
const ABILITY_COLORS: Record<string, string> = {
  'shiba-active': '#f39c12',
  'kungfu-active': '#e74c3c',
  'canoc-active': '#e74c3c',
  'chicken-active': '#e74c3c',
  'owl-active': '#9b59b6',
  'rabbit-active': '#9b59b6',
  'horse-active': '#9b59b6',
  'seahorse-active': '#e67e22',
  'pigfish-active': '#3498db',
  'sloth-active': '#2ecc71',
  'trau-active': '#3498db',
  'elephant-active': '#2ecc71',
};

/** Get notification i18n key + params for each abilityId */
function getNotifData(
  abilityId: string,
  payload: { slot: number; targetSlot?: number; cellIndex?: number; amount?: number },
  players: Array<{ slot: number; displayName?: string; guestName?: string; character: string }>,
  t: (key: string, params?: Record<string, string | number>) => string,
): { key: string; params: Record<string, string | number> } {
  const caster = players.find(p => p.slot === payload.slot);
  const name = caster?.displayName || caster?.guestName || `Player ${payload.slot}`;
  const target = payload.targetSlot != null ? players.find(p => p.slot === payload.targetSlot) : null;
  const targetName = target?.displayName || target?.guestName || '';
  const cell = payload.cellIndex != null ? BOARD_CELLS.find(c => c.index === payload.cellIndex) : null;
  const cellName = cell ? t(cell.name as any) : payload.cellIndex != null ? `Ô ${payload.cellIndex}` : '';

  switch (abilityId) {
    case 'shiba-active':
      return { key: 'tinhTuy.abilities.notifications.shibaReroll', params: { name } };
    case 'kungfu-active':
      return { key: 'tinhTuy.abilities.notifications.kungfuDestroy', params: { name, cell: cellName } };
    case 'canoc-active':
      return { key: 'tinhTuy.abilities.notifications.canocSteal', params: { name, target: targetName, amount: payload.amount || 0 } };
    case 'chicken-active':
      return { key: 'tinhTuy.abilities.notifications.chickenSkip', params: { name, target: targetName } };
    case 'rabbit-active':
      return { key: 'tinhTuy.abilities.notifications.rabbitTeleport', params: { name, cell: cellName } };
    case 'horse-active':
      return { key: 'tinhTuy.abilities.notifications.horseGallop', params: { name, steps: payload.amount || 0 } };
    case 'seahorse-active':
      return { key: 'tinhTuy.abilities.notifications.seahorseDraw', params: { name } };
    case 'pigfish-active':
      return { key: 'tinhTuy.abilities.notifications.pigfishDive', params: { name } };
    case 'sloth-active':
      return { key: 'tinhTuy.abilities.notifications.slothHibernate', params: { name } };
    case 'trau-active':
      return { key: 'tinhTuy.abilities.notifications.trauPlow', params: { name } };
    case 'elephant-active':
      return { key: 'tinhTuy.abilities.notifications.elephantBuild', params: { name } };
    case 'owl-active':
      return { key: 'tinhTuy.abilities.notifications.owlForce', params: { name, target: targetName } };
    default:
      return { key: 'tinhTuy.abilities.notifications.abilityUsed', params: { name, ability: abilityId } };
  }
}

/** Abilities that show a caster → target visual layout */
const TARGET_ABILITIES = new Set(['kungfu-active', 'canoc-active', 'chicken-active', 'owl-active']);

/** Avatar bubble component */
const AvatarBubble: React.FC<{ src: string; name: string; color: string; label?: string }> = ({ src, name, color, label }) => (
  <Box sx={{ textAlign: 'center', flex: 1, minWidth: 0 }}>
    <Box
      component="img"
      src={src}
      alt={name}
      sx={{ width: 52, height: 52, objectFit: 'contain', borderRadius: '50%', border: `3px solid ${color}`, mb: 0.5 }}
    />
    <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, color }} noWrap>
      {name}
    </Typography>
    {label && (
      <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
        {label}
      </Typography>
    )}
  </Box>
);

export const TinhTuyAbilityUsedAlert: React.FC = () => {
  const { t } = useLanguage();
  const { state, clearAbilityUsedAlert } = useTinhTuy();

  const alert = state.abilityUsedAlert;
  if (!alert) return null;

  // Skip fox-active — TinhTuyFoxSwapAlert handles it with richer position data
  if (alert.abilityId === 'fox-active') return null;

  const caster = state.players.find(p => p.slot === alert.slot);
  if (!caster) return null;

  const character = caster.character;
  const avatarSrc = CHARACTER_IMAGES[character as keyof typeof CHARACTER_IMAGES];
  const casterColor = PLAYER_COLORS[alert.slot] ?? '#9b59b6';
  const accent = ABILITY_COLORS[alert.abilityId] ?? '#9b59b6';

  // Ability display info
  const abilityDef = CHARACTER_ABILITIES[character as keyof typeof CHARACTER_ABILITIES];
  const abilityIcon = abilityDef?.active.icon ?? '⚡';
  const abilityName = abilityDef ? (t as any)(abilityDef.active.nameKey) : alert.abilityId;

  // Notification message
  const notif = getNotifData(alert.abilityId, alert, state.players as any, t as any);
  const message = (t as any)(notif.key, notif.params) || '';

  // Target player info (for abilities with targets)
  const hasTarget = TARGET_ABILITIES.has(alert.abilityId) && alert.targetSlot != null;
  const targetPlayer = hasTarget ? state.players.find(p => p.slot === alert.targetSlot) : null;
  const targetAvatar = targetPlayer ? CHARACTER_IMAGES[targetPlayer.character as keyof typeof CHARACTER_IMAGES] : '';
  const targetColor = targetPlayer ? (PLAYER_COLORS[targetPlayer.slot] ?? '#999') : '#999';

  // Cell info for kungfu, elephant, rabbit
  const cellInfo = alert.cellIndex != null ? BOARD_CELLS.find(c => c.index === alert.cellIndex) : null;

  return (
    <Dialog
      open={true}
      onClose={clearAbilityUsedAlert}
      maxWidth="xs"
      fullWidth
      hideBackdrop
      disableEnforceFocus
      TransitionProps={{ timeout: 300 }}
      sx={{ pointerEvents: 'none' }}
      PaperProps={{ sx: { borderRadius: 3, borderTop: `4px solid ${accent}`, pointerEvents: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.25)' } }}
    >
      <DialogTitle sx={{ fontWeight: 700, textAlign: 'center', pb: 0.5 }}>
        <Typography variant="h6" sx={{ fontWeight: 700, color: accent }}>
          {abilityIcon} {abilityName}
        </Typography>
      </DialogTitle>

      <DialogContent sx={{ textAlign: 'center', pt: 1, pb: 2.5 }}>
        {/* Description */}
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
          {message}
        </Typography>

        {/* Visual: caster → target (for targeted abilities) */}
        {hasTarget && targetPlayer ? (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5 }}>
            <AvatarBubble
              src={avatarSrc}
              name={caster.displayName || caster.guestName || ''}
              color={casterColor}
            />
            <Typography sx={{ fontSize: 24, lineHeight: 1, color: accent }}>
              {alert.abilityId === 'kungfu-active' ? '💥' :
               alert.abilityId === 'canoc-active' ? '💰' :
               alert.abilityId === 'chicken-active' ? '🚫' :
               alert.abilityId === 'owl-active' ? '📜' : '➡️'}
            </Typography>
            <AvatarBubble
              src={targetAvatar}
              name={targetPlayer.displayName || targetPlayer.guestName || ''}
              color={targetColor}
              label={alert.abilityId === 'canoc-active' ? `-${alert.amount} TT` :
                     alert.abilityId === 'kungfu-active' && cellInfo ? (t as any)(cellInfo.name) : undefined}
            />
          </Box>
        ) : (
          /* Visual: caster only (self-buff / no target) */
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
            <Box
              component="img"
              src={avatarSrc}
              alt={character}
              sx={{ width: 64, height: 64, objectFit: 'contain', borderRadius: '50%', border: `3px solid ${casterColor}` }}
            />
            <Typography variant="body2" sx={{ fontWeight: 700, color: casterColor }}>
              {caster.displayName || caster.guestName || ''}
            </Typography>
            {/* Extra detail line for specific abilities */}
            {alert.abilityId === 'trau-active' && (
              <Typography variant="body2" sx={{ fontWeight: 700, color: '#27ae60' }}>+{alert.amount || 1200} TT</Typography>
            )}
            {alert.abilityId === 'sloth-active' && (
              <Typography variant="body2" sx={{ fontWeight: 700, color: '#27ae60' }}>+{alert.amount || 1500} TT</Typography>
            )}
            {alert.abilityId === 'horse-active' && (
              <Typography variant="body2" sx={{ fontWeight: 700, color: accent }}>🎯 {alert.amount} steps</Typography>
            )}
            {alert.abilityId === 'elephant-active' && cellInfo && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                {cellInfo.icon && (
                  <Box component="img" src={`/location/${cellInfo.icon}`} alt="" sx={{ width: 24, height: 24, objectFit: 'contain', borderRadius: 1 }} />
                )}
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{(t as any)(cellInfo.name)} 🏠</Typography>
              </Box>
            )}
            {alert.abilityId === 'rabbit-active' && cellInfo && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                {cellInfo.icon && (
                  <Box component="img" src={`/location/${cellInfo.icon}`} alt="" sx={{ width: 24, height: 24, objectFit: 'contain', borderRadius: 1 }} />
                )}
                <Typography variant="body2" sx={{ fontWeight: 600 }}>→ {(t as any)(cellInfo.name)}</Typography>
              </Box>
            )}
            {alert.abilityId === 'pigfish-active' && (
              <Typography variant="body2" sx={{ fontWeight: 700, color: '#3498db' }}>🛡️ {(t as any)('tinhTuy.abilities.notifications.pigfishRentImmunity')}</Typography>
            )}
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
};
