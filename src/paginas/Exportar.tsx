/**
 * Exportación de movimientos a CSV o Excel. Filtro de dueño opcional por ID.
 * El backend sigue mostrando columnas Entrada/Salida/Balance en la planilla
 * exportada para mantener la legibilidad histórica del usuario final.
 */
import { useState } from 'react';
import {
  Box, Paper, Typography, Grid, TextField, Button, Stack, Alert,
} from '@mui/material';
import GridOnIcon from '@mui/icons-material/GridOn';
import DescriptionIcon from '@mui/icons-material/Description';
import { useCliente } from '../api/proveedor-cliente';
import { AutocompleteDueno } from '../componentes/AutocompleteDueno';
import type { Dueno } from '../api/tipos';

export function Exportar(): JSX.Element {
  const cliente = useCliente();
  const [anio, setAnio] = useState<string>('');
  const [mes, setMes] = useState<string>('');
  const [dueno, setDueno] = useState<Dueno | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exportando, setExportando] = useState<'csv' | 'excel' | null>(null);

  async function exportar(formato: 'csv' | 'excel'): Promise<void> {
    setError(null);
    setExportando(formato);
    try {
      const sufijo = [anio, mes && String(mes).padStart(2, '0')].filter(Boolean).join('-');
      const nombre = `movimientos${sufijo ? '-' + sufijo : ''}.${formato === 'csv' ? 'csv' : 'xlsx'}`;
      await cliente.descargar(
        `/api/exportar/${formato}`,
        {
          anio: anio || undefined,
          mes: mes || undefined,
          dueno_id: dueno?.id,
        },
        nombre
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExportando(null);
    }
  }

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 2 }}>Exportar movimientos</Typography>

      <Paper sx={{ p: 3 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Dejá los filtros vacíos para exportar todos los movimientos.
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={3}>
            <TextField label="Año" type="number" value={anio} onChange={(e) => setAnio(e.target.value)} fullWidth />
          </Grid>
          <Grid item xs={3}>
            <TextField
              label="Mes" type="number" value={mes} onChange={(e) => setMes(e.target.value)}
              fullWidth inputProps={{ min: 1, max: 12 }}
            />
          </Grid>
          <Grid item xs={6}>
            <AutocompleteDueno
              value={dueno}
              onChange={setDueno}
              label="Filtrar por dueño (opcional)"
              size="medium"
            />
          </Grid>
        </Grid>

        <Stack direction="row" spacing={2} sx={{ mt: 3 }}>
          <Button
            variant="contained"
            startIcon={<GridOnIcon />}
            onClick={() => exportar('excel')}
            disabled={exportando !== null}
          >
            Descargar Excel (.xlsx)
          </Button>
          <Button
            variant="outlined"
            startIcon={<DescriptionIcon />}
            onClick={() => exportar('csv')}
            disabled={exportando !== null}
          >
            Descargar CSV
          </Button>
        </Stack>

        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </Paper>
    </Box>
  );
}
