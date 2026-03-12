/**
 * Xì Dách Score Tracker - Match History Item
 * Displays single match result with edit/undo actions
 */

import React from 'react';
import { Box, Typography, IconButton, Chip, Tooltip } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import UndoIcon from '@mui/icons-material/Undo';
import { XiDachMatch, XiDachPlayer, XiDachSettings } from '../../types/xi-dach-score.types';

type TranslateFunction = (key: string, params?: Record<string, string | number>) => string;

interface MatchHistoryItemProps {
  match: XiDachMatch;
  players: XiDachPlayer[];
  settings: XiDachSettings;
  isLastMatch: boolean;
  onEdit: () => void;
  onUndo: () => void;
  t: TranslateFunction;
}

// Format player result for display (supports both new and legacy formats)
const formatPlayerResult = (
  result: XiDachMatch['results'][0],
  player: XiDachPlayer | undefined,
  players: XiDachPlayer[],
  t: TranslateFunction
): { main: string; details: string[] } => {
  if (!player) return { main: 'N/A', details: [] };

  const sign = result.scoreChange >= 0 ? '+' : '';
  const main = `${player.name}: ${sign}${result.scoreChange} điểm`;

  const details: string[] = [];

  // New format with separate win/lose
  if (result.winTuCount !== undefined && result.loseTuCount !== undefined) {
    // Win tu info
    if (result.winTuCount > 0) {
      let winDetail = `+${result.winTuCount} ${t('xiDachScore.history.tu')}`;
      if (result.winXiBanCount > 0) {
        winDetail += ` (${result.winXiBanCount} ${t('xiDachScore.history.xiBan')})`;
      }
      if (result.winNguLinhCount > 0) {
        winDetail += ` (${result.winNguLinhCount} ${t('xiDachScore.history.nguLinh')})`;
      }
      details.push(winDetail);
    }

    // Lose tu info
    if (result.loseTuCount > 0) {
      let loseDetail = `-${result.loseTuCount} ${t('xiDachScore.history.tu')}`;
      if (result.loseXiBanCount > 0) {
        loseDetail += ` (${result.loseXiBanCount} ${t('xiDachScore.history.xiBan')})`;
      }
      if (result.loseNguLinhCount > 0) {
        loseDetail += ` (${result.loseNguLinhCount} ${t('xiDachScore.history.nguLinh')})`;
      }
      details.push(loseDetail);
    }
  } else {
    // Legacy format with single tuCount and outcome
    const outcomeText = result.outcome === 'win' ? t('xiDachScore.match.win').toLowerCase() : t('xiDachScore.match.lose').toLowerCase();
    details.push(`${result.tuCount || 0} ${t('xiDachScore.history.tu')} ${outcomeText}`);

    // Bonuses (legacy)
    if (result.xiBanCount && result.xiBanCount > 0) {
      details.push(`${result.xiBanCount} ${t('xiDachScore.history.xiBan')}`);
    }
    if (result.nguLinhCount && result.nguLinhCount > 0) {
      details.push(`${result.nguLinhCount} ${t('xiDachScore.history.nguLinh')}`);
    }
  }

  // Penalty 28
  if (result.penalty28 && result.penalty28Recipients.length > 0) {
    const recipientNames = result.penalty28Recipients
      .map((id) => players.find((p) => p.id === id)?.name || 'N/A')
      .join(', ');
    details.push(`${t('xiDachScore.history.penalty28')} → ${recipientNames}`);
  }

  return { main, details };
};

const MatchHistoryItem: React.FC<MatchHistoryItemProps> = ({
  match,
  players,
  isLastMatch,
  onEdit,
  onUndo,
  t,
}) => {
  const formatMatchTime = (timestamp: string, durationMs?: number) => {
    const end = new Date(timestamp);
    let startStr = '';
    
    // Only calculate start time if durationMs exists and is reasonable (< 24hrs)
    if (durationMs && durationMs > 0 && durationMs < 86400000) {
      const start = new Date(end.getTime() - durationMs);
      startStr = start.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + ' - ';
    }
    
    const endStr = end.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    return `${startStr}${endStr}`;
  };

  const formatMatchDuration = (durationMs?: number) => {
    if (!durationMs || durationMs <= 0) return '';
    const minutes = Math.ceil(durationMs / 60000); // Round up to nearest minute
    if (minutes < 1) return '< 1 phút';
    return `${minutes} phút`;
  };

  const dealer = players.find((p) => p.id === match.dealerId);

  return (
    <Box
      sx={{
        p: 2,
        bgcolor: isLastMatch ? 'rgba(255, 138, 101, 0.05)' : '#fff',
        borderRadius: 2,
        border: isLastMatch ? '1px solid rgba(255, 138, 101, 0.2)' : '1px solid #eee',
        position: 'relative',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          mb: 1.5,
        }}
      >
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#2c3e50' }}>
              {t('xiDachScore.history.matchNumber', { number: match.matchNumber })}
            </Typography>
            {match.editedAt && (
              <Chip
                label={t('xiDachScore.history.edited')}
                size="small"
                sx={{
                  height: 18,
                  fontSize: '0.6rem',
                  bgcolor: '#FFB74D',
                  color: '#fff',
                }}
              />
            )}
          </Box>
          <Typography variant="caption" sx={{ color: '#95a5a6', display: 'block' }}>
            {t('xiDachScore.dealer.label')}: 👑 {dealer?.name || 'N/A'}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
            <Typography variant="caption" sx={{ color: '#7f8c8d', bgcolor: '#f5f6fa', px: 1, py: 0.2, borderRadius: 1 }}>
              ⏰ {formatMatchTime(match.timestamp, match.durationMs)}
            </Typography>
            {match.durationMs && match.durationMs > 0 && (
              <Typography variant="caption" sx={{ color: '#7f8c8d', bgcolor: '#f5f6fa', px: 1, py: 0.2, borderRadius: 1 }}>
                ⏱️ {formatMatchDuration(match.durationMs)}
              </Typography>
            )}
          </Box>
        </Box>

        {/* Action Buttons - Only for last match */}
        {isLastMatch && (
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Tooltip title={t('xiDachScore.history.editMatch')}>
              <IconButton
                size="small"
                onClick={onEdit}
                sx={{
                  color: '#FF8A65',
                  '&:hover': { bgcolor: 'rgba(255, 138, 101, 0.1)' },
                }}
              >
                <EditIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title={t('xiDachScore.history.deleteMatch')}>
              <IconButton
                size="small"
                onClick={onUndo}
                sx={{
                  color: '#FF8A65',
                  '&:hover': { bgcolor: 'rgba(255, 138, 101, 0.1)' },
                }}
              >
                <UndoIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
          </Box>
        )}
      </Box>

      {/* Player Results */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
        {match.results.map((result) => {
          const player = players.find((p) => p.id === result.playerId);
          const { main, details } = formatPlayerResult(result, player, players, t);
          const isPositive = result.scoreChange >= 0;

          return (
            <Box
              key={result.playerId}
              sx={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 1,
              }}
            >
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 500,
                  color: isPositive ? '#2e7d32' : '#E64A19',
                  minWidth: 100,
                }}
              >
                {main}
              </Typography>
              {details.length > 0 && (
                <Typography
                  variant="caption"
                  sx={{
                    color: '#95a5a6',
                    flex: 1,
                  }}
                >
                  ({details.join(', ')})
                </Typography>
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

// Memoize to prevent unnecessary re-renders in large match history lists
// Component only re-renders when its props change
export default React.memo(MatchHistoryItem);
