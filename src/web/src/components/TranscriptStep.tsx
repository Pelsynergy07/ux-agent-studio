// Brief › Transcript: the meeting is still the starting point. Paste it, drop a file, or use the sample.
import { ArrowRight, FileText, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cleanTranscript } from '../../../shared/transcript'
import type { Project } from '../../../shared/types'
import { api } from '../api'
import { Button } from '../kit/Button'
import { SAMPLE_TRANSCRIPT } from '../sample'
import { cleanError } from '../ui'

export function TranscriptStep({ project, locked, onSaved, onNext }: { project: Project; locked: boolean; onSaved: (text: string) => void; onNext: () => void }) {
  const [text, setText] = useState<string | null>(null)
  const [saved, setSaved] = useState('')
  const [drag, setDrag] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const file = useRef<HTMLInputElement>(null)
  useEffect(() => {
    api.getTranscript(project.id).then((t) => (setText(t), setSaved(t)))
  }, [project.id])
  if (text === null) return null
  const words = text.trim() ? text.trim().split(/\s+/).length : 0

  const save = async (value = text) => {
    if (value.trim() === saved.trim()) return true
    try {
      await api.setTranscript(project.id, value)
      setSaved(value)
      onSaved(value)
      return true
    } catch (e) {
      setError(cleanError(e))
      return false
    }
  }

  return (
    <div className="transcript-step">
      <div
        className={`composer big ${drag ? 'drag' : ''}`}
        onDragOver={(e) => (e.preventDefault(), setDrag(true))}
        onDragLeave={() => setDrag(false)}
        onDrop={async (e) => {
          e.preventDefault()
          setDrag(false)
          const f = e.dataTransfer.files[0]
          if (f) setText(cleanTranscript(await f.text()))
        }}
      >
        <textarea
          className="composer-input"
          rows={14}
          readOnly={locked}
          placeholder="Paste the meeting transcript (Teams, Zoom…), or drop a .vtt or .txt file here."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => void save()}
        />
        <div className="composer-foot">
          {!locked && (
            <>
              <input ref={file} type="file" accept=".vtt,.txt,.md,.srt" hidden onChange={async (e) => e.target.files?.[0] && setText(cleanTranscript(await e.target.files[0].text()))} />
              <Button variant="ghost" size="sm" icon={Upload} onClick={() => file.current?.click()}>
                Choose file
              </Button>
              {!words && (
                <Button variant="ghost" size="sm" icon={FileText} onClick={() => setText(SAMPLE_TRANSCRIPT)}>
                  Use sample meeting
                </Button>
              )}
            </>
          )}
          <span className="hint">{words ? `${words.toLocaleString()} words` : ''}</span>
          {error && <span className="danger-text small">{error}</span>}
          <Button variant="primary" size="sm" iconRight={ArrowRight} disabled={!words} onClick={async () => (await save()) && onNext()}>
            Continue
          </Button>
        </div>
      </div>
      {locked && <p className="muted small">The brief is approved, so the transcript is read-only. Reopen the brief to change it.</p>}
    </div>
  )
}
