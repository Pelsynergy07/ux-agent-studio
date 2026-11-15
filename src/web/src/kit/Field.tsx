// Form fields: label above, hint below, one focus style.
import { Check, ChevronDown } from 'lucide-react'
import { useEffect, useId, useRef, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'

function Wrap({ id, label, hint, children }: { id: string; label?: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="field">
      {label && (
        <label className="field-label" htmlFor={id}>
          {label}
        </label>
      )}
      {children}
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  )
}

export function Input({ label, hint, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode; hint?: ReactNode }) {
  const id = useId()
  return (
    <Wrap id={id} label={label} hint={hint}>
      <input id={id} className="input" {...rest} />
    </Wrap>
  )
}

/** A textarea that grows with its content (up to maxRows). */
export function Textarea({ label, hint, minRows = 3, maxRows = 16, mono, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: ReactNode; hint?: ReactNode; minRows?: number; maxRows?: number; mono?: boolean }) {
  const id = useId()
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const line = parseFloat(getComputedStyle(el).lineHeight) || 20
    el.style.height = 'auto'
    el.style.height = `${Math.min(Math.max(el.scrollHeight, line * minRows + 16), line * maxRows + 16)}px`
  }, [rest.value, minRows, maxRows])
  return (
    <Wrap id={id} label={label} hint={hint}>
      <textarea id={id} ref={ref} className={`input textarea ${mono ? 'mono' : ''}`} rows={minRows} {...rest} />
    </Wrap>
  )
}

export function Select({ label, hint, options, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label?: ReactNode; hint?: ReactNode; options: { value: string; label: string; disabled?: boolean }[] }) {
  const id = useId()
  return (
    <Wrap id={id} label={label} hint={hint}>
      <span className="select">
        <select id={id} className="input" {...rest}>
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown aria-hidden="true" />
      </span>
    </Wrap>
  )
}

export function Checkbox({ label, checked, onChange }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="check-box" aria-hidden="true">
        <Check />
      </span>
      <span>{label}</span>
    </label>
  )
}

export function Switch({ label, checked, onChange }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="switch">
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch-track" aria-hidden="true">
        <span className="switch-thumb" />
      </span>
      <span>{label}</span>
    </label>
  )
}

/** Tags as removable chips plus a field to add more (Enter or comma). */
export function TagInput({ value, onChange, suggestions = [], placeholder = 'Add tag' }: { value: string[]; onChange: (tags: string[]) => void; suggestions?: string[]; placeholder?: string }) {
  const [draft, setDraft] = useState('')
  const add = (t: string) => {
    const tag = t.trim().replace(/,$/, '')
    if (tag && !value.includes(tag)) onChange([...value, tag])
    setDraft('')
  }
  const listId = useId()
  return (
    <span className="taginput">
      {value.map((t) => (
        <span key={t} className="tagchip">
          {t}
          <button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter((x) => x !== t))}>
            ×
          </button>
        </span>
      ))}
      <input
        list={listId}
        value={draft}
        placeholder={value.length ? '' : placeholder}
        onChange={(e) => (e.target.value.endsWith(',') ? add(e.target.value) : setDraft(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.preventDefault(), add(draft))
          if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1))
        }}
        onBlur={() => draft.trim() && add(draft)}
      />
      <datalist id={listId}>
        {suggestions.filter((s) => !value.includes(s)).map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </span>
  )
}
