/**
 * GoControls — Pass, Resign, Undo buttons + undo approval UI.
 * Styled with consistent button sizing and generous spacing.
 */
import React from 'react';
import { Box, Button, Stack, Paper, Typography } from '@mui/material';
import PauseIcon from '@mui/icons-material/Pause';
import FlagIcon from '@mui/icons-material/Flag';
import UndoIcon from '@mui/icons-material/Undo';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import { useLanguage } from '../../../i18n';
import { GoUndoRequest } from '../go-types';

interface GoControlsProps {
  isMyTurn: boolean;
  phase: 'play' | 'scoring';
  moveCount: number;
  pendingUndo: GoUndoRequest | null;
  mySlot: number | null;
  onPass: () => void;
  onResign: () => void;
  onRequestUndo: () => void;
  onApproveUndo: () => void;
  onRejectUndo: () => void;
}

/** Shared button sx for consistent look */
const actionBtnSx = {
  py: 1,
  fontWeight: 600,
  textTransform: 'none' as const,
  fontSize: '0.85rem',
  borderRadius: 2,
};

const GoControls: React.FC<GoControlsProps> = React.memo(({
  isMyTurn,
  phase,
  moveCount,
  pendingUndo,
  mySlot,
  onPass,
  onResign,
  onRequestUndo,
  onApproveUndo,
  onRejectUndo,
}) => {
  const { t } = useLanguage();

  const handlePass = () => {
    if (window.confirm(t('go.confirmPass'))) {
      onPass();
    }
  };

  const handleResign = () => {
    if (window.confirm(t('go.confirmResign'))) {
      onResign();
    }
  };

  // Is the pending undo for the opponent (i.e. I need to approve/reject)?
  const undoPendingForMe = pendingUndo && mySlot !== null && pendingUndo.fromSlot !== mySlot;
  // Is the pending undo my own request?
  const undoPendingByMe = pendingUndo && mySlot !== null && pendingUndo.fromSlot === mySlot;

  if (phase !== 'play') return null;

  return (
    <Stack spacing={1.5}>
      {/* Undo approval banner */}
      {undoPendingForMe && (
        <Paper
          elevation={3}
          sx={{
            p: 2,
            border: '1px solid',
            borderColor: 'warning.main',
            borderRadius: 2.5,
          }}
        >
          <Typography variant="body2" mb={1.5} textAlign="center" fontWeight={500}>
            {t('go.undoPending')}
          </Typography>
          <Stack direction="row" spacing={1.5} justifyContent="center">
            <Button
              variant="contained"
              color="success"
              startIcon={<CheckIcon />}
              onClick={onApproveUndo}
              sx={{ ...actionBtnSx, flex: 1 }}
            >
              {t('go.approve')}
            </Button>
            <Button
              variant="outlined"
              color="error"
              startIcon={<CloseIcon />}
              onClick={onRejectUndo}
              sx={{ ...actionBtnSx, flex: 1 }}
            >
              {t('go.reject')}
            </Button>
          </Stack>
        </Paper>
      )}

      {undoPendingByMe && (
        <Typography variant="caption" color="text.secondary" textAlign="center">
          {t('go.undoWaiting')}
        </Typography>
      )}

      {/* Game action buttons — vertical, full-width, generous padding */}
      <Stack spacing={1.5}>
        <Button
          variant="outlined"
          color="primary"
          startIcon={<PauseIcon />}
          disabled={!isMyTurn}
          onClick={handlePass}
          fullWidth
          sx={actionBtnSx}
        >
          {t('go.pass')}
        </Button>

        <Button
          variant="outlined"
          color="error"
          startIcon={<FlagIcon />}
          onClick={handleResign}
          fullWidth
          sx={actionBtnSx}
        >
          {t('go.resign')}
        </Button>

        <Button
          variant="outlined"
          color="secondary"
          startIcon={<UndoIcon />}
          disabled={moveCount === 0 || !!pendingUndo}
          onClick={onRequestUndo}
          fullWidth
          sx={actionBtnSx}
        >
          {t('go.undo')}
        </Button>
      </Stack>
    </Stack>
  );
});

GoControls.displayName = 'GoControls';

export default GoControls;
