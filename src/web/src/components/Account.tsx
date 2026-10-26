// The designer's side of the app: Copilot connection, help, theme and their own usage stats.
import { BarChart3, ChevronDown, CircleHelp, ExternalLink, KeyRound, Monitor, Moon, Settings2, Sun, User } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { AuthInfo, UsageStats } from '../../../shared/types'
import { api } from '../api'
import { CountUp } from '../delight'
import { Button, IconButton } from '../kit/Button'
import { Badge, Banner } from '../kit/Feedback'
import { Input, Switch } from '../kit/Field'
import type { ThemePref } from '../theme'
import { cleanError, Modal, Popover } from '../ui'

const TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new'

const initials = (login?: string) => (login ? login.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() : '')

/** Connect Copilot with a token. Used in the tutorial and in the profile menu. */
export function TokenForm({ auth, onChange, compact }: { auth: AuthInfo | null; onChange: (a: AuthInfo) => void; compact?: boolean }) {
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [how, setHow] = useState(!compact)
  const connected = auth?.ok
  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      onChange(await api.saveToken(token))
      setToken('')
    } catch (e) {
      setError(cleanError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="token-form">
      {connected && (
        <div className="token-status">
          <span className="avatar lg">{initials(auth.login) || <User aria-hidden="true" />}</span>
          <div>
            <strong>Connected{auth.login ? ` as ${auth.login}` : ''}</strong>
            <span className="muted small">{auth.source === 'token' ? `Using your token ${auth.tokenHint ?? ''}` : "Using this computer's GitHub sign-in"}</span>
          </div>
          <Badge tone="success" dot>
            Ready
          </Badge>
        </div>
      )}
      <form
        className="token-row"
        onSubmit={(e) => {
          e.preventDefault()
          if (token.trim()) void save()
        }}
      >
        <Input
          label={connected ? 'Use a different token' : 'Your GitHub Copilot token'}
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="github_pat_…"
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
        <Button type="submit" variant="primary" icon={KeyRound} loading={busy} disabled={!token.trim()}>
          {busy ? 'Checking' : 'Connect'}
        </Button>
      </form>
      {error && <Banner tone="danger">{error}</Banner>}
      <p className="muted small">The token stays on this computer. Your Copilot usage is counted against your own GitHub account, like any Copilot tool.</p>
      <button type="button" className={`more ${how ? 'is-open' : ''}`} aria-expanded={how} onClick={() => setHow((h) => !h)}>
        <ChevronDown aria-hidden="true" />
        <span>How do I get a token?</span>
      </button>
      {how && (
        <ol className="token-steps">
          <li>
            Sign in to GitHub with the account that has your Siemens Copilot licence, then open{' '}
            <a className="link" href={TOKEN_URL} target="_blank" rel="noreferrer">
              New token <ExternalLink aria-hidden="true" />
            </a>
            .
          </li>
          <li>Name it “UX Agent Studio” and choose when it expires.</li>
          <li>
            Under <b>Permissions</b>, set <b>Copilot Requests</b> to <b>Read-only</b>. Nothing else is needed.
          </li>
          <li>Select Generate token, copy it, and paste it above.</li>
          <li className="muted">If your team gave you a token, paste that one instead.</li>
        </ol>
      )}
      {auth?.source === 'token' && (
        <button type="button" className="link danger-text" onClick={async () => onChange(await api.clearToken())}>
          Remove my token from this computer
        </button>
      )}
    </div>
  )
}

/** Help and profile, top right of every page. */
export function AccountBar({ auth, theme, onTheme, onTutorial, onSettings, onToken, onStats }: { auth: AuthInfo | null; theme: ThemePref; onTheme: (t: ThemePref, from: { x: number; y: number }) => void; onTutorial: () => void; onSettings: () => void; onToken: () => void; onStats: () => void }) {
  const state = auth === null ? 'checking' : auth.ok ? 'ok' : 'off'
  return (
    <div className="account-bar">
      <IconButton icon={CircleHelp} label="Tutorial" onClick={onTutorial} />
      <Popover
        align="right"
        trigger={(toggle, isOpen) => (
          <button className={`profile-btn conn-${state}`} aria-label="Profile and settings" aria-expanded={isOpen} data-tip={isOpen ? undefined : state === 'off' ? 'Copilot not connected' : 'Profile'} data-tip-side="left" onClick={toggle}>
            {initials(auth?.login) || <User aria-hidden="true" />}
            <i aria-hidden="true" />
          </button>
        )}
      >
        {(close) => (
          <div className="profile">
            <div className="profile-head">
              <span className="avatar lg">{initials(auth?.login) || <User aria-hidden="true" />}</span>
              <div>
                <strong>{auth?.login ?? 'Not signed in'}</strong>
                <span className={`conn ${auth?.ok ? 'ok' : auth ? 'bad' : ''}`}>
                  <i aria-hidden="true" />
                  {auth === null ? 'Checking Copilot…' : auth.ok ? 'Copilot connected' : 'Copilot not connected'}
                </span>
              </div>
            </div>
            <div className="profile-theme">
              <span className="muted small">Appearance</span>
              <ThemeSwitch value={theme} onChange={onTheme} />
            </div>
            <div className="menu">
              <button onClick={() => (close(), onToken())}>
                <KeyRound aria-hidden="true" />
                <span>Copilot token</span>
                {auth && !auth.ok && <span className="menu-hint warn-text">Set up</span>}
              </button>
              <button onClick={() => (close(), onStats())}>
                <BarChart3 aria-hidden="true" />
                <span>My usage stats</span>
              </button>
              <button onClick={() => (close(), onTutorial())}>
                <CircleHelp aria-hidden="true" />
                <span>Tutorial</span>
              </button>
              <hr />
              <button onClick={() => (close(), onSettings())}>
                <Settings2 aria-hidden="true" />
                <span>Settings</span>
              </button>
            </div>
          </div>
        )}
      </Popover>
    </div>
  )
}

