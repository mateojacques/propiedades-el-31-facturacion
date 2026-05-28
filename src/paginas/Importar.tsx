/**
 * Importación CSV / XLSX. Flujo en 3 pasos:
 *   1) Selección de archivo
 *   2) Vista previa con errores / advertencias
 *   3) Confirmación → inserta filas válidas
 */
import { useRef, useState } from 'react';
import {
  Box, Paper, Typography, Button, Alert, Stack, Chip, CircularProgress,
  Table, TableHead, TableRow, TableCell, TableBody, TableContainer,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCliente } from '../api/proveedor-cliente';
import type { VistaPreviaImportacion, FilaImportacion } from '../api/tipos';
import { formatARSConSimbolo } from '../utils/formato';

function etiquetaTipo(t: FilaImportacion['tipo']): string {
  if (t === 'entrada') return 'Entrada';
  if (t === 'salida') return 'Salida';
  return '—';
}

export function Importar(): JSX.Element {
  const cliente = useCliente();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [resultadoFinal, setResultadoFinal] = useState<{ insertadas: number } | null>(null);

  const vistaPrevia = useMutation({
    mutationFn: (f: File) => cliente.uploadFile<VistaPreviaImportacion>('/api/importar/vista-previa', f),
  });

  const confirmar = useMutation({
    mutationFn: (filas: FilaImportacion[]) =>
      cliente.post<{ insertadas: number; duenos_recalculados: number }>(
        '/api/importar/confirmar',
        { filas }
      ),
    onSuccess: (r) => {
      setResultadoFinal({ insertadas: r.insertadas });
      qc.invalidateQueries({ queryKey: ['movimientos'] });
      qc.invalidateQueries({ queryKey: ['movimientos-balance'] });
      vistaPrevia.reset();
      setArchivo(null);
    },
  });

  function onSeleccionar(e: React.ChangeEvent<HTMLInputElement>): void {
    const f = e.target.files?.[0];
    if (!f) return;
    setArchivo(f);
    setResultadoFinal(null);
    vistaPrevia.mutate(f);
  }

  function reiniciar(): void {
    setArchivo(null);
    setResultadoFinal(null);
    vistaPrevia.reset();
    confirmar.reset();
    if (inputRef.current) inputRef.current.value = '';
  }

  const preview = vistaPrevia.data;

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 2 }}>Importar movimientos</Typography>

      <Paper sx={{ p: 3, mb: 2 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <Button
            variant="contained"
            startIcon={<UploadFileIcon />}
            onClick={() => inputRef.current?.click()}
          >
            Seleccionar archivo (CSV o XLSX)
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx"
            hidden
            onChange={onSeleccionar}
          />
          {archivo && <Typography variant="body2">{archivo.name}</Typography>}
          {(archivo || preview) && (
            <Button onClick={reiniciar} color="inherit">Reiniciar</Button>
          )}
        </Stack>
      </Paper>

      {vistaPrevia.isPending && (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}><CircularProgress /></Box>
      )}

      {vistaPrevia.isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Error al procesar el archivo: {(vistaPrevia.error as Error).message}
        </Alert>
      )}

      {resultadoFinal && (
        <Alert severity="success" icon={<CheckCircleIcon />} sx={{ mb: 2 }}>
          Se importaron {resultadoFinal.insertadas} movimientos correctamente.
        </Alert>
      )}

      {preview && !resultadoFinal && (
        <Paper sx={{ p: 2 }}>
          <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
            <Chip label={`Total leídas: ${preview.total_leidas}`} />
            <Chip color="success" label={`Válidas: ${preview.validas.length}`} />
            {preview.errores.length > 0 && (
              <Chip color="error" label={`Errores: ${preview.errores.length}`} />
            )}
            {preview.advertencias.length > 0 && (
              <Chip color="warning" label={`Advertencias: ${preview.advertencias.length}`} />
            )}
          </Stack>

          {preview.errores.length > 0 && (
            <Alert severity="error" sx={{ mb: 2 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Filas con errores (no se importarán):
              </Typography>
              <Box component="ul" sx={{ m: 0, pl: 2 }}>
                {preview.errores.slice(0, 10).map((e, i) => (
                  <li key={i}>Fila {e.rowNumber}: {e.message}</li>
                ))}
                {preview.errores.length > 10 && <li>… y {preview.errores.length - 10} más</li>}
              </Box>
            </Alert>
          )}

          {preview.advertencias.length > 0 && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              <Typography variant="body2">
                {preview.advertencias.length} advertencia(s) — se importarán igualmente.
              </Typography>
            </Alert>
          )}

          {preview.validas.length > 0 && (
            <>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Vista previa de filas válidas (primeras 20):
              </Typography>
              <TableContainer sx={{ maxHeight: 360, mb: 2 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>#</TableCell>
                      <TableCell>Fecha</TableCell>
                      <TableCell>Dueño</TableCell>
                      <TableCell>Inquilino</TableCell>
                      <TableCell>Propiedad</TableCell>
                      <TableCell>Tipo</TableCell>
                      <TableCell align="right">Monto</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {preview.validas.slice(0, 20).map((f) => (
                      <TableRow key={f.rowNumber}>
                        <TableCell>{f.rowNumber}</TableCell>
                        <TableCell>{f.date}</TableCell>
                        <TableCell>{f.duenoName}</TableCell>
                        <TableCell>{f.inquilinoName}</TableCell>
                        <TableCell>{f.propertyFileNumber}</TableCell>
                        <TableCell>{etiquetaTipo(f.tipo)}</TableCell>
                        <TableCell align="right">{formatARSConSimbolo(f.montoCentavos)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              <Button
                variant="contained"
                color="primary"
                disabled={confirmar.isPending}
                onClick={() => confirmar.mutate(preview.validas)}
              >
                Confirmar importación de {preview.validas.length} movimientos
              </Button>
            </>
          )}

          {confirmar.isError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              Error al confirmar: {(confirmar.error as Error).message}
            </Alert>
          )}
        </Paper>
      )}
    </Box>
  );
}
