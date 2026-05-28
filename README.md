# Propiedades El 31 — Facturación

Aplicación de escritorio offline para Windows que gestiona la facturación de
Propiedades El 31. Funciona sin conexión a internet, sin Docker y sin
configuración: se instala con doble clic y se abre desde el menú de inicio.

## Para el usuario final

1. Ejecutar `PropiedadesEl31Facturacion-Setup-x.y.z.exe`.
2. La aplicación se instala en `%LOCALAPPDATA%\Programs\Propiedades El 31 - Facturación\`
   sin pedir permisos de administrador.
3. Los datos se guardan en `%APPDATA%\PropiedadesEl31Facturacion\`.
4. Al abrir por primera vez se pide crear un PIN de 4 dígitos.

## Para desarrollo

```bash
pnpm install     # instala dependencias y reconstruye módulos nativos para Electron
pnpm dev         # arranca Vite + Electron en modo desarrollo
pnpm typecheck   # verifica tipos en renderer, main y server
pnpm dist        # genera el instalador .exe (Windows x64) en dist-installer/
```

Para compilar el instalador desde Linux hace falta `wine ≥ 2.0`.
La validación se realiza ejecutando el `.exe` resultante con Wine.
