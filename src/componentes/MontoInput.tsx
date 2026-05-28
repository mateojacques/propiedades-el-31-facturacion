/**
 * MontoInput — Input estilo calculadora para montos en centavos.
 *
 * El usuario tipea dígitos y los últimos dos se interpretan como centavos.
 *   "" → 0
 *   "1" → $ 0,01
 *   "12345" → $ 123,45
 *   "1234567" → $ 12.345,67
 *
 * Backspace borra el último dígito. La parte entera se formatea con
 * separador de miles "." (es-AR) en tiempo real.
 */
import { TextField, InputAdornment, type TextFieldProps } from '@mui/material';

type Props = Omit<TextFieldProps, 'value' | 'onChange' | 'type'> & {
  value: number; // centavos
  onChange: (centavos: number) => void;
  maxCentavos?: number;
};

const MAX_DEFAULT = 99999999999; // ~$ 999.999.999,99

function formatearCentavos(centavos: number): string {
  if (!centavos || centavos <= 0) return '';
  const entera = Math.floor(centavos / 100);
  const dec = String(centavos % 100).padStart(2, '0');
  const enteraFmt = entera.toLocaleString('es-AR');
  return `${enteraFmt},${dec}`;
}

export function MontoInput({ value, onChange, maxCentavos = MAX_DEFAULT, ...rest }: Props): JSX.Element {
  const display = formatearCentavos(value);

  function onInput(e: React.ChangeEvent<HTMLInputElement>): void {
    const soloDigitos = e.target.value.replace(/\D/g, '');
    if (!soloDigitos) {
      onChange(0);
      return;
    }
    // Sin ceros al principio, salvo que sea el único.
    const limpio = soloDigitos.replace(/^0+/, '') || '0';
    const n = Number(limpio);
    if (!Number.isFinite(n)) return;
    onChange(Math.min(n, maxCentavos));
  }

  return (
    <TextField
      {...rest}
      type="text"
      value={display}
      onChange={onInput}
      inputProps={{
        inputMode: 'numeric',
        autoComplete: 'off',
        ...(rest.inputProps ?? {}),
      }}
      InputProps={{
        startAdornment: <InputAdornment position="start">$</InputAdornment>,
        ...(rest.InputProps ?? {}),
      }}
    />
  );
}
