/**
 * Top-level routed shell. Wraps everything in the PIN gate; once unlocked
 * renders the layout (Drawer + Outlet) with the billing pages.
 */
import { Routes, Route, Navigate } from 'react-router-dom';
import { PinGate } from './componentes/PinGate';
import { Layout } from './componentes/Layout';
import { Movimientos } from './paginas/Movimientos';
import { Duenos } from './paginas/Duenos';
import { Inquilinos } from './paginas/Inquilinos';
import { Importar } from './paginas/Importar';
import { Exportar } from './paginas/Exportar';
import { Liquidacion } from './paginas/Liquidacion';
import { Configuracion } from './paginas/Configuracion';

export function App(): JSX.Element {
  return (
    <PinGate>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/movimientos" replace />} />
          <Route path="/movimientos" element={<Movimientos />} />
          <Route path="/duenos" element={<Duenos />} />
          <Route path="/inquilinos" element={<Inquilinos />} />
          <Route path="/importar" element={<Importar />} />
          <Route path="/exportar" element={<Exportar />} />
          <Route path="/liquidacion" element={<Liquidacion />} />
          <Route path="/configuracion" element={<Configuracion />} />
          <Route path="*" element={<Navigate to="/movimientos" replace />} />
        </Route>
      </Routes>
    </PinGate>
  );
}
