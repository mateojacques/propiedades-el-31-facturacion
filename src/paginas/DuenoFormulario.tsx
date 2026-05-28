/**
 * Diálogo de formulario de Dueño. Crea o edita; al guardar invalida
 * ['duenos'] y ['propiedades'] (porque el alta puede auto-crear propiedades).
 *
 * Acepta `nombreInicial` para precargar el campo cuando se invoca como
 * quick-create desde un Autocomplete.
 */
import { useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField,
  Grid, Stack, Alert,
} from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCliente } from '../api/proveedor-cliente';
import type { Dueno } from '../api/tipos';
import {
  SelectorPropiedadesChips, todasValidas,
} from '../componentes/SelectorPropiedadesChips';

interface Props {
  open: boolean;
  onClose: () => void;
  dueno: Dueno | null;
  nombreInicial?: string;
  /** Callback opcional con el dueño creado/editado (para quick-create flows). */
  onGuardado?: (d: Dueno) => void;
}

interface Form {
  nombre: string;
  documento: string;
  fichas: string[];
}

function duenoAForm(d: Dueno | null, nombreInicial?: string): Form {
  if (!d) {
    return {
      nombre: nombreInicial ?? '',
      documento: '',
      fichas: [],
    };
  }
  return {
    nombre: d.nombre,
    documento: d.documento ?? '',
    fichas: d.propiedades.map((p) => p.ficha),
  };
}

export function DuenoDialog({ open, onClose, dueno, nombreInicial, onGuardado }: Props): JSX.Element {
  const cliente = useCliente();
  const qc = useQueryClient();
  const [form, setForm] = useState<Form>(() => duenoAForm(dueno, nombreInicial));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(duenoAForm(dueno, nombreInicial));
      setError(null);
    }
  }, [open, dueno, nombreInicial]);

  const guardar = useMutation({
    mutationFn: async () => {
      if (!form.nombre.trim()) throw new Error('El nombre es obligatorio');
      if (!todasValidas(form.fichas)) {
        throw new Error('Hay fichas inválidas en el listado de propiedades');
      }
      const payload = {
        nombre: form.nombre.trim(),
        documento: form.documento.trim() ? form.documento.trim() : null,
        fichas: form.fichas,
      };
      if (dueno) {
        return cliente.patch<Dueno>(`/api/duenos/${dueno.id}`, payload);
      }
      return cliente.post<Dueno>('/api/duenos', payload);
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['duenos'] });
      qc.invalidateQueries({ queryKey: ['propiedades'] });
      onGuardado?.(d);
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  const update = <K extends keyof Form>(k: K, v: Form[K]): void =>
    setForm((s) => ({ ...s, [k]: v }));

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{dueno ? `Editar dueño #${dueno.id}` : 'Nuevo dueño'}</DialogTitle>
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
              <SelectorPropiedadesChips
                value={form.fichas}
                onChange={(v) => update('fichas', v)}
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
          {dueno ? 'Guardar' : 'Crear'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
