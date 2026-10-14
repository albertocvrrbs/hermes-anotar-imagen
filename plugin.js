/**
 * anotar-imagen — dibuja sobre una imagen del chat y mándala de vuelta.
 *
 * 1. Cualquier imagen del chat (preview de vision_analyze, MEDIA:, lightbox)
 *    gana un botón «Dibujar».
 * 2. El editor: lápiz / flecha / recuadro, 7 colores, 3 grosores, deshacer,
 *    borrar, comentario. «Enviar» la adjunta al composer y la manda; «Adjuntar»
 *    solo la deja lista.
 * 3. Si la preview nativa de vision_analyze falla («Couldn't load x.jpg», típico
 *    con backend remoto), la reemplaza con la imagen pedida al backend del
 *    plugin (/api/plugins/anotar-imagen/image).
 * 4. ⌘K → «Anotar imagen de esta conversación»: lista las imágenes que el
 *    agente vio o mandó en la sesión.
 *
 * Disco: <HERMES_HOME>/desktop-plugins/anotar-imagen/plugin.js (máquina del app).
 * Backend: ~/.hermes/plugins/anotar-imagen/dashboard/ (máquina del backend).
 */
import { host, PALETTE_AREA, KEYBINDS_AREA } from '@hermes/plugin-sdk'

const ID = 'anotar-imagen'
const COLORS = [
  ['#ff3b30', 'Rojo'], ['#ffcc00', 'Amarillo'], ['#34c759', 'Verde'], ['#0a84ff', 'Azul'],
  ['#bf5af2', 'Morado'], ['#ffffff', 'Blanco'], ['#111111', 'Negro']
]
const SIZES = [['1', 'Fino'], ['2.2', 'Medio'], ['4', 'Grueso']]
const TOOLS = [['pen', 'Lápiz'], ['arrow', 'Flecha'], ['rect', 'Recuadro']]

const CSS = `
.anotar-btn{position:absolute;z-index:5;top:6px;left:6px;display:inline-flex;align-items:center;gap:4px;
  padding:3px 9px;border-radius:999px;font:500 12px/18px inherit;cursor:pointer;
  background:var(--ui-bg-elevated,rgba(20,20,24,.85));color:var(--ui-text-primary,#fff);
  border:1px solid var(--ui-stroke-secondary,rgba(255,255,255,.2));opacity:0;transition:opacity .15s}
[data-slot="aui_zoomable-image"]:hover .anotar-btn,.anotar-fix:hover .anotar-btn,.anotar-btn:focus-visible{opacity:1}
.anotar-btn.lb{position:fixed;top:16px;right:16px;left:auto;opacity:1;z-index:2147482000;padding:6px 14px;font-size:13px}
[data-anotar="fixed"]{font-size:0!important}
[data-anotar="fixed"]>button{display:none!important}
.anotar-fix{position:relative;display:inline-block;max-width:100%;font-size:14px}
.anotar-fix img{display:block;max-width:min(100%,var(--image-preview-max-width,560px));max-height:var(--image-preview-height,360px);border-radius:10px;cursor:zoom-in}
.anotar-ov{position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;
  background:rgba(0,0,0,.82);color:var(--ui-text-primary,#fff);font-size:13px}
.anotar-bar{display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:10px 14px;
  background:var(--ui-bg-elevated,#1c1c20);border-bottom:1px solid var(--ui-stroke-secondary,#333)}
.anotar-bar .grp{display:flex;align-items:center;gap:5px}
.anotar-bar .sep{width:1px;height:22px;background:var(--ui-stroke-secondary,#444)}
.anotar-sw{width:22px;height:22px;border-radius:50%;cursor:pointer;border:2px solid transparent;box-shadow:0 0 0 1px rgba(255,255,255,.35)}
.anotar-sw.on{border-color:var(--ui-text-primary,#fff);transform:scale(1.15)}
.anotar-chip{padding:4px 10px;border-radius:8px;cursor:pointer;background:transparent;color:inherit;
  border:1px solid var(--ui-stroke-secondary,#444);font:inherit}
.anotar-chip.on{background:var(--ui-accent,#0a84ff);border-color:var(--ui-accent,#0a84ff);color:#fff}
.anotar-chip.pri{background:var(--ui-accent,#0a84ff);border-color:var(--ui-accent,#0a84ff);color:#fff;font-weight:600}
.anotar-stage{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;padding:14px;overflow:hidden}
.anotar-stage canvas{max-width:100%;max-height:100%;touch-action:none;cursor:crosshair;box-shadow:0 8px 40px rgba(0,0,0,.6);border-radius:4px}
.anotar-foot{display:flex;gap:8px;align-items:center;padding:10px 14px;background:var(--ui-bg-elevated,#1c1c20);
  border-top:1px solid var(--ui-stroke-secondary,#333)}
.anotar-foot input{flex:1;min-width:0;padding:8px 10px;border-radius:8px;font:inherit;color:inherit;
  background:var(--ui-bg-editor,#111);border:1px solid var(--ui-stroke-secondary,#444);outline:none}
.anotar-foot .hint{opacity:.6;font-size:11.5px;white-space:nowrap}
.anotar-pick{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;padding:16px;overflow:auto}
.anotar-pick button{all:unset;cursor:pointer;border-radius:10px;overflow:hidden;background:var(--ui-bg-tertiary,#222);
  border:1px solid var(--ui-stroke-secondary,#444)}
.anotar-pick img{display:block;width:100%;height:130px;object-fit:cover;background:#000}
.anotar-pick span{display:block;padding:6px 8px;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
`

