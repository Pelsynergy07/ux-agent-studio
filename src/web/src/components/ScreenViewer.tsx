// Screen previews for designers and stakeholders: real design-system screens, scaled from a true
// desktop viewport. Primary controls: fidelity, comment, studio, present; the rest under "More".
import { Columns2, Maximize2, MessageSquare, Monitor, MoreHorizontal, Palette, ScanLine, Tablet, Wand2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Comment, Screen } from '../../../shared/types'
import { previewOrigin } from '../api'
import { Button, IconButton, Segmented } from '../kit/Button'
import { Menu, Tabs } from '../kit/Layout'
import { CommentRow } from './editors'

const VIEWPORTS = { desktop: { w: 1440, h: 900, label: 'Desktop' }, tablet: { w: 1024, h: 768, label: 'Tablet' } }
type Viewport = keyof typeof VIEWPORTS
type Picked = { screenId: string; element: NonNullable<Comment['element']> }

interface Props {
  screens: Screen[]
  /** Previous version's screens, for side-by-side comparison. */
  previous?: { version: number; screens: Screen[] }
  version: number
  /** Lo-fi screens can be previewed in full colour without regenerating. */
  canSwitchFidelity: boolean
  comments: Comment[]
  onComment: (c: { screenId: string; anchor: string; element?: Comment['element']; text: string }) => Promise<void>
  onRemoveComment?: (id: string) => Promise<void>
  /** Extra query for stakeholder access (&token=…). */
  query?: string
  /** Name input for stakeholders, shown above the comment box. */
  nameField?: React.ReactNode
  /** Opens the full-window studio or presentation mode (designer only). */
  onOpen?: (mode: 'studio' | 'present') => void
}

export function ScreenViewer({ screens, previous, version, canSwitchFidelity, comments, onComment, onRemoveComment, query = '', nameField, onOpen }: Props) {
  const [active, setActive] = useState(screens[0]?.id)
  const [fidelity, setFidelity] = useState<'wireframe' | 'full'>('wireframe')
  const [viewport, setViewport] = useState<Viewport>('desktop')
  const [commenting, setCommenting] = useState(false)
  const [compare, setCompare] = useState(false)
  const [picked, setPicked] = useState<Picked | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!screens.find((s) => s.id === active)) setActive(screens[0]?.id)
  }, [screens, active])

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin === previewOrigin() && e.data?.type === 'uxs-pick' && commenting) setPicked({ screenId: active!, element: e.data.element })
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [commenting, active])

  const screen = screens.find((s) => s.id === active)
  if (!screen) return <p className="muted">No screens yet.</p>
  const prevScreen = previous?.screens.find((s) => s.id === active)
  const src = (s: Screen) => `${previewOrigin()}${s.url}?${new URLSearchParams({ fidelity: canSwitchFidelity ? fidelity : '', annotate: commenting ? '1' : '' })}${query}`
  const mine = comments.filter((c) => c.screenId === active)
  const openCount = (id: string) => comments.filter((c) => c.screenId === id && !c.sentInVersion).length
  const unsent = mine.filter((c) => !c.sentInVersion).length

  const submit = async (anchor: string, element?: Comment['element']) => {
    if (!text.trim()) return
    setBusy(true)
    try {
      await onComment({ screenId: screen.id, anchor, element, text })
      setText('')
      setPicked(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="viewer">
      <div className="viewer-bar">
        <Tabs label="Screens" value={active!} onChange={(v) => (setActive(v), setPicked(null))} tabs={screens.map((s) => ({ value: s.id, label: s.title, count: openCount(s.id) }))} />
        <div className="viewer-tools">
          {canSwitchFidelity && (
            <Segmented
              label="Fidelity"
              size="sm"
              value={fidelity}
              onChange={setFidelity}
              options={[
                { value: 'wireframe', label: 'Wireframe', icon: ScanLine },
                { value: 'full', label: 'Colour', icon: Palette },
              ]}
            />
          )}
          <IconButton icon={MessageSquare} label={commenting ? 'Stop commenting' : 'Comment on screen'} active={commenting} badge={unsent || undefined} variant="secondary" onClick={() => (setCommenting((c) => !c), setPicked(null))} />
          <Menu
            trigger={(toggle) => <IconButton icon={MoreHorizontal} label="More" variant="secondary" onClick={toggle} />}
            items={[
              { label: 'Desktop size', icon: Monitor, checked: viewport === 'desktop', onSelect: () => setViewport('desktop') },
              { label: 'Tablet size', icon: Tablet, checked: viewport === 'tablet', onSelect: () => setViewport('tablet') },
              ...(previous && prevScreen ? ['divider' as const, { label: compare ? 'Stop comparing' : `Compare with v${previous.version}`, icon: Columns2, onSelect: () => setCompare((c) => !c) }] : []),
            ]}
          />
          {onOpen && (
            <>
              <span className="tool-sep" aria-hidden="true" />
              <IconButton icon={Maximize2} label="Present full screen" variant="secondary" onClick={() => onOpen('present')} />
              <Button variant="primary" size="sm" icon={Wand2} onClick={() => onOpen('studio')}>
                Open studio
              </Button>
            </>
          )}
        </div>
      </div>

      <div className={`viewer-body ${commenting ? 'with-panel' : ''}`}>
        <div className={`frames ${compare && prevScreen ? 'two' : ''}`}>
          {compare && prevScreen && <Frame label={`v${previous!.version}`} src={src(prevScreen)} viewport={viewport} />}
          <Frame label={compare ? `v${version} · current` : undefined} src={src(screen)} viewport={viewport} highlight={commenting} />
          <p className="screen-purpose">{screen.purpose}</p>
        </div>

        {commenting && (
          <aside className="screen-comments" aria-label="Comments on this screen">
            <p className="muted small">Click any element on the screen to comment on it, or comment on the whole screen.</p>
            {nameField}
            {picked && <div className="crow-el">&lt;{picked.element.tag}&gt; {picked.element.text || 'element'}</div>}
            <textarea className="input" rows={3} autoFocus placeholder={picked ? 'What should change about this element?' : 'Comment on this screen…'} value={text} onChange={(e) => setText(e.target.value)} />
            <div className="row end">
              {picked && (
                <Button variant="ghost" size="sm" onClick={() => setPicked(null)}>
                  Whole screen
                </Button>
              )}
              <Button variant="primary" size="sm" disabled={!text.trim()} loading={busy} onClick={() => (picked ? submit(`${screen.title} › <${picked.element.tag}> "${picked.element.text.slice(0, 50)}"`, picked.element) : submit(screen.title))}>
                Add comment
              </Button>
            </div>
            {[...mine].reverse().map((c) => (
              <CommentRow key={c.id} c={c} onDelete={onRemoveComment && !c.sentInVersion ? () => onRemoveComment(c.id) : undefined} />
            ))}
          </aside>
        )}
      </div>
    </div>
  )
}

/** An iframe rendered at a real viewport size and scaled down to fit its column. */
function Frame({ src, viewport, label, highlight }: { src: string; viewport: Viewport; label?: string; highlight?: boolean }) {
  const box = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.5)
  const { w, h } = VIEWPORTS[viewport]
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setScale(Math.min(1, el.clientWidth / w)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [w])
  return (
    <figure className={`frame ${highlight ? 'commenting' : ''}`}>
      {label && <figcaption>{label}</figcaption>}
      <div className="frame-box" ref={box} style={{ height: h * scale }}>
        <iframe title={label ?? 'Screen preview'} src={src} sandbox="allow-scripts allow-same-origin" style={{ width: w, height: h, transform: `scale(${scale})` }} />
      </div>
    </figure>
  )
}