function ThemeSwitch({ value, onChange }: { value: ThemePref; onChange: (t: ThemePref, from: { x: number; y: number }) => void }) {
  const opts: { v: ThemePref; label: string; icon: typeof Sun }[] = [
    { v: 'light', label: 'Light', icon: Sun },
    { v: 'dark', label: 'Dark', icon: Moon },
    { v: 'system', label: 'Auto', icon: Monitor },
  ]
  return (
    <div className="seg seg-sm" role="radiogroup" aria-label="Appearance">
      {opts.map(({ v, label, icon: Icon }) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={v === value}
          className={v === value ? 'on' : ''}
          onClick={(e) => {
            const b = e.currentTarget.getBoundingClientRect()
            onChange(v, { x: b.left + b.width / 2, y: b.top + b.height / 2 })
          }}
        >
          <Icon aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  )
}

export function TokenDialog({ auth, onChange, onClose }: { auth: AuthInfo | null; onChange: (a: AuthInfo) => void; onClose: () => void }) {
  return (
    <Modal title="Copilot token" onClose={onClose}>
      <TokenForm auth={auth} onChange={onChange} compact={!!auth?.ok} />
    </Modal>
  )
}

/** The designer's own numbers, and the switch for sharing them anonymously. */
export function UsageDialog({ onClose }: { onClose: () => void }) {
  const [stats, setStats] = useState<UsageStats | null>(null)
  const [raw, setRaw] = useState(false)
  useEffect(() => {
    api.getUsageStats().then(setStats)
  }, [])
  if (!stats) return null
  const m = stats.metrics
  const drafts = Object.values(m.drafts).reduce((a, b) => a + b, 0)
  const tiles: { label: string; value: number; suffix?: string }[] = [
    { label: 'Projects', value: m.projects },
    { label: 'Lo-fis signed off', value: m.signOffs },
    { label: 'Agent drafts', value: drafts },
    { label: 'Revisions asked for', value: m.changeRequests + m.studioEdits },
    { label: 'Hand edits', value: m.documentEdits + m.screenTextEdits },
    { label: 'Comments', value: m.comments.designer + m.comments.stakeholder },
  ]
  const setSharing = async (on: boolean) => {
    await api.saveSettings({ telemetry: on })
    setStats({ ...stats, sharing: { ...stats.sharing, enabled: on } })
  }

  return (
    <Modal title="My usage stats" onClose={onClose} wide>
      <div className="stats">
        {m.medianHoursToSignOff !== null && (
          <div className="stats-hero">
            <span className="eyebrow">Median time from kickoff to sign-off</span>
            <b>{m.medianHoursToSignOff < 48 ? `${m.medianHoursToSignOff} h` : `${(m.medianHoursToSignOff / 24).toFixed(1)} days`}</b>
          </div>
        )}
        <div className="stats-grid">
          {tiles.map((t) => (
            <div key={t.label} className="stat">
              <b>
                <CountUp value={t.value} />
              </b>
              <span>{t.label}</span>
            </div>
          ))}
        </div>
        <p className="muted small">
          Agents worked {m.agentMinutes} min across {m.agentRuns} runs · {Math.round((m.inputTokens + m.outputTokens) / 1000).toLocaleString()}k tokens · {m.transcriptWords.toLocaleString()} transcript words
        </p>

        <div className="stats-share">
          {stats.sharing.available ? (
            <Switch label="Share these counts anonymously with the team that maintains this app" checked={stats.sharing.enabled} onChange={setSharing} />
          ) : (
            <p className="muted small">Anonymous sharing isn't set up for this copy of the app, so these numbers stay on this computer.</p>
          )}
          {stats.sharing.available && <p className="muted small">Only numbers are shared: never project names, transcripts, answers, comments or screens.</p>}
          <button type="button" className="link" onClick={() => setRaw((r) => !r)}>
            {raw ? 'Hide' : stats.sharing.available ? 'See exactly what is sent' : 'See what would be sent'}
          </button>
          {raw && <pre className="code">{JSON.stringify(stats.preview, null, 2)}</pre>}
        </div>
      </div>
    </Modal>
  )
}
