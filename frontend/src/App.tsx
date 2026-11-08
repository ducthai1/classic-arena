import React from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { Box, GlobalStyles, Slide, useMediaQuery } from '@mui/material';
import { SnackbarProvider } from 'notistack';
import ToastContent from './components/toast-content';
import { AuthProvider } from './contexts/AuthContext';
import { SocketProvider } from './contexts/SocketContext';
import { GameProvider } from './contexts/GameContext';
import { AchievementProvider } from './contexts/AchievementContext';
import { ToastProvider } from './contexts/ToastContext';
import { LanguageProvider } from './i18n';
import ErrorBoundary from './components/ErrorBoundary';
import LanguageSwitcher from './components/LanguageSwitcher';
import LoginPage from './pages/LoginPage';
import GameRoomPage from './pages/GameRoomPage';
import LeaderboardPage from './pages/LeaderboardPage';
import ProfilePage from './pages/ProfilePage';
import LuckyWheelConfigPage from './pages/LuckyWheelConfigPage';
import LuckyWheelAdminPage from './pages/admin/LuckyWheelAdminPage';
import LuckyWheelUserConfigPage from './pages/admin/LuckyWheelUserConfigPage';
import TinhTuyAdminPage from './pages/admin/TinhTuyAdminPage';
import TinhTuyRoomConfigPage from './pages/admin/TinhTuyRoomConfigPage';
import { MainLayout } from './components/MainLayout';

const theme = createTheme({
  palette: {
    primary: {
      main: '#7ec8e3',
      light: '#a8d5e2',
      dark: '#5ba8c7',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#a8e6cf',
      light: '#c8f0df',
      dark: '#88d6b7',
      contrastText: '#2c3e50',
    },
    background: {
      default: '#ffffff',
      paper: '#ffffff',
    },
    text: {
      primary: '#2c3e50',
      secondary: '#5a6a7a',
    },
    success: {
      main: '#a8e6cf',
    },
    warning: {
      main: '#ffb88c',
    },
    error: {
      main: '#ffaaa5',
    },
    info: {
      main: '#7ec8e3',
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          textTransform: 'none',
          fontWeight: 600,
          padding: '10px 24px',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          boxShadow: '0 2px 8px rgba(126, 200, 227, 0.15)',
          '&:hover': {
            boxShadow: '0 4px 16px rgba(126, 200, 227, 0.25)',
          },
        },
        contained: {
          background: 'linear-gradient(135deg, #7ec8e3 0%, #a8e6cf 100%)',
          color: '#ffffff',
          fontWeight: 700,
          boxShadow: '0 4px 12px rgba(126, 200, 227, 0.3)',
          border: 'none',
          '&:hover': {
            background: 'linear-gradient(135deg, #5ba8c7 0%, #88d6b7 100%)',
            boxShadow: '0 6px 16px rgba(126, 200, 227, 0.4)',
            transform: 'translateY(-2px)',
            border: 'none',
          },
        },
        outlined: {
          borderColor: '#7ec8e3',
          borderWidth: 2,
          color: '#2c3e50',
          fontWeight: 600,
          '&:hover': {
            borderColor: '#5ba8c7',
            borderWidth: 2,
            background: 'rgba(126, 200, 227, 0.08)',
            transform: 'translateY(-1px)',
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          background: '#ffffff',
          border: '1px solid rgba(126, 200, 227, 0.15)',
        },
        elevation1: {
          boxShadow: '0 2px 8px rgba(44, 62, 80, 0.08), 0 1px 3px rgba(0,0,0,0.04)',
        },
        elevation2: {
          boxShadow: '0 4px 12px rgba(44, 62, 80, 0.1), 0 2px 4px rgba(0,0,0,0.06)',
        },
        elevation3: {
          boxShadow: '0 6px 16px rgba(44, 62, 80, 0.12), 0 3px 6px rgba(0,0,0,0.08)',
        },
        elevation4: {
          boxShadow: '0 8px 24px rgba(44, 62, 80, 0.15), 0 4px 8px rgba(0,0,0,0.1)',
        },
      },
    },
  },
});

