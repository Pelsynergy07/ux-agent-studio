// What a project's agents read: Library items it follows (by tag or pinned), notes only for this
// project, and what it has learnt from the designer. Used in Brief › Context and the Sources panel.
import {
  BookOpen,
  Brain,
  Check,
  ExternalLink,
  FileText,
  Folder,
  Image as ImageIcon,
  Paperclip,
  Plus,
  StickyNote,
  Trash2,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ContextSource, LibraryItem, Project, ProjectSources } from '../../../shared/types'
import { api } from '../api'
import { Button, IconButton } from '../kit/Button'
import { Card } from '../kit/Card'
import { getTagPalette } from '../pages/Library'
import { cleanError, Modal } from '../ui'

export const TEXT_FILES = '.txt,.md,.markdown,.csv,.tsv,.json,.html,.htm,.xml,.vtt,.srt,.yaml,.yml'
export const IMAGE_FILES = '.png,.jpg,.jpeg,.webp,.gif,.svg'
export const ALL_SUPPORTED_FILES = `${TEXT_FILES},${IMAGE_FILES}`

const tokens = (words: number) => Math.round(words * 1.35)
const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n))

export async function readUploadedFiles(list: FileList | File[]): Promise<{
  textFiles: { name: string; text: string }[]
  imageFiles: { name: string; dataUrl: string; mimeType: string }[]
  rejected: string[]
}> {
  const files = [...list]
  const isText = (f: File) => TEXT_FILES.split(',').some((ext) => f.name.toLowerCase().endsWith(ext))
  const isImage = (f: File) => IMAGE_FILES.split(',').some((ext) => f.name.toLowerCase().endsWith(ext)) || f.type.startsWith('image/')

  const textFiles: { name: string; text: string }[] = []
  const imageFiles: { name: string; dataUrl: string; mimeType: string }[] = []
  const rejected: string[] = []

  for (const f of files) {
    if (isImage(f)) {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(f)
      })
      imageFiles.push({ name: f.name, dataUrl, mimeType: f.type || 'image/png' })
    } else if (isText(f)) {
      textFiles.push({ name: f.name, text: await f.text() })
    } else {
      rejected.push(f.name)
    }
  }
  return { textFiles, imageFiles, rejected }
}

export async function readTextFiles(list: FileList | File[]): Promise<{ ok: { name: string; text: string }[]; rejected: string[] }> {
  const files = [...list]
  const isText = (f: File) => TEXT_FILES.split(',').some((ext) => f.name.toLowerCase().endsWith(ext))
  return { ok: await Promise.all(files.filter(isText).map(async (f) => ({ name: f.name, text: await f.text() }))), rejected: files.filter((f) => !isText(f)).map((f) => f.name) }
}

