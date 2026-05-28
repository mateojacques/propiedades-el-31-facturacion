/**
 * Autocomplete reutilizable para seleccionar una Propiedad existente.
 * El quick-create acepta el texto tipeado SI cumple el formato X-YYYY.
 */
import { Autocomplete, TextField, CircularProgress, Box, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { useQuery } from '@tanstack/react-query';
import { useCliente } from '../api/proveedor-cliente';
import type { Propiedad } from '../api/tipos';
import { esFichaValida } from './FichaPropiedadInput';

interface OpcionCrear { __crear: true; ficha: string; }
type Opcion = Propiedad | OpcionCrear;
const esCrear = (o: Opcion): o is OpcionCrear => (o as OpcionCrear).__crear === true;

interface Props {
  value: Propiedad | null;
  onChange: (p: Propiedad | null) => void;
  /** Llamado con la ficha válida cuando el usuario elige "+ Crear …". */
  onCrearNueva?: (ficha: string) => void;
  label?: string;
  required?: boolean;
  size?: 'small' | 'medium';
  disabled?: boolean;
  fullWidth?: boolean;
}

export function AutocompletePropiedad({
  value, onChange, onCrearNueva, label = 'Propiedad',
  required, size = 'small', disabled, fullWidth = true,
}: Props): JSX.Element {
  const cliente = useCliente();
  const lista = useQuery({
    queryKey: ['propiedades'],
    queryFn: () => cliente.get<Propiedad[]>('/api/propiedades'),
    staleTime: 30_000,
  });

  const opciones: Propiedad[] = lista.data ?? [];

  return (
    <Autocomplete<Opcion, false, false, false>
      value={value}
      onChange={(_, v) => {
        if (v && esCrear(v)) { onCrearNueva?.(v.ficha); return; }
        onChange((v as Propiedad | null) ?? null);
      }}
      options={opciones}
      loading={lista.isLoading}
      disabled={disabled}
      fullWidth={fullWidth}
      size={size}
      isOptionEqualToValue={(o, v) => {
        if (esCrear(o) || esCrear(v as Opcion)) return false;
        return (o as Propiedad).id === (v as Propiedad).id;
      }}
      getOptionLabel={(o) => (esCrear(o) ? `+ Crear "${o.ficha}"` : o.ficha)}
      filterOptions={(opts, state) => {
        const q = state.inputValue.trim().toLowerCase();
        const filtrados = q
          ? (opts as Propiedad[]).filter((p) => p.ficha.toLowerCase().includes(q))
          : (opts as Propiedad[]);
        const exact = (opts as Propiedad[]).some((p) => p.ficha.toLowerCase() === q);
        if (onCrearNueva && q && !exact && esFichaValida(q)) {
          return [...filtrados, { __crear: true, ficha: q } as OpcionCrear];
        }
        return filtrados;
      }}
      renderOption={(props, option) => {
        if (esCrear(option)) {
          return (
            <li {...props} key="__crear">
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'primary.main' }}>
                <AddIcon fontSize="small" />
                <Typography variant="body2">Crear ficha "{option.ficha}"</Typography>
              </Box>
            </li>
          );
        }
        return (
          <li {...props} key={option.id}>
            <Typography variant="body2">{option.ficha}</Typography>
          </li>
        );
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          required={required}
          placeholder="20-2026"
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
