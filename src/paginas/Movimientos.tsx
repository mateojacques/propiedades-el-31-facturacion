/**
 * Listado de movimientos del período. Una sola tabla con filtros por
 * año/mes/tipo y filtrado por dueño/inquilino/propiedad usando Autocompletes
 * (selección por ID, sin búsqueda fuzzy). Badge único de "Balance del mes".
 * Incluye la Observación de Caja del período (sobrante/faltante) arriba.
 * El balance se invalida automáticamente cuando cambia cualquier movimiento.
 */
import { useMemo, useState } from 'react';
import {
  Box, Paper, Typography, Grid, TextField, Button, IconButton, Stack,
  CircularProgress, Alert, Chip, Tooltip, MenuItem,
} from '@mui/material';
import {
  DataGrid, type GridColDef, type GridPaginationModel,
} from '@mui/x-data-grid';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCliente } from '../api/proveedor-cliente';
import type {
  Movimiento, ListaMovimientos, BalanceMensual, ObservacionCaja, TipoMovimiento,
  Dueno, Inquilino, Propiedad,
} from '../api/tipos';
import { formatARSConSimbolo, formatFechaCorta, MESES_ES } from '../utils/formato';
import { MovimientoDialog } from './MovimientoFormulario';
import { ObservacionCajaCard } from '../componentes/ObservacionCajaCard';
import { ObservacionCajaDialog } from '../componentes/ObservacionCajaDialog';
import { AutocompleteDueno } from '../componentes/AutocompleteDueno';
import { AutocompleteInquilino } from '../componentes/AutocompleteInquilino';
import { AutocompletePropiedad } from '../componentes/AutocompletePropiedad';

