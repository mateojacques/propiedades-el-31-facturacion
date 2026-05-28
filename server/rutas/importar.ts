/**
 * Importación de archivos CSV / XLSX.
 *   POST /api/importar/vista-previa  — parsea + valida, NO escribe en DB.
 *                                      Reporta qué dueños/inquilinos/propiedades
 *                                      se van a crear automáticamente.
 *   POST /api/importar/confirmar     — en transacción: upsert de entidades
 *                                      y luego insert de movimientos con
 *                                      IDs resueltos.
 *
 * Política de auto-upsert:
 *   - Propiedad por `ficha` (case-insensitive; se guarda como vino).
 *   - Dueño por `nombre` normalizado (NFD + lowercase + trim).
 *   - Inquilino por `(nombre normalizado, propiedad_id)`.
 *   - Si el dueño existe, se asegura el vínculo dueño↔propiedad.
 *
 * Si una `propertyFileNumber` no cumple X-YYYY, la fila se rechaza con error.
 */
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { detectFormat, parseFile, type ParsedRow } from '../servicios/importador-parser';
import { validateRows } from '../servicios/importador-validador';
import { esFichaValida } from '../servicios/validar-ficha';

function normalizarNombre(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

interface EntidadesACrear {
  propiedades: string[]; // fichas únicas que no existen
  duenos: string[];      // nombres únicos que no existen
  inquilinos: string[];  // "nombre · ficha" únicos que no existen
}

interface ErrorEntidad {
  rowNumber: number;
  message: string;
}

async function analizarEntidades(
  app: FastifyInstance,
  filas: ParsedRow[]
): Promise<{ entidades: EntidadesACrear; erroresEntidades: ErrorEntidad[] }> {
  const erroresEntidades: ErrorEntidad[] = [];

  // 1. Fichas (validar formato + detectar nuevas).
  const fichasEnArchivo = new Set<string>();
  for (const f of filas) {
    if (!f.propertyFileNumber) continue;
    if (!esFichaValida(f.propertyFileNumber)) {
      erroresEntidades.push({
        rowNumber: f.rowNumber,
        message: `Ficha de propiedad inválida: "${f.propertyFileNumber}" (formato esperado X-YYYY)`,
      });
      continue;
    }
    fichasEnArchivo.add(f.propertyFileNumber);
  }

  const fichasArr = Array.from(fichasEnArchivo);
  const propiedadesExistentes = fichasArr.length
    ? await app.db
        .selectFrom('propiedades')
        .select(['id', 'ficha'])
        .where('ficha', 'in', fichasArr)
        .execute()
    : [];
  const fichasExistentes = new Set(propiedadesExistentes.map((p) => p.ficha));
  const propiedadesNuevas = fichasArr.filter((f) => !fichasExistentes.has(f));

  // 2. Dueños (por nombre normalizado).
  const duenosEnArchivo = new Map<string, string>(); // normalizado → original
  for (const f of filas) {
    if (!f.duenoName) continue;
    const norm = normalizarNombre(f.duenoName);
    if (!duenosEnArchivo.has(norm)) duenosEnArchivo.set(norm, f.duenoName);
  }
  const duenosExistentes = await app.db.selectFrom('duenos').select(['id', 'nombre']).execute();
  const duenosExistentesNorm = new Set(duenosExistentes.map((d) => normalizarNombre(d.nombre)));
  const duenosNuevos = Array.from(duenosEnArchivo.entries())
    .filter(([norm]) => !duenosExistentesNorm.has(norm))
    .map(([, orig]) => orig);

  // 3. Inquilinos (por nombre normalizado + ficha).
  const inquilinosEnArchivo = new Map<string, { nombre: string; ficha: string }>();
  for (const f of filas) {
    if (!f.inquilinoName || !f.propertyFileNumber) continue;
    if (!esFichaValida(f.propertyFileNumber)) continue;
    const norm = normalizarNombre(f.inquilinoName);
    const key = `${norm}||${f.propertyFileNumber}`;
    if (!inquilinosEnArchivo.has(key)) {
      inquilinosEnArchivo.set(key, { nombre: f.inquilinoName, ficha: f.propertyFileNumber });
    }
  }
  // Inquilinos existentes: traerlos con su ficha.
  const inquilinosExistentes = await app.db
    .selectFrom('inquilinos as i')
    .innerJoin('propiedades as p', 'p.id', 'i.propiedad_id')
    .select(['i.nombre as nombre', 'p.ficha as ficha'])
    .execute();
  const inquilinosExistentesKeys = new Set(
    inquilinosExistentes.map((i) => `${normalizarNombre(i.nombre)}||${i.ficha}`)
  );
  const inquilinosNuevos = Array.from(inquilinosEnArchivo.entries())
    .filter(([key]) => !inquilinosExistentesKeys.has(key))
    .map(([, v]) => `${v.nombre} · ${v.ficha}`);

  return {
    entidades: {
      propiedades: propiedadesNuevas.sort(),
      duenos: duenosNuevos.sort((a, b) => a.localeCompare(b, 'es')),
      inquilinos: inquilinosNuevos.sort((a, b) => a.localeCompare(b, 'es')),
    },
    erroresEntidades,
  };
}

export const rutasImportar: FastifyPluginAsync = async (app: FastifyInstance) => {
  // ── VISTA PREVIA ───────────────────────────────────────────────────────
  app.post('/vista-previa', async (req, reply) => {
    const data = await req.file();
    if (!data) return reply.code(400).send({ error: 'Falta el archivo' });
    const buffer = await data.toBuffer();
    const format = detectFormat(data.filename, data.mimetype);
    if (!format) return reply.code(400).send({ error: 'Formato no soportado (use .csv o .xlsx)' });
    try {
      const parsed = await parseFile(buffer, format);
      const result = validateRows(parsed);
      const { entidades, erroresEntidades } = await analizarEntidades(app, result.validRows);
      // Filas con ficha inválida deben moverse de "validas" a "errores".
      const idsInvalidos = new Set(erroresEntidades.map((e) => e.rowNumber));
      const validasFinal = result.validRows.filter((r) => !idsInvalidos.has(r.rowNumber));
      const erroresFinal = [
        ...result.errors,
        ...erroresEntidades.map((e) => ({ rowNumber: e.rowNumber, message: e.message })),
      ];
      return {
        ok: erroresFinal.length === 0,
        validas: validasFinal,
        errores: erroresFinal,
        advertencias: result.warnings,
        total_leidas: parsed.length,
        entidades_a_crear: entidades,
      };
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  // ── CONFIRMAR ──────────────────────────────────────────────────────────
  const filaSchema = z.object({
    rowNumber: z.number().int(),
    date: z.string(),
    rawDate: z.string(),
    duenoName: z.string(),
    propertyFileNumber: z.string(),
    inquilinoName: z.string(),
    tipo: z.enum(['entrada', 'salida']),
    montoCentavos: z.number().int().positive(),
    paymentForMonths: z.array(z.object({ anio: z.number().int(), mes: z.number().int() })),
    parseErrors: z.array(z.string()),
  });

  app.post('/confirmar', async (req, reply) => {
    const parsed = z.object({ filas: z.array(filaSchema) }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Filas inválidas' });
    const filas = parsed.data.filas as ParsedRow[];

    try {
      const resultado = await app.db.transaction().execute(async (trx) => {
        const ahora = new Date().toISOString();
        let insertadas = 0;
        let duenosCreados = 0;
        let inquilinosCreados = 0;
        let propiedadesCreadas = 0;

        // Cachés locales en la transacción.
        const cachePropFicha = new Map<string, number>(); // ficha → id
        const cacheDuenoNorm = new Map<string, number>(); // normNombre → id
        const cacheInqKey   = new Map<string, number>(); // norm||ficha → id

        // Precarga.
        const [propsBd, duenosBd, inqsBd] = await Promise.all([
          trx.selectFrom('propiedades').select(['id', 'ficha']).execute(),
          trx.selectFrom('duenos').select(['id', 'nombre']).execute(),
          trx
            .selectFrom('inquilinos as i')
            .innerJoin('propiedades as p', 'p.id', 'i.propiedad_id')
            .select(['i.id as id', 'i.nombre as nombre', 'p.ficha as ficha'])
            .execute(),
        ]);
        for (const p of propsBd as Array<{ id: number; ficha: string }>) cachePropFicha.set(p.ficha, p.id);
        for (const d of duenosBd as Array<{ id: number; nombre: string }>)
          cacheDuenoNorm.set(normalizarNombre(d.nombre), d.id);
        for (const i of inqsBd as Array<{ id: number; nombre: string; ficha: string }>) {
          cacheInqKey.set(`${normalizarNombre(i.nombre)}||${i.ficha}`, i.id);
        }

        async function obtenerPropiedadId(ficha: string): Promise<number> {
          let id = cachePropFicha.get(ficha);
          if (id !== undefined) return id;
          const ins = await trx
            .insertInto('propiedades')
            .values({ ficha, creado_en: ahora, actualizado_en: ahora })
            .returning('id')
            .executeTakeFirstOrThrow();
          id = (ins as { id: number }).id;
          cachePropFicha.set(ficha, id);
          propiedadesCreadas++;
          return id;
        }

        async function obtenerDuenoId(nombre: string): Promise<number> {
          const norm = normalizarNombre(nombre);
          let id = cacheDuenoNorm.get(norm);
          if (id !== undefined) return id;
          const ins = await trx
            .insertInto('duenos')
            .values({ nombre, documento: null, creado_en: ahora, actualizado_en: ahora })
            .returning('id')
            .executeTakeFirstOrThrow();
          id = (ins as { id: number }).id;
          cacheDuenoNorm.set(norm, id);
          duenosCreados++;
          return id;
        }

        async function obtenerInquilinoId(nombre: string, propiedadId: number, ficha: string): Promise<number> {
          const key = `${normalizarNombre(nombre)}||${ficha}`;
          let id = cacheInqKey.get(key);
          if (id !== undefined) return id;
          const ins = await trx
            .insertInto('inquilinos')
            .values({
              nombre,
              documento: null,
              propiedad_id: propiedadId,
              creado_en: ahora,
              actualizado_en: ahora,
            })
            .returning('id')
            .executeTakeFirstOrThrow();
          id = (ins as { id: number }).id;
          cacheInqKey.set(key, id);
          inquilinosCreados++;
          return id;
        }

        async function asegurarVinculoDuenoPropiedad(duenoId: number, propiedadId: number): Promise<void> {
          // INSERT OR IGNORE — la PK compuesta evita duplicados.
          await trx
            .insertInto('dueno_propiedades')
            .values({ dueno_id: duenoId, propiedad_id: propiedadId })
            .onConflict((oc) => oc.columns(['dueno_id', 'propiedad_id']).doNothing())
            .execute();
        }

        for (const f of filas) {
          if (!f.date || !f.tipo) continue;
          if (f.propertyFileNumber && !esFichaValida(f.propertyFileNumber)) {
            throw new Error(`Fila ${f.rowNumber}: ficha inválida "${f.propertyFileNumber}"`);
          }

          let propiedadId: number | null = null;
          let duenoId: number | null = null;
          let inquilinoId: number | null = null;

          if (f.propertyFileNumber) {
            propiedadId = await obtenerPropiedadId(f.propertyFileNumber);
          }
          if (f.duenoName) {
            duenoId = await obtenerDuenoId(f.duenoName);
            if (propiedadId !== null) {
              await asegurarVinculoDuenoPropiedad(duenoId, propiedadId);
            }
          }
          if (f.inquilinoName && propiedadId !== null) {
            inquilinoId = await obtenerInquilinoId(f.inquilinoName, propiedadId, f.propertyFileNumber);
          }

          const [y, m] = f.date.split('-');
          await trx
            .insertInto('movimientos')
            .values({
              fecha: f.date,
              anio: parseInt(y!, 10),
              mes: parseInt(m!, 10),
              tipo: f.tipo,
              monto_centavos: f.montoCentavos,
              dueno_id: duenoId,
              inquilino_id: inquilinoId,
              propiedad_id: propiedadId,
              concepto: '',
              detalle: null,
              pagos_de_meses: f.paymentForMonths.length ? JSON.stringify(f.paymentForMonths) : null,
              mes_facturacion_id: null,
              movimiento_original_id: null,
              extras: null,
              creado_en: ahora,
              actualizado_en: ahora,
            })
            .execute();
          insertadas++;
        }
        return { insertadas, duenos_creados: duenosCreados, inquilinos_creados: inquilinosCreados, propiedades_creadas: propiedadesCreadas };
      });
      return resultado;
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
  });
};
