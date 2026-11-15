// Shape's user flows on a pannable, zoomable board (FigJam-like): one frame per core flow, laid out
// automatically. Drag to pan, pinch or ⌘/Ctrl + scroll to zoom, double-click a box to rename it.
import dagre from '@dagrejs/dagre'
import { Background, BackgroundVariant, Handle, MarkerType, NodeToolbar, Position, ReactFlow, ReactFlowProvider, useReactFlow, useStore, type Edge, type Node, type NodeProps } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Maximize, Maximize2, Minimize2, Minus, MonitorSmartphone, Plus } from 'lucide-react'
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { IconButton } from '../kit/Button'
import { CommentButton, usePhase } from './editors'

export interface FlowNode {
  id: string
  label: string
  kind: 'start' | 'screen' | 'action' | 'decision' | 'end' | 'error'
  screen: string
}
export interface Flow {
  id: string
  name: string
  nodes: FlowNode[]
  edges: { from: string; to: string; label: string }[]
}

type StepData = { node: FlowNode; path: string; anchor: string; screenName?: string }
type FrameData = { flow: Flow; w: number; h: number }

const H = { decision: 72, start: 38, end: 38 } as Partial<Record<FlowNode['kind'], number>>
const size = (n: FlowNode) => ({ w: n.kind === 'decision' ? 128 : Math.min(200, Math.max(104, n.label.length * 7 + 36 + (n.kind === 'screen' ? 22 : 0))), h: H[n.kind] ?? 48 })
const PAD = { x: 36, top: 64, bottom: 36 }
const GAP = 72

/** Lays out every flow left to right with dagre and stacks the flows as frames, one under the other. */
function layout(flows: Flow[], screens: Map<string, string>): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = []
  const edges: Edge[] = []
  let y = 0
  flows.forEach((flow, fi) => {
    const g = new dagre.graphlib.Graph()
    g.setGraph({ rankdir: 'LR', nodesep: 28, ranksep: 44, marginx: 0, marginy: 0 })
    g.setDefaultEdgeLabel(() => ({}))
    const known = new Set(flow.nodes.map((n) => n.id))
    for (const n of flow.nodes) {
      const s = size(n)
      g.setNode(n.id, { width: s.w, height: s.h })
    }
    const valid = flow.edges.filter((e) => known.has(e.from) && known.has(e.to))
    for (const e of valid) g.setEdge(e.from, e.to)
    dagre.layout(g)
    const box = flow.nodes.reduce(
      (b, n) => {
        const p = g.node(n.id)
        return { w: Math.max(b.w, p.x + p.width / 2), h: Math.max(b.h, p.y + p.height / 2) }
      },
      { w: 260, h: 40 },
    )
    const frameId = `frame:${flow.id}`
    const w = box.w + PAD.x * 2
    const h = box.h + PAD.top + PAD.bottom
    nodes.push({ id: frameId, type: 'frame', position: { x: 0, y }, data: { flow, w, h } satisfies FrameData, style: { width: w, height: h }, selectable: false, draggable: false, zIndex: -1 })
    flow.nodes.forEach((n, ni) => {
      const p = g.node(n.id)
      nodes.push({
        id: `${flow.id}:${n.id}`,
        type: 'step',
        parentId: frameId,
        extent: 'parent',
        position: { x: PAD.x + p.x - p.width / 2, y: PAD.top + p.y - p.height / 2 },
        data: { node: n, path: `flows.${fi}.nodes.${ni}`, anchor: `${flow.name} › ${n.label}`, screenName: n.screen ? screens.get(n.screen) : undefined } satisfies StepData,
        style: { width: p.width, height: p.height },
        draggable: false,
      })
    })
    valid.forEach((e, ei) =>
      edges.push({
        id: `${flow.id}:e${ei}`,
        source: `${flow.id}:${e.from}`,
        target: `${flow.id}:${e.to}`,
        label: e.label || undefined,
        type: 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
        className: e.label ? 'labelled' : '',
      }),
    )
    y += h + GAP
  })
  return { nodes, edges }
}

const Rename = createContext<{ editable: boolean; rename: (path: string, label: string) => void }>({ editable: false, rename: () => {} })

