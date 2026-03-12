/**
 * Xì Dách Score Tracker - Session Summary
 * Full screen summary with rankings and settlement
 */

import React, { useMemo } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  Divider,
} from '@mui/material';
import HistoryIcon from '@mui/icons-material/History';
import HomeIcon from '@mui/icons-material/Home';
import { useXiDachScore } from './XiDachScoreContext';
import { calculateSettlement } from '../../utils/xi-dach-score-storage';
import { XiDachPlayer } from '../../types/xi-dach-score.types';
import { useLanguage } from '../../i18n';

// ============== HELPERS ==============

const getRankIcon = (rank: number): string => {
  switch (rank) {
    case 1:
      return '🥇';
    case 2:
      return '🥈';
    case 3:
      return '🥉';
    default:
      return '';
  }
};

interface RankedPlayer extends XiDachPlayer {
  netScore: number;
  rank: number;
  icon: string;
}

const getRankings = (players: XiDachPlayer[]): RankedPlayer[] => {
  // Include ALL players (even removed ones) to calculate total scores correctly
  // Removed players still have match history and their scores should be counted
  return players
    .map((p) => ({
      ...p,
      netScore: p.currentScore - p.baseScore,
    }))
    .sort((a, b) => b.netScore - a.netScore)
    .map((p, index) => ({
      ...p,
      rank: index + 1,
      icon: getRankIcon(index + 1),
    }));
};

type TranslateFunction = (key: string, params?: Record<string, string | number>) => string;

const formatDuration = (startDate: string, endDate: string, t: TranslateFunction): string => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffMs = end.getTime() - start.getTime();

  const hours = Math.floor(diffMs / 3600000);
  const minutes = Math.floor((diffMs % 3600000) / 60000);

  if (hours === 0) {
    return t('xiDachScore.time.minutes', { count: minutes });
  }
  if (minutes === 0) {
    return t('xiDachScore.time.hours', { count: hours });
  }
  return t('xiDachScore.time.hoursMinutes', { hours, minutes });
};

// ============== COMPONENT ==============

