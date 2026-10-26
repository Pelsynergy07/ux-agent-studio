import { Mermaid } from '../Mermaid'
import { EText, ETable, Fold, ListBody, usePhase } from '../editors'

/** Shape: the flow diagram is the point; tables are there when you want them. */
export function Shape() {
  const { data } = usePhase()
  return (
    <div className="doc">
      <div className="gist">
        <p className="gist-text">
          <EText path="summary" multiline />
        </p>
        <div className="screen-chips">
          {data.screens.map((s: { id: string; name: string }) => (
            <span key={s.id} className="chip">
              {s.name}
            </span>
          ))}
        </div>
      </div>
      <div className="flow-box">
        <Mermaid source={data.mermaid} />
      </div>
      <div className="folds">
        <ETable
          path="screens"
          title="Screens the lo-fi will draw"
          noun="screen"
          rowLabel={(r) => `Screen ${r.name}`}
          columns={[
            { key: 'name', label: 'Screen', width: '22%' },
            { key: 'purpose', label: 'Purpose' },
            { key: 'keyComponents', label: 'Components', width: '28%' },
          ]}
          newRow={() => ({ id: `screen-${data.screens.length + 1}`, name: 'New screen', purpose: 'What it is for', keyComponents: [] })}
        />
        <ETable
          path="steps"
          title="Happy path"
          noun="step"
          rowLabel={(r) => `Step ${r.id}`}
          columns={[
            { key: 'id', label: '#', width: '50px' },
            { key: 'screen', label: 'Screen', width: '18%' },
            { key: 'userAction', label: 'User does' },
            { key: 'systemResponse', label: 'System does' },
          ]}
        />
        <ETable
          path="edgeCases"
          title="Edge cases"
          noun="edge case"
          rowLabel={(r) => `Edge case ${r.id}`}
          columns={[
            { key: 'id', label: '#', width: '50px' },
            { key: 'case', label: 'When' },
            { key: 'handling', label: 'We handle it by' },
          ]}
          newRow={() => ({ id: `E${data.edgeCases.length + 1}`, case: 'New edge case', handling: '…' })}
        />
        <Fold title="Entry points and KPI measurement" summary={`${data.entryPoints.length} entry points · ${data.kpiHooks.length} KPI hooks`} path="entryPoints">
          <h4 className="mini">Entry points</h4>
          <ListBody path="entryPoints" items={data.entryPoints} title="Entry point" />
          <h4 className="mini">Where KPIs are measured</h4>
          <ListBody path="kpiHooks" items={data.kpiHooks} title="KPI hook" />
        </Fold>
      </div>
    </div>
  )
}
