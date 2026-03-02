/**
 * WordChainWaitingRoom - View after creating/joining a room.
 * Desktop: centered card layout with room code, settings, players, actions.
 * Mobile: stacked single column.
 */
import React, { useState } from 'react';
import {
  Box, Typography, Paper, Button, Chip, IconButton, Tooltip,
  Dialog, DialogTitle, DialogContent, DialogActions, CircularProgress,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ExitToAppIcon from '@mui/icons-material/ExitToApp';
import PersonIcon from '@mui/icons-material/Person';
import PersonRemoveIcon from '@mui/icons-material/PersonRemove';
import FavoriteIcon from '@mui/icons-material/Favorite';
import WifiIcon from '@mui/icons-material/Wifi';
import WifiOffIcon from '@mui/icons-material/WifiOff';
import PhoneIphoneIcon from '@mui/icons-material/PhoneIphone';
import TabletMacIcon from '@mui/icons-material/TabletMac';
import LaptopMacIcon from '@mui/icons-material/LaptopMac';
import SettingsIcon from '@mui/icons-material/Settings';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import { useLanguage } from '../../../i18n';
import { useWordChain } from '../WordChainContext';
import { useToast } from '../../../contexts/ToastContext';
import { useAuth } from '../../../contexts/AuthContext';
import { WordType, WordChainGameMode } from '../word-chain-types';
import { WordChainSettingsForm } from './WordChainSettingsForm';
import ConfirmDialog from '../../ConfirmDialog/ConfirmDialog';
import GuestNameDialog from '../../GuestNameDialog/GuestNameDialog';
import { ChatButton, FloatingChatMessage, WordChainChatOverlay } from '../word-chain-game/WordChainChat';

export const WordChainWaitingRoom: React.FC = () => {
  const { t } = useLanguage();

  const WORD_TYPE_LABELS: Record<string, string> = {
    '2+': t('wordChain.wordType2Plus'),
    '3+': t('wordChain.wordType3Plus'),
    'all': t('wordChain.wordTypeAll'),
  };
  const toast = useToast();
  const { state, startGame, leaveRoom, kickPlayer, updateRoom, updateGuestName, sendChat, clearChat } = useWordChain();
  const { isAuthenticated } = useAuth();
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [kickTarget, setKickTarget] = useState<{ slot: number; name: string } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showGuestNameDialog, setShowGuestNameDialog] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  // Edit settings state (initialized when dialog opens)
  const [editMaxPlayers, setEditMaxPlayers] = useState(state.maxPlayers);
  const [editWordType, setEditWordType] = useState<WordType>(state.rules?.wordType || '2+');
  const [editGameMode, setEditGameMode] = useState<WordChainGameMode>(state.rules?.gameMode || 'classic');
  const [editTurnDuration, setEditTurnDuration] = useState(state.rules?.turnDuration || 60);
  const [editLives, setEditLives] = useState(state.rules?.lives || 3);
  const [editAllowRepeat, setEditAllowRepeat] = useState(state.rules?.allowRepeat || false);
  const [editShowHint, setEditShowHint] = useState(state.rules?.showHint !== false);
  const [editPassword, setEditPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const openSettings = () => {
    setEditMaxPlayers(state.maxPlayers);
    setEditWordType(state.rules?.wordType || '2+');
    setEditGameMode(state.rules?.gameMode || 'classic');
    setEditTurnDuration(state.rules?.turnDuration || 60);
    setEditLives(state.rules?.lives || 3);
    setEditAllowRepeat(state.rules?.allowRepeat || false);
    setEditShowHint(state.rules?.showHint !== false);
    setEditPassword('');
    setShowSettings(true);
  };

  const handleSaveSettings = async () => {
    setIsSaving(true);
    const success = await updateRoom({
      maxPlayers: editMaxPlayers,
      rules: {
        wordType: editWordType,
        gameMode: editGameMode,
        turnDuration: editTurnDuration,
        lives: editLives,
        allowRepeat: editAllowRepeat,
        showHint: editShowHint,
      },
      password: editPassword || undefined,
    });
    setIsSaving(false);
    if (success) setShowSettings(false);
  };

  const handleRemovePassword = async () => {
    setIsSaving(true);
    const success = await updateRoom({ password: null });
    setIsSaving(false);
    if (success) setShowSettings(false);
  };

  const handleGuestNameUpdated = (newName: string) => {
    const currentName = state.players.find(p => p.slot === state.mySlot)?.guestName;
    if (newName && newName !== currentName) {
      updateGuestName(newName);
    }
    setShowGuestNameDialog(false);
  };

  const canStart = state.isHost && state.players.length >= 2 && !isStarting;

  const handleStartGame = async () => {
    if (isStarting) return;
    setIsStarting(true);
    const success = await startGame();
    // Reset on failure; on success the view switches to 'playing' and this component unmounts
    if (!success) setIsStarting(false);
  };

  const handleCopyCode = async () => {
    if (state.roomCode) {
      await navigator.clipboard.writeText(state.roomCode);
      toast.success('toast.codeCopied');
    }
  };

  return (
    <Box
      sx={{
        p: { xs: 2, sm: 3, md: 4 },
        pt: { xs: '96px', md: 4 },
        maxWidth: 760,
        mx: 'auto',
        minHeight: '100vh',
      }}
    >
      {/* Room Code + Settings — single card */}
      <Paper
        elevation={2}
        sx={{
          p: { xs: 2.5, sm: 3 },
          mb: 3,
          borderRadius: 4,
          background: 'linear-gradient(135deg, rgba(46, 204, 113, 0.04) 0%, rgba(39, 174, 96, 0.07) 100%)',
          position: 'relative',
        }}
      >
        {/* Top right actions: chat + settings */}
        <Box sx={{ position: 'absolute', top: 8, right: 8, display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <ChatButton onSend={sendChat} />
          {state.isHost && (
            <Tooltip title={t('wordChain.editSettings')}>
              <IconButton
                onClick={openSettings}
                size="small"
                sx={{ color: '#2ecc71' }}
              >
                <SettingsIcon sx={{ fontSize: 20 }} />
              </IconButton>
            </Tooltip>
          )}
        </Box>

        {/* Room Code */}
        <Box sx={{ textAlign: 'center', mb: 2 }}>
          <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            {t('wordChain.roomCode')}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
            <Typography
              sx={{
                fontWeight: 800,
                fontFamily: 'monospace',
                letterSpacing: '0.2em',
                color: '#2ecc71',
                fontSize: { xs: '1.8rem', sm: '2.2rem' },
              }}
            >
              {state.roomCode}
            </Typography>
            <Tooltip title={t('wordChain.copyCode')}>
              <IconButton onClick={handleCopyCode} size="small">
                <ContentCopyIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
          </Box>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {t('wordChain.shareCode')}
          </Typography>
        </Box>

        {/* Settings chips — inline */}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, justifyContent: 'center' }}>
          <Chip
            label={`${state.players.length}/${state.maxPlayers} ${t('wordChain.playersLabel').charAt(0).toUpperCase() + t('wordChain.playersLabel').slice(1)}`}
            size="small"
            sx={{ fontWeight: 600, bgcolor: 'rgba(52, 152, 219, 0.12)', color: '#2980b9', border: '1px solid rgba(52, 152, 219, 0.25)' }}
          />
          <Chip
            label={WORD_TYPE_LABELS[state.rules?.wordType || '2+'] || state.rules?.wordType}
            size="small"
            sx={{ fontWeight: 600, bgcolor: 'rgba(155, 89, 182, 0.12)', color: '#8e44ad', border: '1px solid rgba(155, 89, 182, 0.25)' }}
          />
          <Chip
            label={`${state.rules?.turnDuration || 60}s`}
            size="small"
            sx={{ fontWeight: 600, bgcolor: 'rgba(230, 126, 34, 0.12)', color: '#d35400', border: '1px solid rgba(230, 126, 34, 0.25)' }}
          />
          <Chip
            label={`${state.rules?.lives || 3} ${t('wordChain.livesLabel')}`}
            size="small"
            icon={<FavoriteIcon sx={{ fontSize: '14px !important', color: '#e74c3c !important' }} />}
            sx={{ fontWeight: 600, bgcolor: 'rgba(231, 76, 60, 0.12)', color: '#c0392b', border: '1px solid rgba(231, 76, 60, 0.25)' }}
          />
          <Chip
            label={state.rules?.gameMode === 'speed' ? t('wordChain.modeSpeed') : t('wordChain.modeClassic')}
            size="small"
            sx={{ fontWeight: 600, bgcolor: 'rgba(46, 204, 113, 0.12)', color: '#27ae60', border: '1px solid rgba(46, 204, 113, 0.25)' }}
          />
          {state.rules?.allowRepeat && (
            <Chip
              label={t('wordChain.allowRepeat')}
              size="small"
              sx={{ fontWeight: 600, bgcolor: 'rgba(241, 196, 15, 0.12)', color: '#f39c12', border: '1px solid rgba(241, 196, 15, 0.25)' }}
            />
          )}
        </Box>
      </Paper>

      {/* Players List */}
      <Paper elevation={1} sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: 3, mb: 3 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5, textTransform: 'capitalize' }}>
          {t('wordChain.playersLabel')} ({state.players.length}/{state.maxPlayers})
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {state.players.map((player, idx) => (
            <Box
              key={player.slot}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                p: 1.5,
                borderRadius: 2,
                bgcolor: player.slot === state.mySlot ? 'rgba(46, 204, 113, 0.08)' : 'rgba(0,0,0,0.02)',
                border: '1px solid',
                borderColor: player.slot === state.mySlot ? 'rgba(46, 204, 113, 0.3)' : 'transparent',
              }}
            >
              {/* Slot number */}
              <Box
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: '#2ecc71',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  flexShrink: 0,
                }}
              >
                {player.slot}
              </Box>

              {/* Name */}
              <Box sx={{ flex: 1, fontWeight: player.slot === state.mySlot ? 700 : 500, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.5, fontSize: '1rem' }}>
                <span>{player.name || player.guestName || 'Player'}</span>
                {player.slot === state.mySlot && !isAuthenticated && (
                  <Tooltip title={t('wordChain.editName') || 'Edit Name'}>
                    <IconButton
                      size="small"
                      onClick={() => setShowGuestNameDialog(true)}
                      sx={{ p: 0.5, color: 'text.secondary', '&:hover': { color: '#2ecc71' } }}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
                {player.slot === state.mySlot && (
                  <Typography component="span" variant="caption" sx={{ color: '#2ecc71' }}>
                    ({t('wordChain.you')})
                  </Typography>
                )}
                {player.isHost && (
                  <Chip label={t('wordChain.host')} size="small" sx={{ height: 20, fontSize: '0.65rem' }} />
                )}
              </Box>

              {/* Connection + Device */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                {player.isConnected ? (
                  <WifiIcon sx={{ fontSize: 18, color: '#2ecc71' }} />
                ) : (
                  <WifiOffIcon sx={{ fontSize: 18, color: '#e74c3c' }} />
                )}
                <Tooltip title={player.deviceType === 'mobile' ? t('common.device.mobile' as any) : player.deviceType === 'tablet' ? t('common.device.tablet' as any) : t('common.device.desktop' as any)}>
                  <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center' }}>
                    {player.deviceType === 'mobile' ? (
                      <PhoneIphoneIcon sx={{ fontSize: 16, color: '#3498db' }} />
                    ) : player.deviceType === 'tablet' ? (
                      <TabletMacIcon sx={{ fontSize: 16, color: '#9b59b6' }} />
                    ) : (
                      <LaptopMacIcon sx={{ fontSize: 16, color: '#7f8c8d' }} />
                    )}
                  </Box>
                </Tooltip>
              </Box>

              {/* Kick button — host only, not self */}
              {state.isHost && player.slot !== state.mySlot && (
                <Tooltip title={t('wordChain.kick')}>
                  <IconButton
                    size="small"
                    onClick={() => setKickTarget({ slot: player.slot, name: player.name || player.guestName || 'Player' })}
                    sx={{
                      color: '#e74c3c',
                      '&:hover': { bgcolor: 'rgba(231, 76, 60, 0.1)' },
                    }}
                  >
                    <PersonRemoveIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
          ))}

          {/* Empty slots */}
          {Array.from({ length: state.maxPlayers - state.players.length }).map((_, i) => (
            <Box
              key={`empty-${i}`}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                p: 1.5,
                borderRadius: 2,
                bgcolor: 'rgba(0,0,0,0.02)',
                border: '1px dashed rgba(0,0,0,0.1)',
              }}
            >
              <PersonIcon sx={{ fontSize: 20, color: '#ccc' }} />
              <Typography variant="body2" sx={{ color: 'text.disabled' }}>
                {t('wordChain.waitingForPlayer')}
              </Typography>
            </Box>
          ))}
        </Box>
      </Paper>

      {/* Actions */}
      <Box sx={{ display: 'flex', gap: 2 }}>
        {state.isHost && (
          <Button
            variant="contained"
            startIcon={isStarting ? <CircularProgress size={20} color="inherit" /> : <PlayArrowIcon />}
            onClick={handleStartGame}
            disabled={!canStart}
            sx={{
              background: canStart
                ? 'linear-gradient(135deg, #2ecc71 0%, #27ae60 100%)'
                : undefined,
              '&:hover': canStart
                ? { background: 'linear-gradient(135deg, #27ae60 0%, #219a52 100%)' }
                : undefined,
              py: 1.25,
              px: 4,
              fontWeight: 700,
              whiteSpace: 'nowrap',
              flex: 1,
            }}
          >
            {isStarting
              ? t('wordChain.starting') || 'Starting...'
              : canStart
              ? t('wordChain.startGame')
              : t('wordChain.waitingForPlayers')}
          </Button>
        )}
        <Button
          variant="outlined"
          startIcon={<ExitToAppIcon />}
          onClick={() => setShowLeaveConfirm(true)}
          sx={{
            borderColor: '#e74c3c',
            color: '#e74c3c',
            '&:hover': { borderColor: '#c0392b', background: 'rgba(231, 76, 60, 0.08)' },
            py: 1.25,
            px: 3,
            whiteSpace: 'nowrap',
            minWidth: 120,
            flex: state.isHost ? undefined : 1,
          }}
        >
          {t('wordChain.leave')}
        </Button>
      </Box>

      {/* Leave confirmation dialog */}
      <ConfirmDialog
        open={showLeaveConfirm}
        title={t('wordChain.leaveConfirmTitle')}
        message={t('wordChain.leaveConfirmMsg')}
        confirmText={t('wordChain.leave')}
        variant="warning"
        onConfirm={() => { setShowLeaveConfirm(false); leaveRoom(); }}
        onCancel={() => setShowLeaveConfirm(false)}
      />

      {/* Kick confirmation dialog */}
      <ConfirmDialog
        open={!!kickTarget}
        title={t('wordChain.kickConfirmTitle')}
        message={t('wordChain.kickConfirmMsg').replace('{name}', kickTarget?.name || '')}
        confirmText={t('wordChain.kick')}
        variant="danger"
        onConfirm={() => { if (kickTarget) kickPlayer(kickTarget.slot); setKickTarget(null); }}
        onCancel={() => setKickTarget(null)}
      />

      {/* Edit Settings Dialog */}
      <Dialog
        open={showSettings}
        onClose={() => setShowSettings(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, maxHeight: '90vh' } }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', pb: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, flex: 1 }}>
            {t('wordChain.editSettings')}
          </Typography>
          <IconButton onClick={() => setShowSettings(false)} size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <WordChainSettingsForm
            maxPlayers={editMaxPlayers} setMaxPlayers={setEditMaxPlayers}
            wordType={editWordType} setWordType={setEditWordType}
            gameMode={editGameMode} setGameMode={setEditGameMode}
            turnDuration={editTurnDuration} setTurnDuration={setEditTurnDuration}
            lives={editLives} setLives={setEditLives}
            allowRepeat={editAllowRepeat} setAllowRepeat={setEditAllowRepeat}
            showHint={editShowHint} setShowHint={setEditShowHint}
            password={editPassword} setPassword={setEditPassword}
            minMaxPlayers={state.players.length}
            hasPassword={state.hasPassword}
            onRemovePassword={handleRemovePassword}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setShowSettings(false)} variant="outlined">
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleSaveSettings}
            variant="contained"
            disabled={isSaving}
            sx={{
              background: 'linear-gradient(135deg, #2ecc71 0%, #27ae60 100%)',
              '&:hover': { background: 'linear-gradient(135deg, #27ae60 0%, #219a52 100%)' },
            }}
          >
            {t('wordChain.saveSettings')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Guest Name Dialog */}
      <GuestNameDialog
        open={showGuestNameDialog}
        onClose={handleGuestNameUpdated}
        initialName={state.players.find(p => p.slot === state.mySlot)?.guestName || ''}
      />

      {/* Floating Chat Messages */}
      <WordChainChatOverlay>
        {state.chatMessages.map((chat, idx) => (
          <FloatingChatMessage
            key={chat.id}
            chat={chat}
            index={idx}
            onDismiss={() => clearChat(chat.id)}
          />
        ))}
      </WordChainChatOverlay>
    </Box >
  );
};
