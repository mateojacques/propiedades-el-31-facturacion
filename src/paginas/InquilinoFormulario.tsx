/**
 * Diálogo de formulario de Inquilino. La propiedad se elige con
 * AutocompletePropiedad (con quick-create de propiedad nueva).
 *
 * Acepta `nombreInicial` y `propiedadId` para precargar el form cuando
 * se invoca desde un quick-create.
 */
import { useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField,
  Grid, Stack, Alert,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCliente } from '../api/proveedor-cliente';
import type { Inquilino, Propiedad } from '../api/tipos';
import { AutocompletePropiedad } from '../componentes/AutocompletePropiedad';

interface Props {
  open: boolean;
  onClose: () => void;
  inquilino: Inquilino | null;
  nombreInicial?: string;
  propiedadId?: number | null;
  onGuardado?: (i: Inquilino) => void;
}

interface Form {
  nombre: string;
  documento: string;
  propiedad: Propiedad | null;
  /** Ficha pendiente de creación (cuando el quick-create no encontró match). */
  fichaPendiente: string | null;
}

function emptyForm(nombreInicial?: string): Form {
  return {
    nombre: nombreInicial ?? '',
    documento: '',
    propiedad: null,
    fichaPendiente: null,
  };
}

export function InquilinoDialog({
  open, onClose, inquilino, nombreInicial, propiedadId, onGuardado,
}: Props): JSX.Element {
  const cliente = useCliente();
  const qc = useQueryClient();
  const propiedades = useQuery({
    queryKey: ['propiedades'],
    queryFn: () => cliente.get<Propiedad[]>('/api/propiedades'),
    staleTime: 30_000,
  });

  const [form, setForm] = useState<Form>(() => emptyForm(nombreInicial));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (inquilino) {
      setForm({
        nombre: inquilino.nombre,
        documento: inquilino.documento ?? '',
        propiedad: {
          id: inquilino.propiedad_id,
          ficha: inquilino.propiedad_ficha,
          duenos_ids: [],
          creado_en: '',
          actualizado_en: '',
        },
        fichaPendiente: null,
      });
    } else if (propiedadId != null && propiedades.data) {
      const p = propiedades.data.find((x) => x.id === propiedadId) ?? null;
      setForm({ ...emptyForm(nombreInicial), propiedad: p });
    } else {
      setForm(emptyForm(nombreInicial));
    }
  }, [open, inquilino, nombreInicial, propiedadId, propiedades.data]);

  const guardar = useMutation({
    mutationFn: async () => {
      if (!form.nombre.trim()) throw new Error('El nombre es obligatorio');
      if (!form.propiedad && !form.fichaPendiente) {
        throw new Error('Debe asignar una propiedad');
      }
      const payload: Record<string, unknown> = {
        nombre: form.nombre.trim(),
        documento: form.documento.trim() ? form.documento.trim() : null,
      };
      if (form.propiedad) payload.propiedad_id = form.propiedad.id;
      else payload.ficha = form.fichaPendiente;

      if (inquilino) {
        return cliente.patch<Inquilino>(`/api/inquilinos/${inquilino.id}`, payload);
      }
      return cliente.post<Inquilino>('/api/inquilinos', payload);
    },
    onSuccess: (i) => {
      qc.invalidateQueries({ queryKey: ['inquilinos'] });
      qc.invalidateQueries({ queryKey: ['propiedades'] });
      onGuardado?.(i);
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  const update = <K extends keyof Form>(k: K, v: Form[K]): void =>
    setForm((s) => ({ ...s, [k]: v }));

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{inquilino ? `Editar inquilino #${inquilino.id}` : 'Nuevo inquilino'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Grid container spacing={2}>
            <Grid item xs={7}>
              <TextField
                label="Nombre"
                value={form.nombre}
                onChange={(e) => update('nombre', e.target.value)}
                fullWidth
                required
                autoFocus
              />
            </Grid>
            <Grid item xs={5}>
              <TextField
                label="Documento (opcional)"
                value={form.documento}
                onChange={(e) => update('documento', e.target.value)}
                fullWidth
                placeholder="DNI/CUIT"
              />
            </Grid>
            <Grid item xs={12}>
              <AutocompletePropiedad
                value={form.propiedad}
                onChange={(p) => setForm((s) => ({ ...s, propiedad: p, fichaPendiente: null }))}
                onCrearNueva={(ficha) =>
                  setForm((s) => ({ ...s, propiedad: null, fichaPendiente: ficha }))
                }
                required
              />
              {form.fichaPendiente && (
                <Alert severity="info" sx={{ mt: 1 }}>
                  Se creará la propiedad <strong>{form.fichaPendiente}</strong> al guardar.
                </Alert>
              )}
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
          {inquilino ? 'Guardar' : 'Crear'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
