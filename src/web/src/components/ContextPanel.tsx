// The project's knowledge base: one place to dump what you know. Agents read the relevant parts before
// every phase, and Align's open questions are filled from it automatically.
import { BookOpen, ChevronRight, FileText, Paperclip, Plus, Sparkles, StickyNote, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { effectiveAnswer } from '../../../shared/pipelineRules'
import type { ContextSource, Project } from '../../../shared/types'
import { api } from '../api'
import { Button, IconButton } from '../kit/Button'
import { Banner } from '../kit/Feedback'
import type { View } from '../pages/ProjectView'
import { ago, cleanError } from '../ui'

const TEXT_FILES = '.txt,.md,.markdown,.csv,.tsv,.json,.html,.htm,.xml,.vtt,.srt,.yaml,.yml'

export function ContextPanel({ project, onChange, onGo, toast }: { project: Project; onChange: () => void; onGo: (v: View) => void; toast: (m: string) => void }) {
  const [sources, setSources] = useState<ContextSource[] | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [drag, setDrag] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openQs, setOpenQs] = useState(0)
  const files = useRef<HTMLInputElement>(null)
  const alignOpen = project.stages.align.status === 'review'

  useEffect(() => {
    api.getContext(project.id).then(setSources)
  }, [project.id])

  // How many Align questions are still waiting: new context may answer them.
  const countOpen = useCallback(async () => {
    if (!alignOpen) return 0
    const a = await api.getArtifact(project.id, 'align')
    const n = ((a?.data as { questions?: { id: string; answer?: string }[] })?.questions ?? []).filter((q) => !effectiveAnswer(q, a?.answers ?? {})).length
    setOpenQs(n)
    return n
  }, [alignOpen, project.id, project.updatedAt])
  useEffect(() => void countOpen(), [countOpen])

  const fill = async () => {
    try {
      const { filled } = await api.answerFromContext(project.id)
      toast(filled ? `Answered ${filled} open question${filled > 1 ? 's' : ''} in Align from your context.` : 'Your context doesn’t answer the open questions yet.')
      onChange()
      void countOpen()
    } catch (e) {
      setError(cleanError(e))
    }
  }

  const add = async (items: { title?: string; text: string; kind: ContextSource['kind'] }[]) => {
    setBusy(true)
    setError(null)
    try {
      let next = sources ?? []
      for (const it of items) next = await api.addContext(project.id, it)
      setSources(next)
      setText('')
      onChange()
      // New knowledge may settle open questions: try straight away, so nobody has to ask.
      if ((await countOpen()) > 0) await fill()
    } catch (e) {
      setError(cleanError(e))
    } finally {
      setBusy(false)
    }
  }

  const addFiles = async (list: FileList | File[]) => {
    const picked = [...list]
    const bad = picked.filter((f) => !TEXT_FILES.split(',').some((ext) => f.name.toLowerCase().endsWith(ext)))
    if (bad.length) setError(`${bad.map((f) => f.name).join(', ')}: only text files for now (${TEXT_FILES.replaceAll(',', ' ')}). For PDF or Word, paste the text.`)
    const ok = picked.filter((f) => !bad.includes(f))
    if (ok.length) await add(await Promise.all(ok.map(async (f) => ({ title: f.name, text: await f.text(), kind: 'file' as const }))))
  }

  const words = sources?.reduce((n, s) => n + s.words, 0) ?? 0

  return (
    <section className="phase context-panel" aria-label="Context">
      <header className="phase-head compact">
        <div className="phase-title">
          <h2>Context</h2>
          <p className="phase-sub">Everything you know. Agents read it before every phase.</p>
        </div>
        {sources && sources.length > 0 && (
          <span className="muted small">
            {sources.length} source{sources.length > 1 ? 's' : ''} · {words.toLocaleString()} words
          </span>
        )}
      </header>

      {error && (
        <Banner tone="danger" onClose={() => setError(null)}>
          {error}
        </Banner>
      )}
      {alignOpen && openQs > 0 && (
        <Banner
          tone="accent"
          action={
            <>
              <Button size="sm" variant="ghost" onClick={() => onGo('align')}>
                See them
              </Button>
              <Button size="sm" variant="primary" icon={Sparkles} loading={busy} onClick={() => (setBusy(true), void fill().finally(() => setBusy(false)))}>
                Answer from context
              </Button>
            </>
          }
        >
          {openQs} open question{openQs > 1 ? 's' : ''} in Align.
        </Banner>
      )}

      <div
        className={`composer ${drag ? 'drag' : ''}`}
        onDragOver={(e) => (e.preventDefault(), setDrag(true))}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDrag(false)
          if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files)
        }}
      >
        <textarea
          className="composer-input"
          rows={5}
          placeholder="Paste or type anything: research notes, answers from stakeholders, requirements, domain knowledge… or drop files here."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && text.trim() && void add([{ text, kind: 'note' }])}
        />
        <div className="composer-foot">
          <Button variant="ghost" size="sm" icon={Paperclip} onClick={() => files.current?.click()}>
            Attach files
          </Button>
          <input ref={files} type="file" multiple accept={TEXT_FILES} hidden onChange={(e) => e.target.files && void addFiles(e.target.files).finally(() => (e.target.value = ''))} />
          <span className="hint">⌘ Enter</span>
          <Button variant="primary" size="sm" icon={Plus} disabled={!text.trim()} loading={busy} onClick={() => add([{ text, kind: 'note' }])}>
            Add
          </Button>
        </div>
      </div>

      {sources === null ? null : sources.length === 0 ? (
        <div className="context-empty">
          <BookOpen aria-hidden="true" />
          <span>Nothing yet. The more you add, the fewer questions you'll be asked.</span>
        </div>
      ) : (
        <ul className="sources">
          {[...sources].reverse().map((s) => (
            <SourceRow
              key={s.id}
              s={s}
              onDelete={async () => {
                if (!confirm(`Remove “${s.title}” from the context?`)) return
                setSources(await api.deleteContext(project.id, s.id))
                onChange()
              }}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function SourceRow({ s, onDelete }: { s: ContextSource; onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  const Icon = s.kind === 'file' ? FileText : StickyNote
  return (
    <li className={`source ${open ? 'open' : ''}`}>
      <button type="button" className="source-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <ChevronRight className="fold-chev" aria-hidden="true" />
        <Icon className="source-icon" aria-hidden="true" />
        <span className="source-title">{s.title}</span>
        <span className="source-meta">
          {s.words.toLocaleString()} words · {ago(s.addedAt)}
        </span>
      </button>
      <IconButton icon={Trash2} label="Remove" size="sm" onClick={onDelete} />
      {open && <pre className="source-text">{s.text.length > 6000 ? `${s.text.slice(0, 6000)}\n\n…` : s.text}</pre>}
    </li>
  )
}
