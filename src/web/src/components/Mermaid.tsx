import { useEffect, useRef, useState } from 'react'
import DOMPurify from 'dompurify'
import mermaid from 'mermaid'

mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'strict', fontFamily: 'inherit', flowchart: { useMaxWidth: false } })
let seq = 0

/** Renders a Mermaid diagram; shows the source with a hint when the syntax is invalid. */
export function Mermaid({ source }: { source: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    let live = true
    const code = source.replace(/^```(mermaid)?\s*|```\s*$/g, '').trim()
    mermaid
      .render(`mmd-${++seq}`, code)
      .then(({ svg }) => {
        if (!live || !ref.current) return
        ref.current.innerHTML = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true }, ADD_TAGS: ['foreignObject'] })
        setError(false)
      })
      .catch(() => live && setError(true))
    return () => {
      live = false
    }
  }, [source])
  return error ? (
    <div className="mermaid-error">
      <p>The diagram has a syntax error. Comment on it or request changes so the agent can fix it.</p>
      <pre>{source}</pre>
    </div>
  ) : (
    <div className="mermaid-box" ref={ref} />
  )
}
