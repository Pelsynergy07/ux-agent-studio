// The studio: a full-window workspace for screens, in the spirit of Lovable / Figma Make.
//   Play     – click through the screens as a prototype (data-goto links).
//   Edit     – describe a change (optionally pointing at an element); the agent revises that screen.
//   Text     – click any text on the screen and type; saved on blur, logged as a hand edit.
//   Link     – pick a clickable element and choose which screen it opens; saved like a text edit.
//   Comment  – click an element and leave a comment (for the next revision or for the record).
//   Present  – true full screen for review meetings: click through or use arrow keys, comment in place.
import { ArrowRight, ChevronLeft, ChevronRight, Link2, LogOut, Maximize2, MessageSquare, MousePointerClick, Palette, ScanLine, Type, Unlink, Wand2, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Comment, Decision, Project, StageArtifact, StageId } from '../../../shared/types'
import { api, previewOrigin } from '../api'
import { Button, IconButton, Segmented } from '../kit/Button'
import { Spinner } from '../kit/Feedback'
import { Select } from '../kit/Field'
import { ago, cleanError } from '../ui'
import { CommentRow } from './editors'

type Mode = 'play' | 'edit' | 'text' | 'link' | 'comment'
type LinkEl = El & { selector: string; goto: string }
type El = NonNullable<Comment['element']>
const VIEW = { w: 1440, h: 900 }

interface Props {
  project: Project
  stage: StageId
  artifact: StageArtifact
  comments: Comment[]
  decisions: Decision[]
  running: boolean
  progress?: string
  editable: boolean
  startIn: 'studio' | 'present'
  onClose: () => void
  onChange: () => void
  onCommentsChange: () => void
}

