/**
 * TinhTuyCardModal — Card reveal with 3D flip animation + auto-dismiss.
 * Auto-dismiss timer starts only when the card is actually visible
 * (after pendingMove + animatingToken clear).
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Dialog, Typography, Box } from '@mui/material';
import { useLanguage } from '../../../i18n';
import { useTinhTuy } from '../TinhTuyContext';
import { BOARD_CELLS, PLAYER_COLORS } from '../tinh-tuy-types';
import './tinh-tuy-board.css';

const CARD_DISPLAY_MS = 5000;
// Cards with detailed info (multi-player effects, teleports, etc.) need more reading time
const CARD_DISPLAY_LONG_MS = 8000;

export const TinhTuyCardModal: React.FC = () => {
  const { t } = useLanguage();
  const { state, clearCard } = useTinhTuy();
  const card = state.drawnCard;
  const extra = state.cardExtraInfo;
  const [flipped, setFlipped] = useState(false);
  const dismissTimerRef = useRef<number | null>(null);

  const canShow = !!card && !state.pendingMove && !state.animatingToken;

  // Debug: log card visibility state changes
  useEffect(() => {
    if (card) {
      console.log('[TinhTuyCardModal] card:', card.id, 'canShow:', canShow, 'pendingMove:', !!state.pendingMove, 'animatingToken:', !!state.animatingToken);
    }
  }, [card, canShow, state.pendingMove, state.animatingToken]);

  // Use longer display time for cards with detailed extra info sections
  const hasDetailedInfo = extra && (
    (extra.allHousesRemoved && extra.allHousesRemoved.length > 0) ||
    (extra.teleportAll && extra.teleportAll.length > 0) ||
    extra.stolenCellIndex != null ||
    extra.wealthTransfer != null
  );
  const displayMs = hasDetailedInfo ? CARD_DISPLAY_LONG_MS : CARD_DISPLAY_MS;

  const clearDismissTimer = useCallback(() => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  }, []);

  // Flip card 300ms after it becomes VISIBLE (canShow=true, i.e. after movement animation finishes)
  useEffect(() => {
    if (!canShow) {
      setFlipped(false);
      return;
    }
    setFlipped(false);
    const timer = setTimeout(() => setFlipped(true), 300);
    return () => clearTimeout(timer);
  }, [canShow]);

  // Auto-dismiss: start timer only when card becomes visible
  useEffect(() => {
    if (!canShow) return;
    clearDismissTimer();
    dismissTimerRef.current = window.setTimeout(() => {
      clearCard();
      dismissTimerRef.current = null;
    }, displayMs);
    return clearDismissTimer;
  }, [canShow, clearDismissTimer, clearCard, displayMs]);

  // Cleanup on unmount
  useEffect(() => clearDismissTimer, [clearDismissTimer]);

  // Wait for dice + movement animation to fully finish before showing card
  if (!canShow) return null;

  const isKhiVan = card.type === 'KHI_VAN';
  const gradient = isKhiVan
    ? 'linear-gradient(135deg, #8e44ad 0%, #9b59b6 100%)'
    : 'linear-gradient(135deg, #e67e22 0%, #f39c12 100%)';

  const iconSrc = isKhiVan ? '/location/khi-van.png' : '/location/co-hoi.png';

  // Helper: find player display name by slot
  const getPlayerName = (slot: number) => state.players.find(p => p.slot === slot)?.displayName || `P${slot}`;
  const getPlayerColor = (slot: number) => PLAYER_COLORS[slot] || '#999';

  return (
    <Dialog
      open={true}
      onClose={clearCard}
      maxWidth="sm"
      fullWidth
      TransitionProps={{ timeout: 400 }}
      PaperProps={{
        sx: { borderRadius: 3, overflow: 'visible', background: 'none', boxShadow: 'none', border: 0, outline: 'none', pointerEvents: 'none' },
      }}
      slotProps={{ backdrop: { sx: { bgcolor: 'rgba(0,0,0,0.5)' } } }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 2, pointerEvents: 'auto', cursor: 'pointer' }} onClick={clearCard}>
        <div className="tt-card-flip-container">
          <div className={`tt-card-inner ${flipped ? 'flipped' : ''}`}>
            {/* Back face */}
            <div className="tt-card-face tt-card-back" style={{ background: gradient }}>
              <Box
                component="img"
                src={iconSrc}
                alt=""
                sx={{ width: '70%', maxWidth: 260, aspectRatio: '1', objectFit: 'contain', borderRadius: 2, opacity: 0.9 }}
              />
            </div>
            {/* Front face */}
            <div className="tt-card-face tt-card-front">
              <Box
                component="img"
                src={iconSrc}
                alt=""
                sx={{ width: '40%', maxWidth: 140, aspectRatio: '1', objectFit: 'contain', mb: 1, borderRadius: 1 }}
              />
              <Typography variant="caption" sx={{ color: isKhiVan ? '#8e44ad' : '#e67e22', fontWeight: 700, letterSpacing: 1, mb: 0.5 }}>
                {isKhiVan ? t('tinhTuy.cards.khiVanTitle' as any) : t('tinhTuy.cards.coHoiTitle' as any)}
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 1, lineHeight: 1.3 }}>
                {t(card.nameKey as any)}
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {t(card.descriptionKey as any)}
              </Typography>

              {/* ─── House removed signal ─── */}
              {state.houseRemovedCell != null && BOARD_CELLS[state.houseRemovedCell] && (
                <Box sx={{
                  mt: 2, px: 2, py: 1.5, borderRadius: 2,
                  bgcolor: 'rgba(231, 76, 60, 0.12)',
                  border: '2px solid rgba(231, 76, 60, 0.4)',
                  animation: 'tt-travel-pulse 1.5s ease-in-out infinite',
                }}>
                  <Typography variant="body2" sx={{ color: '#e74c3c', fontWeight: 800, fontSize: '1rem', mb: 0.25 }}>
                    🏠 ➜ 💥
                  </Typography>
                  <Typography variant="body1" sx={{ color: '#c0392b', fontWeight: 700 }}>
                    {t(BOARD_CELLS[state.houseRemovedCell].name as any)}
                  </Typography>
                </Box>
              )}

              {/* ─── Swap position signal ─── */}
              {extra?.swapTargetSlot != null && (
                <Box sx={{
                  mt: 2, px: 2, py: 1.5, borderRadius: 2,
                  bgcolor: 'rgba(155, 89, 182, 0.12)',
                  border: '2px solid rgba(155, 89, 182, 0.4)',
                  animation: 'tt-travel-pulse 1.5s ease-in-out infinite',
                }}>
                  <Typography variant="body2" sx={{ color: '#8e44ad', fontWeight: 800, fontSize: '1.1rem', mb: 0.5 }}>
                    🔄 {t('tinhTuy.cards.swapWith' as any)}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                    <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: getPlayerColor(extra.swapTargetSlot) }} />
                    <Typography variant="body1" sx={{ color: getPlayerColor(extra.swapTargetSlot), fontWeight: 700 }}>
                      {getPlayerName(extra.swapTargetSlot)}
                    </Typography>
                  </Box>
                </Box>
              )}

              {/* ─── Stolen property signal ─── */}
              {extra?.stolenCellIndex != null && extra?.stolenFromSlot != null && BOARD_CELLS[extra.stolenCellIndex] && (
                <Box sx={{
                  mt: 2, px: 2, py: 1.5, borderRadius: 2,
                  bgcolor: 'rgba(231, 76, 60, 0.12)',
                  border: '2px solid rgba(231, 76, 60, 0.4)',
                  animation: 'tt-travel-pulse 1.5s ease-in-out infinite',
                }}>
                  <Typography variant="body2" sx={{ color: '#c0392b', fontWeight: 800, fontSize: '1.1rem', mb: 0.5 }}>
                    🏴‍☠️ {t('tinhTuy.cards.stolenResult' as any)}
                  </Typography>
                  {/* Property name */}
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 1,
                    p: 1, borderRadius: 1.5, bgcolor: 'rgba(231, 76, 60, 0.08)',
                  }}>
                    {BOARD_CELLS[extra.stolenCellIndex].icon && (
                      <Box component="img" src={`/location/${BOARD_CELLS[extra.stolenCellIndex].icon}`} alt=""
                        sx={{ width: 28, height: 28, objectFit: 'contain', borderRadius: 0.5 }} />
                    )}
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="body1" sx={{ color: '#2c3e50', fontWeight: 800, fontSize: '1.05rem', lineHeight: 1.2 }}>
                        {t(BOARD_CELLS[extra.stolenCellIndex].name as any)}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        {(extra.stolenHouses ?? 0) > 0 ? `🏠×${extra.stolenHouses}` : t('tinhTuy.game.land' as any)}
                      </Typography>
                    </Box>
                  </Box>
                  {/* Thief gets property */}
                  {extra.stolenToSlot != null && (
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5, mb: 0.3 }}>
                      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: getPlayerColor(extra.stolenToSlot) }} />
                      <Typography variant="body2" sx={{ color: getPlayerColor(extra.stolenToSlot), fontWeight: 700 }}>
                        {getPlayerName(extra.stolenToSlot)}
                      </Typography>
                      <Typography variant="body2" sx={{ color: '#27ae60', fontWeight: 700 }}>
                        +📍 {t('tinhTuy.cards.stolenGained' as any)}
                      </Typography>
                    </Box>
                  )}
                  {/* Victim loses property */}
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: getPlayerColor(extra.stolenFromSlot) }} />
                    <Typography variant="body2" sx={{ color: getPlayerColor(extra.stolenFromSlot), fontWeight: 700 }}>
                      {getPlayerName(extra.stolenFromSlot)}
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#e74c3c', fontWeight: 700 }}>
                      -📍 {t('tinhTuy.cards.stolenLost' as any)}
                    </Typography>
                  </Box>
                </Box>
              )}
              {/* ─── Steal no valid targets ─── */}
              {card.id === 'ch-18' && !extra?.stolenCellIndex && (
                <Box sx={{
                  mt: 2, px: 2, py: 1.5, borderRadius: 2,
                  bgcolor: 'rgba(149, 165, 166, 0.15)',
                  border: '2px solid rgba(149, 165, 166, 0.4)',
                }}>
                  <Typography variant="body2" sx={{ color: '#7f8c8d', fontWeight: 700, fontSize: '1rem' }}>
                    😴 {t('tinhTuy.cards.noStealTarget' as any)}
                  </Typography>
                </Box>
              )}

              {/* ─── Tax richest signal ─── */}
              {extra?.taxedSlot != null && (
                <Box sx={{
                  mt: 2, px: 2, py: 1.5, borderRadius: 2,
                  bgcolor: 'rgba(241, 196, 15, 0.15)',
                  border: '2px solid rgba(241, 196, 15, 0.5)',
                  animation: 'tt-travel-pulse 1.5s ease-in-out infinite',
                }}>
                  <Typography variant="body2" sx={{ color: '#d4a017', fontWeight: 800, fontSize: '1.1rem', mb: 0.5 }}>
                    💰 {t('tinhTuy.cards.taxedPlayer' as any)}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                    <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: getPlayerColor(extra.taxedSlot) }} />
                    <Typography variant="body1" sx={{ color: getPlayerColor(extra.taxedSlot), fontWeight: 700 }}>
                      {getPlayerName(extra.taxedSlot)}
                    </Typography>
                  </Box>
                </Box>
              )}

              {/* ─── Random steps signal (Roulette) ─── */}
              {extra?.randomSteps != null && (
                <Box sx={{
                  mt: 2, px: 2, py: 1.5, borderRadius: 2,
                  bgcolor: 'rgba(46, 204, 113, 0.12)',
                  border: '2px solid rgba(46, 204, 113, 0.4)',
                  animation: 'tt-travel-pulse 1.5s ease-in-out infinite',
                }}>
                  <Typography variant="body2" sx={{ color: '#27ae60', fontWeight: 800, fontSize: '1.3rem' }}>
                    🎰 +{extra.randomSteps} {t('tinhTuy.cards.steps' as any)}
                  </Typography>
                </Box>
              )}

              {/* ─── Random points signal (Luck) ─── */}
              {extra?.randomPoints != null && (
                <Box sx={{
                  mt: 2, px: 2, py: 1.5, borderRadius: 2,
                  bgcolor: extra.randomPoints > 0 ? 'rgba(46, 204, 113, 0.12)' : 'rgba(231, 76, 60, 0.12)',
                  border: `2px solid ${extra.randomPoints > 0 ? 'rgba(46, 204, 113, 0.4)' : 'rgba(231, 76, 60, 0.4)'}`,
                  animation: 'tt-travel-pulse 1.5s ease-in-out infinite',
                }}>
                  <Typography variant="body2" sx={{
                    color: extra.randomPoints > 0 ? '#27ae60' : '#e74c3c',
                    fontWeight: 800, fontSize: '1.3rem',
                  }}>
                    🍀 {extra.randomPoints > 0 ? `+${extra.randomPoints.toLocaleString()} TT` : t('tinhTuy.cards.randomPointsZero' as any)}
                  </Typography>
                </Box>
              )}

              {/* ─── Gamble result signal ─── */}
              {extra?.gambleWon != null && (
                <Box sx={{
                  mt: 2, px: 2, py: 1.5, borderRadius: 2,
                  bgcolor: extra.gambleWon ? 'rgba(46, 204, 113, 0.15)' : 'rgba(231, 76, 60, 0.12)',
                  border: `2px solid ${extra.gambleWon ? 'rgba(46, 204, 113, 0.5)' : 'rgba(231, 76, 60, 0.4)'}`,
                  animation: 'tt-travel-pulse 1.5s ease-in-out infinite',
                }}>
                  <Typography variant="body2" sx={{
                    color: extra.gambleWon ? '#27ae60' : '#e74c3c',
                    fontWeight: 800, fontSize: '1.3rem',
                  }}>
                    {extra.gambleWon ? '🎉' : '💸'} {t(extra.gambleWon ? 'tinhTuy.cards.gambleWin' as any : 'tinhTuy.cards.gambleLose' as any)}
                  </Typography>
                </Box>
              )}

              {/* ─── Underdog boost signal ─── */}
              {extra?.underdogBoosted != null && (
                <Box sx={{
                  mt: 2, px: 2, py: 1.5, borderRadius: 2,
                  bgcolor: extra.underdogBoosted ? 'rgba(46, 204, 113, 0.15)' : 'rgba(231, 76, 60, 0.12)',
                  border: `2px solid ${extra.underdogBoosted ? 'rgba(46, 204, 113, 0.5)' : 'rgba(231, 76, 60, 0.4)'}`,
                  animation: 'tt-travel-pulse 1.5s ease-in-out infinite',
                }}>
                  <Typography variant="body2" sx={{
                    color: extra.underdogBoosted ? '#27ae60' : '#e74c3c',
                    fontWeight: 800, fontSize: '1.1rem',
                  }}>
                    {extra.underdogBoosted ? '🍀' : '💸'} {t(extra.underdogBoosted ? 'tinhTuy.cards.underdogBoost' as any : 'tinhTuy.cards.underdogPenalty' as any)}
                  </Typography>
                </Box>
              )}

              {/* ─── Festival rush signal ─── */}
              {extra?.movedToFestival && extra?.festivalCellIndex != null && BOARD_CELLS[extra.festivalCellIndex] && (
                <Box sx={{
                  mt: 2, px: 2, py: 1.5, borderRadius: 2,
                  bgcolor: 'rgba(241, 196, 15, 0.15)',
                  border: '2px solid rgba(241, 196, 15, 0.5)',
                  animation: 'tt-travel-pulse 1.5s ease-in-out infinite',
                }}>
                  <Typography variant="body2" sx={{ color: '#d4a017', fontWeight: 800, fontSize: '1.1rem', mb: 0.5 }}>
                    🎪 {t('tinhTuy.cards.festivalRush' as any)}
                  </Typography>
                  <Typography variant="body1" sx={{ color: '#2c3e50', fontWeight: 700 }}>
                    {t(BOARD_CELLS[extra.festivalCellIndex].name as any)}
                  </Typography>
                </Box>
              )}
              {card.id === 'kv-22' && !extra?.movedToFestival && (
                <Box sx={{
                  mt: 2, px: 2, py: 1.5, borderRadius: 2,
                  bgcolor: 'rgba(149, 165, 166, 0.15)',
                  border: '2px solid rgba(149, 165, 166, 0.4)',
                }}>
                  <Typography variant="body2" sx={{ color: '#7f8c8d', fontWeight: 700, fontSize: '1rem' }}>
                    😴 {t('tinhTuy.cards.noFestival' as any)}
                  </Typography>
                </Box>
              )}

              {/* ─── Extra turn signal ─── */}
              {extra?.extraTurn && (
                <Box sx={{
                  mt: 2, px: 2, py: 1.5, borderRadius: 2,
                  bgcolor: 'rgba(155, 89, 182, 0.15)',
                  border: '2px solid rgba(155, 89, 182, 0.5)',
                  animation: 'tt-travel-pulse 1.5s ease-in-out infinite',
                }}>
                  <Typography variant="body2" sx={{ color: '#8e44ad', fontWeight: 800, fontSize: '1.1rem' }}>
                    ⚡ {t('tinhTuy.cards.extraTurn' as any)}
                  </Typography>
                </Box>
              )}

              {/* ─── Wealth transfer signal ─── */}
              {extra?.wealthTransfer && (
                <Box sx={{
                  mt: 2, px: 2, py: 1.5, borderRadius: 2,
                  bgcolor: 'rgba(241, 196, 15, 0.15)',
                  border: '2px solid rgba(241, 196, 15, 0.5)',
                  animation: 'tt-travel-pulse 1.5s ease-in-out infinite',
                }}>
                  <Typography variant="body2" sx={{ color: '#d4a017', fontWeight: 800, fontSize: '1.1rem', mb: 0.5 }}>
                    💸 {t('tinhTuy.cards.wealthFrom' as any)}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 0.5 }}>
                    <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: getPlayerColor(extra.wealthTransfer.richestSlot) }} />
                    <Typography variant="body2" sx={{ color: getPlayerColor(extra.wealthTransfer.richestSlot), fontWeight: 700 }}>
                      {getPlayerName(extra.wealthTransfer.richestSlot)}
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#555' }}>→</Typography>
                    <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: getPlayerColor(extra.wealthTransfer.poorestSlot) }} />
                    <Typography variant="body2" sx={{ color: getPlayerColor(extra.wealthTransfer.poorestSlot), fontWeight: 700 }}>
                      {getPlayerName(extra.wealthTransfer.poorestSlot)}
                    </Typography>
                  </Box>
                </Box>
              )}

              {/* ─── Storm: all houses removed signal ─── */}
              {extra?.allHousesRemoved && extra.allHousesRemoved.length > 0 && (
                <Box sx={{
                  mt: 2, px: 2, py: 1.5, borderRadius: 2,
                  bgcolor: 'rgba(52, 73, 94, 0.1)',
                  border: '2px solid rgba(52, 73, 94, 0.3)',
                  animation: 'tt-travel-pulse 1.5s ease-in-out infinite',
                }}>
                  <Typography variant="body2" sx={{ color: '#2c3e50', fontWeight: 800, fontSize: '1rem', mb: 0.5 }}>
                    🌪️ {t('tinhTuy.cards.stormDamage' as any)}
                  </Typography>
                  {extra.allHousesRemoved.map((rem, i) => (
                    <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 0.8, mb: 0.3 }}>
                      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: getPlayerColor(rem.slot) }} />
                      <Typography variant="caption" sx={{ color: getPlayerColor(rem.slot), fontWeight: 700 }}>
                        {getPlayerName(rem.slot)}
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#555' }}>
                        — {BOARD_CELLS[rem.cellIndex] ? t(BOARD_CELLS[rem.cellIndex].name as any) : `#${rem.cellIndex}`}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              )}

              {/* ─── Teleport all signal (Chaos) ─── */}
              {extra?.teleportAll && extra.teleportAll.length > 0 && (
                <Box sx={{
                  mt: 2, px: 2, py: 1.5, borderRadius: 2,
                  bgcolor: 'rgba(155, 89, 182, 0.12)',
                  border: '2px solid rgba(155, 89, 182, 0.4)',
                  animation: 'tt-travel-pulse 1.5s ease-in-out infinite',
                }}>
                  <Typography variant="body2" sx={{ color: '#8e44ad', fontWeight: 800, fontSize: '1rem', mb: 0.5 }}>
                    🌀 {t('tinhTuy.cards.teleportAll' as any)}
                  </Typography>
                  {extra.teleportAll.map((tp, i) => (
                    <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 0.8, mb: 0.3 }}>
                      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: getPlayerColor(tp.slot) }} />
                      <Typography variant="caption" sx={{ color: getPlayerColor(tp.slot), fontWeight: 700 }}>
                        {getPlayerName(tp.slot)}
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#555' }}>
                        → {BOARD_CELLS[tp.to] ? t(BOARD_CELLS[tp.to].name as any) : `#${tp.to}`}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              )}

              {/* ─── Zone bonus: completed groups count ─── */}
              {extra?.completedGroups != null && (
                <Box sx={{
                  mt: 2, px: 2, py: 1.5, borderRadius: 2,
                  bgcolor: extra.completedGroups > 0 ? 'rgba(46, 204, 113, 0.15)' : 'rgba(149, 165, 166, 0.12)',
                  border: `2px solid ${extra.completedGroups > 0 ? 'rgba(46, 204, 113, 0.5)' : 'rgba(149, 165, 166, 0.4)'}`,
                  animation: extra.completedGroups > 0 ? 'tt-travel-pulse 1.5s ease-in-out infinite' : 'none',
                }}>
                  <Typography variant="body2" sx={{
                    color: extra.completedGroups > 0 ? '#27ae60' : '#7f8c8d',
                    fontWeight: 800, fontSize: '1.1rem',
                  }}>
                    {extra.completedGroups > 0 ? '🎯' : '😢'} {(t as any)('tinhTuy.cards.zoneBonusResult', { groups: extra.completedGroups })}
                  </Typography>
                </Box>
              )}
            </div>
          </div>
        </div>
      </Box>
    </Dialog>
  );
};
