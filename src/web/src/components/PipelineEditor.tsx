import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react'
import { IconButton } from '../kit/Button'
import { useMemo, useState } from 'react'
import { pipelineWarnings } from '../../../shared/pipelineRules'
import { PIPELINE_PRESETS, STAGE_IDS, type AgentInfo, type StageId, type StageMeta } from '../../../shared/types'

interface Props {
  value: StageId[]
  onChange: (next: StageId[]) => void
  stages: StageMeta[]
  agents: AgentInfo[]
  /** Number of leading phases that already ran and can't change. */
  fixed?: number
}

/** Pick a preset; customise (toggle, reorder) only if you want to. */
export function PipelineEditor({ value, onChange, stages, agents, fixed = 0 }: Props) {
  const preset = PIPELINE_PRESETS.find((p) => p.stages.join() === value.join())
  const [custom, setCustom] = useState(!preset)
  const title = (s: StageId) => stages.find((x) => x.id === s)?.title ?? s
  const skipped = STAGE_IDS.filter((s) => !value.includes(s))
  const warnings = useMemo(() => {
    const titles = Object.fromEntries(STAGE_IDS.map((s) => [s, title(s)])) as Record<StageId, string>
    const inputs = Object.fromEntries(agents.map((a) => [a.stage, a.inputs])) as Partial<Record<StageId, StageId[]>>
    return pipelineWarnings(value, inputs, titles)
  }, [value, agents, stages])
  const move = (i: number, d: -1 | 1) => {
    const j = i + d
    if (j < fixed || j >= value.length) return
    const next = [...value]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }

  return (
    <div className="pipe">
      <div className="pipe-presets" role="radiogroup" aria-label="Process">
        {PIPELINE_PRESETS.map((p) => {
          const usable = p.stages.slice(0, fixed).join() === value.slice(0, fixed).join()
          return (
            <button key={p.id} role="radio" aria-checked={preset?.id === p.id} className={`preset ${preset?.id === p.id ? 'on' : ''}`} disabled={!usable} onClick={() => onChange(p.stages)}>
              <b>{p.name}</b>
              <span className="preset-steps">{p.stages.map(title).join(' → ')}</span>
            </button>
          )
        })}
      </div>
      {!custom ? (
        <button className="link" onClick={() => setCustom(true)}>
          Customize phases
        </button>
      ) : (
        <>
          <ol className="pipe-list">
            {value.map((s, i) => (
              <li key={s} className={i < fixed ? 'fixed' : ''}>
                <span className="pipe-num">{i + 1}</span>
                <span className="pipe-name">{title(s)}</span>
                {i < fixed ? (
                  <span className="muted small">already ran</span>
                ) : (
                  <span className="pipe-actions">
                    <IconButton icon={ArrowUp} size="sm" label="Move up" disabled={i <= fixed} onClick={() => move(i, -1)} />
                    <IconButton icon={ArrowDown} size="sm" label="Move down" disabled={i === value.length - 1} onClick={() => move(i, 1)} />
                    <IconButton icon={X} size="sm" label="Skip" disabled={value.length === 1} onClick={() => onChange(value.filter((x) => x !== s))} />
                  </span>
                )}
              </li>
            ))}
          </ol>
          {skipped.length > 0 && (
            <div className="pipe-skipped">
              <span className="muted small">Add back:</span>
              {skipped.map((s) => (
                <button key={s} className="chip" onClick={() => onChange([...value, s])}>
                  <Plus aria-hidden="true" /> {title(s)}
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {warnings.length > 0 && (
        <ul className="pipe-warn">
          {warnings.map((w, i) => (
            <li key={i}>{w.message}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
