/**
 * Autocomplete reutilizable para seleccionar un Dueño existente, con
 * opción inline "+ Crear «texto tipeado»" cuando no hay match. El padre
 * decide qué hacer al crear (típicamente abrir un modal con el nombre
 * precargado).
 *
 * Carga todos los dueños con TanStack Query (cache key ['duenos']) y filtra
 * client-side por substring case-insensitive sobre nombre y documento.
 */
import { Autocomplete, TextField, CircularProgress, Box, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { useQuery } from '@tanstack/react-query';
import { useCliente } from '../api/proveedor-cliente';
import type { Dueno } from '../api/tipos';

interface OpcionCrear {
  __crear: true;
  texto: string;
}
type Opcion = Dueno | OpcionCrear;

function esCrear(o: Opcion): o is OpcionCrear {
  return (o as OpcionCrear).__crear === true;
}

interface Props {
  value: Dueno | null;
  onChange: (d: Dueno | null) => void;
  /** Llamado cuando el usuario selecciona "+ Crear …". Recibe el texto tipeado. */
  onCrearNuevo?: (nombre: string) => void;
  label?: string;
  required?: boolean;
  size?: 'small' | 'medium';
  disabled?: boolean;
  fullWidth?: boolean;
}

function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function AutocompleteDueno({
  value, onChange, onCrearNuevo, label = 'Dueño',
  required, size = 'small', disabled, fullWidth = true,
}: Props): JSX.Element {
  const cliente = useCliente();
  const lista = useQuery({
    queryKey: ['duenos'],
    queryFn: () => cliente.get<Dueno[]>('/api/duenos'),
    staleTime: 30_000,
  });

  const opciones: Dueno[] = lista.data ?? [];

  return (
    <Autocomplete<Opcion, false, false, false>
      value={value}
      onChange={(_, v) => {
        if (v && esCrear(v)) {
          onCrearNuevo?.(v.texto);
          return;
        }
        onChange((v as Dueno | null) ?? null);
      }}
      options={opciones}
      loading={lista.isLoading}
      disabled={disabled}
      fullWidth={fullWidth}
      size={size}
      isOptionEqualToValue={(o, v) => {
        if (esCrear(o) || esCrear(v as Opcion)) return false;
        return (o as Dueno).id === (v as Dueno).id;
      }}
      getOptionLabel={(o) => (esCrear(o) ? `+ Crear "${o.texto}"` : o.nombre)}
      filterOptions={(opts, state) => {
        const q = normalizar(state.inputValue);
        const filtrados = q
          ? (opts as Dueno[]).filter((d) =>
              normalizar(d.nombre).includes(q) ||
              (d.documento ? normalizar(d.documento).includes(q) : false)
            )
          : (opts as Dueno[]);
        const exact = (opts as Dueno[]).some((d) => normalizar(d.nombre) === q);
        if (onCrearNuevo && q && !exact) {
          return [...filtrados, { __crear: true, texto: state.inputValue.trim() } as OpcionCrear];
        }
        return filtrados;
      }}
      renderOption={(props, option) => {
        if (esCrear(option)) {
          return (
            <li {...props} key="__crear">
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'primary.main' }}>
                <AddIcon fontSize="small" />
                <Typography variant="body2">Crear "{option.texto}"</Typography>
              </Box>
            </li>
          );
        }
        return (
          <li {...props} key={option.id}>
            <Box>
              <Typography variant="body2">{option.nombre}</Typography>
              {option.documento && (
                <Typography variant="caption" color="text.secondary">
                  Doc: {option.documento}
                </Typography>
              )}
            </Box>
          </li>
        );
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          required={required}
          InputProps={{
            ...params.InputProps,
            endAdornment: (
              <>
                {lista.isLoading ? <CircularProgress color="inherit" size={16} /> : null}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
        />
      )}
    />
  );
}
