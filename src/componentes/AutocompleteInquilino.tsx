/**
 * Autocomplete reutilizable para seleccionar un Inquilino existente.
 * Soporta filtrado opcional por `propiedadId` y quick-create inline.
 */
import { Autocomplete, TextField, CircularProgress, Box, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { useQuery } from '@tanstack/react-query';
import { useCliente } from '../api/proveedor-cliente';
import type { Inquilino } from '../api/tipos';

interface OpcionCrear { __crear: true; texto: string; }
type Opcion = Inquilino | OpcionCrear;
const esCrear = (o: Opcion): o is OpcionCrear => (o as OpcionCrear).__crear === true;

interface Props {
  value: Inquilino | null;
  onChange: (i: Inquilino | null) => void;
  onCrearNuevo?: (nombre: string) => void;
  /** Si se setea, filtra opciones a inquilinos de esa propiedad. */
  filtrarPorPropiedadId?: number | null;
  label?: string;
  required?: boolean;
  size?: 'small' | 'medium';
  disabled?: boolean;
  fullWidth?: boolean;
}

function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

export function AutocompleteInquilino({
  value, onChange, onCrearNuevo, filtrarPorPropiedadId,
  label = 'Inquilino', required, size = 'small', disabled, fullWidth = true,
}: Props): JSX.Element {
  const cliente = useCliente();
  const lista = useQuery({
    queryKey: ['inquilinos'],
    queryFn: () => cliente.get<Inquilino[]>('/api/inquilinos'),
    staleTime: 30_000,
  });

  const todas = lista.data ?? [];
  const opciones = filtrarPorPropiedadId != null
    ? todas.filter((i) => i.propiedad_id === filtrarPorPropiedadId)
    : todas;

  return (
    <Autocomplete<Opcion, false, false, false>
      value={value}
      onChange={(_, v) => {
        if (v && esCrear(v)) { onCrearNuevo?.(v.texto); return; }
        onChange((v as Inquilino | null) ?? null);
      }}
      options={opciones}
      loading={lista.isLoading}
      disabled={disabled}
      fullWidth={fullWidth}
      size={size}
      isOptionEqualToValue={(o, v) => {
        if (esCrear(o) || esCrear(v as Opcion)) return false;
        return (o as Inquilino).id === (v as Inquilino).id;
      }}
      getOptionLabel={(o) => (esCrear(o) ? `+ Crear "${o.texto}"` : o.nombre)}
      filterOptions={(opts, state) => {
        const q = normalizar(state.inputValue);
        const filtrados = q
          ? (opts as Inquilino[]).filter((i) =>
              normalizar(i.nombre).includes(q) ||
              (i.documento ? normalizar(i.documento).includes(q) : false) ||
              normalizar(i.propiedad_ficha).includes(q)
            )
          : (opts as Inquilino[]);
        const exact = (opts as Inquilino[]).some((i) => normalizar(i.nombre) === q);
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
              <Typography variant="caption" color="text.secondary">
                Propiedad: {option.propiedad_ficha}
                {option.documento ? ` · Doc: ${option.documento}` : ''}
              </Typography>
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
