/**
 * Diálogo de formulario de movimiento (crear o editar).
 * Usa MontoInput con formateo en vivo. Tipo entrada/salida con
 * ToggleButtonGroup. Al guardar, invalida tanto la lista como el
 * balance del mes para forzar recálculo instantáneo.
 */
import { useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField,
  Grid, Stack, Alert, ToggleButton, ToggleButtonGroup,
} from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Movimiento, TipoMovimiento } from '../api/tipos';
import { useCliente } from '../api/proveedor-cliente';
import { MontoInput } from '../componentes/MontoInput';
import { hoyIso } from '../utils/formato';

interface Props {
  open: boolean;
  onClose: () => void;
  movimiento: Movimiento | null; // null → crear
}

interface Form {
  fecha: string;
  tipo: TipoMovimiento;
  monto_centavos: number;
  dueno: string;
  inquilino: string;
  propiedad: string;
  concepto: string;
  detalle: string;
}

function movimientoAForm(m: Movimiento | null): Form {
  if (!m) {
    return {
      fecha: hoyIso(),
      tipo: 'entrada',
      monto_centavos: 0,
      dueno: '', inquilino: '', propiedad: '',
      concepto: '', detalle: '',
    };
  }
  return {
    fecha: m.fecha,
    tipo: m.tipo,
    monto_centavos: m.monto_centavos,
    dueno: m.dueno ?? '',
    inquilino: m.inquilino ?? '',
    propiedad: m.propiedad ?? '',
    concepto: m.concepto,
    detalle: m.detalle ?? '',
  };
}

export function MovimientoDialog({ open, onClose, movimiento }: Props): JSX.Element {
  const cliente = useCliente();
  const qc = useQueryClient();
  const [form, setForm] = useState<Form>(() => movimientoAForm(movimiento));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(movimientoAForm(movimiento));
      setError(null);
    }
  }, [open, movimiento]);

  const guardar = useMutation({
    mutationFn: async () => {
      if (form.monto_centavos <= 0) {
        throw new Error('Debe ingresar un monto mayor a 0');
      }
      const payload = {
        fecha: form.fecha,
        tipo: form.tipo,
        monto_centavos: form.monto_centavos,
        dueno: form.dueno || null,
        inquilino: form.inquilino || null,
        propiedad: form.propiedad || null,
        concepto: form.concepto,
        detalle: form.detalle || null,
      };
      if (movimiento) {
        return cliente.patch<Movimiento>(`/api/movimientos/${movimiento.id}`, payload);
      }
      return cliente.post<Movimiento>('/api/movimientos', payload);
    },
    onSuccess: () => {
      // Invalida lista + balance para recálculo instantáneo en la página de Movimientos.
      qc.invalidateQueries({ queryKey: ['movimientos'] });
      qc.invalidateQueries({ queryKey: ['movimientos-balance'] });
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  const update = <K extends keyof Form>(k: K, v: Form[K]): void =>
    setForm((s) => ({ ...s, [k]: v }));

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{movimiento ? `Editar movimiento #${movimiento.id}` : 'Nuevo movimiento'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Grid container spacing={2}>
            <Grid item xs={4}>
              <TextField
                label="Fecha"
                type="date"
                value={form.fecha}
                onChange={(e) => update('fecha', e.target.value)}
                InputLabelProps={{ shrink: true }}
                fullWidth
                required
              />
            </Grid>
            <Grid item xs={4}>
              <ToggleButtonGroup
                color={form.tipo === 'entrada' ? 'success' : 'error'}
                exclusive
                value={form.tipo}
                onChange={(_, v: TipoMovimiento | null) => v && update('tipo', v)}
                fullWidth
                sx={{ height: '100%' }}
              >
                <ToggleButton value="entrada">Entrada</ToggleButton>
                <ToggleButton value="salida">Salida</ToggleButton>
              </ToggleButtonGroup>
            </Grid>
            <Grid item xs={4}>
              <MontoInput
                label="Monto"
                value={form.monto_centavos}
                onChange={(v) => update('monto_centavos', v)}
                fullWidth
                required
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Concepto"
                value={form.concepto}
                onChange={(e) => update('concepto', e.target.value)}
                fullWidth
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                label="Dueño"
                value={form.dueno}
                onChange={(e) => update('dueno', e.target.value)}
                fullWidth
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                label="Inquilino"
                value={form.inquilino}
                onChange={(e) => update('inquilino', e.target.value)}
                fullWidth
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                label="Propiedad"
                value={form.propiedad}
                onChange={(e) => update('propiedad', e.target.value)}
                fullWidth
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Detalle"
                value={form.detalle}
                onChange={(e) => update('detalle', e.target.value)}
                fullWidth
                multiline
                minRows={2}
              />
            </Grid>
          </Grid>
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button
          variant="contained"
          onClick={() => guardar.mutate()}
          disabled={guardar.isPending}
        >
          {movimiento ? 'Guardar' : 'Crear'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
