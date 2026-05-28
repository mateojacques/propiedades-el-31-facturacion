/**
 * Aggregator de rutas. Mantener server/index.ts limpio de imports crecientes.
 */
import type { FastifyInstance } from 'fastify';
import { rutasSalud } from './salud';
import { rutasPin } from './pin';
import { rutasMovimientos } from './movimientos';
import { rutasImportar } from './importar';
import { rutasExportar } from './exportar';
import { rutasLiquidacion } from './liquidacion';
import { rutasObservacionesCaja } from './observaciones-caja';
import { rutasTipoCambio } from './tipo-cambio';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(rutasSalud, { prefix: '/api' });
  await app.register(rutasPin, { prefix: '/api/pin' });
  await app.register(rutasMovimientos, { prefix: '/api/movimientos' });
  await app.register(rutasImportar, { prefix: '/api/importar' });
  await app.register(rutasExportar, { prefix: '/api/exportar' });
  await app.register(rutasLiquidacion, { prefix: '/api/liquidacion' });
  await app.register(rutasObservacionesCaja, { prefix: '/api/observaciones-caja' });
  await app.register(rutasTipoCambio, { prefix: '/api/tipo-cambio' });
}
