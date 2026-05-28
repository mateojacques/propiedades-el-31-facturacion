/**
 * Listado de Dueños: tabla con filtros por nombre/documento, botón Nuevo,
 * edit/delete por fila. Borrar rechaza con mensaje claro si está
 * referenciado por movimientos.
 */
import { useMemo, useState } from 'react';
import {
  Box, Paper, Typography, TextField, Button, IconButton, Stack,
  CircularProgress, Alert, Chip, Tooltip,
} from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCliente } from '../api/proveedor-cliente';
import { ApiError } from '../api/cliente';
import type { Dueno } from '../api/tipos';
import { DuenoDialog } from './DuenoFormulario';

export function Duenos(): JSX.Element {
  const cliente = useCliente();
  const qc = useQueryClient();
  const [busqueda, setBusqueda] = useState('');
  const [dialogo, setDialogo] = useState<{ abierto: boolean; dueno: Dueno | null }>({
    abierto: false, dueno: null,
  });

  const lista = useQuery({
    queryKey: ['duenos'],
    queryFn: () => cliente.get<Dueno[]>('/api/duenos'),
  });

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return lista.data ?? [];
    return (lista.data ?? []).filter((d) =>
      d.nombre.toLowerCase().includes(q) ||
      (d.documento ?? '').toLowerCase().includes(q) ||
      d.propiedades.some((p) => p.ficha.toLowerCase().includes(q))
    );
  }, [busqueda, lista.data]);

  const borrar = useMutation({
    mutationFn: (id: number) => cliente.del<{ ok: boolean }>(`/api/duenos/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['duenos'] }),
  });

  function onBorrar(d: Dueno): void {
    if (!confirm(`¿Eliminar al dueño "${d.nombre}"?`)) return;
    borrar.mutate(d.id, {
      onError: (e) => {
        if (e instanceof ApiError && e.status === 409) {
          const b = e.body as { referenciado_por_movimientos?: number } | null;
          const n = b?.referenciado_por_movimientos ?? 0;
          alert(
            `No se puede eliminar: hay ${n} movimientos asociados a este dueño.\n\n` +
            `Borrá primero esos movimientos desde la sección Movimientos.`
          );
        } else {
          alert(`Error: ${(e as Error).message}`);
        }
      },
    });
  }

  const cols: GridColDef<Dueno>[] = [
    { field: 'id', headerName: '#', width: 70 },
    { field: 'nombre', headerName: 'Nombre', flex: 1, minWidth: 180 },
    {
      field: 'documento', headerName: 'Documento', width: 160,
      valueGetter: (v) => v ?? '—',
    },
    {
      field: 'propiedades', headerName: 'Propiedades', flex: 1, minWidth: 220, sortable: false,
      renderCell: (p) => (
        <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5, py: 0.5 }}>
          {(p.value as Dueno['propiedades']).map((prop) => (
            <Chip key={prop.id} label={prop.ficha} size="small" variant="outlined" />
          ))}
          {(p.value as Dueno['propiedades']).length === 0 && (
            <Typography variant="caption" color="text.secondary">—</Typography>
          )}
        </Stack>
      ),
    },
    {
      field: 'acciones', headerName: '', width: 110, sortable: false, filterable: false,
      renderCell: (p) => (
        <Stack direction="row" spacing={0.5}>
          <Tooltip title="Editar">
            <IconButton size="small" onClick={() => setDialogo({ abierto: true, dueno: p.row })}>
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
        <Typography variant="h5">Dueños</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setDialogo({ abierto: true, dueno: null })}
        >
          Nuevo dueño
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

      {lista.isError && <Alert severity="error" sx={{ mb: 2 }}>Error al cargar dueños</Alert>}

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
            density="standard"
            getRowHeight={() => 'auto'}
            sx={{ '& .MuiDataGrid-cell': { py: 1 } }}
          />
        )}
      </Paper>

      <DuenoDialog
        open={dialogo.abierto}
        dueno={dialogo.dueno}
        onClose={() => setDialogo({ abierto: false, dueno: null })}
      />
    </Box>
  );
}