function StepNode({ data, selected, positionAbsoluteX, positionAbsoluteY }: NodeProps<Node<StepData>>) {
  const { node, path, anchor, screenName } = data
  const { editable, rename } = useContext(Rename)
  const [draft, setDraft] = useState<string | null>(null)
  // The board clips its overflow, so the comment popover opens toward the roomier side.
  const room = useStore((s) => {
    const [tx, ty, zoom] = s.transform
    return { left: positionAbsoluteX * zoom + tx < s.width / 2, up: positionAbsoluteY * zoom + ty > s.height / 2 }
  }, (a, b) => a.left === b.left && a.up === b.up)
  const commit = () => {
    if (draft !== null && draft.trim() && draft.trim() !== node.label) rename(`${path}.label`, draft.trim())
    setDraft(null)
  }
  return (
    <div className={`fnode k-${node.kind} ${selected ? 'sel' : ''}`} onDoubleClick={() => editable && setDraft(node.label)} title={editable ? 'Double-click to rename' : undefined}>
      <Handle type="target" position={Position.Left} />
      {node.kind === 'decision' && <span className="fnode-diamond" aria-hidden="true" />}
      {node.kind === 'screen' && <MonitorSmartphone className="fnode-icon" aria-hidden="true" />}
      {draft !== null ? (
        <input className="fnode-input nodrag" autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => (e.key === 'Enter' ? commit() : e.key === 'Escape' && setDraft(null))} />
      ) : (
        <span className="fnode-label">{node.label}</span>
      )}
      <Handle type="source" position={Position.Right} />
      <NodeToolbar isVisible={selected} position={Position.Top} className="fnode-bar">
        <span className="fnode-kind">{screenName ? `Screen · ${screenName}` : node.kind}</span>
        <CommentButton path={path} anchor={anchor} align={room.left ? 'left' : 'right'} up={room.up} />
      </NodeToolbar>
    </div>
  )
}

function FrameNode({ data }: NodeProps<Node<FrameData>>) {
  return (
    <div className="fframe" style={{ width: data.w, height: data.h }}>
      <span className="fframe-title">
        <b>{data.flow.id}</b> {data.flow.name}
      </span>
    </div>
  )
}

const nodeTypes = { step: StepNode, frame: FrameNode }

function Board({ flows, screens, full, setFull }: { flows: Flow[]; screens: Map<string, string>; full: boolean; setFull: (f: boolean) => void }) {
  const { editable, edit } = usePhase()
  const laid = useMemo(() => layout(flows, screens), [flows, screens])
  // Nodes are derived from the phase data, so selection is kept here rather than in React Flow.
  const [sel, setSel] = useState<string | null>(null)
  const nodes = useMemo(() => laid.nodes.map((n) => (n.id === sel ? { ...n, selected: true } : n)), [laid, sel])
  const edges = laid.edges
  const rf = useReactFlow()
  // Open on the first flow at a readable size; "All flows" zooms out to the whole board.
  const [focus, setFocus] = useState<string>(flows[0]?.id ?? 'all')
  const zoomTo = (id: string, duration = 450) => {
    setFocus(id)
    if (id === 'all') return void rf.fitView({ padding: 0.08, maxZoom: 1.1, duration })
    // Fit the flow; if that makes labels too small to read, start at its left edge at a readable size.
    const frame = rf.getNode(`frame:${id}`)
    const box = document.querySelector('.fcanvas .react-flow')?.getBoundingClientRect()
    const w = Number(frame?.style?.width ?? 0)
    const h = Number(frame?.style?.height ?? 0)
    if (frame && box && w && box.width / w < 0.7) {
      const zoom = 0.8
      return void rf.setViewport({ x: -frame.position.x * zoom + 24, y: box.height / 2 - (frame.position.y + h / 2) * zoom, zoom }, { duration })
    }
    void rf.fitView({ nodes: [{ id: `frame:${id}` }], padding: 0.08, maxZoom: 1.1, duration })
  }
  // The first fit is React Flow's own (it waits for measured boxes); later ones follow full screen.
  const first = useRef(true)
  useEffect(() => {
    if (first.current) return void (first.current = false)
    const t = setTimeout(() => zoomTo(focus, 0), 60)
    return () => clearTimeout(t)
  }, [full])
  const rename = useMemo(() => ({ editable, rename: (path: string, label: string) => void edit(path, label) }), [editable, edit])

  return (
    <Rename.Provider value={rename}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.08, maxZoom: 1.1 }}
        // React Flow's own fit shows the whole board; then settle on the first flow once boxes are measured.
        onInit={() => setTimeout(() => zoomTo(focus, 0), 80)}
        minZoom={0.15}
        maxZoom={2}
        onNodeClick={(_, n) => n.type === 'step' && setSel(n.id)}
        onPaneClick={() => setSel(null)}
        nodesConnectable={false}
        nodesDraggable={false}
        elementsSelectable
        // Inline, the page keeps scrolling; full screen behaves like a whiteboard (scroll pans).
        panOnScroll={full}
        zoomOnScroll={false}
        preventScrolling={full}
        zoomOnDoubleClick={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1.2} />
      </ReactFlow>
      <div className="fcanvas-flows" role="tablist" aria-label="Flows">
        {flows.length > 1 && (
          <button type="button" role="tab" aria-selected={focus === 'all'} className={focus === 'all' ? 'on' : ''} onClick={() => zoomTo('all')}>
            All flows
          </button>
        )}
        {flows.map((f) => (
          <button key={f.id} type="button" role="tab" aria-selected={focus === f.id} className={focus === f.id ? 'on' : ''} onClick={() => zoomTo(f.id)}>
            <b>{f.id}</b> {f.name}
          </button>
        ))}
      </div>
      <div className="fcanvas-tools">
        <IconButton icon={Minus} label="Zoom out" size="sm" tipSide="left" onClick={() => rf.zoomOut({ duration: 200 })} />
        <IconButton icon={Plus} label="Zoom in" size="sm" tipSide="left" onClick={() => rf.zoomIn({ duration: 200 })} />
        <IconButton icon={Maximize} label="Fit" size="sm" tipSide="left" onClick={() => zoomTo(focus)} />
        <IconButton icon={full ? Minimize2 : Maximize2} label={full ? 'Exit full screen' : 'Full screen'} size="sm" tipSide="left" onClick={() => setFull(!full)} />
      </div>
      <span className="fcanvas-hint">{full ? 'Scroll to pan · ⌘/Ctrl + scroll to zoom · Esc to exit' : 'Drag to pan · ⌘/Ctrl + scroll to zoom'}</span>
    </Rename.Provider>
  )
}

