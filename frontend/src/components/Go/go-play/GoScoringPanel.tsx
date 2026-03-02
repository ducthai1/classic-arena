/**
 * GoScoringPanel — Scoring phase controls: agree/reject, score display.
 * Generous padding, clear visual hierarchy.
 */
import React from 'react';
import { Box, Button, Paper, Stack, Typography, Divider } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import ReplayIcon from '@mui/icons-material/Replay';
import { useLanguage } from '../../../i18n';
import { GoScore, GoPlayer } from '../go-types';

interface GoScoringPanelProps {
  score: GoScore | null;
  players: GoPlayer[];
  mySlot: number | null;
  onAgree: () => void;
  onReject: () => void;
}

const GoScoringPanel: React.FC<GoScoringPanelProps> = React.memo(({
  score,
  players,
  mySlot,
  onAgree,
  onReject,
}) => {
  const { t } = useLanguage();

  const myPlayer = players.find(p => p.slot === mySlot);
  const alreadyAgreed = myPlayer?.scoringAgreed ?? false;

  return (
    <Paper
      elevation={3}
      sx={{
        p: 2.5,
        borderRadius: 3,
        border: '1px solid',
        borderColor: 'primary.main',
        bgcolor: 'background.paper',
      }}
    >
      <Typography variant="subtitle1" fontWeight="bold" mb={1} textAlign="center">
        {t('go.scoringPhase')}
      </Typography>

      <Typography variant="caption" color="text.secondary" display="block" textAlign="center" mb={2}>
        {t('go.scoringHint')}
      </Typography>

      {score && (
        <>
          <Divider sx={{ mb: 2 }} />
          <Stack direction="row" justifyContent="space-around" mb={2}>
            <Stack alignItems="center" spacing={0.5}>
              <Box
                sx={{
                  width: 18, height: 18, borderRadius: '50%',
                  bgcolor: '#1a1a1a', border: '1.5px solid #444',
                }}
              />
              <Typography variant="h6" fontWeight="bold">{score.black.total}</Typography>
              <Typography variant="caption" color="text.secondary">
                {t('go.black')}
              </Typography>
            </Stack>
            <Stack alignItems="center" spacing={0.5}>
              <Box
                sx={{
                  width: 18, height: 18, borderRadius: '50%',
                  bgcolor: '#f5f5f5', border: '2px solid #999',
                }}
              />
              <Typography variant="h6" fontWeight="bold">{score.white.total}</Typography>
              <Typography variant="caption" color="text.secondary">
                {t('go.white')}
              </Typography>
            </Stack>
          </Stack>
          <Divider sx={{ mb: 2 }} />
        </>
      )}

      {/* Player agreement status */}
      <Stack spacing={0.75} mb={2}>
        {players.map(p => (
          <Stack key={p.slot} direction="row" alignItems="center" justifyContent="space-between">
            <Typography variant="body2">
              {p.username || p.guestName || `${t('common.player' as any)} ${p.slot}`}
            </Typography>
            <Typography variant="body2" fontWeight={600} color={p.scoringAgreed ? 'success.main' : 'text.secondary'}>
              {p.scoringAgreed ? t('go.agreed') : t('go.pending')}
            </Typography>
          </Stack>
        ))}
      </Stack>

      <Stack spacing={1.5}>
        <Button
          variant="contained"
          color="success"
          startIcon={<CheckIcon />}
          disabled={alreadyAgreed}
          onClick={onAgree}
          fullWidth
          sx={{ py: 1, fontWeight: 600, textTransform: 'none', fontSize: '0.85rem', borderRadius: 2 }}
        >
          {alreadyAgreed ? t('go.agreed') : t('go.agreeScoring')}
        </Button>
        <Button
          variant="outlined"
          color="warning"
          startIcon={<ReplayIcon />}
          onClick={onReject}
          fullWidth
          sx={{ py: 1, fontWeight: 600, textTransform: 'none', fontSize: '0.85rem', borderRadius: 2 }}
        >
          {t('go.resumePlay')}
        </Button>
      </Stack>
    </Paper>
  );
});

GoScoringPanel.displayName = 'GoScoringPanel';

export default GoScoringPanel;
