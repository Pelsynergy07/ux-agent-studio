import { FlowCanvas, type Flow } from '../FlowCanvas'
import { Mermaid } from '../Mermaid'
import { EText, ETable, Fold, ListBody, usePhase } from '../editors'

/** Shape: the flows on a board you can pan and zoom; screens and edge cases are a click away. */
export function Shape() {
  const { data } = usePhase()
  const flows: Flow[] = data.flows ?? []
  return (
    <div className="doc">
      <p className="lede">
        <EText path="summary" multiline />
      </p>
      {flows.length ? (
        <FlowCanvas flows={flows} screens={data.screens} />
      ) : data.mermaid ? (
        // Drafts from before flow boards: still shown, as the chart they were.
        <div className="flow-box">
          <Mermaid source={data.mermaid} />
        </div>
      ) : null}
      <div className="folds">
        <ETable
          path="screens"
          title="Screens"
          noun="screen"
          rowLabel={(r) => `Screen ${r.name}`}
          columns={[
            { key: 'name', label: 'Screen', width: '24%' },
            { key: 'purpose', label: 'Purpose' },
            { key: 'keyComponents', label: 'Components', width: '28%' },
          ]}
          newRow={() => ({ id: `screen-${data.screens.length + 1}`, name: 'New screen', purpose: 'What it is for', keyComponents: [] })}
        />
        <ETable
          path="edgeCases"
          title="Edge cases"
          noun="edge case"
          rowLabel={(r) => `Edge case ${r.id}`}
          columns={[
            { key: 'case', label: 'When' },
            { key: 'handling', label: 'We handle it by' },
          ]}
          newRow={() => ({ id: `E${data.edgeCases.length + 1}`, case: 'New edge case', handling: '…' })}
        />
        <Fold title="Where KPIs are measured" summary={`${data.kpiHooks.length}`} path="kpiHooks">
          <ListBody path="kpiHooks" items={data.kpiHooks} title="KPI hook" />
        </Fold>
      </div>
    </div>
  )
}
