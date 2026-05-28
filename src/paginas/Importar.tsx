/**
 * Importación CSV / XLSX. Flujo en 3 pasos:
 *   1) Selección de archivo
 *   2) Vista previa: muestra filas válidas, errores, advertencias y
 *      entidades nuevas que se crearán (dueños, inquilinos, propiedades).
 *   3) Confirmación → inserta filas válidas y materializa entidades nuevas.
 */
import { useRef, useState } from 'react';
import {
  Box, Paper, Typography, Button, Alert, Stack, Chip, CircularProgress,
  Table, TableHead, TableRow, TableCell, TableBody, TableContainer,
  Accordion, AccordionSummary, AccordionDetails,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCliente } from '../api/proveedor-cliente';
import type {
  VistaPreviaImportacion, FilaImportacion, ResultadoConfirmacionImportacion,
} from '../api/tipos';
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
  const [resultadoFinal, setResultadoFinal] = useState<ResultadoConfirmacionImportacion | null>(null);

  const vistaPrevia = useMutation({
    mutationFn: (f: File) => cliente.uploadFile<VistaPreviaImportacion>('/api/importar/vista-previa', f),
  });

  const confirmar = useMutation({
    mutationFn: (filas: FilaImportacion[]) =>
      cliente.post<ResultadoConfirmacionImportacion>('/api/importar/confirmar', { filas }),
    onSuccess: (r) => {
      setResultadoFinal(r);
      qc.invalidateQueries({ queryKey: ['movimientos'] });
      qc.invalidateQueries({ queryKey: ['movimientos-balance'] });
      qc.invalidateQueries({ queryKey: ['duenos'] });
      qc.invalidateQueries({ queryKey: ['inquilinos'] });
      qc.invalidateQueries({ queryKey: ['propiedades'] });
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
  const totalNuevas = preview
    ? preview.entidades_a_crear.duenos.length +
      preview.entidades_a_crear.inquilinos.length +
      preview.entidades_a_crear.propiedades.length
    : 0;

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
          Se importaron <strong>{resultadoFinal.insertadas}</strong> movimientos.
          {resultadoFinal.duenos_creados > 0 && ` · ${resultadoFinal.duenos_creados} dueño(s) creado(s)`}
          {resultadoFinal.inquilinos_creados > 0 && ` · ${resultadoFinal.inquilinos_creados} inquilino(s) creado(s)`}
          {resultadoFinal.propiedades_creadas > 0 && ` · ${resultadoFinal.propiedades_creadas} propiedad(es) creada(s)`}
          .
        </Alert>
      )}

      {preview && !resultadoFinal && (
        <Paper sx={{ p: 2 }}>
          <Stack direction="row" spacing={1} sx={{ mb: 2 }} flexWrap="wrap">
            <Chip label={`Total leídas: ${preview.total_leidas}`} />
            <Chip color="success" label={`Válidas: ${preview.validas.length}`} />
            {preview.errores.length > 0 && (
              <Chip color="error" label={`Errores: ${preview.errores.length}`} />
            )}
            {preview.advertencias.length > 0 && (
              <Chip color="warning" label={`Advertencias: ${preview.advertencias.length}`} />
            )}
          </Stack>

          {totalNuevas > 0 && (
            <Accordion sx={{ mb: 2 }} defaultExpanded>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                  <Typography variant="subtitle2">Se crearán nuevas entidades:</Typography>
                  {preview.entidades_a_crear.duenos.length > 0 && (
                    <Chip color="primary" size="small"
                      label={`${preview.entidades_a_crear.duenos.length} dueño(s)`} />
                  )}
                  {preview.entidades_a_crear.inquilinos.length > 0 && (
                    <Chip color="primary" size="small"
                      label={`${preview.entidades_a_crear.inquilinos.length} inquilino(s)`} />
                  )}
                  {preview.entidades_a_crear.propiedades.length > 0 && (
                    <Chip color="primary" size="small"
                      label={`${preview.entidades_a_crear.propiedades.length} propiedad(es)`} />
                  )}
                </Stack>
              </AccordionSummary>
              <AccordionDetails>
                <Stack spacing={1}>
                  {preview.entidades_a_crear.propiedades.length > 0 && (
                    <Box>
                      <Typography variant="caption" color="text.secondary">Propiedades:</Typography>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                        {preview.entidades_a_crear.propiedades.map((f) => (
                          <Chip key={f} size="small" label={f} variant="outlined" />
                        ))}
                      </Box>
                    </Box>
                  )}
                  {preview.entidades_a_crear.duenos.length > 0 && (
                    <Box>
                      <Typography variant="caption" color="text.secondary">Dueños:</Typography>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                        {preview.entidades_a_crear.duenos.map((n) => (
                          <Chip key={n} size="small" label={n} variant="outlined" />
                        ))}
                      </Box>
                    </Box>
                  )}
                  {preview.entidades_a_crear.inquilinos.length > 0 && (
                    <Box>
                      <Typography variant="caption" color="text.secondary">Inquilinos:</Typography>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                        {preview.entidades_a_crear.inquilinos.map((n) => (
                          <Chip key={n} size="small" label={n} variant="outlined" />
                        ))}
                      </Box>
                    </Box>
                  )}
                </Stack>
              </AccordionDetails>
            </Accordion>
          )}

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
