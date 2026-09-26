import { createPortal } from 'react-dom'
import { usePopoutBehaviour } from './HomePopouts'
import './view-picker.css'

/** Every way to look at the tickets. Used by the View selector and by the "All Views" picker. */
export const VIEW_GROUPS: { selectLabel: string; pickerLabel: string; views: [value: string, label: string][] }[] = [
  { selectLabel: 'Records', pickerLabel: 'Records', views: [['list', 'List View'], ['split', 'Split View']] },
  { selectLabel: 'Kanban', pickerLabel: 'Kanban', views: [['small', 'Kanban Compact'], ['regular', 'Kanban Detailed']] },
  { selectLabel: 'Operations', pickerLabel: 'Operations', views: [['my-work', 'My Work'], ['sla', 'SLA View'], ['workload', 'Workload View'], ['escalation', 'Escalation View'], ['department', 'Department View']] },
  { selectLabel: 'Planning and insights', pickerLabel: 'Planning & insights', views: [['calendar', 'Calendar View'], ['priority-matrix', 'Priority Matrix'], ['analytics', 'Analytics View'], ['graph', 'Graph View'], ['timeline', 'Timeline View']] },
]

/** The "All Views" popup: all the layouts in one place, with the current one marked. */
export default function ViewPicker({ current, onChoose, onClose }: { current: string; onChoose: (value: string) => void; onClose: () => void }) {
  const dialog = usePopoutBehaviour(onClose, 'All views')
  return createPortal(
    <div className="views-modal" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section ref={dialog} className="views-dialog" role="dialog" aria-modal="true" aria-labelledby="views-title" tabIndex={-1}>
        <button className="views-close" type="button" aria-label="Close views" onClick={onClose}>×</button>
        <div className="eyebrow">TICKET WORKSPACE</div>
        <h2 id="views-title">Choose a view</h2>
        <p>Pick the layout that best fits the work you are doing.</p>
        <div className="views-grid">
          {VIEW_GROUPS.map((group) => <section className="views-group" key={group.pickerLabel}>
            <h3>{group.pickerLabel}</h3>
            <div>{group.views.map(([value, label]) => <button key={value} type="button" className={`views-option${current === value ? ' current' : ''}`} onClick={() => onChoose(value)}>{label}</button>)}</div>
          </section>)}
        </div>
      </section>
    </div>,
    document.body,
  )
}