// ---------------------------------------------------------------- helpers
const el = (tag, props = {}, kids = []) => {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v
    else if (k === 'style') node.style.cssText = v
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v)
    else if (v !== undefined && v !== null) node.setAttribute(k, v)
  }
  for (const kid of [].concat(kids)) if (kid != null) node.append(kid)
  return node
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

const visibleSurface = () => {
  const all = [...document.querySelectorAll('[data-composer-target]')]
  return all.find(n => !n.closest('[data-pane-hidden]') && n.getClientRects().length) || all[0] || null
}

const loadImage = src =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('No se pudo abrir la imagen'))
    img.src = src
  })

// An <img> already on screen may be a blob:/http URL. Draw from a data URL so the
// canvas is never tainted (toBlob would throw on a cross-origin source).
async function toSafeSrc(src) {
  if (!src || src.startsWith('data:')) return src
  try {
    const res = await fetch(src)
    const blob = await res.blob()
    return await new Promise(r => {
      const fr = new FileReader()
      fr.onload = () => r(fr.result)
      fr.readAsDataURL(blob)
    })
  } catch {
    return src
  }
}

// ---------------------------------------------------------------- editor
function openEditor(ctx, src, name = 'imagen') {
  const prefs = { color: '#ff3b30', size: '2.2', tool: 'pen', ...ctx.storage.get('prefs', {}) }
  const save = () => ctx.storage.set('prefs', prefs)
  const shapes = []
  let current = null
  let base = null

  const canvas = el('canvas')
  const g = canvas.getContext('2d')
  const comment = el('input', { placeholder: 'Comentario (opcional) — Enter envía', type: 'text' })

  const width = () => Math.max(2, (Math.max(canvas.width, canvas.height) / 450) * Number(prefs.size))

  const drawShape = s => {
    g.save()
    g.strokeStyle = s.color
    g.fillStyle = s.color
    g.lineWidth = s.w
    g.lineCap = 'round'
    g.lineJoin = 'round'
    g.shadowColor = 'rgba(0,0,0,.35)'
    g.shadowBlur = s.w * 0.6
    if (s.tool === 'pen') {
      g.beginPath()
      s.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)))
      if (s.pts.length === 1) g.lineTo(s.pts[0][0] + 0.1, s.pts[0][1])
      g.stroke()
    } else if (s.tool === 'rect') {
      const [[x0, y0], [x1, y1]] = [s.pts[0], s.pts[s.pts.length - 1]]
      g.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0))
    } else if (s.tool === 'arrow') {
      const [[x0, y0], [x1, y1]] = [s.pts[0], s.pts[s.pts.length - 1]]
      const a = Math.atan2(y1 - y0, x1 - x0)
      const head = Math.max(s.w * 4, 14)
      g.beginPath()
      g.moveTo(x0, y0)
      g.lineTo(x1 - Math.cos(a) * head * 0.6, y1 - Math.sin(a) * head * 0.6)
      g.stroke()
      g.beginPath()
      g.moveTo(x1, y1)
      g.lineTo(x1 - head * Math.cos(a - 0.45), y1 - head * Math.sin(a - 0.45))
      g.lineTo(x1 - head * Math.cos(a + 0.45), y1 - head * Math.sin(a + 0.45))
      g.closePath()
      g.fill()
    }
    g.restore()
  }

  const redraw = () => {
    g.clearRect(0, 0, canvas.width, canvas.height)
    if (base) g.drawImage(base, 0, 0)
    shapes.forEach(drawShape)
    if (current) drawShape(current)
  }

  const point = e => {
    const r = canvas.getBoundingClientRect()
    return [((e.clientX - r.left) / r.width) * canvas.width, ((e.clientY - r.top) / r.height) * canvas.height]
  }

  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0) return
    canvas.setPointerCapture(e.pointerId)
    current = { tool: prefs.tool, color: prefs.color, w: width(), pts: [point(e)] }
    redraw()
  })
  canvas.addEventListener('pointermove', e => {
    if (!current) return
    const p = point(e)
    if (current.tool === 'pen') current.pts.push(p)
    else current.pts = [current.pts[0], p]
    redraw()
  })
  const finish = () => {
    if (!current) return
    shapes.push(current)
    current = null
    redraw()
  }
  canvas.addEventListener('pointerup', finish)
  canvas.addEventListener('pointercancel', finish)

  // toolbar
  const swatches = COLORS.map(([c, label]) =>
    el('button', { class: 'anotar-sw', title: label, style: `background:${c}`, type: 'button', onclick: () => { prefs.color = c; save(); paint() } })
  )
  const sizes = SIZES.map(([v, label]) =>
    el('button', { class: 'anotar-chip', type: 'button', onclick: () => { prefs.size = v; save(); paint() } }, label)
  )
  const tools = TOOLS.map(([v, label]) =>
    el('button', { class: 'anotar-chip', type: 'button', onclick: () => { prefs.tool = v; save(); paint() } }, label)
  )
  const paint = () => {
    swatches.forEach((b, i) => b.classList.toggle('on', COLORS[i][0] === prefs.color))
    sizes.forEach((b, i) => b.classList.toggle('on', SIZES[i][0] === prefs.size))
    tools.forEach((b, i) => b.classList.toggle('on', TOOLS[i][0] === prefs.tool))
  }

  const undo = () => { shapes.pop(); redraw() }
  const clear = () => { shapes.length = 0; redraw() }

  const close = () => {
    document.removeEventListener('keydown', onKey, true)
    overlay.remove()
  }

  const send = async submit => {
    const blob = await new Promise(r => canvas.toBlob(r, 'image/png'))
    let out = blob
    if (blob && blob.size > 8 * 1024 * 1024) out = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.9))
    if (!out) return host.notify?.({ kind: 'error', message: 'No se pudo exportar la imagen' })
    const stem = String(name).replace(/\.[a-z0-9]+$/i, '').slice(0, 60) || 'imagen'
    const file = new File([out], `${stem}_anotada.${out.type === 'image/png' ? 'png' : 'jpg'}`, { type: out.type })
    const text = comment.value.trim()
    close()
    // Close the app lightbox if it is open (Radix listens for Escape).
    if (document.querySelector('[role="dialog"] [class~="group/lightbox"]')) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await sleep(120)
    }
    const surface = visibleSurface()
    const target = surface?.dataset.composerTarget || 'main'
    const pills = () => surface?.querySelectorAll('[data-slot="composer-attachments"] button[aria-label]').length || 0
    const before = pills()
    window.dispatchEvent(new CustomEvent('hermes:composer-attach-images', { detail: { blobs: [file], target } }))
    if (text) await host.composer?.insertText?.(null, text, { mode: 'block' })
    if (!submit) {
      host.composer?.focus?.(null)
      return
    }
    // Wait for the pill to land and finish uploading, then press the real Send.
    for (let i = 0; i < 100; i++) {
      await sleep(150)
      const root = surface?.querySelector('[data-slot="composer-attachments"]')
      const ready = pills() > before && !root?.querySelector('[aria-busy="true"]')
      const btn = surface?.querySelector('button[type="submit"]:not([disabled])')
      if (ready && btn) {
        await sleep(150)
        btn.click()
        return
      }
    }
    host.composer?.focus?.(null)
    host.notify?.({ kind: 'warning', message: 'La imagen quedó adjunta: revisa y dale Enter.' })
  }

  const onKey = e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close() }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.stopPropagation(); undo() }
    else if (e.key === 'Enter' && document.activeElement === comment) { e.preventDefault(); e.stopPropagation(); send(!e.shiftKey) }
  }
  document.addEventListener('keydown', onKey, true)

  const overlay = el('div', { class: 'anotar-ov', role: 'dialog', 'aria-label': 'Anotar imagen' }, [
    el('div', { class: 'anotar-bar' }, [
      el('div', { class: 'grp' }, tools),
      el('span', { class: 'sep' }),
      el('div', { class: 'grp' }, swatches),
      el('span', { class: 'sep' }),
      el('div', { class: 'grp' }, sizes),
      el('span', { class: 'sep' }),
      el('button', { class: 'anotar-chip', type: 'button', title: 'Ctrl+Z', onclick: undo }, 'Deshacer'),
      el('button', { class: 'anotar-chip', type: 'button', onclick: clear }, 'Borrar todo'),
      el('span', { style: 'flex:1' }),
      el('button', { class: 'anotar-chip', type: 'button', title: 'Esc', onclick: close }, 'Cancelar')
    ]),
    el('div', { class: 'anotar-stage' }, canvas),
    el('div', { class: 'anotar-foot' }, [
      comment,
      el('span', { class: 'hint' }, 'Shift+Enter: solo adjuntar'),
      el('button', { class: 'anotar-chip', type: 'button', onclick: () => send(false) }, 'Adjuntar'),
      el('button', { class: 'anotar-chip pri', type: 'button', onclick: () => send(true) }, 'Enviar')
    ])
  ])
  paint()
  document.body.append(overlay)

  toSafeSrc(src)
    .then(loadImage)
    .then(img => {
      base = img
      canvas.width = img.naturalWidth || img.width
      canvas.height = img.naturalHeight || img.height
      redraw()
    })
    .catch(err => {
      close()
      host.notify?.({ kind: 'error', message: `No se pudo abrir la imagen: ${err?.message || err}` })
    })
}

