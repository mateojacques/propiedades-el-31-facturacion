/**
 * Input controlado para una ficha de propiedad con formato X-YYYY.
 * Valida en vivo: muestra estado error + helper text cuando es inválida.
 *
 * X    = entero positivo (sin ceros a la izquierda)
 * YYYY = año entre 1900 y 2100
 */
import { TextField, type TextFieldProps } from '@mui/material';

const RE_FICHA = /^[1-9]\d*-(?:19\d{2}|20\d{2}|2100)$/;

export function esFichaValida(s: string): boolean {
  return RE_FICHA.test(s.trim());
}

interface Props extends Omit<TextFieldProps, 'value' | 'onChange' | 'error' | 'helperText'> {
  value: string;
  onChange: (v: string) => void;
  /** Si true, muestra error solo cuando el campo no está vacío y es inválido. */
  validarSiVacio?: boolean;
}

export function FichaPropiedadInput({
  value, onChange, validarSiVacio = false, ...rest
}: Props): JSX.Element {
  const vacio = value.trim().length === 0;
  const valida = !vacio && esFichaValida(value);
  const mostrarError = vacio ? validarSiVacio : !valida;
  return (
    <TextField
      {...rest}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      error={mostrarError}
      helperText={mostrarError ? 'Formato: X-YYYY (ej. 20-2026)' : ' '}
      placeholder={rest.placeholder ?? '20-2026'}
    />
  );
}
