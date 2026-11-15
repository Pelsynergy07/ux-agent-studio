// Cards the step pages share, so every step reads the same way.
import { ListTodo, Plus, Quote, Trash2, type LucideIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { IconButton } from '../../kit/Button'
import { Card, Pill } from '../../kit/Card'
import { getPath } from '../../ui'
import { CommentButton, EText, ListBody, usePhase } from '../editors'

/** Long people lists start short; the rest is one click away. */
export const PEOPLE_SHOWN = 6
export function MoreToggle({ total, all, onToggle }: { total: number; all: boolean; onToggle: () => void }) {
  if (total <= PEOPLE_SHOWN) return null
  return (
    <button type="button" className="more-toggle" onClick={onToggle}>
      {all ? 'Show fewer' : `Show ${total - PEOPLE_SHOWN} more`}
    </button>
  )
}

/** An editable list shown in full inside a card (no accordion to open). */
export function ListCard({ path, label, icon, iconClassName = '', noun = 'item', empty = 'None' }: { path: string; label: string; icon: LucideIcon; iconClassName?: string; noun?: string; empty?: string }) {
  const { data, editable, edit } = usePhase()
  const items: string[] = getPath(data, path) ?? []
  return (
    <Card icon={icon} iconClassName={iconClassName} label={label} count={items.length || undefined} actions={<CommentButton path={path} anchor={label} />}>
      {items.length ? <ListBody path={path} items={items} title={label} /> : <p className="muted small">{empty}</p>}
      {editable && (
        <button className="add" onClick={() => edit(path, [...items, `New ${noun}`])}>
          <Plus aria-hidden="true" /> Add {noun}
        </button>
      )}
    </Card>
  )
}

const initials = (n: string) =>
  n
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

/** People as rows: initials, name, one line about them, and something on the right (status, role…). */
export function PeopleCard<T extends { name: string }>({
  path,
  label = 'People',
  icon,
  iconClassName = '',
  sub,
  right,
  inferred,
  newPerson,
}: {
  path: string
  label?: string
  icon: LucideIcon
  iconClassName?: string
  sub: keyof T & string
  right?: (p: T, i: number) => ReactNode
  inferred?: (p: T) => boolean
  newPerson?: () => T
}) {
  const { data, editable, edit } = usePhase()
  const people: T[] = getPath(data, path) ?? []
  return (
    <Card icon={icon} iconClassName={iconClassName} label={label} count={people.length} flush>
      <ul className="people">
        {people.map((p, i) => (
          <li key={i} className="item">
            <span className={`avatar ${inferred?.(p) ? 'inferred' : ''}`} title={inferred?.(p) ? 'Not in the meeting, but should be involved' : undefined}>
              {initials(p.name)}
            </span>
            <span className="person">
              <span className="person-name">
                <EText path={`${path}.${i}.name`} />
              </span>
              <span className="person-need">
                <EText path={`${path}.${i}.${sub}`} multiline />
              </span>
            </span>
            {right?.(p, i)}
            <span className="item-tools">
              <CommentButton path={`${path}.${i}`} anchor={`Person ${p.name}`} />
              {editable && (
                <IconButton
                  icon={Trash2}
                  label="Remove"
                  size="sm"
                  onClick={() =>
                    edit(
                      path,
                      people.filter((_, j) => j !== i),
                    )
                  }
                />
              )}
            </span>
          </li>
        ))}
      </ul>
      {editable && newPerson && (
        <div className="card-foot">
          <button className="add" onClick={() => edit(path, [...people, newPerson()])}>
            <Plus aria-hidden="true" /> Add person
          </button>
        </div>
      )}
    </Card>
  )
}

/** Verbatim quotes from the meeting. */
export function QuotesCard({ path }: { path: string }) {
  const { data } = usePhase()
  const quotes: { quote: string; speaker: string }[] = getPath(data, path) ?? []
  if (!quotes.length) return null
  return (
    <Card icon={Quote} label="Quotes" count={quotes.length}>
      <div className="quotes">
        {quotes.map((q, i) => (
          <figure key={i} className="quote">
            <blockquote>“{q.quote}”</blockquote>
            <figcaption>{q.speaker}</figcaption>
          </figure>
        ))}
      </div>
    </Card>
  )
}

/** User stories with their priority. */
export function StoriesCard({ path = 'userStories', iconClassName = 'icon-accent' }: { path?: string; iconClassName?: string }) {
  const { data } = usePhase()
  const stories: { id: string; story: string; priority: string }[] = getPath(data, path) ?? []
  return (
    <Card icon={ListTodo} iconClassName={iconClassName} label="User stories" count={stories.length} flush>
      <ul className="rows">
        {stories.map((u, i) => (
          <li key={u.id} className="item">
            <span className="row-num mono">{u.id}</span>
            <span className="row-main">
              <span className="row-sub strong">
                <EText path={`${path}.${i}.story`} multiline />
              </span>
            </span>
            <Pill tone={u.priority === 'must' ? 'accent' : 'neutral'}>{u.priority}</Pill>
            <span className="item-tools">
              <CommentButton path={`${path}.${i}`} anchor={`Story ${u.id}`} />
            </span>
          </li>
        ))}
      </ul>
    </Card>
  )
}
