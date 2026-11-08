import React, { useState, useRef } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
  Paper,
  Tooltip,
} from '@mui/material';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import SportsTennisIcon from '@mui/icons-material/SportsTennis';
import RefreshIcon from '@mui/icons-material/Refresh';

export const BadmintonContent: React.FC = () => {
  const [helpOpen, setHelpOpen] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const handleFullscreen = () => {
    if (iframeRef.current) {
      if (iframeRef.current.requestFullscreen) {
        iframeRef.current.requestFullscreen();
      }
    }
  };

  const handleOpenNewTab = () => {
    window.open('/games/birdie-bash/index.html', '_blank');
  };

  const handleReload = () => {
    if (iframeRef.current) {
      iframeRef.current.src = '/games/birdie-bash/index.html';
    }
  };

  return (
    <Box
      sx={{
        width: '100%',
        minHeight: 'calc(100vh - 80px)',
        p: { xs: 1, sm: 2, md: 3 },
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      {/* Top Action Bar */}
      <Paper
        elevation={1}
        sx={{
          p: { xs: 1.5, sm: 2 },
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 1.5,
          borderRadius: '16px',
          background: 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(255,240,245,0.95) 100%)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255, 143, 176, 0.25)',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              width: 44,
              height: 44,
              borderRadius: '12px',
              bgcolor: 'rgba(255, 143, 176, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '24px',
            }}
          >
            🏸
          </Box>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="h6" sx={{ fontWeight: 800, color: '#2c3e50', fontSize: { xs: '1rem', sm: '1.25rem' } }}>
                Birdie Bash · Cầu Lông 3D
              </Typography>
              <Chip
                label="3D Game"
                size="small"
                sx={{
                  bgcolor: '#ff8fb0',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: '0.72rem',
                }}
              />
            </Box>
            <Typography variant="body2" sx={{ color: '#666', fontSize: '0.85rem' }}>
              Thời gian thực trên trình duyệt · 16 thú cưng vui nhộn · Đấu Bot & Luyện tập
            </Typography>
          </Box>
        </Box>

        {/* Action buttons */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Tooltip title="Hướng dẫn điều khiển">
            <Button
              variant="outlined"
              size="small"
              startIcon={<HelpOutlineIcon />}
              onClick={() => setHelpOpen(true)}
              sx={{
                borderColor: '#ff8fb0',
                color: '#d44670',
                '&:hover': { borderColor: '#d44670', bgcolor: 'rgba(255, 143, 176, 0.08)' },
              }}
            >
              Cách chơi
            </Button>
          </Tooltip>

          <Tooltip title="Tải lại game">
            <IconButton onClick={handleReload} size="small" sx={{ color: '#666' }}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>

          <Tooltip title="Chơi toàn màn hình">
            <IconButton onClick={handleFullscreen} size="small" sx={{ color: '#ff8fb0' }}>
              <FullscreenIcon />
            </IconButton>
          </Tooltip>

          <Tooltip title="Mở trang riêng">
            <IconButton onClick={handleOpenNewTab} size="small" sx={{ color: '#2c3e50' }}>
              <OpenInNewIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Paper>

      {/* Game Iframe Container */}
      <Box
        sx={{
          position: 'relative',
          width: '100%',
          height: { xs: '72vh', sm: '76vh', md: '80vh' },
          borderRadius: '20px',
          overflow: 'hidden',
          boxShadow: '0 12px 36px rgba(0,0,0,0.12)',
          bgcolor: '#1a1a24',
          border: '2px solid rgba(255, 143, 176, 0.3)',
        }}
      >
        <iframe
          ref={iframeRef}
          src="/games/birdie-bash/index.html"
          title="Birdie Bash 3D Badminton"
          allow="autoplay; fullscreen; clipboard-write"
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            display: 'block',
          }}
        />
      </Box>

      {/* Quick Controls Bar */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexWrap: 'wrap',
          gap: { xs: 1, sm: 2 },
          py: 1,
          px: 2,
          bgcolor: 'rgba(255, 255, 255, 0.85)',
          borderRadius: '12px',
          border: '1px solid rgba(0,0,0,0.06)',
          fontSize: '0.85rem',
          color: '#555',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Chip label="A / D hoặc ← / →" size="small" variant="outlined" sx={{ fontWeight: 600 }} />
          <span>Di chuyển</span>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Chip label="Space / J" size="small" variant="outlined" sx={{ fontWeight: 600 }} />
          <span>Vung vợt (Swing)</span>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Chip label="K" size="small" color="primary" sx={{ fontWeight: 600 }} />
          <span>Nhảy đập cầu (Smash)</span>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Chip label="L" size="small" color="secondary" sx={{ fontWeight: 600 }} />
          <span>Cứu cầu (Dive)</span>
        </Box>
      </Box>

      {/* Help Dialog */}
      <Dialog open={helpOpen} onClose={() => setHelpOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
          <SportsTennisIcon sx={{ color: '#ff8fb0' }} />
          Hướng Dẫn Chơi Birdie Bash (Cầu Lông 3D)
        </DialogTitle>
        <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="body1">
            <strong>Birdie Bash</strong> là tựa game thể thao cầu lông 3D phong cách dễ thương. Bạn có thể chọn các nhân vật động vật ngộ nghĩnh (Thỏ Pomu, Gấu Bao, Gà Pipi, Ếch Ribbi...) và thi đấu trên các sân vận động khác nhau!
          </Typography>

          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#d44670' }}>
            🎮 Phím Điều Khiển:
          </Typography>
          <Box component="ul" sx={{ pl: 2, m: 0, '& li': { mb: 0.5 } }}>
            <li><strong>Di chuyển:</strong> Phím mũi tên (← ↑ ↓ →) hoặc W, A, S, D</li>
            <li><strong>Đánh bóng chuẩn (Swing):</strong> Phím <code>Space</code> hoặc phím <code>J</code></li>
            <li><strong>Nhảy đập cầu (Jump Smash):</strong> Phím <code>K</code> khi cầu ở trên cao</li>
            <li><strong>Lao người cứu cầu (Dive):</strong> Phím <code>L</code> khi cầu ở xa tầm với</li>
          </Box>

          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#d44670' }}>
            🏟️ Các Chế Độ Chơi:
          </Typography>
          <Box component="ul" sx={{ pl: 2, m: 0, '& li': { mb: 0.5 } }}>
            <li><strong>Play Bots:</strong> Thi đấu 1v1 với máy qua 3 mức độ khó (Dễ, Trung bình, Cao thủ).</li>
            <li><strong>Sân đấu & Gió:</strong>
              <ul>
                <li><em>Blossom Gym:</em> Nhà thi đấu kín, không có gió, chuẩn kỹ thuật.</li>
                <li><em>Twilight Rooftop:</em> Sân thượng hoàng hôn, gió thoảng nhẹ.</li>
                <li><em>Meadow Park:</em> Công viên ngoài trời, gió đổi hướng liên tục.</li>
              </ul>
            </li>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHelpOpen(false)} variant="contained" sx={{ bgcolor: '#ff8fb0', '&:hover': { bgcolor: '#d44670' } }}>
            Đã hiểu, vào chơi ngay!
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default BadmintonContent;

