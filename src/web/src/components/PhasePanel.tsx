import { Check, ChevronRight, Info, Link2, Lock, RotateCcw, Send, Share2, Sparkles, Undo2 } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { AgentInfo, Budget, Comment, Decision, Project, Readiness, ServerInfo, StageArtifact, StageId, StageMeta, StageStatus } from '../../../shared/types'
import { api } from '../api'
import { Button, IconButton } from '../kit/Button'
import { Banner } from '../kit/Feedback'
import { Dither } from '../kit/Dither'
import { SubSteps } from '../kit/Layout'
import { estimate, withBudget } from '../run'
import { cleanError, duration, Popover, setPath } from '../ui'
import { Phase, type PhaseCtx } from './editors'
import { Align } from './phases/Align'
import { Brief } from './phases/Brief'
import { Concepts } from './phases/Concepts'
import { Shape } from './phases/Shape'
import { Understand } from './phases/Understand'
import { ScreenViewer } from './ScreenViewer'
import { SourcesEditor } from './Sources'
import { Studio } from './Studio'
import { Working } from './Working'
import { TranscriptStep } from './TranscriptStep'

interface Props {
  project: Project
  meta: StageMeta
  stages: StageMeta[]
  agent?: AgentInfo
  progress?: { message: string; chars?: number; startedAt: number }
  comments: Comment[]
  decisions: Decision[]
  server: ServerInfo | null
  budget: Budget | null
  onChange: () => void
  onCommentsChange: () => void
  onSources: () => void
  /** The step navigation, shown on the same line as this step's status. */
  nav: ReactNode
}

const STATUS: Record<StageStatus, string> = {
  locked: 'Locked',
  ready: 'Not started',
  running: 'Working…',
  review: 'Ready for your review',
  approved: 'Approved',
  error: 'Failed',
}

/** What the start button says, per step. */
const START: Partial<Record<StageId, string>> = { brief: 'Write the brief', explore: 'Explore 3 concepts', shape: 'Design the flow', lofi: 'Build the lo-fi', hifi: 'Build the hi-fi' }
/** Steps that first check whether anything essential is missing (cheap, and skipped when nothing changed). */
const CHECKED: StageId[] = ['explore', 'shape', 'lofi']
type Sub = 'transcript' | 'context' | 'draft'

