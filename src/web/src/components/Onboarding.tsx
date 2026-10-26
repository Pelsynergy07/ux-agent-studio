// First-run tutorial, written for designers who have never used an agent tool.
// Opens by itself on first launch; the ? button in the top bar reopens it any time.
import { ArrowLeft, ArrowRight, BarChart3, Bot, Check, FileText, KeyRound, LayoutTemplate, Link2, ScrollText, MessageSquare, MonitorPlay, PenLine, Sparkles, Users, Workflow, X, type LucideIcon } from 'lucide-react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { AuthInfo } from '../../../shared/types'
import { api } from '../api'
import { Button, IconButton } from '../kit/Button'
import { Switch } from '../kit/Field'
import { TokenForm } from './Account'

interface Step {
  id: string
  icon: LucideIcon
  title: string
  body: ReactNode
  /** A tiny picture of the idea: a row of tiles, the highlighted one is what this step is about. */
  art?: { icon: LucideIcon; label: string }[]
  focus?: number
  extra?: ReactNode
}

export function Onboarding({ auth, onAuth, sharingAvailable, onClose, onNewProject }: { auth: AuthInfo | null; onAuth: (a: AuthInfo) => void; sharingAvailable: boolean; onClose: () => void; onNewProject: () => void }) {
  const [i, setI] = useState(0)
  const [sharing, setSharing] = useState(true)

  const steps: Step[] = [
    {
      id: 'welcome',
      icon: Sparkles,
      title: 'From meeting to a lo-fi your stakeholders sign off',
      body: 'Paste the transcript of a kickoff meeting. Specialist agents draft each step of the design work, and you approve every step before the next one starts. Nothing moves on without you.',
      art: [
        { icon: FileText, label: 'Transcript' },
        { icon: Bot, label: 'Agents draft' },
        { icon: Check, label: 'You approve' },
        { icon: LayoutTemplate, label: 'Lo-fi' },
      ],
    },
    {
      id: 'token',
      icon: KeyRound,
      title: 'Connect GitHub Copilot',
      body: 'The agents run on GitHub Copilot, using your own Copilot licence. Connect it once with a token and you are set.',
      extra: <TokenForm auth={auth} onChange={onAuth} compact={!!auth?.ok} />,
    },
    {
      id: 'phases',
      icon: Workflow,
      title: 'Four phases, one at a time',
      body: 'Understand turns the meeting into a brief. Align lists who to ask what, and success measures. Shape drafts the user flow. Lo-fi builds the screens from real Siemens iX components. The bar at the top of a project shows where you are.',
      art: [
        { icon: FileText, label: 'Understand' },
        { icon: Users, label: 'Align' },
        { icon: Workflow, label: 'Shape' },
        { icon: LayoutTemplate, label: 'Lo-fi' },
      ],
      focus: -1,
    },
    {
      id: 'steer',
      icon: MessageSquare,
      title: 'You steer every step',
      body: 'Read the draft, then Approve it or Request changes. Click any text to fix it yourself, or use the speech bubble next to an item to tell the agent exactly what to change.',
      art: [
        { icon: PenLine, label: 'Edit' },
        { icon: MessageSquare, label: 'Comment' },
        { icon: Check, label: 'Approve' },
      ],
      focus: 2,
    },
    {
      id: 'studio',
      icon: MonitorPlay,
      title: 'Refine and present the lo-fi',
      body: 'Open the studio to change one screen by describing it in plain words, edit labels directly, or present full screen in a meeting and collect comments as people talk.',
      art: [
        { icon: Sparkles, label: 'Describe' },
        { icon: PenLine, label: 'Edit text' },
        { icon: MonitorPlay, label: 'Present' },
      ],
      focus: 2,
    },
    {
      id: 'share',
      icon: Link2,
      title: 'Share for sign-off, keep the story',
      body: 'Share a link so stakeholders can comment and sign off. Every decision, piece of feedback and edit is saved in the Decision log, at the top right of each project: handy for case studies.',
      art: [
        { icon: Link2, label: 'Share' },
        { icon: Check, label: 'Sign-off' },
        { icon: ScrollText, label: 'Decision log' },
      ],
      focus: 1,
    },
    ...(sharingAvailable
      ? [
          {
            id: 'sharing',
            icon: BarChart3,
            title: 'Help improve the app',
            body: 'Share anonymous counts, like how many projects you created and how many revisions it took. Only numbers are sent: never names, transcripts, comments or screens. You can change this any time under your profile.',
            extra: <Switch label="Share anonymous usage counts" checked={sharing} onChange={setSharing} />,
          } satisfies Step,
        ]
      : []),
  ]
  const step = steps[i]
  const last = i === steps.length - 1

  const finish = useCallback(
    (then?: () => void) => {
      void api.saveSettings({ onboardedAt: new Date().toISOString(), ...(sharingAvailable ? { telemetry: sharing } : {}) })
      onClose()
      then?.()
    },
    [onClose, sharing, sharingAvailable],
  )

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea')) return
      if (e.key === 'ArrowRight' && !last) setI((x) => x + 1)
      else if (e.key === 'ArrowLeft' && i > 0) setI((x) => x - 1)
      else if (e.key === 'Escape') finish()
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [i, last, finish])

  return createPortal(
    <div className="scrim">
      <div className="modal onboarding" role="dialog" aria-modal="true" aria-labelledby="ob-title">
        <header className="ob-top">
          <span className="eyebrow">
            Getting started · {i + 1} of {steps.length}
          </span>
          <IconButton icon={X} label="Close tutorial" size="sm" onClick={() => finish()} />
        </header>

        <div className="ob-body" key={step.id}>
          {step.art ? (
            <div className="ob-art" aria-hidden="true">
              {step.art.map((a, n) => (
                <div key={a.label} className={`ob-tile ${step.focus === undefined || step.focus === -1 || step.focus === n ? 'on' : ''}`} style={{ animationDelay: `${n * 70}ms` }}>
                  <span>
                    <a.icon />
                  </span>
                  <small>{a.label}</small>
                </div>
              ))}
            </div>
          ) : (
            <div className="ob-icon" aria-hidden="true">
              <step.icon />
            </div>
          )}
          <h2 id="ob-title">{step.title}</h2>
          <p className="ob-text">{step.body}</p>
          {step.extra && <div className="ob-extra">{step.extra}</div>}
        </div>

        <footer className="ob-foot">
          <div className="ob-dots" role="tablist" aria-label="Tutorial steps">
            {steps.map((s, n) => (
              <button key={s.id} role="tab" aria-selected={n === i} aria-label={`Step ${n + 1}`} className={n === i ? 'on' : n < i ? 'done' : ''} onClick={() => setI(n)} />
            ))}
          </div>
          <div className="row">
            {i > 0 && <IconButton icon={ArrowLeft} label="Back" variant="secondary" onClick={() => setI(i - 1)} />}
            {last ? (
              <Button variant="primary" icon={Sparkles} onClick={() => finish(onNewProject)}>
                Create my first project
              </Button>
            ) : (
              <Button variant="primary" iconRight={ArrowRight} onClick={() => setI(i + 1)}>
                {step.id === 'token' && !auth?.ok ? 'Skip for now' : i === 0 ? 'Show me how' : 'Next'}
              </Button>
            )}
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