// ---------------------------------------------------------------- backend
function makeApi(ctx) {
  let cache = { sid: null, at: 0, images: [] }
  const sid = () => {
    try { return host.state?.focusedSessionId?.get?.() || '' } catch { return '' }
  }
  return {
    async recent(force = false) {
      const s = sid()
      if (!force && cache.sid === s && Date.now() - cache.at < 4000) return cache.images
      const res = await ctx.rest(`/recent?session_id=${encodeURIComponent(s)}&limit=40`)
      cache = { sid: s, at: Date.now(), images: res?.images || [] }
      return cache.images
    },
    async image(path) {
      const res = await ctx.rest(`/image?path=${encodeURIComponent(path)}`)
      if (!res?.dataUrl) throw new Error('sin imagen')
      return res.dataUrl
    }
  }
}

// ---------------------------------------------------------------- picker
async function openPicker(ctx, api) {
  let images = []
  try { images = await api.recent(true) } catch (err) {
    return host.notify?.({ kind: 'error', message: `El backend de anotar-imagen no responde (${err?.message || err}). ¿Está habilitado en el servidor?` })
  }
  if (!images.length) return host.notify?.({ kind: 'info', message: 'No hay imágenes en esta conversación' })
  const close = () => { document.removeEventListener('keydown', onKey, true); ov.remove() }
  const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close() } }
  document.addEventListener('keydown', onKey, true)
  const grid = el('div', { class: 'anotar-pick' })
  const ov = el('div', { class: 'anotar-ov' }, [
    el('div', { class: 'anotar-bar' }, [
      el('strong', {}, 'Elige la imagen para anotar'),
      el('span', { style: 'flex:1' }),
      el('button', { class: 'anotar-chip', type: 'button', onclick: close }, 'Cerrar')
    ]),
    grid
  ])
  document.body.append(ov)
  for (const it of images) {
    const img = el('img', { alt: it.name })
    grid.append(el('button', { type: 'button', title: it.path, onclick: () => { close(); api.image(it.path).then(src => openEditor(ctx, src, it.name)) } }, [img, el('span', {}, it.name)]))
    api.image(it.path).then(src => { img.src = src }).catch(() => {})
  }
}

