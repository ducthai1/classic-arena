/**
 * GoWaitingRoom - View after creating/joining a Go room.
 * Shows room code, settings summary, player slots, and host controls.
 */
import React, { useState, useRef, useEffect } from 'react';
import {
  Box, Typography, Button, Paper, IconButton, Chip, Stack, Divider,
  Dialog, DialogTitle, DialogContent, DialogActions, Tooltip,
  CircularProgress, FormControl, Select, MenuItem, TextField,
  ToggleButtonGroup, ToggleButton, Collapse, SelectChangeEvent,
  InputAdornment,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ExitToAppIcon from '@mui/icons-material/ExitToApp';
import PersonIcon from '@mui/icons-material/Person';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import SettingsIcon from '@mui/icons-material/Settings';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import CloseIcon from '@mui/icons-material/Close';
import GridOnIcon from '@mui/icons-material/GridOn';
import TimerIcon from '@mui/icons-material/Timer';
import TimerOffIcon from '@mui/icons-material/TimerOff';
import SendIcon from '@mui/icons-material/Send';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import { useLanguage } from '../../../i18n';
import { useToast } from '../../../contexts/ToastContext';
import { useGo } from '../GoContext';
import { GoRules, GoBoardSize, DEFAULT_RULES } from '../go-types';
import ConfirmDialog from '../../ConfirmDialog/ConfirmDialog';
import GoHelpDialog from '../go-play/GoHelpDialog';

const GO_ACCENT = '#2c3e50';
const GO_ACCENT2 = '#34495e';

const MAIN_TIMES = [0, 60, 180, 300, 600, 900, 1200, 1800];
const BYOYOMI_PERIODS = [1, 2, 3, 5];
const BYOYOMI_TIMES = [10, 20, 30, 60];

function formatMainTime(s: number, noTimerLabel: string): string {
  if (s === 0) return noTimerLabel;
  if (s < 60) return `${s}s`;
  return `${Math.round(s / 60)}min`;
}

function formatTimer(rules: GoRules, noTimerLabel: string): string {
  if (!rules.mainTime) return noTimerLabel;
  return `${formatMainTime(rules.mainTime, noTimerLabel)} + ${rules.byoyomiPeriods}×${rules.byoyomiTime}s`;
}

export const GoWaitingRoom: React.FC = () => {
  const { t } = useLanguage();
  const toast = useToast();
  const { state, startGame, leaveRoom, updateSettings, sendChat } = useGo();

  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Edit settings state
  const [editBoardSize, setEditBoardSize] = useState<GoBoardSize>(state.rules?.boardSize ?? DEFAULT_RULES.boardSize);
  const [editKomi, setEditKomi] = useState(state.rules?.komi ?? DEFAULT_RULES.komi);
  const [editHandicap, setEditHandicap] = useState(state.rules?.handicap ?? DEFAULT_RULES.handicap);
  const [editMainTime, setEditMainTime] = useState(state.rules?.mainTime ?? DEFAULT_RULES.mainTime);
  const [editByoyomiPeriods, setEditByoyomiPeriods] = useState(state.rules?.byoyomiPeriods ?? DEFAULT_RULES.byoyomiPeriods);
  const [editByoyomiTime, setEditByoyomiTime] = useState(state.rules?.byoyomiTime ?? DEFAULT_RULES.byoyomiTime);

  const openSettings = () => {
    setEditBoardSize(state.rules?.boardSize ?? DEFAULT_RULES.boardSize);
    setEditKomi(state.rules?.komi ?? DEFAULT_RULES.komi);
    setEditHandicap(state.rules?.handicap ?? DEFAULT_RULES.handicap);
    setEditMainTime(state.rules?.mainTime ?? DEFAULT_RULES.mainTime);
    setEditByoyomiPeriods(state.rules?.byoyomiPeriods ?? DEFAULT_RULES.byoyomiPeriods);
    setEditByoyomiTime(state.rules?.byoyomiTime ?? DEFAULT_RULES.byoyomiTime);
    setShowSettings(true);
  };

  const handleSaveSettings = () => {
    updateSettings({
      boardSize: editBoardSize,
      komi: editKomi,
      handicap: editHandicap,
      mainTime: editMainTime,
      byoyomiPeriods: editByoyomiPeriods,
      byoyomiTime: editByoyomiTime,
    });
    setShowSettings(false);
  };

  const handleCopyCode = async () => {
    if (state.roomCode) {
      await navigator.clipboard.writeText(state.roomCode);
      toast.success('go.codeCopied');
    }
  };

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [state.chatMessages.length]);

  const handleSendChat = () => {
    const msg = chatInput.trim();
    if (!msg) return;
    sendChat(msg);
    setChatInput('');
  };

  const canStart = state.isHost && state.players.length >= 2 && !isStarting;

  const startTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => { if (startTimeoutRef.current) clearTimeout(startTimeoutRef.current); };
  }, []);

  const handleStartGame = () => {
    if (isStarting) return;
    setIsStarting(true);
    startGame();
    if (startTimeoutRef.current) clearTimeout(startTimeoutRef.current);
    startTimeoutRef.current = setTimeout(() => setIsStarting(false), 5000);
  };

  const rules = state.rules;
  const labelSx = { fontWeight: 600, fontSize: '0.85rem', mb: 0.75, color: 'text.secondary' };

  return (
    <Box
      sx={{
        p: { xs: 2, sm: 3, md: 4 },
        pt: { xs: '96px', md: 4 },
        width: '100%',
        maxWidth: 720,
        mx: 'auto',
        minHeight: '100vh',
      }}
    >
      {/* Room Code Card */}
      <Paper
        elevation={2}
        sx={{
          p: { xs: 2.5, sm: 3 },
          mb: 3,
          borderRadius: 4,
          background: `linear-gradient(135deg, rgba(44, 62, 80, 0.04) 0%, rgba(52, 73, 94, 0.07) 100%)`,
          position: 'relative',
        }}
      >
        {/* Top-right icons: help (all) + settings (host only) */}
        <Box sx={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 0.25 }}>
          <Tooltip title={t('go.help.title' as any)}>
            <IconButton onClick={() => setShowHelp(true)} size="small" sx={{ color: GO_ACCENT }}>
              <MenuBookIcon sx={{ fontSize: 20 }} />
            </IconButton>
          </Tooltip>
          {state.isHost && (
            <Tooltip title={t('go.settings')}>
              <IconButton onClick={openSettings} size="small" sx={{ color: GO_ACCENT }}>
                <SettingsIcon sx={{ fontSize: 20 }} />
              </IconButton>
            </Tooltip>
          )}
        </Box>

        {/* Room Code */}
        <Box sx={{ textAlign: 'center', mb: 2.5 }}>
          <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            {t('go.roomCode')}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
            <Typography
              sx={{
                fontWeight: 800,
                fontFamily: 'monospace',
                letterSpacing: '0.25em',
                color: GO_ACCENT,
                fontSize: { xs: '1.8rem', sm: '2.2rem' },
              }}
            >
              {state.roomCode}
            </Typography>
            <Tooltip title={t('go.copyCode')}>
              <IconButton onClick={handleCopyCode} size="small">
                <ContentCopyIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        {/* Settings Summary Chips */}
        {rules && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, justifyContent: 'center' }}>
            <Chip
              icon={<GridOnIcon sx={{ fontSize: '14px !important', color: `${GO_ACCENT} !important` }} />}
              label={`${rules.boardSize}×${rules.boardSize}`}
              size="small"
              sx={{ fontWeight: 600, bgcolor: 'rgba(44, 62, 80, 0.08)', color: GO_ACCENT, border: `1px solid rgba(44, 62, 80, 0.2)` }}
            />
            <Chip
              label={`Komi ${rules.komi}`}
              size="small"
              sx={{ fontWeight: 600, bgcolor: 'rgba(52, 152, 219, 0.1)', color: '#2980b9', border: '1px solid rgba(52, 152, 219, 0.2)' }}
            />
            {rules.handicap > 0 && (
              <Chip
                label={`${t('go.handicap')} ${rules.handicap}`}
                size="small"
                sx={{ fontWeight: 600, bgcolor: 'rgba(155, 89, 182, 0.1)', color: '#8e44ad', border: '1px solid rgba(155, 89, 182, 0.2)' }}
              />
            )}
            <Chip
              icon={rules.mainTime ? <TimerIcon sx={{ fontSize: '14px !important', color: '#d35400 !important' }} /> : <TimerOffIcon sx={{ fontSize: '14px !important', color: '#999 !important' }} />}
              label={formatTimer(rules, t('go.timer.noTimer'))}
              size="small"
              sx={{ fontWeight: 600, bgcolor: rules.mainTime ? 'rgba(230, 126, 34, 0.1)' : 'rgba(0,0,0,0.04)', color: rules.mainTime ? '#d35400' : 'text.secondary', border: rules.mainTime ? '1px solid rgba(230, 126, 34, 0.2)' : '1px solid rgba(0,0,0,0.1)' }}
            />
            {state.hasPassword && (
              <Chip
                label={t('go.password')}
                size="small"
                sx={{ fontWeight: 600, bgcolor: 'rgba(241, 196, 15, 0.1)', color: '#f39c12', border: '1px solid rgba(241, 196, 15, 0.2)' }}
              />
            )}
          </Box>
        )}
      </Paper>

      {/* Player Slots */}
      <Paper elevation={1} sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: 3, mb: 3 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
          {t('go.players' as any)} ({state.players.length}/2)
        </Typography>

        <Stack spacing={1}>
          {/* Slot 1 */}
          {[1, 2].map(slot => {
            const player = state.players.find(p => p.slot === slot);
            const isMe = player?.slot === state.mySlot;
            const colorLabel = slot === 1 ? t('go.black') : t('go.white');
            const colorDot = slot === 1 ? '#1a1a1a' : '#e8e8e8';
            const colorBorder = slot === 1 ? '#1a1a1a' : '#999';

            return (
              <Box
                key={slot}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  p: 1.5,
                  borderRadius: 2,
                  bgcolor: isMe ? 'rgba(44, 62, 80, 0.06)' : 'rgba(0,0,0,0.02)',
                  border: '1px solid',
                  borderColor: isMe ? 'rgba(44, 62, 80, 0.3)' : 'transparent',
                }}
              >
                {/* Stone color indicator */}
                <Box
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    bgcolor: colorDot,
                    border: `2px solid ${colorBorder}`,
                    boxShadow: slot === 2 ? '0 0 0 1px rgba(0,0,0,0.15)' : 'none',
                    flexShrink: 0,
                  }}
                />

                {/* Name / color label */}
                <Box sx={{ flex: 1 }}>
                  {player ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                      <Typography sx={{ fontWeight: isMe ? 700 : 500 }}>
                        {player.username || player.guestName || `Player ${slot}`}
                      </Typography>
                      {isMe && (
                        <Typography component="span" variant="caption" sx={{ color: GO_ACCENT }}>
                          ({t('go.you' as any)})
                        </Typography>
                      )}
                      <Chip label={colorLabel} size="small" sx={{ height: 20, fontSize: '0.65rem', bgcolor: slot === 1 ? 'rgba(0,0,0,0.08)' : 'rgba(0,0,0,0.04)', color: 'text.secondary' }} />
                    </Box>
                  ) : (
                    <Typography variant="body2" sx={{ color: 'text.disabled' }}>
                      {t('go.waitingForPlayer')}
                    </Typography>
                  )}
                </Box>

                {/* Empty slot icon */}
                {!player && <PersonOutlineIcon sx={{ color: '#ccc', fontSize: 22 }} />}
                {player && <PersonIcon sx={{ color: GO_ACCENT, fontSize: 22, opacity: 0.6 }} />}
              </Box>
            );
          })}
        </Stack>
      </Paper>

      {/* Actions */}
      <Box sx={{ display: 'flex', gap: 2 }}>
        {state.isHost && (
          <Button
            variant="contained"
            startIcon={isStarting ? <CircularProgress size={18} color="inherit" /> : <PlayArrowIcon />}
            onClick={handleStartGame}
            disabled={!canStart}
            sx={{
              background: canStart
                ? 'linear-gradient(135deg, #27ae60 0%, #2ecc71 100%)'
                : undefined,
              '&:hover': canStart
                ? { background: 'linear-gradient(135deg, #219a52 0%, #27ae60 100%)' }
                : undefined,
              py: 1.25,
              px: 4,
              fontWeight: 700,
              whiteSpace: 'nowrap',
              flex: 1,
            }}
          >
            {isStarting
              ? t('go.starting' as any)
              : canStart
              ? t('go.startGame')
              : t('go.waitingForOpponent')}
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
            fontWeight: 700,
            whiteSpace: 'nowrap',
            minWidth: 120,
            flex: state.isHost ? undefined : 1,
          }}
        >
          {t('go.leaveRoom')}
        </Button>
      </Box>

      {/* Chat Panel */}
      <Paper elevation={1} sx={{ mt: 3, borderRadius: 3, overflow: 'hidden' }}>
        <Box sx={{ px: 2, py: 1, bgcolor: 'rgba(44, 62, 80, 0.06)', borderBottom: '1px solid rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: 1 }}>
          <ChatBubbleOutlineIcon sx={{ fontSize: 16, color: GO_ACCENT }} />
          <Typography variant="caption" sx={{ fontWeight: 700, color: GO_ACCENT }}>
            {t('go.chat' as any)}
          </Typography>
        </Box>
        <Box
          ref={chatScrollRef}
          sx={{
            height: 140, overflowY: 'auto', px: 2, py: 1,
            display: 'flex', flexDirection: 'column', gap: 0.5,
            '&::-webkit-scrollbar': { width: 4 },
            '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(0,0,0,0.12)', borderRadius: 2 },
          }}
        >
          {state.chatMessages.length === 0 ? (
            <Typography variant="caption" sx={{ color: 'text.disabled', textAlign: 'center', mt: 3 }}>
              {t('go.noChatMessages' as any)}
            </Typography>
          ) : (
            state.chatMessages.map((msg, i) => (
              <Box key={i} sx={{ display: 'flex', gap: 0.5, alignItems: 'flex-start' }}>
                <Typography variant="caption" sx={{ fontWeight: 700, color: msg.slot === 1 ? '#1a1a1a' : '#7f8c8d', flexShrink: 0 }}>
                  {msg.username}:
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.primary', wordBreak: 'break-word' }}>
                  {msg.message}
                </Typography>
              </Box>
            ))
          )}
        </Box>
        <Box sx={{ display: 'flex', gap: 0.5, p: 1, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
          <TextField
            size="small"
            fullWidth
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value.slice(0, 200))}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendChat(); } }}
            placeholder={t('go.chatPlaceholder' as any)}
            autoComplete="off"
            sx={{
              '& .MuiOutlinedInput-root': { borderRadius: 2, fontSize: '0.8rem' },
              '& .MuiOutlinedInput-input': { py: 0.75 },
            }}
          />
          <IconButton size="small" onClick={handleSendChat} disabled={!chatInput.trim()} sx={{ color: GO_ACCENT }}>
            <SendIcon fontSize="small" />
          </IconButton>
        </Box>
      </Paper>

      {/* Leave Confirm */}
      <ConfirmDialog
        open={showLeaveConfirm}
        title={t('go.leaveRoom')}
        message={t('go.confirmLeaveMsg' as any)}
        confirmText={t('go.leaveRoom')}
        variant="warning"
        onConfirm={() => { setShowLeaveConfirm(false); leaveRoom(); }}
        onCancel={() => setShowLeaveConfirm(false)}
      />

      {/* Help Dialog */}
      <GoHelpDialog open={showHelp} onClose={() => setShowHelp(false)} />

      {/* Edit Settings Dialog (host only) */}
      <Dialog
        open={showSettings}
        onClose={() => setShowSettings(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, maxHeight: '90vh' } }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', pb: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, flex: 1, color: GO_ACCENT }}>
            {t('go.roomSettings')}
          </Typography>
          <IconButton onClick={() => setShowSettings(false)} size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent sx={{ pt: 1 }}>
          {/* Board Size */}
          <Box sx={{ mb: 2.5 }}>
            <Typography sx={labelSx}>{t('go.boardSize')}</Typography>
            <ToggleButtonGroup
              value={editBoardSize}
              exclusive
              onChange={(_, v) => v && setEditBoardSize(v as GoBoardSize)}
              size="small"
              fullWidth
            >
              {([9, 13, 19] as GoBoardSize[]).map(size => (
                <ToggleButton
                  key={size}
                  value={size}
                  sx={{
                    fontWeight: 700,
                    '&.Mui-selected': {
                      bgcolor: GO_ACCENT,
                      color: '#fff',
                      '&:hover': { bgcolor: GO_ACCENT2 },
                    },
                  }}
                >
                  {size}×{size}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Box>

          {/* Komi */}
          <Box sx={{ mb: 2.5 }}>
            <Typography sx={labelSx}>{t('go.komi')}</Typography>
            <TextField
              type="number"
              size="small"
              value={editKomi}
              onChange={e => setEditKomi(parseFloat(e.target.value) || 0)}
              inputProps={{ min: 0, max: 9, step: 0.5 }}
              sx={{ width: 120 }}
            />
          </Box>

          {/* Handicap */}
          <Box sx={{ mb: 2.5 }}>
            <Typography sx={labelSx}>{t('go.handicap')}</Typography>
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <Select
                value={editHandicap}
                onChange={(e: SelectChangeEvent<number>) => setEditHandicap(Number(e.target.value))}
              >
                <MenuItem value={0}>{t('go.noHandicap')}</MenuItem>
                {[2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                  <MenuItem key={n} value={n}>
                    {t('go.handicapStones').replace('{{count}}', String(n))}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          <Divider sx={{ my: 2 }} />

          {/* Main Time */}
          <Box sx={{ mb: 2.5 }}>
            <Typography sx={labelSx}>{t('go.timer.mainTime')}</Typography>
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <Select
                value={editMainTime}
                onChange={(e: SelectChangeEvent<number>) => setEditMainTime(Number(e.target.value))}
              >
                {MAIN_TIMES.map(s => (
                  <MenuItem key={s} value={s}>
                    {s === 0
                      ? <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}><TimerOffIcon sx={{ fontSize: 16 }} />{t('go.timer.noTimer')}</Box>
                      : formatMainTime(s, t('go.timer.noTimer'))
                    }
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          <Collapse in={editMainTime > 0}>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2.5 }}>
              <Box>
                <Typography sx={labelSx}>{t('go.byoyomiPeriods' as any)}</Typography>
                <FormControl size="small" sx={{ minWidth: 100 }}>
                  <Select
                    value={editByoyomiPeriods}
                    onChange={(e: SelectChangeEvent<number>) => setEditByoyomiPeriods(Number(e.target.value))}
                  >
                    {BYOYOMI_PERIODS.map(n => (
                      <MenuItem key={n} value={n}>
                        {t('go.timer.periods').replace('{{count}}', String(n))}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
              <Box>
                <Typography sx={labelSx}>{t('go.byoyomiTime' as any)}</Typography>
                <FormControl size="small" sx={{ minWidth: 120 }}>
                  <Select
                    value={editByoyomiTime}
                    onChange={(e: SelectChangeEvent<number>) => setEditByoyomiTime(Number(e.target.value))}
                  >
                    {BYOYOMI_TIMES.map(s => (
                      <MenuItem key={s} value={s}>
                        {t('go.timer.perPeriod').replace('{{seconds}}', String(s))}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
            </Box>
          </Collapse>
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setShowSettings(false)} variant="outlined">
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleSaveSettings}
            variant="contained"
            sx={{
              background: `linear-gradient(135deg, ${GO_ACCENT} 0%, ${GO_ACCENT2} 100%)`,
              '&:hover': { background: `linear-gradient(135deg, #1a252f 0%, ${GO_ACCENT} 100%)` },
              fontWeight: 700,
            }}
          >
            {t('go.updateSettings')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
