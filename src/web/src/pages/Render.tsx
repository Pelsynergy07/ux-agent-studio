// Chrome-less pages for the case-study builder to photograph: one flow board, or the concept cards.
import { useEffect, useState } from 'react'
import type { StageArtifact } from '../../../shared/types'
import { api } from '../api'
import { Phase, type PhaseCtx } from '../components/editors'
import { FlowCanvas, type Flow } from '../components/FlowCanvas'
import { Concepts } from '../components/phases/Concepts'

const readOnly = (data: unknown, stage: PhaseCtx['stage']): PhaseCtx => ({ stage, data, editable: false, comments: [], edit: async () => {}, comment: async () => {}, removeComment: async () => {} })

export function RenderView({ hash }: { hash: string }) {
  const [, kind, projectId, flowId] = hash.replace(/^#\//, '').split('/').map(decodeURIComponent)
  const stage = kind === 'concepts' ? 'explore' : 'shape'
  const [a, setA] = useState<StageArtifact | null>(null)
  useEffect(() => {
    api.getArtifact(projectId, stage).then(setA)
  }, [projectId, stage])
  if (!a) return null
  const data = a.data as { flows?: Flow[]; screens?: { id: string; name: string }[] }
  return (
    <div className={`render render-${kind}`}>
      <Phase.Provider value={readOnly(a.data, stage)}>
        {kind === 'flow' ? <FlowCanvas flows={(data.flows ?? []).filter((f) => f.id === flowId)} screens={data.screens ?? []} /> : <Concepts readOnly />}
      </Phase.Provider>
    </div>
  )
}