// ---------------------------------------------------------------- DOM scan
function pencil(ctx, getSrc, name, lightbox = false) {
  return el('button', {
    class: `anotar-btn${lightbox ? ' lb' : ''}`,
    type: 'button',
    title: 'Dibujar sobre la imagen',
    onclick: e => {
      e.preventDefault()
      e.stopPropagation()
      const src = getSrc()
      if (src) openEditor(ctx, src, name?.() || 'imagen')
    }
  }, '✎ Dibujar')
}

const imgName = img => {
  const src = img?.getAttribute('alt') || ''
  return src && !/^(output|image|imagen)$/i.test(src) ? src : 'imagen'
}

function scan(ctx, api) {
  // inline images (tool rows, MEDIA:, markdown)
  document.querySelectorAll('[data-slot="aui_zoomable-image"]').forEach(box => {
    if (box.querySelector(':scope > .anotar-btn')) return
    const img = box.querySelector('img')
    if (!img) return
    box.append(pencil(ctx, () => img.currentSrc || img.src, () => imgName(img)))
  })
  // app lightbox
  document.querySelectorAll('[role="dialog"]').forEach(dlg => {
    const lb = dlg.querySelector('[class~="group/lightbox"] img')
    if (!lb || dlg.querySelector('.anotar-btn.lb')) return
    dlg.append(pencil(ctx, () => lb.currentSrc || lb.src, () => imgName(lb), true))
  })
  // failed native previews → fetch through the plugin backend
  document.querySelectorAll('[data-slot="aui_markdown-image"]:not([data-anotar])').forEach(span => {
    const m = /^Couldn.t load (.+?)\.\s*Open image/.exec(span.textContent || '')
    if (!m) return
    const name = m[1].trim()
    span.setAttribute('data-anotar', 'pending')
    api.recent()
      .then(list => list.find(it => it.name === name) || (api.recent(true).then(l => l.find(it => it.name === name))))
      .then(hit => {
        if (!hit) throw new Error('no encontrada')
        return api.image(hit.path).then(src => ({ src, hit }))
      })
      .then(({ src, hit }) => {
        if (!span.isConnected) return
        const img = el('img', { alt: hit.name, src, title: hit.path, onclick: () => openEditor(ctx, src, hit.name) })
        const box = el('span', { class: 'anotar-fix' }, [img, pencil(ctx, () => src, () => hit.name)])
        span.append(box)
        span.setAttribute('data-anotar', 'fixed')
      })
      .catch(() => span.setAttribute('data-anotar', 'miss'))
  })
}