export function PhasePanel({ project, meta, stages, agent, progress, comments, decisions, server, budget, onChange, onCommentsChange, onSources, nav }: Props) {
  const st = project.stages[meta.id]
  const [artifact, setArtifact] = useState<StageArtifact | null>(null)
  const [previous, setPrevious] = useState<StageArtifact | null>(null)
  const [viewVersion, setViewVersion] = useState<number | null>(null)
  const [gate, setGate] = useState<'idle' | 'changes' | 'approve'>('idle')
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [studio, setStudio] = useState<'studio' | 'present' | null>(null)
  const [starting, setStarting] = useState(false)
  const [clarify, setClarify] = useState<Readiness['questions'] | null>(null)
  const index = project.pipeline.indexOf(meta.id)
  // The first step starts from the meeting: Transcript → Context (optional) → the agent's draft.
  const first = index === 0
  const [sub, setSub] = useState<Sub | null>(first ? null : 'draft')
  const [transcript, setTranscript] = useState('')
  const isScreens = meta.id === 'lofi' || meta.id === 'hifi'
  const latest = viewVersion === null || viewVersion === st.version
  const mine = comments.filter((c) => c.stage === meta.id)
  const pending = mine.filter((c) => !c.sentInVersion)

  useEffect(() => {
    setViewVersion(null)
    setGate('idle')
    setText('')
    setError(null)
    setClarify(null)
    if (!first) return setSub('draft')
    api.getTranscript(project.id).then((t) => {
      setTranscript(t)
      setSub(!t.trim() ? 'transcript' : st.version === 0 && st.status !== 'running' ? 'context' : 'draft')
    })
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

  const run = () => act(() => withBudget((force) => api.runStage(project.id, meta.id, { force })))
  /** Start a step: ask first only if something essential is missing, then run. */
  const start = async () => {
    setStarting(true)
    setError(null)
    try {
      if (CHECKED.includes(meta.id)) {
        const r = await api.checkReady(project.id, meta.id).catch((e) => {
          // Over budget: skip the check; the run itself asks whether to go ahead.
          if (/Monthly budget reached/.test(String(e))) return { ready: true, questions: [] }
          throw e
        })
        if (!r.ready) return setClarify(r.questions)
      }
      await run()
    } catch (e) {
      setError(cleanError(e))
    } finally {
      setStarting(false)
    }
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
  const chosenMissing = meta.id === 'explore' && !(artifact?.data as { chosen?: string } | undefined)?.chosen
  const fillAnswers = async (notes: string) => {
    const { artifact: a, filled } = await api.answerFromContext(project.id, notes)
    setArtifact(a)
    onChange()
    return filled
  }

  const subSteps = first && sub && (
    <SubSteps
      current={sub}
      onSelect={(v) => setSub(v as Sub)}
      items={[
        { id: 'transcript', label: 'Transcript', done: !!transcript.trim() },
        { id: 'context', label: 'Context', done: !!project.sources?.tags.length || !!project.sources?.pinned.length || st.version > 0, disabled: !transcript.trim() },
        { id: 'draft', label: meta.title, done: st.status === 'approved', disabled: !transcript.trim() },
      ]}
    />
  )

  return (
    <section className="stepview" aria-label={meta.title}>
      <header className="stepbar">
        {nav}
        <div className="stepbar-status">
          <span className={`status-text s-${st.status}`}>
            {STATUS[st.status]}
            {st.version > 0 ? ` · v${st.version}` : ''}
          </span>
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
                        <dt>Cost</dt>
                        <dd className="mono">
                          {usage.premiumRequests} request{usage.premiumRequests === 1 ? '' : 's'} · {usage.inputTokens.toLocaleString()} in · {usage.outputTokens.toLocaleString()} out · {Math.round(usage.durationMs / 1000)}s
                        </dd>
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

      {subSteps}

      <div className="stepview-banners">
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
        {st.status === 'locked' && st.version > 0 && <Banner tone="neutral">Locked until {prevTitle ?? 'the previous step'} is approved again. Showing the last version, read-only.</Banner>}
      </div>

      {first && sub === 'transcript' && (
        <div className="stepview-pad">
          <TranscriptStep project={project} locked={st.status === 'approved' || st.status === 'running'} onSaved={(t) => (setTranscript(t), onChange())} onNext={() => setSub(st.version ? 'draft' : 'context')} />
        </div>
      )}

      {first && sub === 'context' && (
        <div className="stepview-pad">
          <div className="intro">
            <h3>Add context?</h3>
            <p>Optional. Pick what the agents should read besides the meeting. You can change this any time from Sources.</p>
          </div>
          <SourcesEditor project={project} transcript={transcript} onChange={onChange} />
          <div className="row end step-foot">
            <Button variant="ghost" onClick={() => setSub('draft')}>
              Skip
            </Button>
            <Button variant="primary" onClick={() => setSub('draft')}>
              Continue
            </Button>
          </div>
        </div>
      )}

      {sub === 'draft' && (
        <>
          {st.status === 'locked' && st.version === 0 && (
            <div className="startcard locked">
              <Dither seed={`${project.id}-${meta.id}`} cols={204} rows={30} density={0.55} className="startcard-art" />
              <div className="startcard-text">
                <span className="startcard-icon">
                  <Lock aria-hidden="true" />
                </span>
                <h3>Not yet</h3>
                <p>This step opens once {prevTitle ?? 'the previous step'} is approved.</p>
              </div>
            </div>
          )}

          {(st.status === 'ready' || (st.status === 'error' && st.version === 0)) && !clarify && (
            <div className="startcard">
              <Dither seed={`${project.id}-${meta.id}`} cols={204} rows={30} density={0.75} className="startcard-art" />
              <div className="startcard-text">
                <h3>{st.status === 'error' ? 'That didn’t work' : (START[meta.id] ?? `Start ${meta.title}`)}</h3>
                <p>{st.status === 'error' ? (st.error ?? 'The agent failed.') : `${agent?.name ?? 'An agent'} drafts it from ${first ? 'the meeting and your sources' : 'what you’ve approved and your sources'}. You review it next.`}</p>
                <div className="start-row">
                  <Button variant="primary" icon={st.status === 'error' ? RotateCcw : Sparkles} loading={starting} onClick={start}>
                    {st.status === 'error' ? 'Try again' : (START[meta.id] ?? 'Start')}
                  </Button>
                  <span className="muted small mono">{estimate(budget?.perRun, meta.id)}</span>
                </div>
              </div>
            </div>
          )}

          {clarify && st.status !== 'running' && (
            <ClarifyCard
              stage={meta.title}
              questions={clarify}
              onSubmit={async (answers) => {
                await api.answerClarify(project.id, meta.id, answers)
                setClarify(null)
                await run()
              }}
            />
          )}

          {st.status === 'running' && <Working stage={meta.id} agent={agent?.name} message={progress?.message} startedAt={progress?.startedAt} chars={progress?.chars} onCancel={() => act(() => api.cancelStage(project.id, meta.id))} />}

          {artifact && ctx && (
            <div key={`${meta.id}-${artifact.version}`} className={`stepview-body ${st.status === 'running' ? 'dim' : ''}`}>
              <Phase.Provider value={{ ...ctx, editable: ctx.editable && st.status !== 'running' }}>
                {isScreens && (st.status === 'review' || st.status === 'approved') && latest && (
                  <div id="share">
                    <SignOff project={project} stage={meta.id} version={artifact.version} server={server} onChange={onChange} />
                  </div>
                )}
                {meta.id === 'brief' && <Brief answers={artifact.answers ?? {}} answerSources={artifact.answerSources ?? {}} projectName={project.name} onSources={onSources} onFill={fillAnswers} onAnswers={async (a) => act(async () => setArtifact(await api.saveAnswers(project.id, a)))} />}
                {meta.id === 'understand' && <Understand />}
                {meta.id === 'align' && <Align answers={artifact.answers ?? {}} answerSources={artifact.answerSources ?? {}} projectName={project.name} onSources={onSources} onFill={fillAnswers} onAnswers={async (a) => act(async () => setArtifact(await api.saveAnswers(project.id, a)))} />}
                {meta.id === 'explore' && (
                  <Concepts
                    onChoose={async (cid, why) => {
                      setArtifact(await api.chooseConcept(project.id, cid, why))
                      onChange()
                    }}
                    onMore={async (direction) => {
                      await withBudget((force) => api.exploreMore(project.id, direction, { force }))
                      onChange()
                    }}
                  />
                )}
                {meta.id === 'shape' && <Shape />}
                {isScreens && artifact.screens && (
                  <div id="screens-view">
                    <ScreenViewer
                      screens={artifact.screens}
                      version={artifact.version}
                      previous={previous?.screens ? { version: previous.version, screens: previous.screens } : undefined}
                      comments={mine}
                      onComment={ctx.comment}
                      onRemoveComment={ctx.removeComment}
                      onOpen={latest ? setStudio : undefined}
                    />
                  </div>
                )}
              </Phase.Provider>
            </div>
          )}
        </>
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

      {sub === 'draft' && st.status === 'review' && latest && (
        <footer className={`gate ${gate !== 'idle' ? 'open' : ''}`}>
          {gate === 'idle' && (
            <div className="gate-row">
              <span className="gate-q">{chosenMissing ? 'Choose a concept to continue' : meta.gate}</span>
              <Button variant="secondary" icon={pending.length ? Send : undefined} onClick={() => setGate('changes')}>
                {pending.length ? `Send ${pending.length} comment${pending.length > 1 ? 's' : ''}` : 'Request changes'}
              </Button>
              <Button variant="primary" icon={Check} disabled={chosenMissing} onClick={() => setGate('approve')}>
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
                <span className="hint">{estimate(budget?.perRun, meta.id)}</span>
                <Button variant="ghost" onClick={() => setGate('idle')}>
                  Cancel
                </Button>
                <Button variant="primary" icon={Send} disabled={!text.trim() && !pending.length} onClick={() => act(() => withBudget((force) => api.requestChanges(project.id, meta.id, text, { force })))}>
                  Send to agent
                </Button>
              </div>
            </div>
          )}
          {gate === 'approve' && (
            <div className="gate-panel">
              <strong>Approve {meta.title}?</strong>
              {pending.length > 0 && <p className="warn-text small">{pending.length} unsent comment{pending.length > 1 ? 's' : ''} will stay unsent.</p>}
              <input className="input" autoFocus placeholder="Why? (optional, goes in the decision log)" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && act(() => api.approveStage(project.id, meta.id, text))} />
              <div className="row end">
                <Button variant="ghost" onClick={() => setGate('idle')}>
                  Cancel
                </Button>
                <Button variant="primary" icon={Check} onClick={() => act(() => api.approveStage(project.id, meta.id, text))}>
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

/** Shown only when the readiness check found something essential missing. Up to three questions. */
function ClarifyCard({ stage, questions, onSubmit }: { stage: string; questions: Readiness['questions']; onSubmit: (a: { question: string; answer: string }[]) => Promise<void> }) {
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<'skip' | 'go' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const send = async (skip: boolean) => {
    setBusy(skip ? 'skip' : 'go')
    setError(null)
    try {
      await onSubmit(questions.map((q) => ({ question: q.question, answer: skip ? '' : (answers[q.id] ?? '') })))
    } catch (e) {
      setError(cleanError(e))
    } finally {
      setBusy(null)
    }
  }
  return (
    <div className="clarify">
      <div className="clarify-head">
        <strong>
          {questions.length === 1 ? 'One thing' : `${questions.length} things`} to check before {stage}
        </strong>
        <span className="muted small">Not in the meeting or your sources, and it changes the design.</span>
      </div>
      {questions.map((q) => (
        <label key={q.id} className="clarify-q">
          <span className="clarify-text">{q.question}</span>
          <span className="muted small">{q.why}</span>
          <textarea className="input" rows={2} value={answers[q.id] ?? ''} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} />
        </label>
      ))}
      <div className="row end">
        {error && <span className="danger-text small">{error}</span>}
        <Button variant="ghost" loading={busy === 'skip'} disabled={!!busy} onClick={() => send(true)}>
          Skip, let it assume
        </Button>
        <Button variant="primary" loading={busy === 'go'} disabled={!!busy || !Object.values(answers).some((a) => a.trim())} onClick={() => send(false)}>
          Answer and continue
        </Button>
      </div>
    </div>
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
