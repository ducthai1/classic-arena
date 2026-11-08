import React, { useState, useEffect, useCallback } from 'react';
import { Box, IconButton, useTheme, useMediaQuery, Fade } from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import { useLocation, useNavigate } from 'react-router-dom';
import { HomeSidebar, DRAWER_WIDTH_EXPANDED, DRAWER_WIDTH_COLLAPSED } from '../HomePage';
import { useAuth } from '../../contexts/AuthContext';
import HomePageContent from './HomePageContent';
import LuckyWheelContent from './LuckyWheelContent';
import { LuckyWheelProvider } from '../LuckyWheel';
import { XiDachScoreProvider, XiDachScoreContent } from '../XiDachScore';
import { WordChainProvider, WordChainContent } from '../WordChain';
import { TinhTuyProvider, TinhTuyContent } from '../TinhTuy';
import { GoProvider, GoContent } from '../Go';
import { BadmintonContent } from '../Badminton';
import { MainLayoutProvider, useMainLayout } from './MainLayoutContext';
import GuestNameDialog from '../GuestNameDialog/GuestNameDialog';
import { getGuestName } from '../../utils/guestName';

interface MainLayoutProps {
  children?: React.ReactNode;
}

const MainLayoutInner: React.FC<MainLayoutProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, user, logout } = useAuth();
  const { openGuestNameDialog } = useMainLayout();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [selectedGame, setSelectedGame] = useState<string>(() => {
    // Sync với route hiện tại
    if (location.pathname === '/lucky-wheel') return 'lucky-wheel';
    if (location.pathname === '/xi-dach-score') return 'xi-dach-score';
    if (location.pathname === '/word-chain') return 'word-chain';
    if (location.pathname === '/tinh-tuy') return 'tinh-tuy';
    if (location.pathname === '/go') return 'go';
    if (location.pathname === '/badminton') return 'badminton';
    if (location.pathname === '/') return 'caro';
    return 'caro';
  });
  const [isScrolled, setIsScrolled] = useState(false);
  const [contentKey, setContentKey] = useState(selectedGame); // Key để trigger animation
  const [showGuestNameDialog, setShowGuestNameDialog] = useState(false);

  // Listen for openGuestNameDialog event globally
  useEffect(() => {
    const handleOpenGuestName = () => setShowGuestNameDialog(true);
    window.addEventListener('openGuestNameDialog', handleOpenGuestName);
    return () => window.removeEventListener('openGuestNameDialog', handleOpenGuestName);
  }, []);

  // Sync selectedGame với route changes (cho các route khác như /game/:roomId)
  useEffect(() => {
    if (location.pathname === '/lucky-wheel') {
      setSelectedGame('lucky-wheel');
    } else if (location.pathname === '/xi-dach-score') {
      setSelectedGame('xi-dach-score');
    } else if (location.pathname === '/word-chain') {
      setSelectedGame('word-chain');
    } else if (location.pathname === '/tinh-tuy') {
      setSelectedGame('tinh-tuy');
    } else if (location.pathname === '/go') {
      setSelectedGame('go');
    } else if (location.pathname === '/badminton') {
      setSelectedGame('badminton');
    } else if (location.pathname === '/') {
      setSelectedGame('caro');
    }
  }, [location.pathname]);

  // Scroll detection for mobile header
  useEffect(() => {
    if (!isMobile) return;

    const handleScroll = () => {
      setIsScrolled(window.scrollY > 30);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isMobile]);

  // Handle game selection - navigate to game route (instant, no delay)
  const handleGameSelection = useCallback((gameId: string) => {
    // Determine target path for gameId
    const targetPath = gameId === 'lucky-wheel' ? '/lucky-wheel'
      : gameId === 'xi-dach-score' ? '/xi-dach-score'
        : gameId === 'word-chain' ? '/word-chain'
          : gameId === 'tinh-tuy' ? '/tinh-tuy'
            : gameId === 'go' ? '/go'
              : gameId === 'badminton' ? '/badminton'
                : '/';

    // Skip if already on target route
    if (location.pathname === targetPath) return;

    // Instant switch - no fade delay
    setContentKey(gameId);
    setSelectedGame(gameId);
    navigate(targetPath, { replace: true });
  }, [location.pathname, navigate]);


  const drawerWidth = isMobile ? DRAWER_WIDTH_EXPANDED : (sidebarCollapsed ? DRAWER_WIDTH_COLLAPSED : DRAWER_WIDTH_EXPANDED);

  // Expose sidebar width as CSS variable for fixed-position overlays (chat, reactions)
  useEffect(() => {
    const sidebarOffset = isMobile ? 0 : drawerWidth;
    document.documentElement.style.setProperty('--sidebar-width', `${sidebarOffset}px`);
  }, [isMobile, drawerWidth]);

  // Render content based on selected game
  const renderContent = () => {
    if (children) {
      // Nếu có children (cho các route đặc biệt như /game/:roomId), render children
      return children;
    }

    // Render game content dựa trên selectedGame
    switch (selectedGame) {
      case 'lucky-wheel':
        return (
          <LuckyWheelProvider>
            <LuckyWheelContent />
          </LuckyWheelProvider>
        );
      case 'xi-dach-score':
        return (
          <XiDachScoreProvider>
            <XiDachScoreContent />
          </XiDachScoreProvider>
        );
      case 'word-chain':
        return (
          <WordChainProvider>
            <WordChainContent />
          </WordChainProvider>
        );
      case 'tinh-tuy':
        return (
          <TinhTuyProvider>
            <TinhTuyContent />
          </TinhTuyProvider>
        );
      case 'go':
        return (
          <GoProvider>
            <GoContent />
          </GoProvider>
        );
      case 'badminton':
        return <BadmintonContent />;
      case 'caro':
      default:
        return <HomePageContent />;
    }
  };

  const { fullscreen } = useMainLayout();

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar - hidden in fullscreen mode */}
      {!fullscreen && (
        <HomeSidebar
          isMobile={isMobile}
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          sidebarCollapsed={sidebarCollapsed}
          setSidebarCollapsed={setSidebarCollapsed}
          selectedGame={selectedGame}
          setSelectedGame={handleGameSelection}
          isAuthenticated={isAuthenticated}
          user={user}
          logout={logout}
          onEditGuestName={!isAuthenticated ? openGuestNameDialog : undefined}
        />
      )}

      {/* Main Content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: fullscreen ? '100%' : { md: `calc(100% - ${drawerWidth}px)` },
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh',
          ml: { md: 0 },
          position: 'relative',
        }}
      >
        {/* Mobile Header - hidden in fullscreen mode */}
        {isMobile && !sidebarOpen && !fullscreen && (
          <Box
            sx={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              zIndex: (theme) => theme.zIndex.drawer + 1,
              height: 80,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              px: 2,
              bgcolor: isScrolled ? '#ffffff' : 'transparent',
              borderBottom: isScrolled ? '1px solid rgba(126, 200, 227, 0.15)' : 'none',
              boxShadow: isScrolled ? '0 2px 8px rgba(126, 200, 227, 0.15)' : 'none',
              transition: 'background-color 0.2s ease, box-shadow 0.2s ease',
              pointerEvents: 'auto',
            }}
          >
            {/* Hamburger - absolute left */}
            <IconButton
              onClick={() => setSidebarOpen(true)}
              sx={{
                position: 'absolute',
                left: 16,
                width: 48,
                height: 48,
                background: 'linear-gradient(135deg, #7ec8e3 0%, #a8e6cf 100%)',
                color: '#ffffff',
                boxShadow: '0 2px 8px rgba(126, 200, 227, 0.25)',
                '&:hover': {
                  background: 'linear-gradient(135deg, #5ba8c7 0%, #88d6b7 100%)',
                },
              }}
            >
              <MenuIcon />
            </IconButton>
            {/* Logo - centered */}
            <Box
              component="img"
              src="/logo/glacier_logo.svg"
              alt="Glacier"
              sx={{
                height: 70,
                objectFit: 'contain',
                transform: isScrolled ? 'scale(0.75)' : 'scale(1)',
                transition: 'transform 0.25s ease',
              }}
            />
          </Box>
        )}

        {/* Content với fade in/out animation */}
        <Box
          sx={{
            width: '100%',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0, // Allow flex children to shrink properly
          }}
        >
          <Fade in={true} timeout={150} key={contentKey}>
            <Box
              sx={{
                width: '100%',
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {renderContent()}
            </Box>
          </Fade>
        </Box>
      </Box>

      {/* Global Guest Name Dialog */}
      {!isAuthenticated && (
        <GuestNameDialog
          open={showGuestNameDialog}
          onClose={() => setShowGuestNameDialog(false)}
          initialName={getGuestName()}
        />
      )}
    </Box>
  );
};

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  return (
    <MainLayoutProvider>
      <MainLayoutInner>{children}</MainLayoutInner>
    </MainLayoutProvider>
  );
};

export default MainLayout;