// ---------------------------------------------------------------- plugin
export default {
  id: ID,
  name: 'Anotar imagen',
  description: 'Dibuja sobre las imágenes del chat (colores, grosores, flecha, recuadro) y mándalas de vuelta al agente.',
  register(ctx) {
    const api = makeApi(ctx)
    const style = el('style', { 'data-plugin': ID }, CSS)
    document.head.append(style)

    let queued = false
    const run = () => {
      queued = false
      try { scan(ctx, api) } catch (err) { console.warn(`[${ID}] scan`, err) }
    }
    const observer = new MutationObserver(() => {
      if (!queued) { queued = true; requestAnimationFrame(run) }
    })
    observer.observe(document.body, { childList: true, subtree: true })
    run()

    ctx.registerMany([
      {
        id: 'pick',
        area: PALETTE_AREA,
        data: {
          id: `${ID}.pick`,
          label: 'Anotar imagen de esta conversación',
          keywords: ['dibujar', 'anotar', 'imagen', 'pintar', 'draw'],
          run: () => void openPicker(ctx, api)
        }
      },
      {
        id: 'pick-key',
        area: KEYBINDS_AREA,
        data: {
          id: `${ID}.pick`,
          label: 'Anotar imagen de esta conversación',
          category: 'Anotar imagen',
          defaults: ['mod+alt+d'],
          run: () => void openPicker(ctx, api)
        }
      }
    ])

    ctx.onDispose(() => {
      observer.disconnect()
      style.remove()
      document.querySelectorAll('.anotar-btn,.anotar-fix,.anotar-ov').forEach(n => n.remove())
      document.querySelectorAll('[data-anotar]').forEach(n => n.removeAttribute('data-anotar'))
    })
  }
}
