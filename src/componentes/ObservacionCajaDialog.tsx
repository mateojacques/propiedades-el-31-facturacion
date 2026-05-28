/**
 * Diálogo para crear / editar la observación de caja del mes.
 */
import { useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Stack,
  ToggleButton, ToggleButtonGroup, TextField, Alert, Typography,
} from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ObservacionCaja, TipoObservacionCaja } from '../api/tipos';
import { useCliente } from '../api/proveedor-cliente';
import { MontoInput } from './MontoInput';
import { MESES_ES } from '../utils/formato';

interface Props {
  open: boolean;
  onClose: () => void;
  anio: number;
  mes: number;
  observacion: ObservacionCaja | null;
}

export function ObservacionCajaDialog({ open, onClose, anio, mes, observacion }: Props): JSX.Element {
  const cliente = useCliente();
  const qc = useQueryClient();
  const [tipo, setTipo] = useState<TipoObservacionCaja>('sobrante');
  const [monto, setMonto] = useState<number>(0);
  const [nota, setNota] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (observacion) {
      setTipo(observacion.tipo);
      setMonto(observacion.monto_centavos);
      setNota(observacion.nota ?? '');
    } else {
      setTipo('sobrante');
      setMonto(0);
      setNota('');
    }
  }, [open, observacion]);

  const guardar = useMutation({
    mutationFn: async () => {
      if (monto <= 0) throw new Error('El monto debe ser mayor a 0');
      return cliente.put<ObservacionCaja>('/api/observaciones-caja', {
        anio, mes, tipo, monto_centavos: monto, nota: nota || null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['observacion-caja', anio, mes] });
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Observación de caja — {MESES_ES[mes]} {anio}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Registrá si al cierre del mes hubo dinero de más (sobrante) o de menos (faltante)
            en la caja, junto con el monto observado y una nota opcional.
          </Typography>
          <ToggleButtonGroup
            color="primary"
            exclusive
            value={tipo}
            onChange={(_, v: TipoObservacionCaja | null) => v && setTipo(v)}
            fullWidth
          >
            <ToggleButton value="sobrante">Sobrante</ToggleButton>
            <ToggleButton value="faltante">Faltante</ToggleButton>
          </ToggleButtonGroup>
          <MontoInput
            label="Monto observado"
            value={monto}
            onChange={setMonto}
            fullWidth
            required
            autoFocus
          />
          <TextField
            label="Nota (opcional)"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            fullWidth
            multiline
            minRows={2}
          />
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" onClick={() => guardar.mutate()} disabled={guardar.isPending}>
          Guardar
        </Button>
      </DialogActions>
    </Dialog>
  );
}