export function FlowCanvas({ flows, screens }: { flows: Flow[]; screens: { id: string; name: string }[] }) {
  const [full, setFull] = useState(false)
  const map = useMemo(() => new Map(screens.map((s) => [s.id, s.name])), [screens])
  useEffect(() => {
    if (!full) return
    const k = (e: KeyboardEvent) => e.key === 'Escape' && !(e.target as HTMLElement).closest('input, textarea') && setFull(false)
    window.addEventListener('keydown', k)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', k)
      document.body.style.overflow = ''
    }
  }, [full])
  const board = (
    <div className={`fcanvas ${full ? 'full' : ''}`}>
      <ReactFlowProvider>
        <Board flows={flows} screens={map} full={full} setFull={setFull} />
      </ReactFlowProvider>
    </div>
  )
  // Full screen escapes the page layout (and its transforms) by rendering into <body>.
  return full ? (
    <>
      <div className="fcanvas placeholder" aria-hidden="true" />
      {createPortal(board, document.body)}
    </>
  ) : (
    board
  )
}

/**
 * Reads an older Mermaid flowchart into the same flow graph, so drafts made before flow boards still
 * get the canvas. Handles node shapes ([], (), {}, ([ ])), `-->`, `-- label -->` and `-->|label|`.
 */
export function mermaidToFlow(src: string, name = 'Main flow'): Flow | null {
  const nodes = new Map<string, FlowNode>()
  const edges: Flow['edges'] = []
  const node = (tok: string) => {
    const m = /^([A-Za-z0-9_]+)\s*(?:(\(\[|\[\[|\(\(|\[|\(|\{)\s*"?([\s\S]*?)"?\s*(?:\]\)|\]\]|\)\)|\]|\)|\}))?$/.exec(tok.trim())
    if (!m) return null
    const [, id, open, label] = m
    const known = nodes.get(id)
    if (!known) nodes.set(id, { id, label: label || id, kind: open === '{' ? 'decision' : open === '([' || open === '((' ? 'start' : 'action', screen: '' })
    else if (label) nodes.set(id, { ...known, label, kind: open === '{' ? 'decision' : known.kind })
    return id
  }
  for (const raw of src.replace(/^```(mermaid)?\s*|```\s*$/g, '').split('\n')) {
    const line = raw.trim().replace(/;$/, '')
    if (!line || /^(flowchart|graph|%%|classDef|class |style |linkStyle|subgraph|end$)/.test(line)) continue
    // `A -- "label" --> B` becomes `A -->|label| B`; then split the chain on arrows.
    const norm = line.replace(/--\s*"?([^">|-][^">|]*?)"?\s*-->/g, '-->|$1|').replace(/-\.->|==>/g, '-->')
    const parts = norm.split('-->')
    let prev: string | null = null
    for (const part of parts) {
      const lm = /^\s*\|\s*"?([^|]*?)"?\s*\|\s*([\s\S]*)$/.exec(part)
      const id = node(lm ? lm[2] : part)
      if (id && prev) edges.push({ from: prev, to: id, label: lm ? lm[1].trim() : '' })
      prev = id
    }
  }
  if (!nodes.size) return null
  const list = [...nodes.values()]
  const hasOut = new Set(edges.map((e) => e.from))
  const hasIn = new Set(edges.map((e) => e.to))
  for (const n of list) {
    if (n.kind === 'decision') continue
    if (!hasIn.has(n.id) || n === list[0]) n.kind = 'start'
    else if (!hasOut.has(n.id)) n.kind = 'end'
    else if (/error|fail|unavailable|lost|stale/i.test(n.label)) n.kind = 'error'
  }
  return { id: 'F1', name, nodes: list, edges }
}
