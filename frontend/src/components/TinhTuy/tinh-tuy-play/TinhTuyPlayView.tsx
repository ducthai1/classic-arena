/**
 * TinhTuyPlayView — Full-screen game view.
 * Layout: Left panel (players + actions) | Board (with dice overlay) | Right panel (chat).
 */
import React, { useState, useEffect } from 'react';
import { Box, Button, Typography, Paper, Chip, IconButton, Tooltip } from '@mui/material';
import ConstructionIcon from '@mui/icons-material/Construction';
import ExitToAppIcon from '@mui/icons-material/ExitToApp';
import FlagIcon from '@mui/icons-material/Flag';
import EditIcon from '@mui/icons-material/Edit';
import ConfirmDialog from '../../ConfirmDialog/ConfirmDialog';
import GuestNameDialog from '../../GuestNameDialog/GuestNameDialog';
import { useLanguage } from '../../../i18n';
import { useMainLayout } from '../../MainLayout/MainLayoutContext';
import { useAuth } from '../../../contexts/AuthContext';
import { useTinhTuy } from '../TinhTuyContext';
import { PLAYER_COLORS, TinhTuyState } from '../tinh-tuy-types';
import { TinhTuyBoard } from './TinhTuyBoard';
import { TinhTuyDice3D } from './TinhTuyDice3D';
import { TinhTuyTurnTimer } from './TinhTuyTurnTimer';
import { TinhTuyActionModal } from './TinhTuyActionModal';
import { TinhTuyCardModal } from './TinhTuyCardModal';
import { TinhTuyBuildModal } from './TinhTuyBuildModal';
import { TinhTuyIslandModal, TinhTuyIslandAlert } from './TinhTuyIslandModal';
import { TinhTuyTaxAlert } from './TinhTuyTaxAlert';
import { TinhTuyRentAlert } from './TinhTuyRentAlert';
import { TinhTuyGoPopup } from './TinhTuyGoPopup';
import { TinhTuyBuildPrompt } from './TinhTuyBuildPrompt';
import { TinhTuyFreeHouseModal } from './TinhTuyFreeHouseModal';
import { TinhTuyFreeHotelModal } from './TinhTuyFreeHotelModal';
import { TinhTuyGoBonusModal } from './TinhTuyGoBonusModal';
import { TinhTuySellModal } from './TinhTuySellModal';
import { TinhTuyTravelPendingAlert } from './TinhTuyTravelPendingAlert';
import { TinhTuyBankruptAlert } from './TinhTuyBankruptAlert';
import { TinhTuyMonopolyAlert } from './TinhTuyMonopolyAlert';
import { TinhTuyGameOverModal } from './TinhTuyGameOverModal';
import { TinhTuyVolumeControl } from './TinhTuyVolumeControl';
import { TinhTuyChat, TinhTuyChatOverlay, TinhTuyFloatingReaction } from './TinhTuyChat';
import { TinhTuyAttackPropertyModal } from './TinhTuyAttackPropertyModal';
import { TinhTuyForcedTradeModal } from './TinhTuyForcedTradeModal';
import { TinhTuyRentFreezeModal } from './TinhTuyRentFreezeModal';
import { TinhTuyAttackAlert } from './TinhTuyAttackAlert';
import { TinhTuyForcedTradeAlert } from './TinhTuyForcedTradeAlert';
import { TinhTuyBuybackModal } from './TinhTuyBuybackModal';
import { TinhTuyAutoSoldAlert } from './TinhTuyAutoSoldAlert';
import { TinhTuyNearWinAlert } from './TinhTuyNearWinAlert';
import { TinhTuyBuyBlockModal } from './TinhTuyBuyBlockModal';
import { TinhTuyEminentDomainModal } from './TinhTuyEminentDomainModal';
import { TinhTuyNegotiateWizard } from './TinhTuyNegotiateWizard';
import { TinhTuyNegotiateModal } from './TinhTuyNegotiateModal';
import { TinhTuyAbilityButton } from './TinhTuyAbilityButton';
import { TinhTuyAbilityModal } from './TinhTuyAbilityModal';
import { TinhTuyOwlPickModal } from './TinhTuyOwlPickModal';
import { TinhTuyHorseAdjustModal } from './TinhTuyHorseAdjustModal';
import { TinhTuyShibaRerollModal } from './TinhTuyShibaRerollModal';
import { TinhTuyRabbitBonusModal } from './TinhTuyRabbitBonusModal';
import { TinhTuyFoxSwapAlert } from './TinhTuyFoxSwapAlert';
import { TinhTuyAbilityUsedAlert } from './TinhTuyAbilityUsedAlert';
import { TinhTuyAbilityInfoModal } from './TinhTuyAbilityInfoModal';
import HandshakeIcon from '@mui/icons-material/Handshake';
import MenuBookIcon from '@mui/icons-material/MenuBook';

