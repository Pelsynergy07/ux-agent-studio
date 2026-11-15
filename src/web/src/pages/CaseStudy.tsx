// The case study: written from the decision log and the approved work, edited here, then turned into
// a PDF and a Markdown file with the flows, screens, KPIs and edge cases as images and tables.
import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { Download, FileDown, FolderOpen, NotebookPen, Pencil, RotateCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Budget, CaseStudyInfo, Project } from '../../../shared/types'
import { api } from '../api'
import { Button } from '../kit/Button'
import { Banner, EmptyState, Spinner } from '../kit/Feedback'
import { estimate, withBudget } from '../run'
import { ago, cleanError } from '../ui'

export function CaseStudy({ project, budget, progress, toast, onChange }: { project: Project; budget: Budget | null; progress?: { message: string }; toast: (m: string) => void; onChange: () => void }) {
  const [cs, setCs] = useState<CaseStudyInfo | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [building, setBuilding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const writing = !!progress
  const load = () => api.getCaseStudy(project.id).then(setCs)
  useEffect(() => void load(), [project.id, project.updatedAt, writing])

  const write = async () => {
    setError(null)
    try {
      await withBudget(() => api.generateCaseStudy(project.id))
      toast('Writing the case study…')
    } catch (e) {
      setError(cleanError(e))
    }
  }
  const build = async () => {
    setBuilding(true)
    setError(null)
    try {
      const info = await api.buildCaseStudyFiles(project.id)
      setCs(info)
      setNote(info.note ?? null)
    } catch (e) {
      setError(cleanError(e))
    } finally {
      setBuilding(false)
    }
  }

  if (!cs) return null
  const html = cs.markdown ? DOMPurify.sanitize(marked.parse(`# ${cs.title}\n\n> ${cs.tldr}\n\n${cs.markdown}`, { async: false }) as string) : ''

  return (
    <section className="phase" aria-label="Case study">
      <header className="phase-head">
        <div className="phase-title">
          <h2>Case study</h2>
          <p className="phase-sub">The story of this work, ready to share. Not part of the step export.</p>
        </div>
        {cs.markdown && !writing && (
          <div className="phase-head-right">
            <Button variant="ghost" size="sm" icon={RotateCcw} onClick={() => confirm('Write it again from the latest work? Your edits to the text will be replaced.') && write()}>
              Rewrite
            </Button>
          </div>
        )}
      </header>
      <div className="phase-banners">
        {error && (
          <Banner tone="danger" onClose={() => setError(null)}>
            {error}
          </Banner>
        )}
        {note && <Banner tone="warn">{note}</Banner>}
      </div>

      {writing ? (
        <div className="thinking" role="status">
          <Spinner size={18} />
          <div className="thinking-text">
            <span className="thinking-line">{progress?.message ?? 'Writing…'}</span>
          </div>
        </div>
      ) : !cs.markdown ? (
        <EmptyState
          icon={NotebookPen}
          title="Write the case study"
          action={
            <div className="start-row">
              <Button variant="primary" icon={NotebookPen} onClick={write}>
                Write it
              </Button>
              <span className="muted small mono">{estimate(budget?.perRun, 'casestudy')}</span>
            </div>
          }
        >
          From the decision log and the approved work: who you talked to, what you explored, the flow, edge cases, KPIs and screens.
        </EmptyState>
      ) : (
        <div className="phase-pad">
          <div className="cs-files">
            <div className="cs-files-text">
              <strong>Files</strong>
              <span className="muted small">{cs.files.zip ? `PDF and Markdown with ${cs.files.images} images · made ${ago(cs.files.at!)}` : 'Make a PDF and a Markdown file with images of the flows and screens.'}</span>
            </div>
            <Button variant={cs.files.zip ? 'secondary' : 'primary'} icon={FileDown} loading={building} onClick={build}>
              {cs.files.zip ? 'Make again' : 'Make files'}
            </Button>
            {cs.files.pdf && (
              <a className="btn btn-secondary btn-md" href={`/download/${project.id}/case-study.pdf`}>
                <Download aria-hidden="true" /> PDF
              </a>
            )}
            {cs.files.zip && (
              <a className="btn btn-secondary btn-md" href={`/download/${project.id}/case-study.zip`}>
                <Download aria-hidden="true" /> Markdown + images
              </a>
            )}
            {cs.files.zip && <Button variant="ghost" icon={FolderOpen} onClick={() => api.openCaseStudyFolder(project.id)} aria-label="Open folder" />}
          </div>

          {editing !== null ? (
            <div className="cs-edit">
              <textarea className="input textarea mono" rows={24} value={editing} onChange={(e) => setEditing(e.target.value)} />
              <div className="row end">
                <span className="hint">Markdown. Flows, screens, KPI and edge-case tables are added when you make the files.</span>
                <Button variant="ghost" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={async () => {
                    try {
                      setCs(await api.saveCaseStudy(project.id, editing))
                      setEditing(null)
                      onChange()
                    } catch (e) {
                      setError(cleanError(e))
                    }
                  }}
                >
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <article className="prose">
              <div className="prose-tools">
                <Button variant="ghost" size="sm" icon={Pencil} onClick={() => setEditing(cs.markdown ?? '')}>
                  Edit text
                </Button>
              </div>
              <div dangerouslySetInnerHTML={{ __html: html }} />
            </article>
          )}
        </div>
      )}
    </section>
  )
}
