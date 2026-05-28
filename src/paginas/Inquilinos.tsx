/**
 * Listado de Inquilinos: tabla con búsqueda + filtro por propiedad,
 * CRUD inline. Borrar rechaza con mensaje claro si está referenciado.
 */
import { useMemo, useState } from 'react';
import {
  Box, Paper, Typography, TextField, Button, IconButton, Stack,
  CircularProgress, Alert, Tooltip, Chip,
} from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCliente } from '../api/proveedor-cliente';
import { ApiError } from '../api/cliente';
import type { Inquilino } from '../api/tipos';
import { InquilinoDialog } from './InquilinoFormulario';

export function Inquilinos(): JSX.Element {
  const cliente = useCliente();
  const qc = useQueryClient();
  const [busqueda, setBusqueda] = useState('');
  const [dialogo, setDialogo] = useState<{ abierto: boolean; inquilino: Inquilino | null }>({
    abierto: false, inquilino: null,
  });

  const lista = useQuery({
    queryKey: ['inquilinos'],
    queryFn: () => cliente.get<Inquilino[]>('/api/inquilinos'),
  });

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return lista.data ?? [];
    return (lista.data ?? []).filter((i) =>
      i.nombre.toLowerCase().includes(q) ||
      (i.documento ?? '').toLowerCase().includes(q) ||
      i.propiedad_ficha.toLowerCase().includes(q)
    );
  }, [busqueda, lista.data]);

  const borrar = useMutation({
    mutationFn: (id: number) => cliente.del<{ ok: boolean }>(`/api/inquilinos/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inquilinos'] }),
  });

  function onBorrar(i: Inquilino): void {
    if (!confirm(`¿Eliminar al inquilino "${i.nombre}"?`)) return;
    borrar.mutate(i.id, {
      onError: (e) => {
        if (e instanceof ApiError && e.status === 409) {
          const b = e.body as { referenciado_por_movimientos?: number } | null;
          const n = b?.referenciado_por_movimientos ?? 0;
          alert(
            `No se puede eliminar: hay ${n} movimientos asociados a este inquilino.\n\n` +
            `Borrá primero esos movimientos desde la sección Movimientos.`
          );
        } else {
          alert(`Error: ${(e as Error).message}`);
        }
      },
    });
  }

  const cols: GridColDef<Inquilino>[] = [
    { field: 'id', headerName: '#', width: 70 },
    { field: 'nombre', headerName: 'Nombre', flex: 1, minWidth: 180 },
    {
      field: 'documento', headerName: 'Documento', width: 160,
      valueGetter: (v) => v ?? '—',
    },
    {
      field: 'propiedad_ficha', headerName: 'Propiedad', width: 140,
      renderCell: (p) => <Chip label={p.value as string} size="small" variant="outlined" />,
    },
    {
      field: 'acciones', headerName: '', width: 110, sortable: false, filterable: false,
      renderCell: (p) => (
        <Stack direction="row" spacing={0.5}>
          <Tooltip title="Editar">
            <IconButton size="small" onClick={() => setDialogo({ abierto: true, inquilino: p.row })}>
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Eliminar">
            <IconButton size="small" onClick={() => onBorrar(p.row)}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      ),
    },
  ];

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h5">Inquilinos</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setDialogo({ abierto: true, inquilino: null })}
        >
          Nuevo inquilino
        </Button>
      </Stack>

      <Paper sx={{ p: 2, mb: 2 }}>
        <TextField
          label="Buscar (nombre, documento o ficha)"
          size="small"
          fullWidth
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </Paper>

      {lista.isError && <Alert severity="error" sx={{ mb: 2 }}>Error al cargar inquilinos</Alert>}

      <Paper sx={{ height: 600 }}>
        {lista.isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <CircularProgress />
          </Box>
        ) : (
          <DataGrid
            rows={filtrados}
            columns={cols}
            disableRowSelectionOnClick
            density="compact"
          />
        )}
      </Paper>

      <InquilinoDialog
        open={dialogo.abierto}
        inquilino={dialogo.inquilino}
        onClose={() => setDialogo({ abierto: false, inquilino: null })}
      />
    </Box>
  );
}