export function SourcesEditor({ project, transcript = '', onChange }: { project: Project; transcript?: string; onChange: () => void }) {
  const [library, setLibrary] = useState<{ items: LibraryItem[]; tags: string[]; folders: string[] } | null>(null)
  const [context, setContext] = useState<ContextSource[]>([])
  const [note, setNote] = useState('')
  const [fact, setFact] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [drag, setDrag] = useState(false)
  const [lightbox, setLightbox] = useState<{ title: string; url: string } | null>(null)
  const files = useRef<HTMLInputElement>(null)
  const src: ProjectSources = project.sources ?? { tags: [], pinned: [], excluded: [] }

  const load = () => Promise.all([api.listLibrary().then(setLibrary), api.getContext(project.id).then(setContext)])
  useEffect(() => void load(), [project.id, project.updatedAt])

  const act = async (fn: () => Promise<unknown>) => {
    setError(null)
    setBusy(true)
    try {
      await fn()
      await load()
      onChange()
    } catch (e) {
      setError(cleanError(e))
    } finally {
      setBusy(false)
    }
  }
  const save = (next: Partial<ProjectSources>) => act(() => api.setSources(project.id, { ...src, ...next }))

  // Tags whose words appear in the transcript are suggested first.
  const suggested = useMemo(() => {
    const t = transcript.toLowerCase()
    return new Set((library?.tags ?? []).filter((tag) => tag.toLowerCase().split(/[\s-]+/).some((w) => w.length > 3 && t.includes(w))))
  }, [library, transcript])
  const tags = [...(library?.tags ?? [])].sort((a, b) => Number(suggested.has(b)) - Number(suggested.has(a)))
  const included = (i: LibraryItem) => !src.excluded.includes(i.id) && (src.pinned.includes(i.id) || i.tags.some((t) => src.tags.includes(t)))
  const toggleItem = (i: LibraryItem) =>
    included(i)
      ? save({ pinned: src.pinned.filter((x) => x !== i.id), excluded: i.tags.some((t) => src.tags.includes(t)) ? [...src.excluded, i.id] : src.excluded })
      : save({ pinned: [...src.pinned, i.id], excluded: src.excluded.filter((x) => x !== i.id) })

  const own = context.filter((c) => c.origin === 'project')
  const memory = context.filter((c) => c.origin === 'memory')
  const libIn = library?.items.filter(included) ?? []
  const total = [...own, ...memory].reduce((n, c) => n + c.words, 0) + libIn.reduce((n, i) => n + i.words, 0)

  return (
    <div className="sources-editor">
      {error && <p className="danger-text small">{error}</p>}

      {/* 1. From your Library */}
      <Card
        icon={BookOpen}
        iconClassName="icon-accent"
        label="From your Library"
        count={libIn.length}
        actions={
          <a className="sources-lib-link" href="#/library" target="_blank" rel="noreferrer">
            Manage Library <ExternalLink aria-hidden="true" className="link-ext-icon" />
          </a>
        }
      >
        {!library ? null : library.items.length === 0 ? (
          <p className="muted small sources-empty-hint">
            Your Library is empty. Add shared files and notes in the Library to reuse them across all your projects.
          </p>
        ) : (
          <div className="sources-card-body">
            {tags.length > 0 && (
              <div className="sources-tags-filter" role="group" aria-label="Filter library tags">
                {tags.map((t) => {
                  const on = src.tags.includes(t)
                  const pal = getTagPalette(t)
                  return (
                    <button
                      key={t}
                      type="button"
                      className={`sources-tag-pill ${on ? 'on' : ''}`}
                      style={{
                        backgroundColor: on ? pal.bg : undefined,
                        borderColor: on ? pal.border : undefined,
                        color: on ? pal.color : undefined,
                      }}
                      aria-pressed={on}
                      onClick={() => save({ tags: on ? src.tags.filter((x) => x !== t) : [...src.tags, t] })}
                    >
                      <span className="sources-tag-dot" style={{ backgroundColor: pal.dot }} />
                      <span>{t}</span>
                      {on && <Check aria-hidden="true" className="sources-tag-check" />}
                      {suggested.has(t) && !on && <span className="sources-tag-sugg">suggested</span>}
                    </button>
                  )
                })}
              </div>
            )}

            <ul className="sources-list">
              {library.items.map((i) => {
                const isInc = included(i)
                return (
                  <li key={i.id} className={`sources-item ${isInc ? 'is-included' : ''}`}>
                    <label className="check sources-check">
                      <input type="checkbox" checked={isInc} disabled={busy} onChange={() => toggleItem(i)} />
                      <span className="check-box">
                        <Check />
                      </span>
                    </label>
                    <div className="sources-item-main" onClick={() => toggleItem(i)}>
                      {i.kind === 'image' ? (
                        <div
                          className="sources-thumb-wrap"
                          title="Click to zoom UI reference"
                          onClick={(e) => {
                            if (i.imageUrl) {
                              e.stopPropagation()
                              setLightbox({ title: i.title, url: i.imageUrl })
                            }
                          }}
                        >
                          {i.imageUrl ? (
                            <img src={i.imageUrl} className="sources-thumb" alt={i.title} />
                          ) : (
                            <ImageIcon className="sources-item-icon" aria-hidden="true" />
                          )}
                        </div>
                      ) : i.kind === 'file' ? (
                        <FileText className="sources-item-icon" aria-hidden="true" />
                      ) : (
                        <StickyNote className="sources-item-icon" aria-hidden="true" />
                      )}
                      <span className="sources-item-title">{i.title}</span>
                      {i.folder && (
                        <span className="sources-folder-badge">
                          <Folder aria-hidden="true" />
                          <span>{i.folder}</span>
                        </span>
                      )}
                      {i.tags.length > 0 && (
                        <div className="sources-item-tags">
                          {i.tags.map((tg) => {
                            const p = getTagPalette(tg)
                            return (
                              <span
                                key={tg}
                                className="sources-tag-chip"
                                style={{ backgroundColor: p.bg, borderColor: p.border, color: p.color }}
                              >
                                <span className="sources-tag-dot" style={{ backgroundColor: p.dot }} />
                                {tg}
                              </span>
                            )
                          })}
                        </div>
                      )}
                    </div>
                    {i.kind === 'image' ? (
                      <span className="sources-item-size badge-ui-ref">UI Ref</span>
                    ) : (
                      <span className="sources-item-size mono">{fmt(tokens(i.words))} tok</span>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </Card>

      {/* 2. Only for this project */}
      <Card
        icon={FileText}
        iconClassName="icon-accent"
        label="Only for this project"
        count={own.length}
      >
        <div className="sources-card-body">
          <div
            className={`composer sources-composer ${drag ? 'drag' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setDrag(true)
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDrag(false)
              void act(async () => {
                const { textFiles, imageFiles, rejected } = await readUploadedFiles(e.dataTransfer.files)
                for (const f of textFiles) await api.addContext(project.id, { title: f.name, text: f.text, kind: 'file' })
                for (const f of imageFiles) await api.addContext(project.id, { title: f.name, dataUrl: f.dataUrl, mimeType: f.mimeType, kind: 'image' })
                if (rejected.length) throw new Error(`${rejected.join(', ')}: unsupported file format.`)
              })
            }}
          >
            <textarea
              className="composer-input"
              rows={3}
              placeholder="Paste notes, research or requirements, or drop text files and UI reference images"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="composer-foot">
              <Button variant="ghost" size="sm" icon={Paperclip} onClick={() => files.current?.click()}>
                Attach
              </Button>
              <input
                ref={files}
                type="file"
                multiple
                accept={ALL_SUPPORTED_FILES}
                hidden
                onChange={(e) => {
                  const list = e.target.files
                  if (list)
                    void act(async () => {
                      const { textFiles, imageFiles, rejected } = await readUploadedFiles(list)
                      for (const f of textFiles) await api.addContext(project.id, { title: f.name, text: f.text, kind: 'file' })
                      for (const f of imageFiles) await api.addContext(project.id, { title: f.name, dataUrl: f.dataUrl, mimeType: f.mimeType, kind: 'image' })
                      if (rejected.length) throw new Error(`${rejected.join(', ')}: unsupported file format.`)
                    }).finally(() => (e.target.value = ''))
                }}
              />
              <span className="hint" />
              <Button
                variant="primary"
                size="sm"
                icon={Plus}
                disabled={!note.trim()}
                loading={busy && !!note.trim()}
                onClick={() =>
                  act(() =>
                    api.addContext(project.id, { text: note, kind: 'note' }).then(() => setNote(''))
                  )
                }
              >
                Add
              </Button>
            </div>
          </div>

          {own.length > 0 && (
            <ul className="sources-list sources-own-list">
              {own.map((c) => (
                <li key={c.id} className="sources-item is-included">
                  <div className="sources-item-main">
                    {c.kind === 'image' ? (
                      <div
                        className="sources-thumb-wrap"
                        title="Click to zoom UI reference"
                        onClick={(e) => {
                          if (c.imageUrl) {
                            e.stopPropagation()
                            setLightbox({ title: c.title, url: c.imageUrl })
                          }
                        }}
                      >
                        {c.imageUrl ? (
                          <img src={c.imageUrl} className="sources-thumb" alt={c.title} />
                        ) : (
                          <ImageIcon className="sources-item-icon" aria-hidden="true" />
                        )}
                      </div>
                    ) : c.kind === 'file' ? (
                      <FileText className="sources-item-icon" aria-hidden="true" />
                    ) : (
                      <StickyNote className="sources-item-icon" aria-hidden="true" />
                    )}
                    <span className="sources-item-title">{c.title}</span>
                  </div>
                  {c.kind === 'image' ? (
                    <span className="sources-item-size badge-ui-ref">UI Ref</span>
                  ) : (
                    <span className="sources-item-size mono">{fmt(tokens(c.words))} tok</span>
                  )}
                  <IconButton
                    icon={Trash2}
                    label="Remove"
                    size="sm"
                    onClick={() => confirm(`Remove “${c.title}”?`) && act(() => api.deleteContext(project.id, c.id))}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      {/* 3. What the project remembers */}
      <Card
        icon={Brain}
        iconClassName="icon-accent"
        label="What the project remembers"
        count={memory.length}
      >
        <div className="sources-card-body">
          <p className="sources-memory-desc muted small">
            Facts the agents remember from your answers, guidance, and project choices.
          </p>

          {memory.length > 0 && (
            <ul className="sources-list sources-memory-list">
              {memory.map((c) => (
                <li key={c.id} className="sources-item is-included sources-memory-item">
                  <Brain className="sources-item-icon memory-icon" aria-hidden="true" />
                  <span className="sources-item-title wrap">{c.text}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="sources-forget-btn"
                    onClick={() => act(() => api.forget(project.id, c.id))}
                  >
                    Forget
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <form
            className="sources-remember-form"
            onSubmit={(e) => {
              e.preventDefault()
              if (fact.trim()) void act(() => api.remember(project.id, fact).then(() => setFact('')))
            }}
          >
            <input
              className="input sources-remember-input"
              placeholder="Tell it something to remember, e.g. “Night shift has one operator”"
              value={fact}
              onChange={(e) => setFact(e.target.value)}
            />
            <Button type="submit" variant="secondary" size="sm" disabled={!fact.trim()} loading={busy && !!fact.trim()}>
              Remember
            </Button>
          </form>
        </div>
      </Card>

      {/* Bottom Token Status Bar */}
      <div className="sources-token-bar">
        <BookOpen aria-hidden="true" className="token-icon" />
        <span className="token-count">
          <strong>{fmt(tokens(total))} tokens</strong> available
        </span>
        <span className="token-dot">·</span>
        <span className="token-hint">Each step reads only the most relevant ~3k</span>
      </div>

      {lightbox && (
        <Modal title={lightbox.title} onClose={() => setLightbox(null)} wide>
          <div className="lightbox-content">
            <img src={lightbox.url} alt={lightbox.title} className="lightbox-img" />
          </div>
        </Modal>
      )}
    </div>
  )
}