export function Movimientos(): JSX.Element {
  const cliente = useCliente();
  const qc = useQueryClient();
  const ahora = new Date();
  const [anio, setAnio] = useState<string>(String(ahora.getFullYear()));
  const [mes, setMes] = useState<string>(String(ahora.getMonth() + 1));
  const [tipo, setTipo] = useState<TipoMovimiento | ''>('');
  const [duenoFiltro, setDuenoFiltro] = useState<Dueno | null>(null);
  const [inquilinoFiltro, setInquilinoFiltro] = useState<Inquilino | null>(null);
  const [propiedadFiltro, setPropiedadFiltro] = useState<Propiedad | null>(null);
  const [pagina, setPagina] = useState<GridPaginationModel>({ page: 0, pageSize: 50 });
  const [dlgMov, setDlgMov] = useState<{ abierto: boolean; movimiento: Movimiento | null }>({
    abierto: false, movimiento: null,
  });
  const [dlgObs, setDlgObs] = useState<boolean>(false);

  const anioNum = anio ? Number(anio) : undefined;
  const mesNum = mes ? Number(mes) : undefined;
  const tieneAnioMes = Number.isFinite(anioNum) && Number.isFinite(mesNum);

  const filtros = useMemo(
    () => ({
      anio: anio || undefined,
      mes: mes || undefined,
      tipo: tipo || undefined,
      dueno_id: duenoFiltro?.id,
      inquilino_id: inquilinoFiltro?.id,
      propiedad_id: propiedadFiltro?.id,
      pagina: pagina.page + 1,
      por_pagina: pagina.pageSize,
    }),
    [anio, mes, tipo, duenoFiltro, inquilinoFiltro, propiedadFiltro, pagina]
  );

  const lista = useQuery({
    queryKey: ['movimientos', filtros],
    queryFn: () => cliente.get<ListaMovimientos>('/api/movimientos', filtros),
  });

  const balance = useQuery({
    queryKey: ['movimientos-balance', anioNum, mesNum],
    queryFn: () =>
      cliente.get<BalanceMensual>('/api/movimientos/balance', { anio: anioNum, mes: mesNum }),
    enabled: tieneAnioMes,
  });

  const observacion = useQuery({
    queryKey: ['observacion-caja', anioNum, mesNum],
    queryFn: () =>
      cliente.get<ObservacionCaja | null>('/api/observaciones-caja', { anio: anioNum, mes: mesNum }),
    enabled: tieneAnioMes,
  });

  const borrar = useMutation({
    mutationFn: (id: number) => cliente.del<{ ok: boolean }>(`/api/movimientos/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['movimientos'] });
      qc.invalidateQueries({ queryKey: ['movimientos-balance'] });
    },
  });

  const borrarObs = useMutation({
    mutationFn: () => cliente.del<{ ok: boolean }>(`/api/observaciones-caja?anio=${anioNum}&mes=${mesNum}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['observacion-caja'] }),
  });

  const cols: GridColDef<Movimiento>[] = [
    { field: 'id', headerName: '#', width: 70 },
    {
      field: 'fecha', headerName: 'Fecha', width: 110,
      valueFormatter: (v) => formatFechaCorta(v as string),
    },
    {
      field: 'tipo', headerName: 'Tipo', width: 100,
      renderCell: (p) => {
        const esEntrada = p.value === 'entrada';
        return (
          <Chip
            size="small"
            icon={esEntrada ? <ArrowUpwardIcon fontSize="small" /> : <ArrowDownwardIcon fontSize="small" />}
            label={esEntrada ? 'Entrada' : 'Salida'}
            color={esEntrada ? 'success' : 'warning'}
            variant="outlined"
          />
        );
      },
    },
    {
      field: 'dueno_nombre', headerName: 'Dueño', flex: 1, minWidth: 140,
      valueGetter: (_, row) => row.dueno_nombre ?? '',
    },
    {
      field: 'inquilino_nombre', headerName: 'Inquilino', flex: 1, minWidth: 140,
      valueGetter: (_, row) => row.inquilino_nombre ?? '',
    },
    {
      field: 'propiedad_ficha', headerName: 'Propiedad', width: 130,
      renderCell: (p) => p.row.propiedad_ficha
        ? <Chip size="small" label={p.row.propiedad_ficha} variant="outlined" />
        : null,
    },
    {
      field: 'monto_centavos', headerName: 'Monto', width: 130, align: 'right', headerAlign: 'right',
      renderCell: (p) => {
        const esEntrada = p.row.tipo === 'entrada';
        return (
          <Box sx={{ color: esEntrada ? 'success.main' : 'warning.main', fontWeight: 500 }}>
            {esEntrada ? '+' : '−'} {formatARSConSimbolo(Number(p.value ?? 0))}
          </Box>
        );
      },
    },
    { field: 'concepto', headerName: 'Concepto', flex: 1, minWidth: 140 },
    {
      field: 'acciones', headerName: '', width: 110, sortable: false, filterable: false,
      renderCell: (p) => (
        <Stack direction="row" spacing={0.5}>
          <Tooltip title="Editar">
            <IconButton size="small" onClick={() => setDlgMov({ abierto: true, movimiento: p.row })}>
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Eliminar">
            <IconButton
              size="small"
              onClick={() => {
                if (confirm(`¿Eliminar movimiento #${p.row.id}?`)) borrar.mutate(p.row.id);
              }}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      ),
    },
  ];

  const balanceCentavos = balance.data?.balance_centavos ?? 0;
  const balanceColor: 'success' | 'error' | 'default' =
    balanceCentavos > 0 ? 'success' : balanceCentavos < 0 ? 'error' : 'default';
  const mesLabel = mesNum ? MESES_ES[mesNum] : '';

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h5">Movimientos</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setDlgMov({ abierto: true, movimiento: null })}
        >
          Nuevo movimiento
        </Button>
      </Stack>

      {tieneAnioMes && (
        <Box sx={{ mb: 2 }}>
          <ObservacionCajaCard
            observacion={observacion.data ?? null}
            onCrear={() => setDlgObs(true)}
            onEditar={() => setDlgObs(true)}
            onEliminar={() => {
              if (confirm('¿Eliminar la observación de caja del mes?')) borrarObs.mutate();
            }}
          />
        </Box>
      )}

      <Paper sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={2}>
            <TextField
              label="Año" type="number" size="small" fullWidth
              value={anio} onChange={(e) => setAnio(e.target.value)}
            />
          </Grid>
          <Grid item xs={2}>
            <TextField
              select label="Mes" size="small" fullWidth
              value={mes} onChange={(e) => setMes(e.target.value)}
            >
              <MenuItem value="">Todos</MenuItem>
              {Object.entries(MESES_ES).map(([k, v]) => (
                <MenuItem key={k} value={k}>{v}</MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={2}>
            <TextField
              select label="Tipo" size="small" fullWidth
              value={tipo} onChange={(e) => setTipo(e.target.value as TipoMovimiento | '')}
            >
              <MenuItem value="">Todos</MenuItem>
              <MenuItem value="entrada">Entradas</MenuItem>
              <MenuItem value="salida">Salidas</MenuItem>
            </TextField>
          </Grid>
          <Grid item xs={3}>
            <AutocompleteDueno
              value={duenoFiltro}
              onChange={setDuenoFiltro}
              label="Filtrar por dueño"
            />
          </Grid>
          <Grid item xs={3}>
            {tieneAnioMes && balance.data && (
              <Tooltip
                title={`${balance.data.cantidad} movimientos · Entradas ${formatARSConSimbolo(
                  balance.data.total_entradas_centavos
                )} · Salidas ${formatARSConSimbolo(balance.data.total_salidas_centavos)}`}
              >
                <Chip
                  color={balanceColor === 'default' ? undefined : balanceColor}
                  label={`Balance ${mesLabel} ${anio}: ${formatARSConSimbolo(balanceCentavos)}`}
                  sx={{ width: '100%', fontWeight: 600, fontSize: '0.95rem', height: 36 }}
                />
              </Tooltip>
            )}
          </Grid>
          <Grid item xs={3}>
            <AutocompleteInquilino
              value={inquilinoFiltro}
              onChange={setInquilinoFiltro}
              label="Filtrar por inquilino"
              filtrarPorPropiedadId={propiedadFiltro?.id ?? null}
            />
          </Grid>
          <Grid item xs={3}>
            <AutocompletePropiedad
              value={propiedadFiltro}
              onChange={setPropiedadFiltro}
              label="Filtrar por propiedad"
            />
          </Grid>
        </Grid>
      </Paper>

      {lista.isError && <Alert severity="error" sx={{ mb: 2 }}>Error al cargar movimientos</Alert>}
      {borrar.isError && <Alert severity="error" sx={{ mb: 2 }}>Error al eliminar</Alert>}

      <Paper sx={{ height: 600 }}>
        {lista.isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <CircularProgress />
          </Box>
        ) : (
          <DataGrid
            rows={lista.data?.data ?? []}
            columns={cols}
            paginationMode="server"
            rowCount={lista.data?.paginacion.total ?? 0}
            paginationModel={pagina}
            onPaginationModelChange={setPagina}
            pageSizeOptions={[25, 50, 100, 200]}
            disableRowSelectionOnClick
            density="compact"
          />
        )}
      </Paper>

      <MovimientoDialog
        open={dlgMov.abierto}
        movimiento={dlgMov.movimiento}
        periodoAnio={anioNum}
        periodoMes={mesNum}
        onClose={() => setDlgMov({ abierto: false, movimiento: null })}
      />

      {tieneAnioMes && (
        <ObservacionCajaDialog
          open={dlgObs}
          onClose={() => setDlgObs(false)}
          anio={anioNum!}
          mes={mesNum!}
          observacion={observacion.data ?? null}
        />
      )}
    </Box>
  );
}
