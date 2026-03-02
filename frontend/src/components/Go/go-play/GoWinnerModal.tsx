/**
 * GoWinnerModal — Result dialog shown when game ends.
 */
import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Stack,
  Box,
  Divider,
} from '@mui/material';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import { useLanguage } from '../../../i18n';
import { GoWinner, GoWinReason, GoScore, GoPlayer } from '../go-types';

interface GoWinnerModalProps {
  open: boolean;
  winner: GoWinner | null;
  winReason: GoWinReason | null;
  finalScore: GoScore | null;
  players: GoPlayer[];
  mySlot: number | null;
  isHost: boolean;
  onNewGame: () => void;
  onLeave: () => void;
  onDismiss: () => void;
}

const GoWinnerModal: React.FC<GoWinnerModalProps> = React.memo(({
  open,
  winner,
  winReason,
  finalScore,
  players,
  mySlot,
  isHost,
  onNewGame,
  onLeave,
  onDismiss,
}) => {
  const { t } = useLanguage();

  if (!winner) return null;

  const isWinner = winner.slot === mySlot;
  const winnerName = winner.username || winner.guestName || `${t('common.player' as any)} ${winner.slot}`;

  const winReasonText = winReason === 'resign'
    ? t('go.winByResign')
    : winReason === 'timeout'
      ? t('go.winByTimeout')
      : t('go.winByScore');

  return (
    <Dialog open={open} onClose={onDismiss} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ textAlign: 'center', pb: 0 }}>
        <Stack alignItems="center" spacing={1}>
          <EmojiEventsIcon
            sx={{ fontSize: 48, color: isWinner ? 'warning.main' : 'text.secondary' }}
          />
          <Typography variant="h5" fontWeight="bold">
            {isWinner ? t('go.youWin') : t('go.youLose')}
          </Typography>
        </Stack>
      </DialogTitle>

      <DialogContent>
        <Stack spacing={2} alignItems="center" pt={1}>
          <Typography variant="body1" textAlign="center">
            <strong>{winnerName}</strong>
            {' '}
            {t('go.wins')}
            {' '}
            {winReasonText}
          </Typography>

          {finalScore && (
            <>
              <Divider sx={{ width: '100%' }} />
              <Box sx={{ width: '100%' }}>
                <Typography variant="subtitle2" textAlign="center" mb={1} color="text.secondary">
                  {t('go.finalScore')}
                </Typography>
                <Stack direction="row" justifyContent="space-around">
                  <Stack alignItems="center">
                    <Box
                      sx={{
                        width: 16, height: 16, borderRadius: '50%',
                        bgcolor: '#1a1a1a', border: '1px solid #444', mb: 0.5,
                      }}
                    />
                    <Typography variant="body2" fontWeight="bold">
                      {finalScore.black.total}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {t('go.black')}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {t('go.territory')}: {finalScore.black.territory}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {t('go.captures')}: {finalScore.black.captures}
                    </Typography>
                  </Stack>
                  <Stack alignItems="center">
                    <Box
                      sx={{
                        width: 16, height: 16, borderRadius: '50%',
                        bgcolor: '#f5f5f5', border: '1.5px solid #888', mb: 0.5,
                      }}
                    />
                    <Typography variant="body2" fontWeight="bold">
                      {finalScore.white.total}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {t('go.white')}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {t('go.territory')}: {finalScore.white.territory}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Komi: {finalScore.white.komi}
                    </Typography>
                  </Stack>
                </Stack>
              </Box>
            </>
          )}
        </Stack>
      </DialogContent>

      <DialogActions sx={{ justifyContent: 'center', gap: 1, pb: 2, flexWrap: 'wrap' }}>
        {isHost && (
          <Button variant="contained" color="primary" onClick={onNewGame}>
            {t('go.newGame')}
          </Button>
        )}
        <Button variant="outlined" color="error" onClick={onLeave}>
          {t('go.leaveRoom')}
        </Button>
        <Button variant="text" onClick={onDismiss}>
          {t('go.close')}
        </Button>
      </DialogActions>
    </Dialog>
  );
});

GoWinnerModal.displayName = 'GoWinnerModal';

export default GoWinnerModal;
