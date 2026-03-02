/**
 * GoPlayerPanel — Displays player info, captures, timer, and turn indicator.
 */
import React from 'react';
import { Box, Paper, Typography, Stack, Chip } from '@mui/material';
import { keyframes } from '@mui/system';
import { useLanguage } from '../../../i18n';
import { GoPlayer } from '../go-types';
import GoTimerDisplay from './GoTimerDisplay';

interface GoPlayerPanelProps {
  player: GoPlayer;
  isCurrentTurn: boolean;
  timerEnabled: boolean;
  byoyomiTime: number;
}

const glowAnim = keyframes`
  0%, 100% { box-shadow: 0 0 6px 2px rgba(255, 220, 50, 0.4); }
  50% { box-shadow: 0 0 14px 4px rgba(255, 220, 50, 0.8); }
`;

const GoPlayerPanel: React.FC<GoPlayerPanelProps> = React.memo(({
  player,
  isCurrentTurn,
  timerEnabled,
  byoyomiTime,
}) => {
  const { t } = useLanguage();
  const displayName = player.username || player.guestName || `${t('common.player' as any)} ${player.slot}`;
  const isBlack = player.color === 'black';

  return (
    <Paper
      elevation={isCurrentTurn ? 4 : 1}
      sx={{
        p: 1.5,
        borderRadius: 2,
        border: '2px solid',
        borderColor: isCurrentTurn ? 'warning.main' : 'divider',
        animation: isCurrentTurn ? `${glowAnim} 1.5s ease-in-out infinite` : 'none',
        transition: 'border-color 0.3s, box-shadow 0.3s',
        minWidth: 140,
      }}
    >
      <Stack spacing={1}>
        {/* Name + color indicator */}
        <Stack direction="row" alignItems="center" spacing={1}>
          <Box
            sx={{
              width: 18,
              height: 18,
              borderRadius: '50%',
              bgcolor: isBlack ? '#1a1a1a' : '#f5f5f5',
              border: isBlack ? '1px solid #444' : '1.5px solid #888',
              flexShrink: 0,
              boxShadow: isBlack
                ? 'inset -1px -1px 3px rgba(255,255,255,0.15)'
                : 'inset -1px -1px 3px rgba(0,0,0,0.1)',
            }}
          />
          <Typography
            variant="body2"
            fontWeight={isCurrentTurn ? 700 : 400}
            noWrap
            sx={{ flex: 1, maxWidth: 120 }}
            title={displayName}
          >
            {displayName}
          </Typography>
        </Stack>

        {/* Captures */}
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <Typography variant="caption" color="text.secondary">
            {t('go.captures')}:
          </Typography>
          <Typography variant="caption" fontWeight="bold">
            {player.captures}
          </Typography>
        </Stack>

        {/* Timer */}
        <GoTimerDisplay
          mainTimeLeft={player.mainTimeLeft}
          byoyomiPeriodsLeft={player.byoyomiPeriodsLeft}
          byoyomiTime={byoyomiTime}
          isActive={isCurrentTurn}
          timerEnabled={timerEnabled}
        />

        {/* Connection status */}
        {!player.isConnected && (
          <Chip
            label={t('go.disconnected')}
            color="error"
            size="small"
            sx={{ fontSize: '0.65rem', height: 20 }}
          />
        )}

        {/* Passed indicator */}
        {player.passed && (
          <Chip
            label={t('go.passed' as any)}
            color="default"
            size="small"
            sx={{ fontSize: '0.65rem', height: 20 }}
          />
        )}

        {/* Scoring agreed */}
        {player.scoringAgreed && (
          <Chip
            label={t('go.agreed')}
            color="success"
            size="small"
            sx={{ fontSize: '0.65rem', height: 20 }}
          />
        )}
      </Stack>
    </Paper>
  );
});

GoPlayerPanel.displayName = 'GoPlayerPanel';

export default GoPlayerPanel;
