import {
  AppBar,
  Avatar,
  Box,
  Button,
  Container,
  Divider,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Switch,
  Toolbar,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { Link as RouterLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';
import { useColorMode } from '../theme/ColorModeContext';

/** Shared shell for authenticated pages: top bar + routed content. */
export function AppLayout() {
  const { user, logout } = useAuth();
  const { mode, toggle } = useColorMode();
  const location = useLocation();
  const navigate = useNavigate();
  const isAdmin = user?.globalRole === 'SUPER_ADMIN';

  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);
  const closeMenu = () => setAnchorEl(null);

  return (
    <Box>
      <AppBar position="static" elevation={0}>
        <Toolbar>
          <Typography
            variant="h6"
            component={RouterLink}
            to="/"
            sx={{ flexGrow: 1, fontWeight: 700, color: 'inherit', textDecoration: 'none' }}
          >
            TestingFlow
          </Typography>

          {isAdmin && (
            <>
              <Button
                color="inherit"
                component={RouterLink}
                to="/admin"
                sx={{ fontWeight: location.pathname === '/admin' ? 700 : 400 }}
              >
                Admin
              </Button>
              <Button
                color="inherit"
                component={RouterLink}
                to="/admin/projects"
                sx={{ mr: 1, fontWeight: location.pathname === '/admin/projects' ? 700 : 400 }}
              >
                Projects
              </Button>
            </>
          )}

          {/* Account trigger: avatar + name -> dropdown menu */}
          <Button
            color="inherit"
            onClick={(e) => setAnchorEl(e.currentTarget)}
            aria-haspopup="true"
            aria-controls={open ? 'account-menu' : undefined}
            aria-expanded={open ? 'true' : undefined}
            sx={{ textTransform: 'none', gap: 1 }}
            endIcon={<Box component="span" aria-hidden sx={{ fontSize: '0.7rem' }}>▾</Box>}
          >
            <Avatar
              src={user?.avatarUrl ?? undefined}
              sx={{ width: 32, height: 32, fontSize: '0.9rem' }}
            >
              {user?.name?.[0]?.toUpperCase()}
            </Avatar>
            <Typography component="span" sx={{ display: { xs: 'none', sm: 'block' } }}>
              {user?.name}
            </Typography>
          </Button>

          <Menu
            id="account-menu"
            anchorEl={anchorEl}
            open={open}
            onClose={closeMenu}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            slotProps={{ paper: { sx: { minWidth: 220 } } }}
          >
            <MenuItem
              component={RouterLink}
              to="/profile"
              onClick={closeMenu}
              selected={location.pathname === '/profile'}
            >
              <ListItemIcon>👤</ListItemIcon>
              <ListItemText>Profile</ListItemText>
            </MenuItem>

            {/* Toggle handled by the row click; the Switch is presentational. */}
            <MenuItem onClick={toggle}>
              <ListItemIcon>{mode === 'dark' ? '☀️' : '🌙'}</ListItemIcon>
              <ListItemText>Dark mode</ListItemText>
              <Switch
                edge="end"
                size="small"
                checked={mode === 'dark'}
                readOnly
                tabIndex={-1}
                inputProps={{ 'aria-label': 'toggle dark mode' }}
                sx={{ pointerEvents: 'none' }}
              />
            </MenuItem>

            <Divider />

            <MenuItem
              onClick={() => {
                closeMenu();
                void logout().then(() => navigate('/login', { replace: true }));
              }}
            >
              <ListItemIcon>⎋</ListItemIcon>
              <ListItemText>Sign out</ListItemText>
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ mt: 4 }}>
        <Outlet />
      </Container>
    </Box>
  );
}
