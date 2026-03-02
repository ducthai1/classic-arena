/**
 * GoPlayerPanel — Displays player info: name, stone color, captures, timer, status chips.
 * Designed for 260px+ side panels with generous spacing.
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
  0%, 100% { box-shadow: 0 0 8px 2px rgba(255, 220, 50, 0.35); }
  50% { box-shadow: 0 0 18px 6px rgba(255, 220, 50, 0.7); }
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
        p: 2.5,
        borderRadius: 3,
        border: '2px solid',
        borderColor: isCurrentTurn ? 'warning.main' : 'divider',
        animation: isCurrentTurn ? `${glowAnim} 1.8s ease-in-out infinite` : 'none',
        transition: 'border-color 0.3s, box-shadow 0.3s',
      }}
    >
      <Stack spacing={2}>
        {/* Name + color stone indicator */}
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Box
            sx={{
              width: 26,
              height: 26,
              borderRadius: '50%',
              bgcolor: isBlack ? '#1a1a1a' : '#f5f5f5',
              border: isBlack ? '1.5px solid #444' : '2px solid #999',
              flexShrink: 0,
              boxShadow: isBlack
                ? 'inset -2px -2px 4px rgba(255,255,255,0.15), 0 1px 3px rgba(0,0,0,0.3)'
                : 'inset -2px -2px 4px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.15)',
            }}
          />
          <Typography
            variant="body1"
            fontWeight={isCurrentTurn ? 700 : 500}
            noWrap
            sx={{ flex: 1 }}
            title={displayName}
          >
            {displayName}
          </Typography>
        </Stack>

        {/* Captures count */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, pl: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            {t('go.captures')}:
          </Typography>
          <Typography variant="body2" fontWeight="bold" color="text.primary">
            {player.captures}
          </Typography>
        </Box>

        {/* Timer — centered, prominent */}
        <GoTimerDisplay
          mainTimeLeft={player.mainTimeLeft}
          byoyomiPeriodsLeft={player.byoyomiPeriodsLeft}
          byoyomiTime={byoyomiTime}
          isActive={isCurrentTurn}
          timerEnabled={timerEnabled}
        />

        {/* Status chips row */}
        {(!player.isConnected || player.passed || player.scoringAgreed) && (
          <Stack direction="row" spacing={0.5} flexWrap="wrap">
            {!player.isConnected && (
              <Chip
                label={t('go.disconnected')}
                color="error"
                size="small"
                sx={{ fontSize: '0.7rem', height: 22 }}
              />
            )}
            {player.passed && (
              <Chip
                label={t('go.passed' as any)}
                color="default"
                size="small"
                sx={{ fontSize: '0.7rem', height: 22 }}
              />
            )}
            {player.scoringAgreed && (
              <Chip
                label={t('go.agreed')}
                color="success"
                size="small"
                sx={{ fontSize: '0.7rem', height: 22 }}
              />
            )}
          </Stack>
        )}
      </Stack>
    </Paper>
  );
});

GoPlayerPanel.displayName = 'GoPlayerPanel';

export default GoPlayerPanel;
