/**
 * PIN gate. On first run prompts to set a PIN; on subsequent runs prompts to
 * unlock. Once unlocked, renders children. There is no logout button —
 * closing the app re-locks.
 */
import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Box, Paper, Typography, TextField, Button, CircularProgress, Alert, Stack,
} from '@mui/material';
import { useCliente } from '../api/proveedor-cliente';

interface Props {
  children: React.ReactNode;
}

export function PinGate({ children }: Props): JSX.Element {
  const cliente = useCliente();
  const [desbloqueado, setDesbloqueado] = useState(false);
  const [pin, setPin] = useState('');
  const [pinConfirma, setPinConfirma] = useState('');
  const [error, setError] = useState<string | null>(null);

  const estado = useQuery({
    queryKey: ['pin', 'estado'],
    queryFn: () => cliente.get<{ configurado: boolean }>('/api/pin/estado'),
  });

  const verificar = useMutation({
    mutationFn: (p: string) => cliente.post<{ ok: boolean }>('/api/pin/verificar', { pin: p }),
    onSuccess: (r) => {
      if (r.ok) {
        setDesbloqueado(true);
        setError(null);
      } else {
        setError('PIN incorrecto');
        setPin('');
      }
    },
    onError: () => setError('Error al verificar'),
  });

  const crear = useMutation({
    mutationFn: (p: string) => cliente.post<{ ok: boolean }>('/api/pin/cambiar', { pinNuevo: p }),
    onSuccess: () => {
      setDesbloqueado(true);
      setError(null);
    },
    onError: () => setError('No se pudo establecer el PIN'),
  });

  if (desbloqueado) return <>{children}</>;

  if (estado.isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  const yaConfigurado = estado.data?.configurado === true;

  function onSubmit(e: React.FormEvent): void {
    e.preventDefault();
    setError(null);
    if (!/^\d{4}$/.test(pin)) {
      setError('El PIN debe tener 4 dígitos');
      return;
    }
    if (yaConfigurado) {
      verificar.mutate(pin);
    } else {
      if (pin !== pinConfirma) {
        setError('Los PIN no coinciden');
        return;
      }
      crear.mutate(pin);
    }
  }

  return (
    <Box
      sx={{
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        height: '100vh', bgcolor: 'grey.100',
      }}
    >
      <Paper sx={{ p: 4, width: 360 }} elevation={3}>
        <Typography variant="h5" gutterBottom align="center">
          Propiedades El 31
        </Typography>
        <Typography variant="subtitle1" align="center" color="text.secondary" gutterBottom>
          Facturación
        </Typography>
        <Box component="form" onSubmit={onSubmit} sx={{ mt: 2 }}>
          <Stack spacing={2}>
            <Typography variant="body1">
              {yaConfigurado ? 'Ingrese su PIN para continuar' : 'Defina un PIN de 4 dígitos'}
            </Typography>
            <TextField
              label="PIN"
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              inputProps={{ inputMode: 'numeric', maxLength: 4 }}
              autoFocus
              fullWidth
            />
            {!yaConfigurado && (
              <TextField
                label="Repetir PIN"
                type="password"
                value={pinConfirma}
                onChange={(e) => setPinConfirma(e.target.value.replace(/\D/g, '').slice(0, 4))}
                inputProps={{ inputMode: 'numeric', maxLength: 4 }}
                fullWidth
              />
            )}
            {error && <Alert severity="error">{error}</Alert>}
            <Button
              type="submit"
              variant="contained"
              size="large"
              disabled={verificar.isPending || crear.isPending}
            >
              {yaConfigurado ? 'Desbloquear' : 'Crear PIN'}
            </Button>
          </Stack>
        </Box>
      </Paper>
    </Box>
  );
}
