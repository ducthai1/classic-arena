/**
 * GoCreateRoom - Dialog for creating a new Go room with board size, komi,
 * handicap, timer settings, and optional password.
 */
import React, { useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Typography, IconButton, Box, TextField,
  FormControl, InputLabel, Select, MenuItem,
  ToggleButtonGroup, ToggleButton, Divider, Collapse,
  SelectChangeEvent,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import TimerOffIcon from '@mui/icons-material/TimerOff';
import { useLanguage } from '../../../i18n';
import { useGo } from '../GoContext';
import { GoRules, GoBoardSize, DEFAULT_RULES } from '../go-types';

const GO_ACCENT = '#2c3e50';
const GO_ACCENT2 = '#34495e';

export interface GoCreateRoomProps {
  open: boolean;
  onClose: () => void;
}

const MAIN_TIMES = [0, 60, 180, 300, 600, 900, 1200, 1800]; // seconds
const BYOYOMI_PERIODS = [1, 2, 3, 5];
const BYOYOMI_TIMES = [10, 20, 30, 60]; // seconds

function formatMainTime(s: number, noTimerLabel: string): string {
  if (s === 0) return noTimerLabel;
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  return `${m}min`;
}

export const GoCreateRoom: React.FC<GoCreateRoomProps> = ({ open, onClose }) => {
  const { t } = useLanguage();
  const { createRoom } = useGo();

  const [boardSize, setBoardSize] = useState<GoBoardSize>(DEFAULT_RULES.boardSize);
  const [komi, setKomi] = useState<number>(DEFAULT_RULES.komi);
  const [handicap, setHandicap] = useState<number>(DEFAULT_RULES.handicap);
  const [mainTime, setMainTime] = useState<number>(DEFAULT_RULES.mainTime);
  const [byoyomiPeriods, setByoyomiPeriods] = useState<number>(DEFAULT_RULES.byoyomiPeriods);
  const [byoyomiTime, setByoyomiTime] = useState<number>(DEFAULT_RULES.byoyomiTime);
  const [password, setPassword] = useState('');

  const timerEnabled = mainTime > 0;

  const handleCreate = () => {
    const rules: GoRules = {
      boardSize,
      komi,
      handicap,
      mainTime,
      byoyomiPeriods,
      byoyomiTime,
    };
    createRoom(rules, password.trim() || undefined);
    onClose();
    // Reset
    setBoardSize(DEFAULT_RULES.boardSize);
    setKomi(DEFAULT_RULES.komi);
    setHandicap(DEFAULT_RULES.handicap);
    setMainTime(DEFAULT_RULES.mainTime);
    setByoyomiPeriods(DEFAULT_RULES.byoyomiPeriods);
    setByoyomiTime(DEFAULT_RULES.byoyomiTime);
    setPassword('');
  };

  const labelSx = { fontWeight: 600, fontSize: '0.85rem', mb: 0.75, color: 'text.secondary' };
  const sectionSx = { mb: 2.5 };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: 3, maxHeight: '90vh' } }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', pb: 1 }}>
        <Typography variant="h6" sx={{ fontWeight: 700, flex: 1, color: GO_ACCENT }}>
          {t('go.createRoom')}
        </Typography>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: 1 }}>

        {/* Board Size */}
        <Box sx={sectionSx}>
          <Typography sx={labelSx}>{t('go.boardSize')}</Typography>
          <ToggleButtonGroup
            value={boardSize}
            exclusive
            onChange={(_, v) => v && setBoardSize(v as GoBoardSize)}
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
        <Box sx={sectionSx}>
          <Typography sx={labelSx}>{t('go.komi')}</Typography>
          <TextField
            type="number"
            size="small"
            value={komi}
            onChange={e => setKomi(parseFloat(e.target.value) || 0)}
            inputProps={{ min: 0, max: 9, step: 0.5 }}
            sx={{ width: 120 }}
          />
        </Box>

        {/* Handicap */}
        <Box sx={sectionSx}>
          <Typography sx={labelSx}>{t('go.handicap')}</Typography>
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <Select
              value={handicap}
              onChange={(e: SelectChangeEvent<number>) => setHandicap(Number(e.target.value))}
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

        {/* Timer Settings */}
        <Box sx={sectionSx}>
          <Typography sx={labelSx}>{t('go.timer.mainTime')}</Typography>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <Select
              value={mainTime}
              onChange={(e: SelectChangeEvent<number>) => setMainTime(Number(e.target.value))}
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

        <Collapse in={timerEnabled}>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2.5 }}>
            <Box>
              <Typography sx={labelSx}>{t('go.byoyomiPeriods' as any)}</Typography>
              <FormControl size="small" sx={{ minWidth: 100 }}>
                <Select
                  value={byoyomiPeriods}
                  onChange={(e: SelectChangeEvent<number>) => setByoyomiPeriods(Number(e.target.value))}
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
                  value={byoyomiTime}
                  onChange={(e: SelectChangeEvent<number>) => setByoyomiTime(Number(e.target.value))}
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

        <Divider sx={{ my: 2 }} />

        {/* Password */}
        <Box sx={sectionSx}>
          <Typography sx={labelSx}>{t('go.password')}</Typography>
          <TextField
            size="small"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder={t('go.optionalPassword')}
            sx={{ width: '100%', maxWidth: 300 }}
          />
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} variant="outlined">
          {t('common.cancel')}
        </Button>
        <Button
          onClick={handleCreate}
          variant="contained"
          sx={{
            background: `linear-gradient(135deg, ${GO_ACCENT} 0%, ${GO_ACCENT2} 100%)`,
            '&:hover': { background: `linear-gradient(135deg, #1a252f 0%, ${GO_ACCENT} 100%)` },
            fontWeight: 700,
          }}
        >
          {t('go.createRoom')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
