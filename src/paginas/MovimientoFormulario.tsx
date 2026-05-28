/**
 * Diálogo de formulario de movimiento (crear o editar).
 * Usa MontoInput con formateo en vivo. Tipo entrada/salida con
 * ToggleButtonGroup. Las relaciones dueño/inquilino/propiedad se eligen
 * por Autocomplete (FK por ID); cada uno soporta quick-create inline
 * abriendo el diálogo del recurso correspondiente.
 *
 * Auto-fill: al seleccionar un inquilino, se autocompleta la propiedad
 * asociada (si no había ninguna seleccionada).
 */
import { useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField,
  Grid, Stack, Alert, ToggleButton, ToggleButtonGroup,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Movimiento, TipoMovimiento, Dueno, Inquilino, Propiedad,
} from '../api/tipos';
import { useCliente } from '../api/proveedor-cliente';
import { MontoInput } from '../componentes/MontoInput';
import { AutocompleteDueno } from '../componentes/AutocompleteDueno';
import { AutocompleteInquilino } from '../componentes/AutocompleteInquilino';
import { AutocompletePropiedad } from '../componentes/AutocompletePropiedad';
import { DuenoDialog } from './DuenoFormulario';
import { InquilinoDialog } from './InquilinoFormulario';
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
  dueno: Dueno | null;
  inquilino: Inquilino | null;
  propiedad: Propiedad | null;
  concepto: string;
  detalle: string;
}

function emptyForm(): Form {
  return {
    fecha: hoyIso(),
    tipo: 'entrada',
    monto_centavos: 0,
    dueno: null,
    inquilino: null,
    propiedad: null,
    concepto: '',
    detalle: '',
  };
}

export function MovimientoDialog({ open, onClose, movimiento }: Props): JSX.Element {
  const cliente = useCliente();
  const qc = useQueryClient();
  const [form, setForm] = useState<Form>(() => emptyForm());
  const [error, setError] = useState<string | null>(null);

  // Quick-create dialogs.
  const [dlgDueno, setDlgDueno] = useState<{ open: boolean; nombre: string }>({ open: false, nombre: '' });
  const [dlgInquilino, setDlgInquilino] = useState<{ open: boolean; nombre: string }>({ open: false, nombre: '' });

  // Necesario para hidratar entidades al editar (tenemos solo los IDs en el movimiento).
  const duenos = useQuery({
    queryKey: ['duenos'],
    queryFn: () => cliente.get<Dueno[]>('/api/duenos'),
    staleTime: 30_000,
  });
  const inquilinos = useQuery({
    queryKey: ['inquilinos'],
    queryFn: () => cliente.get<Inquilino[]>('/api/inquilinos'),
    staleTime: 30_000,
  });
  const propiedades = useQuery({
    queryKey: ['propiedades'],
    queryFn: () => cliente.get<Propiedad[]>('/api/propiedades'),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (!movimiento) {
      setForm(emptyForm());
      return;
    }
    const d = movimiento.dueno_id != null
      ? duenos.data?.find((x) => x.id === movimiento.dueno_id) ?? null
      : null;
    const i = movimiento.inquilino_id != null
      ? inquilinos.data?.find((x) => x.id === movimiento.inquilino_id) ?? null
      : null;
    const p = movimiento.propiedad_id != null
      ? propiedades.data?.find((x) => x.id === movimiento.propiedad_id) ?? null
      : null;
    setForm({
      fecha: movimiento.fecha,
      tipo: movimiento.tipo,
      monto_centavos: movimiento.monto_centavos,
      dueno: d,
      inquilino: i,
      propiedad: p,
      concepto: movimiento.concepto,
      detalle: movimiento.detalle ?? '',
    });
  }, [open, movimiento, duenos.data, inquilinos.data, propiedades.data]);

  const guardar = useMutation({
    mutationFn: async () => {
      if (form.monto_centavos <= 0) {
        throw new Error('Debe ingresar un monto mayor a 0');
      }
      const payload = {
        fecha: form.fecha,
        tipo: form.tipo,
        monto_centavos: form.monto_centavos,
        dueno_id: form.dueno?.id ?? null,
        inquilino_id: form.inquilino?.id ?? null,
        propiedad_id: form.propiedad?.id ?? null,
        concepto: form.concepto,
        detalle: form.detalle || null,
      };
      if (movimiento) {
        return cliente.patch<Movimiento>(`/api/movimientos/${movimiento.id}`, payload);
      }
      return cliente.post<Movimiento>('/api/movimientos', payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['movimientos'] });
      qc.invalidateQueries({ queryKey: ['movimientos-balance'] });
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  const update = <K extends keyof Form>(k: K, v: Form[K]): void =>
    setForm((s) => ({ ...s, [k]: v }));

  // Al elegir un inquilino, autocompletar propiedad si no hay una elegida o si difiere.
  function onInquilinoChange(i: Inquilino | null): void {
    setForm((s) => {
      if (!i) return { ...s, inquilino: null };
      const propAuto = propiedades.data?.find((p) => p.id === i.propiedad_id) ?? null;
      // Si no hay propiedad elegida o es distinta, la reemplazamos por la del inquilino.
      const propiedad = (!s.propiedad || s.propiedad.id !== i.propiedad_id) ? propAuto : s.propiedad;
      return { ...s, inquilino: i, propiedad };
    });
  }

  return (
    <>
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
                <AutocompleteDueno
                  value={form.dueno}
                  onChange={(d) => update('dueno', d)}
                  onCrearNuevo={(nombre) => setDlgDueno({ open: true, nombre })}
                  size="medium"
                />
              </Grid>
              <Grid item xs={6}>
                <AutocompleteInquilino
                  value={form.inquilino}
                  onChange={onInquilinoChange}
                  onCrearNuevo={(nombre) => setDlgInquilino({ open: true, nombre })}
                  size="medium"
                />
              </Grid>
              <Grid item xs={6}>
                <AutocompletePropiedad
                  value={form.propiedad}
                  onChange={(p) => update('propiedad', p)}
                  size="medium"
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

      <DuenoDialog
        open={dlgDueno.open}
        dueno={null}
        nombreInicial={dlgDueno.nombre}
        onClose={() => setDlgDueno({ open: false, nombre: '' })}
        onGuardado={(d) => setForm((s) => ({ ...s, dueno: d }))}
      />
      <InquilinoDialog
        open={dlgInquilino.open}
        inquilino={null}
        nombreInicial={dlgInquilino.nombre}
        propiedadId={form.propiedad?.id ?? null}
        onClose={() => setDlgInquilino({ open: false, nombre: '' })}
        onGuardado={(i) => onInquilinoChange(i)}
      />
    </>
  );
}
