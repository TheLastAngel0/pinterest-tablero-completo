# Pinterest Tablero Completo

Extensión de Chrome (Manifest V3) para recorrer un tablero de Pinterest y descargar los archivos que la página carga. No impone un límite de 50 pines ni necesita una clave de licencia.

## Instalación

1. Descarga el código y descomprímelo.
2. Abre `chrome://extensions` en Chrome.
3. Activa **Modo de desarrollador**.
4. Selecciona **Cargar descomprimida** y elige la carpeta que contiene `manifest.json`.

## Uso

1. Inicia sesión en Pinterest y abre el tablero que deseas guardar.
2. Si el tablero tiene secciones, entra en **Todos los pines** o procesa cada sección por separado.
3. Abre la extensión y, si conoces el total, indica la cantidad esperada.
4. Pulsa **Recorrer y descargar**. Mantén abierta la pestaña del tablero hasta que termine.
5. Los archivos aparecerán en `Descargas/Pinterest_Tablero_Completo/<tablero>/`. Revisa `informe.json` para ver los pines encontrados, los guardados y los fallidos.

Si Chrome pregunta dónde guardar cada archivo, desactiva esa opción en la configuración de descargas antes de iniciar un tablero grande.

## Alcance y límites

- La extensión solo puede guardar contenido visible para tu sesión y que Pinterest cargue durante el recorrido.
- Intenta la imagen original y, si falla, usa la versión mostrada en el tablero.
- Descarga un video MP4 si Pinterest lo expone directamente en la tarjeta del pin. En otros casos puede guardar solo la miniatura; `informe.json` conserva el enlace del pin.
- El recorrido se detiene si se cierra o recarga la pestaña.
- Pinterest puede cambiar su página y romper la detección de pines. La cantidad esperada ayuda a detectar un recorrido incompleto.
- No se ha validado todavía con el tablero particular de 250 pines del usuario que motivó este proyecto.

## Privacidad

La extensión no usa un servidor propio ni envía tus datos a terceros. Lee los pines de la pestaña de Pinterest, descarga archivos desde `pinimg.com` con el administrador de descargas de Chrome y guarda el estado del proceso localmente en Chrome.

## Desarrollo

No requiere instalación de dependencias ni compilación. Los archivos de la extensión están en la raíz del proyecto. Puedes comprobar su sintaxis con:

```sh
node --check background.js
node --check content.js
node --check popup.js
```

## Licencia

Código publicado bajo la [licencia MIT](LICENSE).

Proyecto independiente, sin afiliación con Pinterest.
