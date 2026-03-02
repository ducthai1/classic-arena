/**
 * GoScoringPanel — Scoring phase controls: agree/reject, score display.
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
        p: 2,
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'primary.main',
        bgcolor: 'background.paper',
      }}
    >
      <Typography variant="subtitle1" fontWeight="bold" mb={1} textAlign="center">
        {t('go.scoringPhase')}
      </Typography>

      <Typography variant="caption" color="text.secondary" display="block" textAlign="center" mb={1.5}>
        {t('go.scoringHint')}
      </Typography>

      {score && (
        <>
          <Divider sx={{ mb: 1.5 }} />
          <Stack direction="row" justifyContent="space-around" mb={1.5}>
            <Stack alignItems="center">
              <Box
                sx={{
                  width: 14, height: 14, borderRadius: '50%',
                  bgcolor: '#1a1a1a', border: '1px solid #444', mb: 0.5,
                }}
              />
              <Typography variant="body2" fontWeight="bold">{score.black.total}</Typography>
              <Typography variant="caption" color="text.secondary">
                {t('go.black')}
              </Typography>
            </Stack>
            <Stack alignItems="center">
              <Box
                sx={{
                  width: 14, height: 14, borderRadius: '50%',
                  bgcolor: '#f5f5f5', border: '1.5px solid #888', mb: 0.5,
                }}
              />
              <Typography variant="body2" fontWeight="bold">{score.white.total}</Typography>
              <Typography variant="caption" color="text.secondary">
                {t('go.white')}
              </Typography>
            </Stack>
          </Stack>
          <Divider sx={{ mb: 1.5 }} />
        </>
      )}

      {/* Player agreement status */}
      <Stack spacing={0.5} mb={1.5}>
        {players.map(p => (
          <Stack key={p.slot} direction="row" alignItems="center" justifyContent="space-between">
            <Typography variant="caption">
              {p.username || p.guestName || `${t('common.player' as any)} ${p.slot}`}
            </Typography>
            <Typography variant="caption" color={p.scoringAgreed ? 'success.main' : 'text.secondary'}>
              {p.scoringAgreed ? t('go.agreed') : t('go.pending')}
            </Typography>
          </Stack>
        ))}
      </Stack>

      <Stack direction="row" spacing={1} justifyContent="center">
        <Button
          variant="contained"
          color="success"
          size="small"
          startIcon={<CheckIcon />}
          disabled={alreadyAgreed}
          onClick={onAgree}
        >
          {alreadyAgreed ? t('go.agreed') : t('go.agreeScoring')}
        </Button>
        <Button
          variant="outlined"
          color="warning"
          size="small"
          startIcon={<ReplayIcon />}
          onClick={onReject}
        >
          {t('go.resumePlay')}
        </Button>
      </Stack>
    </Paper>
  );
});

GoScoringPanel.displayName = 'GoScoringPanel';

export default GoScoringPanel;
