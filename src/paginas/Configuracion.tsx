/**
 * Configuración: tipo de cambio, cambio de PIN, abrir carpeta de datos.
 */
import { useEffect, useState } from 'react';
import {
  Box, Paper, Typography, TextField, Button, Stack, Alert, Divider,
} from '@mui/material';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCliente } from '../api/proveedor-cliente';
import type { TipoCambio } from '../api/tipos';
import { formatFechaCorta } from '../utils/formato';

export function Configuracion(): JSX.Element {
  const cliente = useCliente();
  const qc = useQueryClient();

  // Tipo de cambio
  const tc = useQuery({
    queryKey: ['tipo-cambio'],
    queryFn: () => cliente.get<TipoCambio>('/api/tipo-cambio'),
  });
  const [arsPorUsd, setArsPorUsd] = useState<string>('');
  useEffect(() => {
    if (tc.data && arsPorUsd === '') setArsPorUsd(String(tc.data.ars_por_usd || ''));
  }, [tc.data, arsPorUsd]);
  const guardarTc = useMutation({
    mutationFn: (v: number) =>
      cliente.put<{ ok: boolean; ars_por_usd: number; actualizado_en: string }>(
        '/api/tipo-cambio',
        { ars_por_usd: v }
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tipo-cambio'] }),
  });

  // PIN
  const [pinActual, setPinActual] = useState('');
  const [pinNuevo, setPinNuevo] = useState('');
  const [pinConfirma, setPinConfirma] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinOk, setPinOk] = useState(false);
  const cambiarPin = useMutation({
    mutationFn: () =>
      cliente.post<{ ok: boolean }>('/api/pin/cambiar', { pinActual, pinNuevo }),
    onSuccess: () => {
      setPinActual(''); setPinNuevo(''); setPinConfirma('');
      setPinError(null); setPinOk(true);
      setTimeout(() => setPinOk(false), 4000);
    },
    onError: (e: Error) => setPinError(e.message),
  });

  function onCambiarPin(e: React.FormEvent): void {
    e.preventDefault();
    setPinError(null); setPinOk(false);
    if (!/^\d{4}$/.test(pinActual) || !/^\d{4}$/.test(pinNuevo)) {
      setPinError('Los PIN deben ser de 4 dígitos');
      return;
    }
    if (pinNuevo !== pinConfirma) {
      setPinError('El PIN nuevo no coincide con la confirmación');
      return;
    }
    cambiarPin.mutate();
  }

  // Abrir carpeta de datos
  async function abrirCarpetaDatos(): Promise<void> {
    const dir = await window.app.getUserDataPath();
    await window.app.openPath(dir);
  }

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 2 }}>Configuración</Typography>

      {/* Cambio de PIN */}
      <Paper sx={{ p: 3, mb: 2 }}>
        <Typography variant="h6" gutterBottom>Cambiar PIN</Typography>
        <Box component="form" onSubmit={onCambiarPin}>
          <Stack spacing={2} sx={{ maxWidth: 360 }}>
            <TextField
              label="PIN actual" type="password" value={pinActual}
              onChange={(e) => setPinActual(e.target.value.replace(/\D/g, '').slice(0, 4))}
              inputProps={{ inputMode: 'numeric', maxLength: 4 }}
              size="small"
            />
            <TextField
              label="PIN nuevo" type="password" value={pinNuevo}
              onChange={(e) => setPinNuevo(e.target.value.replace(/\D/g, '').slice(0, 4))}
              inputProps={{ inputMode: 'numeric', maxLength: 4 }}
              size="small"
            />
            <TextField
              label="Repetir PIN nuevo" type="password" value={pinConfirma}
              onChange={(e) => setPinConfirma(e.target.value.replace(/\D/g, '').slice(0, 4))}
              inputProps={{ inputMode: 'numeric', maxLength: 4 }}
              size="small"
            />
            {pinError && <Alert severity="error">{pinError}</Alert>}
            {pinOk && <Alert severity="success">PIN actualizado correctamente.</Alert>}
            <Button type="submit" variant="contained" disabled={cambiarPin.isPending}>
              Cambiar PIN
            </Button>
          </Stack>
        </Box>
      </Paper>

      {/* Carpeta de datos */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>Carpeta de datos</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          La base de datos, copias de seguridad, exportaciones y registros se guardan
          en la carpeta de datos de la aplicación.
        </Typography>
        <Button variant="outlined" startIcon={<FolderOpenIcon />} onClick={abrirCarpetaDatos}>
          Abrir carpeta de datos
        </Button>
      </Paper>
      <Divider sx={{ my: 3 }} />
      <Typography variant="caption" color="text.secondary">
        Propiedades El 31 — Facturación · versión 0.1.0
      </Typography>
    </Box>
  );
}
