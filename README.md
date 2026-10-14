# anotar-imagen (Hermes Desktop)

Dibuja sobre cualquier imagen del chat de Hermes Desktop (lápiz, flecha y recuadro, con 7 colores y 3 grosores) y mándala de vuelta al agente con un comentario.

- Cada imagen del chat y del lightbox tiene un botón **✎ Dibujar**.
- **Enviar** (Enter) la adjunta y la manda. **Adjuntar** (Shift+Enter) solo la deja en el composer.
- Con ⌘K / Ctrl+K → «Anotar imagen de esta conversación» (o Ctrl+Alt+D) se elige entre las imágenes que vio el agente.
- Repara la vista previa de `vision_analyze` cuando dice «Couldn't load x.jpg» con backend remoto.

La mitad Python (`/api/plugins/anotar-imagen/*`) vive en el backend, en `~/.hermes/plugins/anotar-imagen/dashboard/`, y requiere `anotar-imagen` en `plugins.enabled`.

Instalar: `hermes://plugin/install?repo=albertocvrrbs/hermes-anotar-imagen`