/** Slide down on mobile, slide from right on desktop */
const ResponsiveTransition = React.forwardRef<HTMLDivElement, any>(({ children, ...props }, ref) => {
  const isMobile = useMediaQuery('(max-width:600px)');
  return <Slide {...props} ref={ref} direction={isMobile ? 'down' : 'left'}>{children}</Slide>;
});
ResponsiveTransition.displayName = 'ResponsiveTransition';

// Create router with data router API
const router = createBrowserRouter([
  {
    path: '/',
    element: <MainLayout />,
  },
  {
    path: '/lucky-wheel',
    element: <MainLayout />,
  },
  {
    path: '/xi-dach-score',
    element: <MainLayout />,
  },
  {
    path: '/word-chain',
    element: <MainLayout />,
  },
  {
    path: '/tinh-tuy',
    element: <MainLayout />,
  },
  {
    path: '/go',
    element: <MainLayout />,
  },
  {
    path: '/badminton',
    element: <MainLayout />,
  },
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/game/:roomId',
    element: <GameRoomPage />,
  },
  {
    path: '/leaderboard',
    element: <MainLayout><LeaderboardPage /></MainLayout>,
  },
  {
    path: '/profile',
    element: <MainLayout><ProfilePage /></MainLayout>,
  },
  {
    path: '/lucky-wheel/config',
    element: <LuckyWheelConfigPage />,
  },
  {
    path: '/admin/lucky-wheel',
    element: <LuckyWheelAdminPage />,
  },
  {
    path: '/admin/lucky-wheel/:userId',
    element: <LuckyWheelUserConfigPage />,
  },
  {
    path: '/admin/tinh-tuy',
    element: <TinhTuyAdminPage />,
  },
  {
    path: '/admin/tinh-tuy/:roomId',
    element: <TinhTuyRoomConfigPage />,
  },
]);

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <GlobalStyles
        styles={{
          'html, body': {
            WebkitTapHighlightColor: 'transparent',
          },
          // Allow text selection in inputs
          'input, textarea, select': {
            userSelect: 'text',
            WebkitUserSelect: 'text',
          },
          // Skeleton loading animation for lucky wheel icons
          '@keyframes skeleton-shimmer': {
            '100%': {
              transform: 'translateX(100%)',
            },
          },
          // Toast progress bar shrink animation
          '@keyframes toast-shrink': {
            from: { transform: 'scaleX(1)' },
            to: { transform: 'scaleX(0)' },
          },
          // Toast positioning: desktop top-right, mobile top-center
          '.notistack-SnackbarContainer': {
            '@media (max-width: 600px)': {
              top: '8px !important',
              right: '8px !important',
              left: '8px !important',
              alignItems: 'center',
            },
          },
        }}
      />
      <Box
        sx={{
          minHeight: '100vh',
          background: 'linear-gradient(135deg, #f8fbff 0%, #ffffff 50%, #f0f9ff 100%)',
          backgroundAttachment: 'fixed',
        }}
      >
        <ErrorBoundary>
          <LanguageProvider>
            <LanguageSwitcher />
            <AchievementProvider>
              <AuthProvider>
                <SocketProvider>
                  <GameProvider>
                    <SnackbarProvider
                      maxSnack={3}
                      anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
                      autoHideDuration={3000}
                      preventDuplicate
                      TransitionComponent={ResponsiveTransition}
                      Components={{
                        success: ToastContent,
                        error: ToastContent,
                        warning: ToastContent,
                        info: ToastContent,
                        default: ToastContent,
                      }}
                    >
                      <ToastProvider>
                        <RouterProvider router={router} />
                      </ToastProvider>
                    </SnackbarProvider>
                  </GameProvider>
                </SocketProvider>
              </AuthProvider>
            </AchievementProvider>
          </LanguageProvider>
        </ErrorBoundary>
      </Box>
    </ThemeProvider>
  );
}

export default App;
