/**
 * TinhTuyGoBonusModal — Shown when player lands exactly on GO.
 * BONUS_POINTS: random 3000-5000 TT (auto-dismiss 6s).
 * FREE_HOUSE: brief notification (auto-dismiss 3s), then free-house-prompt takes over.
 */
import React, { useEffect, useRef } from 'react';
import { Dialog, DialogTitle, DialogContent, Typography, Box } from '@mui/material';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import HomeIcon from '@mui/icons-material/Home';
import { useLanguage } from '../../../i18n';
import { useTinhTuy } from '../TinhTuyContext';

export const TinhTuyGoBonusModal: React.FC = () => {
  const { t } = useLanguage();
  const { state, clearGoBonus } = useTinhTuy();
  const prompt = state.goBonusPrompt;
  const dismissRef = useRef<number | null>(null);

  useEffect(() => {
    if (!prompt) return;
    const dismissMs = prompt.bonusType === 'FREE_HOUSE' ? 3000 : 6000;
    dismissRef.current = window.setTimeout(() => {
      clearGoBonus();
    }, dismissMs);
    return () => { if (dismissRef.current) clearTimeout(dismissRef.current); };
  }, [prompt, clearGoBonus]);

  if (!prompt) return null;

  const isFreeHouse = prompt.bonusType === 'FREE_HOUSE';
  const accentColor = isFreeHouse ? '#2ecc71' : '#f1c40f';

  return (
    <Dialog
      open={true}
      onClose={(_, reason) => { if (reason !== 'backdropClick') clearGoBonus(); }}
      maxWidth="sm"
      fullWidth
      TransitionProps={{ timeout: 400 }}
      PaperProps={{
        onClick: clearGoBonus,
        sx: {
          borderRadius: 3, borderTop: `4px solid ${accentColor}`,
          animation: 'tt-travel-pulse 1.5s ease-in-out infinite',
          cursor: 'pointer',
        },
      }}
    >
      <DialogTitle sx={{ fontWeight: 700, textAlign: 'center', pb: 0.5 }}>
        {isFreeHouse
          ? <HomeIcon sx={{ fontSize: 40, color: accentColor }} />
          : <MonetizationOnIcon sx={{ fontSize: 40, color: accentColor }} />}
        <br />
        <Typography variant="h6" sx={{ fontWeight: 800, color: accentColor }}>
          {t('tinhTuy.game.goBonusTitle' as any)}
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ textAlign: 'center', py: 2 }}>
          {isFreeHouse ? (
            <>
              <Typography variant="h5" sx={{ fontWeight: 800, color: accentColor, mb: 1 }}>
                {t('tinhTuy.game.goBonusFreeHouseTitle' as any)}
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {t('tinhTuy.game.goBonusFreeHouseDesc' as any)}
              </Typography>
            </>
          ) : (
            <>
              <Typography variant="h5" sx={{ fontWeight: 800, color: accentColor, mb: 1 }}>
                +{(prompt.amount || 0).toLocaleString()} TT
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {t('tinhTuy.game.goBonusPointsDesc' as any)}
              </Typography>
            </>
          )}
        </Box>
      </DialogContent>
    </Dialog>
  );
};
