/**
 * DTO converter para dueños. Incluye listado de propiedades asociadas
 * (id + ficha) precomputado por la ruta.
 */
import type { Dueno } from '../db/tipos';

export interface DuenoPropiedadResumen {
  id: number;
  ficha: string;
}

export interface DuenoDTO {
  id: number;
  nombre: string;
  documento: string | null;
  propiedades: DuenoPropiedadResumen[];
  creado_en: string;
  actualizado_en: string;
}

export function duenoAFila(
  d: Dueno,
  propiedades: DuenoPropiedadResumen[] = []
): DuenoDTO {
  return {
    id: d.id,
    nombre: d.nombre,
    documento: d.documento,
    propiedades,
    creado_en: d.creado_en,
    actualizado_en: d.actualizado_en,
  };
}
