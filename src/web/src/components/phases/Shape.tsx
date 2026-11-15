import {
  Accessibility,
  CircleDashed,
  CloudOff,
  Footprints,
  Gauge,
  Globe,
  Inbox,
  Layers,
  Lock,
  MonitorSmartphone,
  Network,
  OctagonAlert,
  Plus,
  Sparkle,
  Trash2,
  Undo2,
  Users,
  Workflow,
  ChevronDown,
  ChevronUp,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { IconButton } from '../../kit/Button'
import { Card, Pill, StatTile, TabCard } from '../../kit/Card'
import { FlowCanvas, mermaidToFlow, type Flow } from '../FlowCanvas'
import { CommentButton, EText, ListBody, usePhase } from '../editors'

type Area = { area: string; status: 'covered' | 'n/a' | 'gap'; cases: { case: string; handling: string }[] }
const STATUS = { covered: 'Covered', 'n/a': 'N/A', gap: 'Gap' } as const

/** Resolves an area name to its Lucide icon and semantic color */
function getAreaMeta(name: string): { icon: LucideIcon; color: string } {
  const n = name.toLowerCase().replace(/&/g, 'and').trim()
  if (n.includes('empty')) return { icon: Inbox, color: 'icon-info' }
  if (n.includes('error') || n.includes('failure')) return { icon: OctagonAlert, color: 'icon-danger' }
  if (n.includes('permission')) return { icon: Lock, color: 'icon-warn' }
  if (n.includes('offline') || n.includes('latency')) return { icon: CloudOff, color: 'icon-warn' }
  if (n.includes('scale') || n.includes('volume')) return { icon: Layers, color: 'icon-info' }
  if (n.includes('concurrency')) return { icon: Users, color: 'icon-purple' }
  if (n.includes('destructive') || n.includes('undo')) return { icon: Undo2, color: 'icon-danger' }
  if (n.includes('accessib')) return { icon: Accessibility, color: 'icon-accent' }
  if (n.includes('localis') || n.includes('localiz')) return { icon: Globe, color: 'icon-purple' }
  if (n.includes('first')) return { icon: Sparkle, color: 'icon-accent' }
  return { icon: CircleDashed, color: 'icon-accent' }
}

function parseSummaryPoints(text: string): { type: 'scope' | 'assumption' | 'point'; text: string }[] {
  if (!text) return []
  const parts = text
    .split(/(?:\r?\n)+|(?<=[.!?])\s+(?=[A-Z])|(?<=[.!?])\s*(?=Assumption:)/i)
    .map((s) => s.trim())
    .filter(Boolean)

  return parts.map((p) => {
    if (/^assumption[s]?:/i.test(p)) {
      return { type: 'assumption', text: p.replace(/^assumption[s]?:\s*/i, '') }
    }
    if (/^(flows? cover|scope|the \w+ flows? cover)/i.test(p)) {
      return { type: 'scope', text: p }
    }
    return { type: 'point', text: p }
  })
}

function FlowSummary({ summary }: { summary?: string }) {
  const [open, setOpen] = useState(true)
  const { editable } = usePhase()
  const [editing, setEditing] = useState(false)

  if (!summary?.trim()) return null
  const points = parseSummaryPoints(summary)

  return (
    <div className={`flow-summary-box ${open ? 'expanded' : 'collapsed'}`}>
      <div className="flow-summary-head" onClick={() => setOpen(!open)}>
        <div className="flow-summary-title">
          <Sparkles aria-hidden="true" className="flow-summary-icon" />
          <span>Flow scope & assumptions</span>
          <span className="flow-summary-count">{points.length} {points.length === 1 ? 'point' : 'points'}</span>
        </div>
        <div className="flow-summary-actions" onClick={(e) => e.stopPropagation()}>
          {editable && (
            <button
              type="button"
              className="flow-summary-btn"
              onClick={() => {
                if (!open) setOpen(true)
                setEditing(!editing)
              }}
            >
              {editing ? 'Done' : 'Edit notes'}
            </button>
          )}
          <button
            type="button"
            className="flow-summary-toggle"
            onClick={() => setOpen(!open)}
            aria-label={open ? 'Collapse flow notes' : 'Expand flow notes'}
          >
            {open ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="flow-summary-body">
          {editing ? (
            <EText path="summary" multiline />
          ) : (
            <ul className="flow-summary-bullets">
              {points.map((p, i) => (
                <li key={i} className={`flow-bullet-item ${p.type}`}>
                  {p.type === 'assumption' && (
                    <span className="flow-badge assumption">Assumption</span>
                  )}
                  {p.type === 'scope' && (
                    <span className="flow-badge scope">Scope</span>
                  )}
                  <span className="flow-bullet-text">{p.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

/** Flow: the board first, then 4 KPI tiles, then a balanced 2-column grid of screens, edge cases, impacts and KPIs. */
export function Shape() {
  const { data, editable, edit } = usePhase()
  const legacy = !data.flows?.length && data.mermaid ? mermaidToFlow(data.mermaid) : null
  const flows: Flow[] = data.flows?.length ? data.flows : legacy ? [legacy] : []
  const steps: { id: string; screen: string; userAction: string; systemResponse: string }[] = data.steps ?? []
  const areas: Area[] = data.edgeCoverage ?? []
  const gaps = areas.filter((a) => a.status === 'gap').length
  const impacts: { system: string; impact: string; owner: string }[] = data.impacts ?? []
  const screens: { id: string; name: string; purpose: string; keyComponents: string[] }[] = data.screens ?? []

  return (
    <div className="flow-page steplayout">
      <FlowSummary summary={data.summary} />

      <div id="canvas">{flows.length > 0 && <FlowCanvas flows={flows} screens={screens} />}</div>

      {areas.length > 0 && (
        <div className="stiles four-col">
          <StatTile icon={Workflow} label="Flows" value={flows.length} tone="accent" />
          <StatTile icon={MonitorSmartphone} label="Screens" value={screens.length} tone="info" />
          <StatTile icon={CircleDashed} label="Edge cases covered" value={`${areas.filter((a) => a.status === 'covered').length}/${areas.length}`} tone="ok" />
          <StatTile icon={OctagonAlert} label="Gaps" value={gaps} tone={gaps ? 'warn' : 'ok'} />
        </div>
      )}

      <hr className="phase-divider" />

      <div className="two-col-grid">
        {/* Left Row 1: Screens (or Screens + Happy Path tabbed if steps exist) */}
        {steps.length > 0 ? (
          <TabCard
            icon={MonitorSmartphone}
            iconClassName="icon-info"
            label="Architecture"
            tabs={[
              {
                id: 'screens',
                label: 'Screens',
                count: screens.length,
                tone: 'info',
                body: <ScreensList screens={screens} editable={editable} edit={edit} />,
              },
              {
                id: 'steps',
                label: 'Happy path',
                count: steps.length,
                tone: 'accent',
                body: <StepsList steps={steps} />,
              },
            ]}
          />
        ) : (
          <Card id="screens" icon={MonitorSmartphone} iconClassName="icon-info" label="Screens" count={screens.length} flush>
            <ScreensList screens={screens} editable={editable} edit={edit} />
          </Card>
        )}

        {/* Right Row 1: Edge cases */}
        {areas.length > 0 ? (
          <Card id="edges" icon={CircleDashed} iconClassName="icon-warn" label="Edge cases" count={areas.length} actions={gaps > 0 && <span className="muted small">Comment on a gap to have it designed</span>}>
            <ul className="areas">
              {areas.map((a, i) => {
                const { icon: Icon, color: colorClass } = getAreaMeta(a.area)
                return (
                  <li key={a.area} className={`area s-${a.status.replace('/', '')} item`}>
                    <div className="area-head">
                      <span className={`area-icon ${colorClass}`} aria-hidden="true">
                        <Icon />
                      </span>
                      <span className="area-name">{a.area}</span>
                      <span className="item-tools">
                        <CommentButton path={`edgeCoverage.${i}`} anchor={`Edge cases: ${a.area}`} />
                      </span>
                      {editable ? (
                        <select className={`status-select s-${a.status.replace('/', '')}`} value={a.status} onChange={(e) => edit(`edgeCoverage.${i}.status`, e.target.value)} aria-label={`Status of ${a.area}`}>
                          {Object.entries(STATUS).map(([v, l]) => (
                            <option key={v} value={v}>
                              {l}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Pill tone={a.status === 'covered' ? 'ok' : a.status === 'gap' ? 'warn' : 'neutral'}>{STATUS[a.status]}</Pill>
                      )}
                    </div>
                    {a.cases.length > 0 ? (
                      <ul className="area-cases">
                        {a.cases.map((c, j) => (
                          <li key={j}>
                            <span className="case-when">
                              <EText path={`edgeCoverage.${i}.cases.${j}.case`} />
                            </span>
                            <span className="case-then">
                              <EText path={`edgeCoverage.${i}.cases.${j}.handling`} />
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="area-empty">{a.status === 'gap' ? 'Not designed yet' : 'Doesn’t apply here'}</p>
                    )}
                  </li>
                )
              })}
            </ul>
          </Card>
        ) : (
          <LegacyEdgeCases edgeCases={data.edgeCases} />
        )}

        {/* Left Row 2: Systems & teams impacted */}
        <Card id="impacts" icon={Network} iconClassName="icon-purple" label="Impact on systems and teams" count={impacts.length} flush>
          <ul className="rows">
            {impacts.map((x, i) => (
              <li key={i} className="item">
                <span className="row-main">
                  <span className="row-title">
                    <EText path={`impacts.${i}.system`} />
                  </span>
                  <span className="row-sub">
                    <EText path={`impacts.${i}.impact`} multiline />
                  </span>
                </span>
                <Pill tone="purple">
                  <EText path={`impacts.${i}.owner`} />
                </Pill>
                <span className="item-tools">
                  <CommentButton path={`impacts.${i}`} anchor={`Impact on ${x.system}`} />
                  {editable && (
                    <IconButton
                      icon={Trash2}
                      label="Remove"
                      size="sm"
                      onClick={() =>
                        edit(
                          'impacts',
                          impacts.filter((_, j) => j !== i),
                        )
                      }
                    />
                  )}
                </span>
              </li>
            ))}
          </ul>
          {editable && (
            <div className="card-foot">
              <button className="add" onClick={() => edit('impacts', [...impacts, { system: 'System or team', impact: 'What changes for them', owner: 'unknown' }])}>
                <Plus aria-hidden="true" /> Add system
              </button>
            </div>
          )}
        </Card>

        {/* Right Row 2: Where KPIs are measured */}
        <Card icon={Gauge} iconClassName="icon-accent" label="Where KPIs are measured" count={data.kpiHooks?.length ?? 0}>
          {data.kpiHooks?.length > 0 ? (
            <ListBody path="kpiHooks" items={data.kpiHooks} title="KPI hook" />
          ) : (
            <p className="muted small" style={{ padding: '12px' }}>
              KPI measurement points not specified yet.
            </p>
          )}
        </Card>
      </div>
    </div>
  )
}

function ScreensList({
  screens,
  editable,
  edit,
}: {
  screens: { id: string; name: string; purpose: string; keyComponents: string[] }[]
  editable: boolean
  edit: (path: string, val: unknown) => void
}) {
  return (
    <>
      <ul className="rows">
        {screens.map((x, i) => (
          <li key={x.id} className="item">
            <span className="row-num mono">{String(i + 1).padStart(2, '0')}</span>
            <span className="row-main">
              <span className="row-title">
                <EText path={`screens.${i}.name`} />
              </span>
              <span className="row-sub">
                <EText path={`screens.${i}.purpose`} multiline />
              </span>
              {x.keyComponents.length > 0 && <span className="row-comps mono">{x.keyComponents.join(' · ')}</span>}
            </span>
            <span className="item-tools">
              <CommentButton path={`screens.${i}`} anchor={`Screen ${x.name}`} />
              {editable && (
                <IconButton
                  icon={Trash2}
                  label="Remove"
                  size="sm"
                  onClick={() =>
                    edit(
                      'screens',
                      screens.filter((_, j) => j !== i),
                    )
                  }
                />
              )}
            </span>
          </li>
        ))}
      </ul>
      {editable && (
        <div className="card-foot">
          <button className="add" onClick={() => edit('screens', [...screens, { id: `screen-${screens.length + 1}`, name: 'New screen', purpose: 'What it is for', keyComponents: [] }])}>
            <Plus aria-hidden="true" /> Add screen
          </button>
        </div>
      )}
    </>
  )
}

function StepsList({ steps }: { steps: { id: string; screen: string; userAction: string; systemResponse: string }[] }) {
  return (
    <ul className="rows">
      {steps.map((x, i) => (
        <li key={x.id} className="item">
          <span className="row-num mono">{x.id}</span>
          <span className="row-main">
            <span className="row-title">
              <EText path={`steps.${i}.userAction`} multiline />
            </span>
            <span className="row-sub">
              <EText path={`steps.${i}.systemResponse`} multiline />
            </span>
          </span>
          <Pill tone="info">{x.screen}</Pill>
          <span className="item-tools">
            <CommentButton path={`steps.${i}`} anchor={`Step ${x.id}`} />
          </span>
        </li>
      ))}
    </ul>
  )
}

function LegacyEdgeCases({ edgeCases }: { edgeCases?: { id: string; case: string; handling: string; severity?: string }[] }) {
  if (!edgeCases?.length) return null
  return (
    <Card id="edges" icon={CircleDashed} iconClassName="icon-warn" label="Edge cases" count={edgeCases.length} flush>
      <ul className="rows">
        {edgeCases.map((x, i) => (
          <li key={x.id ?? i} className="item">
            <span className="row-num mono">{x.id ?? String(i + 1).padStart(2, '0')}</span>
            <span className="row-main">
              <span className="row-title">
                <EText path={`edgeCases.${i}.case`} multiline />
              </span>
              <span className="row-sub">
                <EText path={`edgeCases.${i}.handling`} multiline />
              </span>
            </span>
            {x.severity && <Pill tone={x.severity === 'high' ? 'danger' : x.severity === 'medium' ? 'warn' : 'neutral'}>{x.severity}</Pill>}
            <span className="item-tools">
              <CommentButton path={`edgeCases.${i}`} anchor={`Edge case: ${x.case}`} />
            </span>
          </li>
        ))}
      </ul>
    </Card>
  )
}
