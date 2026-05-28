/**
 * Selector multi-ficha tipo chips. El usuario tipea una ficha y presiona
 * Enter (o espacio/coma) para agregarla. Cada chip se valida individualmente
 * con el formato X-YYYY; chips inválidos se renderizan con color error.
 *
 * El padre maneja el array de strings; valida con `todasValidas()` antes
 * de submit.
 */
import { useState } from 'react';
import {
  Box, Chip, TextField, Stack, Typography, IconButton, InputAdornment,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { esFichaValida } from './FichaPropiedadInput';

interface Props {
  value: string[];
  onChange: (fichas: string[]) => void;
  label?: string;
  disabled?: boolean;
}

export function SelectorPropiedadesChips({
  value, onChange, label = 'Propiedades (fichas)', disabled,
}: Props): JSX.Element {
  const [draft, setDraft] = useState('');

  function agregar(): void {
    const f = draft.trim();
    if (!f) return;
    if (value.includes(f)) {
      setDraft('');
      return;
    }
    onChange([...value, f]);
    setDraft('');
  }

  function quitar(f: string): void {
    onChange(value.filter((x) => x !== f));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter' || e.key === ',' || (e.key === ' ' && draft.includes('-'))) {
      e.preventDefault();
      agregar();
    } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
      // Borra el último chip con Backspace en input vacío.
      onChange(value.slice(0, -1));
    }
  }

  const draftValido = draft === '' || esFichaValida(draft);

  return (
    <Box>
      <TextField
        label={label}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => { if (draft.trim()) agregar(); }}
        fullWidth
        size="small"
        error={!draftValido}
        helperText={
          !draftValido
            ? 'Formato: X-YYYY (ej. 20-2026)'
            : 'Tipeá una ficha y presioná Enter, coma o espacio para agregarla.'
        }
        disabled={disabled}
        placeholder="20-2026"
        InputProps={{
          endAdornment: (
            <InputAdornment position="end">
              <IconButton
                size="small"
                disabled={!draft.trim() || disabled}
                onClick={agregar}
                edge="end"
              >
                <AddIcon fontSize="small" />
              </IconButton>
            </InputAdornment>
          ),
        }}
      />
      {value.length > 0 && (
        <Stack direction="row" spacing={0.5} sx={{ mt: 1, flexWrap: 'wrap', gap: 0.5 }}>
          {value.map((f) => {
            const valida = esFichaValida(f);
            return (
              <Chip
                key={f}
                label={f}
                onDelete={disabled ? undefined : () => quitar(f)}
                color={valida ? 'primary' : 'error'}
                variant={valida ? 'outlined' : 'filled'}
                size="small"
              />
            );
          })}
        </Stack>
      )}
      {value.some((f) => !esFichaValida(f)) && (
        <Typography variant="caption" color="error" sx={{ mt: 0.5, display: 'block' }}>
          Hay fichas con formato inválido. Quitalas o corregilas antes de guardar.
        </Typography>
      )}
    </Box>
  );
}

/** Helper para el padre: ¿son todas válidas? */
export function todasValidas(fichas: string[]): boolean {
  return fichas.every(esFichaValida);
}