export function Studio({ project, stage, artifact, comments, decisions, running, progress, editable, startIn, onClose, onChange, onCommentsChange }: Props) {
  const screens = artifact.screens ?? []
  const root = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)
  const [mode, setMode] = useState<Mode>(editable ? 'edit' : 'comment')
  const [present, setPresent] = useState(false)
  const [fidelity, setFidelity] = useState<'wireframe' | 'full'>('wireframe')
  const [target, setTarget] = useState<El | null>(null)
  const [text, setText] = useState('')
  const [saidBy, setSaidBy] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [attrs, setAttrs] = useState<{ selector: string; tag: string; attrs: Record<string, string> } | null>(null)
  const [linkTarget, setLinkTarget] = useState<LinkEl | null>(null)
  const [links, setLinks] = useState<LinkEl[]>([])
  const [hotspots, setHotspots] = useState(false)
  const screen = screens[Math.min(index, screens.length - 1)]
  const isLofi = stage === 'lofi'

  // Present: real browser full screen. Leaving full screen (Esc) returns to the studio.
  const enterPresent = useCallback(async () => {
    setPresent(true)
    setMode('play')
    try {
      await root.current?.requestFullscreen()
    } catch {
      /* full screen not allowed (e.g. embedded): the overlay still fills the window */
    }
  }, [])
  const exitPresent = useCallback(async () => {
    setPresent(false)
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {})
  }, [])
  useEffect(() => {
    if (startIn === 'present') void enterPresent()
  }, [startIn, enterPresent])
  useEffect(() => {
    const onFs = () => !document.fullscreenElement && setPresent(false)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  // Keyboard: ← → between screens, Esc closes the studio (full screen handles its own Esc).
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('textarea, input')) return
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(i + 1, screens.length - 1))
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(i - 1, 0))
      if (e.key === 'Escape' && !document.fullscreenElement) onClose()
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [screens.length, onClose])

  // Messages from the screen: a picked element (edit/comment) or edited HTML (text mode).
  useEffect(() => {
    const onMsg = async (e: MessageEvent) => {
      if (e.origin !== previewOrigin() || !screen) return
      if (e.data?.type === 'uxs-pick') setTarget(e.data.element)
      if (e.data?.type === 'uxs-attrs' && mode === 'text') setAttrs(e.data)
      if (e.data?.type === 'uxs-goto' && mode === 'play') {
        const i = screens.findIndex((s) => s.id === e.data.screen)
        if (i > -1) setIndex(i)
      }
      if (e.data?.type === 'uxs-proto-ready') (e.source as Window | null)?.postMessage({ type: 'uxs-hotspots', on: hotspots }, '*')
      if (e.data?.type === 'uxs-link-pick' && mode === 'link') setLinkTarget(e.data.element)
      if (e.data?.type === 'uxs-links' && mode === 'link') setLinks(e.data.links)
      if (e.data?.type === 'uxs-edit' && (mode === 'text' || mode === 'link')) {
        try {
          await api.saveScreenBody(project.id, stage, screen.id, e.data.html)
          setSaved(`Saved ${new Date().toLocaleTimeString()}`)
          onChange()
        } catch (err) {
          setError(cleanError(err))
        }
      }
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [mode, screen?.id, project.id, stage, screens, hotspots])

  useEffect(() => (setTarget(null), setAttrs(null), setLinkTarget(null), setLinks([])), [index, mode])
  useEffect(() => {
    document.querySelector<HTMLIFrameElement>('.studio .fit-frame iframe')?.contentWindow?.postMessage({ type: 'uxs-hotspots', on: hotspots }, '*')
  }, [hotspots])
  const toFrame = (msg: object) => document.querySelector<HTMLIFrameElement>('.studio .fit-frame iframe')?.contentWindow?.postMessage(msg, previewOrigin())
  if (!screen) return null

  const q = new URLSearchParams({
    fidelity: isLofi ? fidelity : '',
    annotate: mode === 'edit' || mode === 'comment' ? '1' : '',
    edit: mode === 'text' && editable ? '1' : '',
    link: mode === 'link' && editable ? '1' : '',
    proto: mode === 'play' ? '1' : '',
  })
  const src = `${previewOrigin()}${screen.url}?${q}`
  const screenComments = comments.filter((c) => c.screenId === screen.id)
  const history = decisions.filter((d) => d.stage === stage && (d.action === 'changes_requested' || d.action === 'generated' || d.action === 'edited') && d.note?.startsWith(`${screen.title}:`)).reverse()

  const applyEdit = async () => {
    setError(null)
    try {
      await api.editScreen(project.id, stage, screen.id, text, target ?? undefined)
      setText('')
      setTarget(null)
      onChange()
    } catch (e) {
      setError(cleanError(e))
    }
  }
  const addComment = async () => {
    setError(null)
    try {
      const anchor = target ? `${screen.title} › <${target.tag}> "${target.text.slice(0, 50)}"` : screen.title
      await api.addComment(project.id, { stage, screenId: screen.id, anchor, element: target ?? undefined, text: saidBy.trim() ? `${saidBy.trim()} (in review): ${text}` : text })
      setText('')
      setTarget(null)
      onCommentsChange()
      onChange()
    } catch (e) {
      setError(cleanError(e))
    }
  }

  const nav = (
    <div className="studio-nav">
      <IconButton icon={ChevronLeft} label="Previous screen (←)" disabled={index === 0} onClick={() => setIndex(index - 1)} />
      <span className="studio-nav-label">
        <b>{screen.title}</b> <span className="muted">{index + 1} / {screens.length}</span>
      </span>
      <IconButton icon={ChevronRight} label="Next screen (→)" disabled={index === screens.length - 1} onClick={() => setIndex(index + 1)} />
    </div>
  )

  // Portal to <body>: iX's content area is its own stacking context, and the studio must cover the app.
  return createPortal(
    <div className={`studio ${present ? 'presenting' : ''}`} ref={root} role="dialog" aria-label="Screen studio">
      {!present && (
        <header className="studio-bar">
          <IconButton icon={X} label="Close studio (Esc)" onClick={onClose} />
          <div className="studio-title">
            <b>{project.name}</b>
            <span className="muted">
              {isLofi ? 'Lo-fi' : 'Hi-fi'} · v{artifact.version}
            </span>
          </div>
          {nav}
          <div className="studio-tools">
            <Segmented
              label="Mode"
              size="sm"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'play' as Mode, label: 'Play', icon: MousePointerClick },
                ...(editable
                  ? [
                      { value: 'edit' as Mode, label: 'Edit', icon: Wand2 },
                      { value: 'text' as Mode, label: 'Text', icon: Type },
                      { value: 'link' as Mode, label: 'Link', icon: Link2 },
                    ]
                  : []),
                { value: 'comment' as Mode, label: 'Comment', icon: MessageSquare },
              ]}
            />
            {isLofi && (
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
            <Button variant="primary" size="sm" icon={Maximize2} onClick={enterPresent}>
              Present
            </Button>
          </div>
        </header>
      )}

      <div className="studio-main">
        {!present && (
          <nav className="studio-screens" aria-label="Screens">
            {screens.map((s, i) => (
              <button key={s.id} className={`sthumb ${i === index ? 'on' : ''}`} onClick={() => setIndex(i)}>
                <span className="sthumb-n">{i + 1}</span>
                <span className="sthumb-t">{s.title}</span>
                {comments.some((c) => c.screenId === s.id && !c.sentInVersion) && <span className="dot" aria-label="has comments" />}
              </button>
            ))}
          </nav>
        )}

        <div className={`studio-canvas mode-${mode}`}>
          <FitFrame src={src} title={screen.title} />
          {running && (
            <div className="canvas-busy">
              <Spinner size={18} />
              <span>{progress ?? 'Updating…'}</span>
            </div>
          )}
        </div>

        {!present && (
          <aside className="studio-panel">
            {error && <p className="danger-text small">{error}</p>}
            {mode === 'play' && (
              <>
                <h3>Click through</h3>
                <p className="muted small">Use the screen like the real product: clickable elements open the screen they link to. Clicking anywhere else briefly shows what is clickable.</p>
                <Button variant="secondary" icon={MousePointerClick} onClick={() => setHotspots((h) => !h)}>
                  {hotspots ? 'Hide clickable areas' : 'Show clickable areas'}
                </Button>
                {editable && (
                  <p className="muted small">
                    Missing a link? Switch to{' '}
                    <button className="link" onClick={() => setMode('link')}>
                      Link
                    </button>{' '}
                    and connect it.
                  </p>
                )}
              </>
            )}
            {mode === 'link' && (
              <LinkPanel
                screens={screens.map((s) => ({ id: s.id, title: s.title }))}
                current={screen.id}
                target={linkTarget}
                links={links}
                saved={saved}
                onPick={(selector) => toFrame({ type: 'uxs-pick-selector', selector })}
                onLink={(goto) => {
                  if (!linkTarget) return
                  toFrame({ type: 'uxs-set-link', selector: linkTarget.selector, screen: goto })
                  setLinkTarget({ ...linkTarget, goto })
                }}
              />
            )}
            {mode === 'edit' && (
              <>
                <h3>Describe a change</h3>
                <p className="muted small">The agent updates this screen only, inside the design system. Click an element first to point at it.</p>
                {target && <TargetChip el={target} onClear={() => setTarget(null)} />}
                <textarea
                  className="input"
                  rows={4}
                  placeholder={target ? 'What should change about this element?' : 'e.g. Make the table denser and move filters into a side panel'}
                  value={text}
                  disabled={running}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && text.trim() && applyEdit()}
                />
                <Button variant="primary" icon={Wand2} disabled={!text.trim()} loading={running} onClick={applyEdit}>
                  {running ? 'Working…' : 'Apply to this screen'}
                </Button>
                {history.length > 0 && (
                  <>
                    <h4 className="mini">Changes to this screen</h4>
                    <ol className="studio-history">
                      {history.map((d, i) => (
                        <li key={i} className={`by-${d.by}`}>
                          <span>{d.note!.slice(screen.title.length + 2)}</span>
                          <span className="muted small">
                            {d.by === 'agent' ? 'Agent' : (d.actor ?? 'You')} · v{d.version} · {ago(d.at)}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </>
                )}
              </>
            )}
            {mode === 'text' && (
              <>
                <h3>Edit text</h3>
                <p className="muted small">Click any text on the screen and type. Press Enter or click away to save. Every change is in the decision log.</p>
                {saved && <p className="ok-text small">{saved}</p>}
                {attrs && (
                  <AttrEditor
                    key={attrs.selector}
                    tag={attrs.tag}
                    attrs={attrs.attrs}
                    onApply={(name, value) => {
                      const frame = document.querySelector<HTMLIFrameElement>('.studio .fit-frame iframe')
                      frame?.contentWindow?.postMessage({ type: 'uxs-set-attr', selector: attrs.selector, name, value }, previewOrigin())
                      setAttrs({ ...attrs, attrs: { ...attrs.attrs, [name]: value } })
                    }}
                  />
                )}
              </>
            )}
            {mode === 'comment' && (
              <CommentPanel target={target} onClearTarget={() => setTarget(null)} text={text} setText={setText} saidBy={saidBy} setSaidBy={setSaidBy} onAdd={addComment} comments={screenComments} />
            )}
          </aside>
        )}
      </div>

      {present && (
        <div className="present-bar">
          {nav}
          <span className="tool-sep" aria-hidden="true" />
          <IconButton icon={MessageSquare} label={mode === 'comment' ? 'Back to clicking through' : 'Comment'} active={mode === 'comment'} onClick={() => setMode(mode === 'comment' ? 'play' : 'comment')} />
          <IconButton icon={MousePointerClick} label={hotspots ? 'Hide clickable areas' : 'Show clickable areas'} active={hotspots} onClick={() => setHotspots((h) => !h)} />
          {isLofi && <IconButton icon={Palette} label={fidelity === 'full' ? 'Show wireframe' : 'Show in colour'} active={fidelity === 'full'} onClick={() => setFidelity(fidelity === 'full' ? 'wireframe' : 'full')} />}
          <Button variant="secondary" size="sm" icon={LogOut} onClick={exitPresent}>
            Exit
          </Button>
        </div>
      )}
      {present && mode === 'comment' && target && (
        <div className="present-composer">
          <TargetChip el={target} onClear={() => setTarget(null)} />
          <input className="input" placeholder="Who said it? (optional)" value={saidBy} onChange={(e) => setSaidBy(e.target.value)} />
          <textarea className="input" autoFocus rows={2} placeholder="Comment…" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), text.trim() && addComment())} />
          <div className="row end">
            <Button variant="ghost" size="sm" onClick={() => setTarget(null)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" disabled={!text.trim()} onClick={addComment}>
              Add comment
            </Button>
          </div>
        </div>
      )}
      {present && mode === 'comment' && !target && <div className="present-hint">Click anything on the screen to comment on it</div>}
      {present && mode === 'play' && (
        <div className="present-hint fleeting" key={screen.id}>
          {screen.title} · click through, or use ← →
        </div>
      )}
    </div>,
    document.body,
  )
}

