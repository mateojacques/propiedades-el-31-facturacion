/**
 * DTO converter para inquilinos. Incluye la propiedad asociada
 * (id + ficha) precomputada por la ruta.
 */
import type { Inquilino } from '../db/tipos';

export interface InquilinoDTO {
  id: number;
  nombre: string;
  documento: string | null;
  propiedad_id: number;
  propiedad_ficha: string;
  creado_en: string;
  actualizado_en: string;
}

export function inquilinoAFila(
  i: Inquilino,
  propiedadFicha: string
): InquilinoDTO {
  return {
    id: i.id,
    nombre: i.nombre,
    documento: i.documento,
    propiedad_id: i.propiedad_id,
    propiedad_ficha: propiedadFicha,
    creado_en: i.creado_en,
    actualizado_en: i.actualizado_en,
  };
}
