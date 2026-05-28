/**
 * Layout principal: AppBar + Drawer permanente + área de contenido (Outlet).
 */
import { NavLink, Outlet } from 'react-router-dom';
import {
  AppBar, Toolbar, Typography, Drawer, List, ListItemButton, ListItemIcon,
  ListItemText, Box, Divider,
} from '@mui/material';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import DescriptionIcon from '@mui/icons-material/Description';
import SettingsIcon from '@mui/icons-material/Settings';

const ANCHO_DRAWER = 220;

const items = [
  { to: '/movimientos', label: 'Movimientos', icon: <ReceiptLongIcon /> },
  { to: '/importar', label: 'Importar', icon: <FileUploadIcon /> },
  { to: '/exportar', label: 'Exportar', icon: <FileDownloadIcon /> },
  { to: '/liquidacion', label: 'Liquidación', icon: <DescriptionIcon /> },
  { to: '/configuracion', label: 'Configuración', icon: <SettingsIcon /> },
];

export function Layout(): JSX.Element {
  return (
    <Box sx={{ display: 'flex', height: '100vh' }}>
      <AppBar
        position="fixed"
        sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}
      >
        <Toolbar>
          <Typography variant="h6" noWrap>
            Propiedades El 31 — Facturación
          </Typography>
        </Toolbar>
      </AppBar>
      <Drawer
        variant="permanent"
        sx={{
          width: ANCHO_DRAWER,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: { width: ANCHO_DRAWER, boxSizing: 'border-box' },
        }}
      >
        <Toolbar />
        <Divider />
        <List>
          {items.map((it) => (
            <ListItemButton
              key={it.to}
              component={NavLink}
              to={it.to}
              sx={{
                '&.active': {
                  bgcolor: 'primary.main',
                  color: 'primary.contrastText',
                  '& .MuiListItemIcon-root': { color: 'primary.contrastText' },
                  '&:hover': { bgcolor: 'primary.dark' },
                },
              }}
            >
              <ListItemIcon>{it.icon}</ListItemIcon>
              <ListItemText primary={it.label} />
            </ListItemButton>
          ))}
        </List>
      </Drawer>
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          overflow: 'auto',
          mt: 8,
        }}
      >
        <Outlet />
      </Box>
    </Box>
  );
}
