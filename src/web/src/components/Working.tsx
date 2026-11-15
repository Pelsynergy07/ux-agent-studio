// What you see while an agent works: a slow dithered field and what it's doing, in plain words.
import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '../kit/Button'
import { Dither } from '../kit/Dither'
import { duration } from '../ui'

const LINES: Record<string, string[]> = {
  brief: ['Reading the meeting', 'Pulling out decisions', 'Checking your sources for answers', 'Finding who to talk to', 'Drafting the core flows', 'Setting measurable KPIs'],
  understand: ['Reading the meeting', 'Pulling out decisions', 'Writing the brief'],
  align: ['Mapping stakeholders', 'Answering what it can', 'Defining success'],
  explore: ['Reading the brief', 'Looking for different angles', 'Sketching three directions', 'Weighing strengths and risks', 'Checking effects on other apps'],
  shape: ['Laying out the flows', 'Walking the happy path', 'Testing edge cases', 'Mapping impact on other teams', 'Listing the screens'],
  lofi: ['Picking design-system components', 'Building the screens', 'Adding realistic sample data', 'Linking screens into a prototype'],
  hifi: ['Applying the full theme', 'Polishing the screens'],
  casestudy: ['Reading the decision log', 'Writing the story'],
}

export function Working({ stage, agent, message, startedAt, chars, onCancel }: { stage: string; agent?: string; message?: string; startedAt?: number; chars?: number; onCancel?: () => void }) {
  const lines = LINES[stage] ?? ['Working']
  const [i, setI] = useState(0)
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const a = setInterval(() => setI((x) => (x + 1) % lines.length), 2600)
    const b = setInterval(() => setNow(Date.now()), 1000)
    return () => (clearInterval(a), clearInterval(b))
  }, [lines.length])
  const secs = Math.max(0, Math.round((now - (startedAt ?? now)) / 1000))
  // While text streams in, the agent is writing; before that, show what it's working through.
  const line = chars ? 'Writing it up' : lines[i]
  return (
    <div className="working" role="status" aria-live="polite">
      <Dither seed={stage} cols={120} rows={28} animate className="working-art" />
      <div className="working-text">
        <span key={line} className="working-line">
          {line}
          <span className="working-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </span>
        <span className="working-meta">
          {agent ?? 'Agent'} · {secs < 60 ? `${secs}s` : duration(secs * 1000)}
          {chars ? ` · ${chars.toLocaleString()} characters` : ''}
          {message && !/started|working/i.test(message) ? ` · ${message}` : ''}
        </span>
      </div>
      {onCancel && (
        <Button variant="ghost" size="sm" icon={X} onClick={onCancel}>
          Cancel
        </Button>
      )}
    </div>
  )
}
