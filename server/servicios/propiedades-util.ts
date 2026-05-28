/**
 * DTO converter para propiedades. Devuelve la ficha y, opcionalmente,
 * el listado de IDs de dueños asociados (precomputado por la ruta).
 */
import type { Propiedad } from '../db/tipos';

export interface PropiedadDTO {
  id: number;
  ficha: string;
  duenos_ids: number[];
  creado_en: string;
  actualizado_en: string;
}

export function propiedadAFila(
  p: Propiedad,
  duenosIds: number[] = []
): PropiedadDTO {
  return {
    id: p.id,
    ficha: p.ficha,
    duenos_ids: duenosIds,
    creado_en: p.creado_en,
    actualizado_en: p.actualizado_en,
  };
}
