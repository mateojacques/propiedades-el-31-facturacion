/**
 * ObservacionCajaCard — Banner visible sobre la tabla de movimientos
 * cuando el mes seleccionado tiene una observación (sobrante / faltante).
 *
 * Si no hay observación, muestra un botón para crear una.
 * Si la hay, muestra el detalle, con botones para editarla o eliminarla.
 */
import { Alert, AlertTitle, Stack, Button, IconButton, Box } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import type { ObservacionCaja } from '../api/tipos';
import { formatARSConSimbolo } from '../utils/formato';

interface Props {
  observacion: ObservacionCaja | null;
  onCrear: () => void;
  onEditar: () => void;
  onEliminar: () => void;
}

export function ObservacionCajaCard({ observacion, onCrear, onEditar, onEliminar }: Props): JSX.Element {
  if (!observacion) {
    return (
      <Alert
        severity="info"
        variant="outlined"
        sx={{ mb: 2 }}
        action={
          <Button
            color="primary"
            size="small"
            startIcon={<AddIcon />}
            onClick={onCrear}
          >
            Marcar sobrante/faltante
          </Button>
        }
      >
        Este mes no tiene observación de caja registrada.
      </Alert>
    );
  }

  const esSobrante = observacion.tipo === 'sobrante';
  const severity = esSobrante ? 'info' : 'warning';
  const titulo = esSobrante ? 'Sobrante de caja' : 'Faltante de caja';

  return (
    <Alert
      severity={severity}
      variant="filled"
      sx={{ mb: 2 }}
      action={
        <Stack direction="row" spacing={0.5}>
          <IconButton size="small" color="inherit" onClick={onEditar} title="Editar">
            <EditIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" color="inherit" onClick={onEliminar} title="Eliminar">
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Stack>
      }
    >
      <AlertTitle sx={{ fontWeight: 700 }}>
        {titulo}: {formatARSConSimbolo(observacion.monto_centavos)}
      </AlertTitle>
      {observacion.nota && <Box sx={{ mt: 0.5 }}>{observacion.nota}</Box>}
    </Alert>
  );
}
