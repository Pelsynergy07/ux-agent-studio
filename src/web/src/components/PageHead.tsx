import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'

/** Page title with an optional back link and actions on the right. */
export function PageHead({ title, sub, back, actions }: { title: ReactNode; sub?: ReactNode; back?: { label: string; onClick: () => void }; actions?: ReactNode }) {
  return (
    <header className="page-head">
      <div className="page-head-text">
        {back && (
          <button className="back" onClick={back.onClick}>
            <ArrowLeft aria-hidden="true" />
            {back.label}
          </button>
        )}
        <h1>{title}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      {actions && <div className="page-head-actions">{actions}</div>}
    </header>
  )
}