/** Link mode: pick a clickable element on the screen, then choose the screen it opens. */
function LinkPanel({ screens, current, target, links, saved, onPick, onLink }: { screens: { id: string; title: string }[]; current: string; target: LinkEl | null; links: LinkEl[]; saved: string | null; onPick: (selector: string) => void; onLink: (goto: string) => void }) {
  const title = (id: string) => screens.find((s) => s.id === id)?.title ?? id
  return (
    <>
      <h3>Link screens</h3>
      <p className="muted small">Click a button, row or menu item on the screen, then choose where it goes. Linked elements are outlined. Every change is in the decision log.</p>
      {saved && <p className="ok-text small">{saved}</p>}
      {target ? (
        <div className="link-editor">
          <div className="target-chip">
            <span>
              &lt;{target.tag}&gt; {target.text || 'element'}
            </span>
          </div>
          <Select label="Opens" value={target.goto} onChange={(e) => onLink(e.target.value)} options={[{ value: '', label: 'Nothing (not a link)' }, ...screens.filter((s) => s.id !== current).map((s) => ({ value: s.id, label: s.title }))]} />
          {target.goto && (
            <Button variant="ghost" size="sm" icon={Unlink} onClick={() => onLink('')}>
              Remove link
            </Button>
          )}
        </div>
      ) : (
        <p className="link-empty small">Pick an element on the screen to link it.</p>
      )}
      <h4 className="mini">Links on this screen</h4>
      {links.length ? (
        <ul className="link-list">
          {links.map((l) => (
            <li key={l.selector}>
              <button onClick={() => onPick(l.selector)}>
                <span className="link-from">{l.text || `<${l.tag}>`}</span>
                <ArrowRight className="link-arrow" aria-hidden="true" />
                <span className="link-to">{title(l.goto)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small">None yet.</p>
      )}
    </>
  )
}

/** Text that iX components take from attributes (labels, titles, placeholders) can't be typed in place. */
function AttrEditor({ tag, attrs, onApply }: { tag: string; attrs: Record<string, string>; onApply: (name: string, value: string) => void }) {
  const [draft, setDraft] = useState(attrs)
  return (
    <div className="attr-editor">
      <div className="target-chip">
        <span>&lt;{tag}&gt;</span>
      </div>
      {Object.keys(attrs).map((k) => (
        <label key={k} className="attr-field">
          <span className="muted small">{k.replace(/-/g, ' ')}</span>
          <input className="input" value={draft[k] ?? ''} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && onApply(k, draft[k] ?? '')} onBlur={() => draft[k] !== attrs[k] && onApply(k, draft[k] ?? '')} />
        </label>
      ))}
    </div>
  )
}

function TargetChip({ el, onClear }: { el: El; onClear: () => void }) {
  return (
    <div className="target-chip">
      <span>
        &lt;{el.tag}&gt; {el.text || 'element'}
      </span>
      <button className="link" onClick={onClear}>
        Clear
      </button>
    </div>
  )
}

function CommentPanel({ target, onClearTarget, text, setText, saidBy, setSaidBy, onAdd, comments }: { target: El | null; onClearTarget: () => void; text: string; setText: (s: string) => void; saidBy: string; setSaidBy: (s: string) => void; onAdd: () => void; comments: Comment[] }) {
  return (
    <>
      <h3>Comments</h3>
      <p className="muted small">Click an element to comment on it, or comment on the whole screen.</p>
      {target && <TargetChip el={target} onClear={onClearTarget} />}
      <input className="input" placeholder="Who said it? (optional, for review meetings)" value={saidBy} onChange={(e) => setSaidBy(e.target.value)} />
      <textarea className="input" rows={3} placeholder={target ? 'What should change about this element?' : 'Comment on this screen…'} value={text} onChange={(e) => setText(e.target.value)} />
      <Button variant="primary" disabled={!text.trim()} onClick={onAdd}>
        Add comment
      </Button>
      {[...comments].reverse().map((c) => (
        <CommentRow key={c.id} c={c} />
      ))}
    </>
  )
}

/** Renders the screen at a real desktop size, scaled to fit the available space in both directions. */
function FitFrame({ src, title }: { src: string; title: string }) {
  const box = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.5)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setScale(Math.min(el.clientWidth / VIEW.w, el.clientHeight / VIEW.h)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <div className="fit-box" ref={box}>
      <div className="fit-frame" style={{ width: VIEW.w * scale, height: VIEW.h * scale }}>
        <iframe title={title} src={src} sandbox="allow-scripts allow-same-origin" style={{ width: VIEW.w, height: VIEW.h, transform: `scale(${scale})` }} />
      </div>
    </div>
  )
}