/* ─── Reusable Player Card ─────────────────────────────── */
const PlayerCardInner: React.FC<{
  player: any;
  isCurrentTurn: boolean;
  isMe: boolean;
  t: (key: string) => string;
  onEditName?: () => void;
  pointNotifs?: TinhTuyState['pointNotifs'];
  displayPoints?: number;
  activePlayers?: number;
}> = ({ player, isCurrentTurn, isMe, t, onEditName, pointNotifs = [], displayPoints, activePlayers = 1 }) => {
  // Show frozen points while notifs are pending, real points after flush
  const shownPoints = displayPoints ?? player.points;
  return (
  <Paper
    elevation={isCurrentTurn ? 3 : 1}
    sx={{
      p: 1.5,
      borderRadius: 2,
      borderLeft: `4px solid ${PLAYER_COLORS[player.slot] || '#999'}`,
      opacity: player.isBankrupt ? 0.5 : 1,
      bgcolor: isCurrentTurn ? 'rgba(155,89,182,0.06)' : 'background.paper',
      transition: 'all 0.2s ease',
      position: 'relative',
      overflow: 'visible',
    }}
  >
    {/* Floating point change notifications */}
    {pointNotifs.length > 0 && (
      <Box sx={{ position: 'absolute', top: -4, right: 8, zIndex: 5 }}>
        {pointNotifs.map(n => (
          <div
            key={n.id}
            className="tt-point-notif"
            style={{ color: n.amount > 0 ? '#27ae60' : '#e74c3c' }}
          >
            {n.amount > 0 ? '+' : ''}{n.amount.toLocaleString()} TT
          </div>
        ))}
      </Box>
    )}

    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
      <Typography
        variant="subtitle2"
        sx={{
          fontWeight: 700, flex: 1,
          color: player.isBankrupt ? 'text.disabled' : 'text.primary',
          textDecoration: player.isBankrupt ? 'line-through' : 'none',
          fontSize: '0.8rem',
        }}
      >
        {player.displayName}
        {isMe && (
          <>
            <Typography component="span" variant="caption" sx={{ color: '#9b59b6', ml: 0.5 }}>
              ({t('tinhTuy.lobby.you')})
            </Typography>
            {onEditName && (
              <Tooltip title={t('game.changeGuestName') || 'Đổi tên'}>
                <IconButton size="small" onClick={onEditName} sx={{ p: 0, ml: 0.5 }}>
                  <EditIcon sx={{ fontSize: 14, color: '#9b59b6' }} />
                </IconButton>
              </Tooltip>
            )}
          </>
        )}
      </Typography>
      {isCurrentTurn && !player.isBankrupt && (
        <Chip label="🎯" size="small" sx={{ height: 20, fontSize: '0.7rem' }} />
      )}
      {!player.isConnected && !player.isBankrupt && (
        <Chip label="📡" size="small" sx={{ height: 20, fontSize: '0.6rem', bgcolor: 'rgba(231,76,60,0.15)' }} />
      )}
    </Box>
    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
      <Typography variant="caption" sx={{ fontWeight: 600, color: '#9b59b6' }}>
        🔮 {shownPoints.toLocaleString()}
      </Typography>
      <Typography variant="caption" sx={{ fontWeight: 600, color: '#27ae60' }}>
        🏠 {player.properties.length}
      </Typography>
      {player.islandTurns > 0 && (
        <Typography variant="caption" sx={{ fontWeight: 600, color: '#e67e22' }}>
          🏝️ {player.islandTurns}
        </Typography>
      )}
      {player.isBankrupt && (
        <Chip label={t('tinhTuy.game.bankrupt')} size="small"
          sx={{ height: 18, fontSize: '0.6rem', bgcolor: 'rgba(231,76,60,0.15)', color: '#e74c3c' }}
        />
      )}
    </Box>
    {/* Active buffs / held cards */}
    {!player.isBankrupt && (player.cards?.length > 0 || player.immunityNextRent || player.doubleRentTurns > 0 || player.buyBlockedTurns > 0 || player.skipNextTurn || player.abilityCooldown > 0) && (
      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
        {player.cards?.includes('shield') && (
          <Chip label={`🛡️ ${t('tinhTuy.game.buffShield')}`} size="small" sx={{ height: 18, fontSize: '0.6rem', bgcolor: 'rgba(52,152,219,0.12)', color: '#2980b9' }} />
        )}
        {player.cards?.includes('escape-island') && (
          <Chip label={`🃏 ${t('tinhTuy.game.buffEscapeIsland')}`} size="small" sx={{ height: 18, fontSize: '0.6rem', bgcolor: 'rgba(39,174,96,0.12)', color: '#27ae60' }} />
        )}
        {player.immunityNextRent && (
          <Chip label={`🛡️ ${t('tinhTuy.game.buffImmunity')}`} size="small" sx={{ height: 18, fontSize: '0.6rem', bgcolor: 'rgba(52,152,219,0.12)', color: '#2980b9' }} />
        )}
        {player.doubleRentTurns > 0 && (
          <Chip label={`⚡ ${(t as any)('tinhTuy.game.buffDoubleRent', { turns: Math.ceil(player.doubleRentTurns / activePlayers) })}`} size="small" sx={{ height: 18, fontSize: '0.6rem', bgcolor: 'rgba(155,89,182,0.12)', color: '#8e44ad' }} />
        )}
        {player.buyBlockedTurns > 0 && (
          <Chip label={`🚫 ${(t as any)('tinhTuy.game.buffBuyBlocked', { turns: player.buyBlockedTurns })}`} size="small" sx={{ height: 18, fontSize: '0.6rem', bgcolor: 'rgba(231,76,60,0.12)', color: '#c0392b' }} />
        )}
        {player.skipNextTurn && (
          <Chip label={`⏭️ ${t('tinhTuy.game.buffSkipTurn')}`} size="small" sx={{ height: 18, fontSize: '0.6rem', bgcolor: 'rgba(231,76,60,0.12)', color: '#e74c3c' }} />
        )}
        {player.abilityCooldown > 0 && (
          <Chip label={`⏳ CD ${player.abilityCooldown}`} size="small" sx={{ height: 18, fontSize: '0.6rem', bgcolor: 'rgba(155,89,182,0.12)', color: '#8e44ad' }} />
        )}
      </Box>
    )}
  </Paper>
  );
};
const PlayerCard = React.memo(PlayerCardInner);

