/**
 * Generación de PDF de liquidación por dueño y período.
 * El dueño se elige con AutocompleteDueno (selección por ID).
 */
import { useState } from 'react';
import {
  Box, Paper, Typography, Grid, TextField, Button, Alert, Stack,
} from '@mui/material';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import { useCliente } from '../api/proveedor-cliente';
import { MESES_ES } from '../utils/formato';
import { AutocompleteDueno } from '../componentes/AutocompleteDueno';
import type { Dueno } from '../api/tipos';

export function Liquidacion(): JSX.Element {
  const cliente = useCliente();
  const ahora = new Date();
  const [anio, setAnio] = useState<string>(String(ahora.getFullYear()));
  const [mes, setMes] = useState<string>(String(ahora.getMonth() + 1));
  const [dueno, setDueno] = useState<Dueno | null>(null);
  const [comision, setComision] = useState<string>('0');
  const [error, setError] = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);

  async function generar(): Promise<void> {
    setError(null);
    if (!dueno) {
      setError('Debe seleccionar un dueño');
      return;
    }
    if (!anio || !mes) {
      setError('Año y mes son obligatorios');
      return;
    }
    setGenerando(true);
    try {
      const mesEs = MESES_ES[Number(mes)] ?? mes;
      const slug = dueno.nombre.replace(/\s+/g, '_');
      const nombre = `liquidacion-${slug}-${anio}-${String(mes).padStart(2, '0')}.pdf`;
      await cliente.descargar(
        '/api/liquidacion/pdf',
        { anio, mes, dueno_id: dueno.id, comision: comision || '0' },
        nombre
      );
      console.log(`PDF de liquidación generado: ${mesEs} ${anio}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerando(false);
    }
  }

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 2 }}>Liquidación de dueño</Typography>

      <Paper sx={{ p: 3 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Genera un PDF con todos los movimientos del dueño indicado para el período seleccionado,
          aplicando la comisión sobre las entradas.
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={3}>
            <TextField
              label="Año" type="number" value={anio}
              onChange={(e) => setAnio(e.target.value)} fullWidth required
            />
          </Grid>
          <Grid item xs={3}>
            <TextField
              label="Mes" type="number" value={mes}
              onChange={(e) => setMes(e.target.value)}
              inputProps={{ min: 1, max: 12 }} fullWidth required
            />
          </Grid>
          <Grid item xs={6}>
            <AutocompleteDueno
              value={dueno}
              onChange={setDueno}
              required
              size="medium"
            />
          </Grid>
          <Grid item xs={3}>
            <TextField
              label="Comisión (%)" type="number" value={comision}
              onChange={(e) => setComision(e.target.value)}
              inputProps={{ min: 0, max: 100, step: 0.5 }}
              fullWidth
            />
          </Grid>
        </Grid>

        <Stack direction="row" spacing={2} sx={{ mt: 3 }}>
          <Button
            variant="contained"
            startIcon={<PictureAsPdfIcon />}
            onClick={generar}
            disabled={generando}
          >
            Generar PDF
          </Button>
        </Stack>

        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </Paper>
    </Box>
  );
}
