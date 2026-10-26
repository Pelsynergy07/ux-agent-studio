// Small moments of delight. Every one of them is skipped when the user prefers reduced motion.
import { useEffect, useRef, useState } from 'react'

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** A short burst of confetti from an element (approvals, sign-off). Pure DOM, cleans itself up. */
export function burst(from?: Element | null, count = 18) {
  if (reducedMotion()) return
  const r = from?.getBoundingClientRect() ?? { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 }
  const x = r.left + r.width / 2
  const y = r.top + r.height / 2
  const colors = ['var(--app-accent)', 'var(--app-accent-2)', 'var(--app-warm)', 'var(--app-ink)']
  for (let i = 0; i < count; i++) {
    const p = document.createElement('i')
    p.className = 'confetti'
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4
    const dist = 60 + Math.random() * 70
    p.style.cssText = `left:${x}px;top:${y}px;background:${colors[i % colors.length]};--dx:${Math.cos(angle) * dist}px;--dy:${Math.sin(angle) * dist - 30}px;--rot:${Math.random() * 540}deg`
    document.body.appendChild(p)
    setTimeout(() => p.remove(), 900)
  }
}

/** Animates a number from 0 to its value when it first appears or changes. */
export function CountUp({ value, ms = 600 }: { value: number; ms?: number }) {
  const [shown, setShown] = useState(reducedMotion() ? value : 0)
  const from = useRef(0)
  useEffect(() => {
    if (reducedMotion()) return setShown(value)
    const start = performance.now()
    const a = from.current
    let raf = 0
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / ms)
      const eased = 1 - Math.pow(1 - k, 3)
      setShown(Math.round(a + (value - a) * eased))
      if (k < 1) raf = requestAnimationFrame(tick)
      else from.current = value
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, ms])
  return <>{shown}</>
}

/** What the agent is "doing", rotated while it works, so waiting never feels like a frozen spinner. */
const THINKING: Record<string, string[]> = {
  understand: ['Reading the transcript', 'Separating decisions from suggestions', 'Pulling out verbatim quotes', 'Drafting user stories', 'Writing requirements'],
  align: ['Mapping who’s involved', 'Spotting missing voices', 'Finding what’s still unknown', 'Routing questions to people', 'Defining the north star'],
  shape: ['Sketching the happy path', 'Walking the edge cases', 'Choosing design-system components', 'Drawing the flow', 'Listing the screens'],
  lofi: ['Laying out the page shell', 'Placing iX components', 'Writing realistic sample data', 'Adding empty and error states', 'Checking against the flow'],
  hifi: ['Tightening hierarchy', 'Applying severity colours', 'Polishing spacing', 'Checking states', 'Final pass'],
  casestudy: ['Reading the decision log', 'Finding the story', 'Writing the iterations', 'Adding the numbers'],
}

export function useThinking(stage: string, active: boolean) {
  const [i, setI] = useState(0)
  useEffect(() => {
    if (!active) return setI(0)
    const t = setInterval(() => setI((x) => x + 1), 2600)
    return () => clearInterval(t)
  }, [active])
  const lines = THINKING[stage] ?? ['Working']
  return lines[i % lines.length]
}

/** A dot-matrix waveform (a nod to the reference): breathes while agents work, rests otherwise. */
export function DotWave({ active = true, cols = 28, rows = 7 }: { active?: boolean; cols?: number; rows?: number }) {
  const dots = []
  for (let c = 0; c < cols; c++) {
    const h = Math.round(((Math.sin(c * 0.55) + Math.sin(c * 0.23 + 1)) / 2 + 1) * (rows / 2))
    for (let r = 0; r < rows; r++) {
      const on = Math.abs(r - (rows - 1) / 2) <= h / 2
      dots.push(<circle key={`${c}-${r}`} cx={c * 6 + 3} cy={r * 6 + 3} r={1.6} className={on ? 'on' : ''} style={{ animationDelay: `${(c * 60) % 1400}ms` }} />)
    }
  }
  return (
    <svg className={`dotwave ${active ? 'active' : ''}`} viewBox={`0 0 ${cols * 6} ${rows * 6}`} aria-hidden="true">
      {dots}
    </svg>
  )
}