const SessionSummary: React.FC = () => {
  const { t } = useLanguage();
  const { currentSession, goToList, goToHistory } = useXiDachScore();

  const rankings = useMemo(() => {
    if (!currentSession) return [];
    return getRankings(currentSession.players);
  }, [currentSession]);

  const settlements = useMemo(() => {
    if (!currentSession) return [];
    return calculateSettlement(currentSession);
  }, [currentSession]);

  if (!currentSession) {
    return null;
  }

  const matchCount = currentSession.matches.length;

  // Helper to get formatted start/end time
  const formatTime = (isoString?: string) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  };

  const getSessionDuration = () => {
    const defaultDuration = formatDuration(currentSession.createdAt, currentSession.updatedAt, t);
    if (!currentSession.startedAt) return defaultDuration;
    
    // For end time: endedAt -> lastMatch.timestamp -> updatedAt
    let endTime = currentSession.updatedAt;
    if (currentSession.endedAt) {
      endTime = currentSession.endedAt;
    } else if (currentSession.matches.length > 0) {
      endTime = currentSession.matches[currentSession.matches.length - 1].timestamp;
    }
    
    return formatDuration(currentSession.startedAt, endTime, t);
  };

  const duration = getSessionDuration();
  const startTimeStr = formatTime(currentSession.startedAt);
  const endTimeStr = formatTime(currentSession.endedAt);

  // Get player name by ID
  const getPlayerName = (playerId: string): string => {
    return currentSession.players.find((p) => p.id === playerId)?.name || 'N/A';
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: '#FFF8F5',
        pt: { xs: 10, md: 4 },
        pb: 4,
        px: { xs: 2, sm: 3 },
      }}
    >
      <Box sx={{ maxWidth: 600, mx: 'auto' }}>
        {/* Header */}
        <Box sx={{ textAlign: 'center', mb: 3 }}>
          <Typography
            variant="h4"
            sx={{
              fontWeight: 700,
              color: '#FF8A65',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1,
              mb: 1,
            }}
          >
            <span>🏆</span> {t('xiDachScore.summary.title')}
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 600, color: '#2c3e50' }}>
            {currentSession.name}
          </Typography>
          <Typography variant="body2" sx={{ color: '#7f8c8d' }}>
            {t('xiDachScore.summary.stats', { count: matchCount, duration })}
          </Typography>
          {startTimeStr && (
            <Typography variant="body2" sx={{ color: '#7f8c8d', mt: 0.5 }}>
              Bắt đầu: {startTimeStr} {endTimeStr ? `- Kết thúc: ${endTimeStr}` : ''}
            </Typography>
          )}
        </Box>

        {/* Rankings Section */}
        <Paper
          elevation={0}
          sx={{
            bgcolor: '#fff',
            borderRadius: 3,
            p: 3,
            mb: 3,
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
          }}
        >
          <Typography
            variant="subtitle2"
            sx={{
              fontWeight: 600,
              color: '#7f8c8d',
              textTransform: 'uppercase',
              letterSpacing: 1,
              fontSize: '0.75rem',
              mb: 2,
            }}
          >
            {t('xiDachScore.summary.rankings')}
          </Typography>

          {rankings.length > 0 ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {rankings.map((player) => (
                <Box
                  key={player.id}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    p: 1.5,
                    borderRadius: 2,
                    bgcolor:
                      player.rank === 1
                        ? 'rgba(241, 196, 15, 0.15)'
                        : player.rank === 2
                        ? 'rgba(189, 195, 199, 0.2)'
                        : player.rank === 3
                        ? 'rgba(205, 127, 50, 0.15)'
                        : 'transparent',
                  }}
                >
                  {/* Rank Icon */}
                  <Box
                    sx={{
                      width: 32,
                      textAlign: 'center',
                      fontSize: '1.2rem',
                      mr: 1,
                    }}
                  >
                    {player.icon || player.rank}
                  </Box>

                  {/* Player Name */}
                  <Typography
                    variant="body1"
                    sx={{
                      flex: 1,
                      fontWeight: player.rank <= 3 ? 600 : 400,
                      color: '#2c3e50',
                    }}
                  >
                    {player.name}
                  </Typography>

                  {/* Net Score */}
                  <Typography
                    variant="h6"
                    sx={{
                      fontWeight: 700,
                      color: player.netScore >= 0 ? '#2e7d32' : '#E64A19',
                    }}
                  >
                    {player.netScore >= 0 ? '+' : ''}
                    {player.netScore} điểm
                  </Typography>
                </Box>
              ))}
            </Box>
          ) : (
            <Typography variant="body2" sx={{ color: '#95a5a6', textAlign: 'center' }}>
              {t('xiDachScore.summary.noPlayers')}
            </Typography>
          )}
        </Paper>

        {/* Settlement Section */}
        {settlements.length > 0 && (
          <Paper
            elevation={0}
            sx={{
              bgcolor: '#fff',
              borderRadius: 3,
              p: 3,
              mb: 3,
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
            }}
          >
            <Typography
              variant="subtitle2"
              sx={{
                fontWeight: 600,
                color: '#7f8c8d',
                textTransform: 'uppercase',
                letterSpacing: 1,
                fontSize: '0.75rem',
                mb: 2,
              }}
            >
              {t('xiDachScore.summary.settlement')}
            </Typography>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {settlements.map((settlement, index) => (
                <Box
                  key={index}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    p: 1.5,
                    borderRadius: 2,
                    bgcolor: 'rgba(255, 138, 101, 0.05)',
                    border: '1px solid rgba(255, 138, 101, 0.1)',
                  }}
                >
                  <Typography
                    variant="body1"
                    sx={{
                      flex: 1,
                      color: '#2c3e50',
                    }}
                  >
                    <strong>{getPlayerName(settlement.fromPlayerId)}</strong>
                    <span style={{ color: '#7f8c8d', margin: '0 8px' }}>→</span>
                    <strong>{getPlayerName(settlement.toPlayerId)}</strong>
                  </Typography>
                  <Typography
                    variant="h6"
                    sx={{
                      fontWeight: 700,
                      color: '#2e7d32',
                    }}
                  >
                    {settlement.amount} điểm
                  </Typography>
                </Box>
              ))}
            </Box>
          </Paper>
        )}

        {/* No Settlement */}
        {settlements.length === 0 && rankings.length > 0 && (
          <Paper
            elevation={0}
            sx={{
              bgcolor: '#fff',
              borderRadius: 3,
              p: 3,
              mb: 3,
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
              textAlign: 'center',
            }}
          >
            <Typography variant="body1" sx={{ color: '#FF8A65' }}>
              ✓ {t('xiDachScore.summary.noSettlement')}
            </Typography>
          </Paper>
        )}

        <Divider sx={{ my: 3 }} />

        {/* Action Buttons */}
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="outlined"
            startIcon={<HistoryIcon />}
            onClick={goToHistory}
            sx={{
              flex: 1,
              py: 1.5,
              borderRadius: 2,
              borderColor: '#FF8A65',
              color: '#FF8A65',
              background: '#fff',
              '&:hover': {
                borderColor: '#E64A19',
                background: 'rgba(0, 0, 0, 0.04)',
              },
            }}
          >
            {t('xiDachScore.summary.viewHistory')}
          </Button>
          <Button
            variant="contained"
            startIcon={<HomeIcon />}
            onClick={goToList}
            sx={{
              flex: 1,
              py: 1.5,
              borderRadius: 2,
              background: '#FF8A65',
              color: '#fff',
              '&:hover': { background: '#E64A19' },
            }}
          >
            {t('xiDachScore.summary.backToHome')}
          </Button>
        </Box>
      </Box>
    </Box>
  );
};

export default SessionSummary;
