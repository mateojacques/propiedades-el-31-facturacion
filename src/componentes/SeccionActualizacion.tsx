/**
 * SeccionActualizacion — tarjeta MUI que renderiza el estado del auto-updater.
 *
 * Consume `useAutoUpdater()` y deriva la UI de `status.kind` mediante un
 * switch exhaustivo (chequeo `never` al final). No importa nada de
 * `electron` ni `electron-updater`: todo viaja por el bridge de preload.
 */

import {
  Paper, Typography, Button, Stack, Alert, LinearProgress, CircularProgress,
  Accordion, AccordionSummary, AccordionDetails, Box,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import RefreshIcon from '@mui/icons-material/Refresh';
import DownloadIcon from '@mui/icons-material/Download';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { useAutoUpdater, type UpdateStatus } from '../hooks/useAutoUpdater';
import { formatFechaCorta } from '../utils/formato';

interface ContenidoProps {
  status: UpdateStatus;
  currentVersion: string;
  check: () => Promise<void>;
  download: () => Promise<void>;
  install: () => Promise<void>;
}

/** Formatea un tamaño en bytes a una cadena legible (ej. "12.3 MB"). */
function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const unidades = ['B', 'KB', 'MB', 'GB', 'TB'] as const;
  const i = Math.min(unidades.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const valor = bytes / Math.pow(1024, i);
  const decimales = i === 0 ? 0 : valor >= 100 ? 0 : valor >= 10 ? 1 : 2;
  return `${valor.toFixed(decimales)} ${unidades[i]}`;
}

/** Render del cuerpo según el estado actual. Pura, sin efectos. */
function ContenidoEstado(props: ContenidoProps): JSX.Element {
  const { status, currentVersion, check, download, install } = props;
  const ocupado = status.kind === 'checking' || status.kind === 'downloading';

  switch (status.kind) {
    case 'idle':
      return (
        <Stack spacing={1}>
          <Typography variant="body2" color="text.secondary">
            Comprobar si hay una versión nueva disponible.
          </Typography>
          <Box>
            <Button variant="contained" color="primary" startIcon={<RefreshIcon />}
              onClick={() => { void check(); }} disabled={ocupado}>
              Buscar actualizaciones
            </Button>
          </Box>
        </Stack>
      );

    case 'checking':
      return (
        <Stack direction="row" spacing={2} alignItems="center">
          <CircularProgress size={20} />
          <Typography variant="body2">Buscando actualizaciones…</Typography>
        </Stack>
      );

    case 'not-available':
      return (
        <Stack spacing={2}>
          <Alert severity="success">
            Tu aplicación está actualizada (versión {status.version}).
          </Alert>
          <Typography variant="caption" color="text.secondary">
            Última verificación: {status.checkedAt.toLocaleString('es-AR')}
          </Typography>
          <Box>
            <Button variant="contained" startIcon={<RefreshIcon />}
              onClick={() => { void check(); }} disabled={ocupado}>
              Buscar de nuevo
            </Button>
          </Box>
        </Stack>
      );

    case 'available':
      return (
        <Stack spacing={2}>
          <Alert severity="info">
            Nueva versión disponible: <strong>{status.version}</strong> (actual: {currentVersion}).
          </Alert>
          {status.releaseDate && (
            <Typography variant="caption" color="text.secondary">
              Publicada: {formatFechaCorta(status.releaseDate)}
            </Typography>
          )}
          {status.releaseNotes && (
            <Accordion disableGutters>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="body2">Ver notas de la versión</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                  {status.releaseNotes}
                </Typography>
              </AccordionDetails>
            </Accordion>
          )}
          <Stack direction="row" spacing={1}>
            <Button variant="contained" color="primary" startIcon={<DownloadIcon />}
              onClick={() => { void download(); }} disabled={ocupado}>
              Descargar actualización
            </Button>
            <Button variant="text" disabled={ocupado}>Más tarde</Button>
          </Stack>
        </Stack>
      );

    case 'downloading':
      return (
        <Stack spacing={1}>
          <LinearProgress variant="determinate" value={status.percent} />
          <Typography variant="caption" color="text.secondary">
            {formatBytes(status.transferred)} / {formatBytes(status.total)} ·{' '}
            {status.percent.toFixed(0)}% · {formatBytes(status.bytesPerSecond)}/s
          </Typography>
        </Stack>
      );

    case 'downloaded':
      return (
        <Stack spacing={2}>
          <Alert severity="success">
            Actualización descargada (versión {status.version}). La aplicación se reiniciará para instalarla.
          </Alert>
          <Stack direction="row" spacing={1}>
            <Button variant="contained" color="primary" startIcon={<RestartAltIcon />}
              onClick={() => { void install(); }}>
              Reiniciar e instalar ahora
            </Button>
            <Button variant="text">Instalar al cerrar la aplicación</Button>
          </Stack>
        </Stack>
      );

    case 'error':
      return (
        <Stack spacing={2}>
          <Alert severity="error">{status.message}</Alert>
          <Box>
            <Button variant="contained" startIcon={<RefreshIcon />}
              onClick={() => { void check(); }}>
              Reintentar
            </Button>
          </Box>
        </Stack>
      );

    case 'dev-mode':
      return (
        <Alert severity="info">
          Modo desarrollo: las actualizaciones automáticas no están disponibles.
        </Alert>
      );

    default: {
      // Chequeo exhaustivo: si se agrega un kind nuevo, TS rompe acá.
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function SeccionActualizacion(): JSX.Element {
  const { status, currentVersion, check, download, install } = useAutoUpdater();
  return (
    <Paper sx={{ p: 3, mb: 2 }}>
      <Typography variant="h6" gutterBottom>Actualización de la aplicación</Typography>
      <Stack spacing={2}>
        <Typography variant="body2" color="text.secondary">
          Versión actual: {currentVersion || '...'}
        </Typography>
        <ContenidoEstado
          status={status}
          currentVersion={currentVersion}
          check={check}
          download={download}
          install={install}
        />
      </Stack>
    </Paper>
  );
}