/* ─── Main Play View ───────────────────────────────────── */
export const TinhTuyPlayView: React.FC = () => {
  const { t } = useLanguage();
  const { setFullscreen } = useMainLayout();
  const { isAuthenticated } = useAuth();
  const { state, leaveRoom, surrender, updateGuestName, openNegotiateWizard, dismissReaction } = useTinhTuy();

  useEffect(() => {
    setFullscreen(true);
    document.body.classList.add('tt-fullscreen');
    return () => { setFullscreen(false); document.body.classList.remove('tt-fullscreen'); };
  }, [setFullscreen]);

  const [buildOpen, setBuildOpen] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showAbilityInfo, setShowAbilityInfo] = useState(false);
  const [showSurrenderConfirm, setShowSurrenderConfirm] = useState(false);
  const [showNameDialog, setShowNameDialog] = useState(false);

  const isMyTurn = state.currentPlayerSlot === state.mySlot;
  const myPlayer = state.players.find(p => p.slot === state.mySlot);
  const hasProperties = myPlayer && myPlayer.properties.length > 0;
  const isBankrupt = myPlayer?.isBankrupt;

  const isGuest = !isAuthenticated;

  const handleGuestNameUpdated = (newName: string) => {
    const currentName = myPlayer?.guestName;
    if (newName && newName !== currentName) {
      updateGuestName(newName);
    }
    setShowNameDialog(false);
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: { xs: 'column', md: 'row' },
        minHeight: '100vh',
        width: '100%',
        overflow: 'hidden',
      }}
    >
      {/* ─── LEFT PANEL ─────────────────────────────── */}
      <Box
        sx={{
          width: { xs: '100%', md: 280 },
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 1.5,
          p: { xs: 1, md: 2 },
          maxHeight: { md: '100vh' },
          overflowY: 'auto',
        }}
      >
        {/* Round + Late-game badge + Volume */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: 700, color: '#9b59b6', flex: 1 }}>
            {t('tinhTuy.game.round')} {state.round}
            {state.lateGameActive && (
              <Typography
                component="span"
                variant="caption"
                sx={{ ml: 1, fontWeight: 800, color: '#e74c3c', animation: 'pulse 1.5s infinite' }}
              >
                {t('tinhTuy.game.lateGameBadge')}
              </Typography>
            )}
          </Typography>
          {state.settings?.abilitiesEnabled && (
            <Tooltip title={(t as any)('tinhTuy.abilityInfo.title')} arrow>
              <IconButton size="small" onClick={() => setShowAbilityInfo(true)} sx={{ color: '#9b59b6', p: 0.5 }}>
                <MenuBookIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
          )}
          <TinhTuyVolumeControl />
        </Box>

        {/* Turn Timer */}
        <TinhTuyTurnTimer />

        {/* All player cards — activePlayers pre-computed outside loop */}
        {(() => {
          const activeCount = state.players.filter(p => !p.isBankrupt).length || 1;
          return state.players.map((player) => (
            <PlayerCard
              key={player.slot}
              player={player}
              isCurrentTurn={state.currentPlayerSlot === player.slot}
              isMe={state.mySlot === player.slot}
              t={t as any}
              onEditName={state.mySlot === player.slot && isGuest ? () => setShowNameDialog(true) : undefined}
              pointNotifs={state.pointNotifs.filter(n => n.slot === player.slot)}
              displayPoints={state.displayPoints[player.slot]}
              activePlayers={activeCount}
            />
          ));
        })()}

        {/* Action buttons */}
        <Box sx={{ display: 'flex', gap: 1, flexDirection: 'column', mt: 'auto' }}>
          <TinhTuyAbilityButton />
          {isMyTurn && hasProperties && state.turnPhase === 'END_TURN' && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<ConstructionIcon />}
              onClick={() => setBuildOpen(true)}
              sx={{
                borderColor: '#27ae60', color: '#27ae60', fontWeight: 600,
                '&:hover': { borderColor: '#2ecc71', bgcolor: 'rgba(39,174,96,0.08)' },
              }}
            >
              {t('tinhTuy.game.build' as any)}
            </Button>
          )}
          {!isBankrupt && state.round >= 40 && !state.pendingNegotiate
            && state.negotiateCooldownUntil <= state.round && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<HandshakeIcon />}
              onClick={() => openNegotiateWizard()}
              sx={{
                borderColor: 'rgba(230,126,34,0.5)', color: '#e67e22', fontWeight: 600,
                '&:hover': { borderColor: '#d35400', bgcolor: 'rgba(230,126,34,0.08)' },
              }}
            >
              {t('tinhTuy.game.negotiate' as any)}
            </Button>
          )}
          {!isBankrupt && state.negotiateCooldownUntil > state.round && (
            <Typography variant="caption" sx={{ color: 'text.secondary', textAlign: 'center', py: 0.5 }}>
              {t('tinhTuy.game.negotiateCooldown' as any, { round: state.negotiateCooldownUntil })}
            </Typography>
          )}
          {!isBankrupt && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<FlagIcon />}
              onClick={() => setShowSurrenderConfirm(true)}
              sx={{
                borderColor: 'rgba(231,76,60,0.4)', color: '#e74c3c', fontWeight: 600,
                '&:hover': { borderColor: '#c0392b', bgcolor: 'rgba(231,76,60,0.08)' },
              }}
            >
              {t('tinhTuy.game.surrender')}
            </Button>
          )}
          <Button
            size="small"
            variant="outlined"
            startIcon={<ExitToAppIcon />}
            onClick={() => setShowLeaveConfirm(true)}
            sx={{
              borderColor: 'rgba(231,76,60,0.4)', color: '#e74c3c', fontWeight: 600,
              '&:hover': { borderColor: '#c0392b', bgcolor: 'rgba(231,76,60,0.08)' },
            }}
          >
            {t('tinhTuy.game.leave' as any)}
          </Button>
        </Box>

      </Box>

      {/* ─── CENTER: Board with dice overlay ─────────── */}
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          position: 'relative',
          pt: { xs: 1, md: 2 },
          minWidth: 0,
          maxHeight: { md: '100vh' },
          overflow: 'visible',
        }}
      >
        <TinhTuyBoard />

        {/* Dice overlay — positioned on top of board center, NOT inside 3D grid */}
        <Box
          sx={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 10,
            pointerEvents: 'auto',
          }}
        >
          <TinhTuyDice3D />
        </Box>
      </Box>

      {/* ─── RIGHT PANEL: Chat only ─────────────────── */}
      <Box
        sx={{
          width: { xs: '100%', md: 300 },
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          p: { xs: 1, md: 2 },
          height: { xs: 250, md: '100vh' },
          maxHeight: { xs: 250, md: '100vh' },
        }}
      >
        <Box sx={{ flex: 1, minHeight: 0 }}>
          <TinhTuyChat />
        </Box>
      </Box>

      {/* Surrender confirm dialog */}
      <ConfirmDialog
        open={showSurrenderConfirm}
        title={t('tinhTuy.game.surrenderConfirmTitle' as any)}
        message={t('tinhTuy.game.surrenderConfirm' as any)}
        confirmText={t('tinhTuy.game.surrender')}
        variant="warning"
        onConfirm={() => { setShowSurrenderConfirm(false); surrender(); }}
        onCancel={() => setShowSurrenderConfirm(false)}
      />

      {/* Leave confirm dialog */}
      <ConfirmDialog
        open={showLeaveConfirm}
        title={t('tinhTuy.lobby.leaveConfirmTitle')}
        message={t('tinhTuy.lobby.leaveConfirmMsg')}
        confirmText={t('tinhTuy.game.leave' as any)}
        variant="warning"
        onConfirm={() => { setShowLeaveConfirm(false); leaveRoom(); }}
        onCancel={() => setShowLeaveConfirm(false)}
      />

      {/* Modals */}
      <TinhTuyActionModal />
      <TinhTuyCardModal />
      <TinhTuyIslandModal />
      <TinhTuyIslandAlert />
      <TinhTuyTaxAlert />
      <TinhTuyRentAlert />
      <TinhTuyBuildModal open={buildOpen} onClose={() => setBuildOpen(false)} />
      <TinhTuyBuildPrompt />
      <TinhTuyFreeHouseModal />
      <TinhTuyFreeHotelModal />
      <TinhTuyGoBonusModal />
      <TinhTuySellModal />
      <TinhTuyTravelPendingAlert />
      <TinhTuyGoPopup />
      <TinhTuyBankruptAlert />
      <TinhTuyMonopolyAlert />
      <TinhTuyAttackPropertyModal />
      <TinhTuyForcedTradeModal />
      <TinhTuyRentFreezeModal />
      <TinhTuyAttackAlert />
      <TinhTuyForcedTradeAlert />
      <TinhTuyBuybackModal />
      <TinhTuyAutoSoldAlert />
      <TinhTuyNearWinAlert />
      <TinhTuyBuyBlockModal />
      <TinhTuyEminentDomainModal />
      <TinhTuyNegotiateWizard />
      <TinhTuyNegotiateModal />
      <TinhTuyAbilityModal />
      <TinhTuyOwlPickModal />
      <TinhTuyHorseAdjustModal />
      <TinhTuyShibaRerollModal />
      <TinhTuyRabbitBonusModal />
      <TinhTuyFoxSwapAlert />
      <TinhTuyAbilityUsedAlert />
      <TinhTuyAbilityInfoModal open={showAbilityInfo} onClose={() => setShowAbilityInfo(false)} />
      <TinhTuyGameOverModal />

      {/* Floating Reactions Overlay */}
      <TinhTuyChatOverlay>
        {state.reactions.map((r) => (
          <TinhTuyFloatingReaction key={r.id} reaction={r} onDismiss={dismissReaction} />
        ))}
      </TinhTuyChatOverlay>

      {/* Guest Name Edit Dialog */}
      <GuestNameDialog
        open={showNameDialog}
        onClose={handleGuestNameUpdated}
        initialName={myPlayer?.displayName || ''}
      />
    </Box>
  );
};
