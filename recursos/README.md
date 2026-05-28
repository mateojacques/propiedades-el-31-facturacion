# Recursos de empaquetado

Esta carpeta es usada por electron-builder como `buildResources`.

## Ícono de la aplicación

Cuando el cliente entregue un ícono definitivo, colocarlo aquí como
`icono.ico` (formato ICO multi-resolución, idealmente con tamaños
16, 32, 48, 64, 128, 256 px) y volver a habilitar las referencias en
`../electron-builder.json`:

```jsonc
"win": {
  ...,
  "icon": "recursos/icono.ico"
},
"nsis": {
  ...,
  "installerIcon": "recursos/icono.ico",
  "uninstallerIcon": "recursos/icono.ico"
}
```

Sin un `icono.ico` presente, electron-builder usa el ícono por defecto
de Electron, lo cual es aceptable para builds iniciales.
