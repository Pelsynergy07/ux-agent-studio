import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'

/** Page title with a back button / breadcrumb trail above it and actions on the right. */
export function PageHead({ title, sub, crumbs, actions }: { title: ReactNode; sub?: ReactNode; crumbs?: { label: string; onClick?: () => void }[]; actions?: ReactNode }) {
  const backCrumb = crumbs?.find((c) => c.onClick)

  return (
    <header className="page-head">
      <div className="page-head-text">
        {backCrumb && (
          <div className="head-back-row">
            <button type="button" className="btn-back" onClick={backCrumb.onClick} title={`Return to ${backCrumb.label}`}>
              <ArrowLeft aria-hidden="true" />
              <span>{backCrumb.label.startsWith('Back') ? backCrumb.label : `Back to ${backCrumb.label}`}</span>
            </button>
          </div>
        )}
        <h1>{title}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      {actions && <div className="page-head-actions">{actions}</div>}
    </header>
  )
}
