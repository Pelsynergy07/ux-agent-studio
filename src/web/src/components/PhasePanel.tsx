import { Check, ChevronRight, Info, Link2, Lock, RotateCcw, Send, Share2, Sparkles, Undo2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { AgentInfo, Comment, Decision, Project, ServerInfo, StageArtifact, StageMeta, StageStatus } from '../../../shared/types'
import { api } from '../api'
import { DotWave, burst, useThinking } from '../delight'
import { Button, IconButton } from '../kit/Button'
import { Badge, Banner, EmptyState, type Tone } from '../kit/Feedback'
import { cleanError, duration, Popover, setPath } from '../ui'
import { Phase, type PhaseCtx } from './editors'
import { Align } from './phases/Align'
import { Shape } from './phases/Shape'
import { Understand } from './phases/Understand'
import { ScreenViewer } from './ScreenViewer'
import { Studio } from './Studio'

interface Props {
  project: Project
  meta: StageMeta
  stages: StageMeta[]
  agent?: AgentInfo
  progress?: { message: string; chars?: number; startedAt: number }
  comments: Comment[]
  decisions: Decision[]
  server: ServerInfo | null
  onChange: () => void
  onCommentsChange: () => void
}

const STATUS: Record<StageStatus, { label: string; tone: Tone }> = {
  locked: { label: 'Locked', tone: 'neutral' },
  ready: { label: 'Ready to start', tone: 'accent' },
  running: { label: 'Agent working', tone: 'info' },
  review: { label: 'Needs your review', tone: 'accent' },
  approved: { label: 'Approved', tone: 'success' },
  error: { label: 'Failed', tone: 'danger' },
}

export function PhasePanel({ project, meta, stages, agent, progress, comments, decisions, server, onChange, onCommentsChange }: Props) {
  const st = project.stages[meta.id]
  const [artifact, setArtifact] = useState<StageArtifact | null>(null)
  const [previous, setPrevious] = useState<StageArtifact | null>(null)
  const [viewVersion, setViewVersion] = useState<number | null>(null)
  const [gate, setGate] = useState<'idle' | 'changes' | 'approve'>('idle')
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())
  const [studio, setStudio] = useState<'studio' | 'present' | null>(null)
  const isScreens = meta.id === 'lofi' || meta.id === 'hifi'
  const latest = viewVersion === null || viewVersion === st.version
  const mine = comments.filter((c) => c.stage === meta.id)
  const pending = mine.filter((c) => !c.sentInVersion)
  const index = project.pipeline.indexOf(meta.id)
  const thinking = useThinking(meta.id, st.status === 'running')

  useEffect(() => {
    setViewVersion(null)
    setGate('idle')
    setText('')
    setError(null)
  }, [meta.id, project.id])

  useEffect(() => {
    let live = true
    const v = viewVersion ?? st.version
    if (!v) return setArtifact(null)
    api.getArtifact(project.id, meta.id, v).then((a) => live && setArtifact(a))
    if (isScreens && v > 1) api.getArtifact(project.id, meta.id, v - 1).then((a) => live && setPrevious(a))
    else setPrevious(null)
    return () => {
      live = false
    }
  }, [project.id, meta.id, st.version, st.status, st.updatedAt, viewVersion, isScreens])

  useEffect(() => {
    if (st.status !== 'running') return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [st.status])

  const act = async (fn: () => Promise<unknown>) => {
    setError(null)
    try {
      await fn()
      setGate('idle')
      setText('')
      onChange()
    } catch (e) {
      setError(cleanError(e))
    }
  }
  const approve = (from?: Element | null) => {
    burst(from)
    void act(() => api.approveStage(project.id, meta.id, text))
  }

  const editable = st.status === 'review' && latest
  const ctx: PhaseCtx | null = useMemo(
    () =>
      artifact && {
        stage: meta.id,
        data: artifact.data,
        editable,
        comments: mine,
        edit: async (path, value) => {
          try {
            setArtifact(await api.saveData(project.id, meta.id, setPath(artifact.data, path, value)))
            onChange()
          } catch (e) {
            setError(cleanError(e))
          }
        },
        comment: async (c) => {
          await api.addComment(project.id, { stage: meta.id, ...c })
          onCommentsChange()
          onChange()
        },
        removeComment: async (id) => {
          await api.deleteComment(project.id, id)
          onCommentsChange()
        },
      },
    [artifact, editable, mine, project.id, meta.id],
  )

  const usage = st.usage
  const servedOther = !!usage && usage.servedModels.length > 0 && !usage.servedModels.includes(usage.model) && usage.model !== 'default'
  const prevTitle = stages.find((s) => s.id === project.pipeline[index - 1])?.title
  const reads = agent?.inputs.filter((i) => project.pipeline.includes(i) && project.pipeline.indexOf(i) < index).map((i) => stages.find((s) => s.id === i)?.title)
  const secs = Math.round((now - (progress?.startedAt ?? now)) / 1000)

  return (
    <section className="phase" aria-label={meta.title}>
      <header className="phase-head">
        <div className="phase-title">
          <span className="eyebrow">
            Phase {index + 1} of {project.pipeline.length}
          </span>
          <h2>{meta.title}</h2>
          <p className="phase-sub">{meta.summary}</p>
        </div>
        <div className="phase-head-right">
          <Badge tone={STATUS[st.status].tone} dot pulse={st.status === 'running' || st.status === 'review'}>
            {STATUS[st.status].label}
          </Badge>
          {st.version > 0 && (
            <Popover align="right" trigger={(toggle) => <IconButton icon={Info} label={servedOther ? 'Details: Copilot used a different model' : 'Details'} badge={servedOther || undefined} onClick={toggle} />}>
              {() => (
                <div className="details">
                  <dl>
                    <dt>Version</dt>
                    <dd>
                      {st.version > 1 ? (
                        <select className="input input-sm" value={viewVersion ?? st.version} onChange={(e) => setViewVersion(Number(e.target.value))}>
                          {Array.from({ length: st.version }, (_, i) => st.version - i).map((v) => (
                            <option key={v} value={v}>
                              v{v}
                              {v === st.version ? ' · latest' : ''}
                            </option>
                          ))}
                        </select>
                      ) : (
                        'v1'
                      )}
                      {st.edited ? ' · edited by you' : ''}
                    </dd>
                    {usage && (
                      <>
                        <dt>Model</dt>
                        <dd>
                          {usage.servedModels.join(', ') || usage.model}
                          {usage.effort ? ` · ${usage.effort} effort` : ''}
                        </dd>
                        <dt>Tokens</dt>
                        <dd className="mono">
                          {usage.inputTokens.toLocaleString()} in · {usage.outputTokens.toLocaleString()} out · {Math.round(usage.durationMs / 1000)}s
                        </dd>
                      </>
                    )}
                    {reads && (
                      <>
                        <dt>Read</dt>
                        <dd>{reads.join(', ') || 'the meeting transcript'}</dd>
                      </>
                    )}
                  </dl>
                  {servedOther && (
                    <Banner tone="warn">
                      Asked for {usage!.model}, but Copilot served {usage!.servedModels.join(', ')}. Your account may not allow choosing models.
                    </Banner>
                  )}
                </div>
              )}
            </Popover>
          )}
          {st.status === 'approved' && <ReopenButton later={project.pipeline.length - index - 1} onReopen={(r) => act(() => api.reopenStage(project.id, meta.id, r))} />}
        </div>
      </header>

      <div className="phase-banners">
        {error && (
          <Banner tone="danger" onClose={() => setError(null)}>
            {error}
          </Banner>
        )}
        {st.error && st.status !== 'running' && st.version > 0 && <Banner tone="warn">The last revision failed: {st.error}</Banner>}
        {!latest && (
          <Banner tone="info" action={<Button size="sm" variant="ghost" onClick={() => setViewVersion(null)}>Back to latest</Button>}>
            Viewing v{viewVersion}, read-only.
          </Banner>
        )}
        {st.status === 'locked' && st.version > 0 && <Banner tone="neutral">Locked until {prevTitle ?? 'the previous phase'} is approved again. Showing the last version, read-only.</Banner>}
      </div>

      {st.status === 'locked' && st.version === 0 && (
        <EmptyState icon={Lock} title="Not yet">
          This phase starts once {prevTitle ?? 'the previous phase'} is approved.
        </EmptyState>
      )}

      {(st.status === 'ready' || (st.status === 'error' && st.version === 0)) && (
        <EmptyState
          icon={st.status === 'error' ? RotateCcw : Sparkles}
          title={st.status === 'error' ? 'That didn’t work' : 'Ready when you are'}
          action={
            <Button variant="primary" icon={st.status === 'error' ? RotateCcw : Sparkles} onClick={() => act(() => api.runStage(project.id, meta.id))}>
              {st.status === 'error' ? 'Try again' : `Start phase ${index + 1}`}
            </Button>
          }
        >
          {st.status === 'error' ? (st.error ?? 'The agent failed.') : `${agent?.name ?? 'An agent'} drafts this from ${index === 0 ? 'the meeting transcript' : 'what you’ve approved so far'}. Usually under a minute.`}
        </EmptyState>
      )}

      {st.status === 'running' && (
        <div className="thinking" role="status" aria-live="polite">
          <DotWave />
          <div className="thinking-text">
            <span key={thinking} className="thinking-line">
              {thinking}…
            </span>
            <span className="muted small mono">
              {agent?.name ?? 'Agent'} · {secs < 60 ? `${secs}s` : duration(secs * 1000)}
              {progress?.chars ? ` · ${progress.chars.toLocaleString()} chars` : ''}
            </span>
          </div>
          <Button variant="ghost" size="sm" icon={X} onClick={() => act(() => api.cancelStage(project.id, meta.id))}>
            Cancel
          </Button>
        </div>
      )}

      {artifact && ctx && (
        <div key={`${meta.id}-${artifact.version}`} className={`phase-body enter ${st.status === 'running' ? 'dim' : ''}`}>
          <Phase.Provider value={{ ...ctx, editable: ctx.editable && st.status !== 'running' }}>
            {isScreens && (st.status === 'review' || st.status === 'approved') && latest && <SignOff project={project} stage={meta.id} version={artifact.version} server={server} onChange={onChange} />}
            {meta.id === 'understand' && <Understand />}
            {meta.id === 'align' && (
              <Align
                answers={artifact.answers ?? {}}
                projectName={project.name}
                onAnswers={async (a) => {
                  try {
                    setArtifact(await api.saveAnswers(project.id, a))
                    onChange()
                  } catch (e) {
                    setError(cleanError(e))
                  }
                }}
              />
            )}
            {meta.id === 'shape' && <Shape />}
            {isScreens && artifact.screens && (
              <ScreenViewer
                screens={artifact.screens}
                version={artifact.version}
                previous={previous?.screens ? { version: previous.version, screens: previous.screens } : undefined}
                canSwitchFidelity={meta.id === 'lofi'}
                comments={mine}
                onComment={ctx.comment}
                onRemoveComment={ctx.removeComment}
                onOpen={latest ? setStudio : undefined}
              />
            )}
          </Phase.Provider>
        </div>
      )}

      {studio && artifact?.screens && (
        <Studio
          project={project}
          stage={meta.id}
          artifact={artifact}
          comments={mine}
          decisions={decisions}
          running={st.status === 'running'}
          progress={progress?.message}
          editable={(st.status === 'review' || st.status === 'running') && latest}
          startIn={studio}
          onClose={() => setStudio(null)}
          onChange={onChange}
          onCommentsChange={onCommentsChange}
        />
      )}

      {st.status === 'review' && latest && (
        <footer className={`gate ${gate !== 'idle' ? 'open' : ''}`}>
          {gate === 'idle' && (
            <div className="gate-row">
              <span className="gate-q">{meta.gate}</span>
              <Button variant="secondary" icon={pending.length ? Send : undefined} onClick={() => setGate('changes')}>
                {pending.length ? `Send ${pending.length} comment${pending.length > 1 ? 's' : ''}` : 'Request changes'}
              </Button>
              <Button variant="primary" icon={Check} onClick={() => setGate('approve')}>
                Approve
              </Button>
            </div>
          )}
          {gate === 'changes' && (
            <div className="gate-panel">
              <strong>What should the agent change?</strong>
              {pending.length > 0 && (
                <details className="pending" open={pending.length <= 3}>
                  <summary>
                    <ChevronRight aria-hidden="true" />
                    {pending.length} comment{pending.length > 1 ? 's' : ''} will be included
                  </summary>
                  <div className="pending-list">
                    {pending.map((c) => (
                      <div key={c.id} className="pending-item">
                        <span className="pending-anchor">{c.anchor}</span>
                        <p className="pending-text">
                          {c.by === 'stakeholder' && <span className="tag">{c.author}</span>} {c.text}
                        </p>
                        <button type="button" className="link" onClick={() => ctx?.removeComment(c.id)}>
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </details>
              )}
              <textarea className="input" autoFocus rows={3} placeholder={pending.length ? 'Anything else? (optional)' : 'Be specific. You can also comment on individual items first.'} value={text} onChange={(e) => setText(e.target.value)} />
              <div className="row end">
                <Button variant="ghost" onClick={() => setGate('idle')}>
                  Cancel
                </Button>
                <Button variant="primary" icon={Send} disabled={!text.trim() && !pending.length} onClick={() => act(() => api.requestChanges(project.id, meta.id, text))}>
                  Send to agent
                </Button>
              </div>
            </div>
          )}
          {gate === 'approve' && (
            <div className="gate-panel">
              <strong>Approve {meta.title}?</strong>
              {pending.length > 0 && <p className="warn-text small">{pending.length} unsent comment{pending.length > 1 ? 's' : ''} will stay unsent.</p>}
              <input className="input" autoFocus placeholder="Why? (optional, goes in the decision log)" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && approve(e.currentTarget)} />
              <div className="row end">
                <Button variant="ghost" onClick={() => setGate('idle')}>
                  Cancel
                </Button>
                <Button variant="primary" icon={Check} onClick={(e) => approve(e.currentTarget)}>
                  Approve
                </Button>
              </div>
            </div>
          )}
        </footer>
      )}
    </section>
  )
}

function ReopenButton({ onReopen, later }: { onReopen: (reason: string) => void; later: number }) {
  const [reason, setReason] = useState('')
  return (
    <Popover
      align="right"
      trigger={(toggle) => (
        <Button variant="ghost" size="sm" icon={Undo2} onClick={toggle}>
          Reopen
        </Button>
      )}
    >
      {(close) => (
        <div className="thread">
          <strong>Reopen this phase?</strong>
          {later > 0 && <p className="muted small">The {later} phase{later > 1 ? 's' : ''} after it will need approval again.</p>}
          <input className="input" autoFocus placeholder="Why? (goes in the decision log)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="row end">
            <Button variant="primary" size="sm" onClick={() => (onReopen(reason), close())}>
              Reopen
            </Button>
          </div>
        </div>
      )}
    </Popover>
  )
}

/** Compact sign-off strip for screen phases: share, copy link, see verdicts. */
function SignOff({ project, stage, version, server, onChange }: { project: Project; stage: string; version: number; server: ServerInfo | null; onChange: () => void }) {
  const rv = project.review
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const current = rv && rv.stage === stage && rv.version === version
  const link = rv ? `${(server?.reviewBase ?? [location.origin]).at(-1)}/review/${rv.token}` : ''
  const approvals = rv?.verdicts.filter((v) => v.verdict === 'approved').length ?? 0
  const changes = rv?.verdicts.filter((v) => v.verdict === 'changes').length ?? 0
  return (
    <div className={`signoff ${project.signedOffAt ? 'done' : ''}`}>
      <span className="signoff-icon" aria-hidden="true">
        {project.signedOffAt ? <Check /> : <Share2 />}
      </span>
      <div className="signoff-text">
        <strong>{project.signedOffAt ? `Signed off in ${duration(Date.parse(project.signedOffAt) - Date.parse(project.createdAt))}` : current ? `v${version} is with stakeholders` : 'Get stakeholder sign-off'}</strong>
        <span className="muted small">
          {rv?.verdicts.length ? `${approvals} approved · ${changes} asked for changes` : current ? 'They can comment on any element and approve.' : rv ? `They’re looking at v${rv.version}.` : 'Share a link. Stakeholders comment on elements and approve.'}
        </span>
        {error && <span className="danger-text small">{error}</span>}
      </div>
      {current ? (
        <Button
          variant="secondary"
          icon={copied ? Check : Link2}
          title={link}
          onClick={async () => {
            await navigator.clipboard.writeText(link)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          }}
        >
          {copied ? 'Copied' : 'Copy review link'}
        </Button>
      ) : (
        <Button
          variant="accent"
          icon={Share2}
          onClick={async () => {
            try {
              await api.shareForReview(project.id)
              onChange()
            } catch (e) {
              setError(cleanError(e))
            }
          }}
        >
          {rv ? `Share v${version}` : 'Share for sign-off'}
        </Button>
      )}
    </div>
  )
}
