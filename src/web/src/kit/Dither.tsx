// Ordered (Bayer) dithering of a soft, seeded field: quiet texture for placeholders, and when
// `animate` is on, a slow flowing pattern that says "an agent is thinking".
import { useEffect, useRef } from 'react'

const BAYER = [0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21].map((v) => (v + 0.5) / 64)

function hash(s: string) {
  let h = 2166136261
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return (h >>> 0) / 4294967296
}

export function Dither({ seed = 'x', cols = 96, rows = 48, animate = false, className = '', density = 1 }: { seed?: string; cols?: number; rows?: number; animate?: boolean; className?: string; density?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const r = hash(seed)
    const fx = 1.2 + r * 2.4
    const fy = 0.8 + ((r * 7) % 1) * 2
    const phase0 = r * 10
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let color = getComputedStyle(canvas).getPropertyValue('--dither').trim() || '#888'
    let frame = 0
    let raf = 0
    let last = 0
    const draw = (t: number) => {
      ctx.clearRect(0, 0, cols, rows)
      ctx.fillStyle = color
      const p = phase0 + t
      for (let y = 0; y < rows; y++)
        for (let x = 0; x < cols; x++) {
          const u = x / cols
          const v = y / rows
          // Two soft waves and a diagonal ramp; brightness then ordered-dithered into dots.
          let f = 0.5 + 0.28 * Math.sin(u * fx * 6.28 + p) * Math.cos(v * fy * 6.28 - p * 0.7) + 0.22 * Math.sin((u + v) * 3.1 + p * 0.5)
          f = Math.pow(Math.min(1, Math.max(0, f)), 1.6) * density
          if (f > BAYER[(y % 8) * 8 + (x % 8)]) ctx.fillRect(x, y, 1, 1)
        }
    }
    const loop = (ms: number) => {
      raf = requestAnimationFrame(loop)
      if (ms - last < 70) return // ~14 fps is plenty for a calm motion
      last = ms
      draw((frame++ * 0.06) % 1000)
    }
    draw(0)
    if (animate && !reduced) raf = requestAnimationFrame(loop)
    // Redraw in the new colour when the theme changes.
    const mo = new MutationObserver(() => {
      color = getComputedStyle(canvas).getPropertyValue('--dither').trim() || color
      draw(frame * 0.06)
    })
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => (cancelAnimationFrame(raf), mo.disconnect())
  }, [seed, cols, rows, animate, density])
  return <canvas ref={ref} className={`dither ${className}`} width={cols} height={rows} aria-hidden="true" />
}
