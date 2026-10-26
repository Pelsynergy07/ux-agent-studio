// What a stakeholder sees: the shared screens, comment-on-anything, and approve or ask for changes.
// No access to the designer's app, the transcript or other projects.
import { Check, RotateCcw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { ReviewPayload } from '../../../shared/types'
import { reviewApi } from '../api'
import { ScreenViewer } from '../components/ScreenViewer'
import { Button } from '../kit/Button'
import { Banner } from '../kit/Feedback'
import { Input, Textarea } from '../kit/Field'
import { cleanError } from '../ui'

const NAME_KEY = 'uxs-reviewer-name'
const readName = () => {
  try {
    return localStorage.getItem(NAME_KEY) ?? ''
  } catch {
    return ''
  }
}

export function ReviewPage({ token }: { token: string }) {
  const rapi = reviewApi(token)
  const [data, setData] = useState<ReviewPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState(readName)
  const [note, setNote] = useState('')
  const [done, setDone] = useState<string | null>(null)
  const load = useCallback(() => rapi.get().then(setData).catch((e) => setError(cleanError(e))), [token])
  useEffect(() => {
    void load()
  }, [load])
  const saveName = (n: string) => {
    setName(n)
    try {
      localStorage.setItem(NAME_KEY, n)
    } catch {
      /* private mode: fine */
    }
  }

  if (!data)
    return (
      <div className="review-page">
        {error ? (
          <Banner tone="danger">{error}</Banner>
        ) : (
          <p className="muted">Loading…</p>
        )}
      </div>
    )

  const verdict = async (v: 'approved' | 'changes') => {
    try {
      await rapi.verdict({ name, verdict: v, comment: note })
      setDone(v === 'approved' ? 'Thanks. Your approval is recorded.' : 'Thanks. Your feedback went to the designer.')
      setNote('')
      setError(null)
      void load()
    } catch (e) {
      setError(cleanError(e))
    }
  }
  const nameField = <Input label="Your name" value={name} onChange={(e) => saveName(e.target.value)} />

  return (
    <div className="review-page">
      <header className="review-head">
        <span className="eyebrow">
          Design review · {data.stage === 'lofi' ? 'Lo-fi' : 'Hi-fi'} v{data.version}
        </span>
        <h1>{data.projectName}</h1>
        <p className="muted">{data.designer} would like your feedback. Use Comment to point at anything on a screen.</p>
      </header>

      {error && (
        <Banner tone="danger" onClose={() => setError(null)}>
          {error}
        </Banner>
      )}

      <ScreenViewer
        screens={data.screens}
        version={data.version}
        canSwitchFidelity={data.stage === 'lofi'}
        comments={data.comments}
        query={`&token=${token}`}
        nameField={nameField}
        onComment={async (c) => {
          try {
            await rapi.comment({ ...c, name })
            setError(null)
            void load()
          } catch (e) {
            setError(cleanError(e))
          }
        }}
      />

      <section className="verdict">
        <h2>Your decision</h2>
        {done ? (
          <Banner tone="success">{done}</Banner>
        ) : (
          <>
            {nameField}
            <Textarea label="Anything to add?" hint="Optional" minRows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="row">
              <Button variant="primary" icon={Check} disabled={!name.trim()} onClick={() => verdict('approved')}>
                Approve
              </Button>
              <Button variant="secondary" icon={RotateCcw} disabled={!name.trim()} onClick={() => verdict('changes')}>
                Ask for changes
              </Button>
            </div>
          </>
        )}
        {data.verdicts.length > 0 && (
          <ul className="verdicts">
            {data.verdicts.map((v, i) => (
              <li key={i} className={`v-${v.verdict}`}>
                {v.verdict === 'approved' ? <Check aria-hidden="true" /> : <RotateCcw aria-hidden="true" />}
                <b>{v.name}</b> {v.verdict === 'approved' ? 'approved' : 'asked for changes'}
                {v.comment ? `: “${v.comment}”` : ''}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
