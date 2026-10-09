import { useState } from 'react'
import { Plus, X, Settings2, AlertTriangle } from 'lucide-react'
import AssignmentGroupManager from './AssignmentGroupManager'
import EscalationMatrixBuilder from './EscalationMatrixBuilder'

type Tab = 'groups' | 'rules' | 'thresholds'

interface EscalationSettingsProps {
  teamId: string
  onClose: () => void
}

export default function EscalationSettings({ teamId, onClose }: EscalationSettingsProps) {
  const [activeTab, setActiveTab] = useState<Tab>('groups')

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Settings2 size={24} className="text-orange-600" />
          <h1 className="text-2xl font-bold text-gray-900">Escalation Configuration</h1>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
        >
          <X size={20} />
        </button>
      </div>

      {/* Alert */}
      <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg flex gap-3">
        <AlertTriangle size={20} className="text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-semibold text-blue-900">Escalation Matrix</p>
          <p className="text-blue-800">
            Configure how tickets escalate through your support tiers. Assignment groups route tickets to teams, not individuals.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-200">
        {[
          { id: 'groups', label: 'Assignment Groups' },
          { id: 'rules', label: 'Escalation Rules' },
          { id: 'thresholds', label: 'Time Thresholds' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as Tab)}
            className={`px-4 py-2 font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-orange-600 text-orange-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="bg-white rounded-lg">
        {activeTab === 'groups' && <AssignmentGroupManager teamId={teamId} />}
        {activeTab === 'rules' && <EscalationMatrixBuilder teamId={teamId} />}
        {activeTab === 'thresholds' && (
          <div className="p-6 text-center text-gray-600">
            <p>Time threshold configuration coming soon</p>
            <p className="text-sm text-gray-500">Configure minutes before escalation from each tier</p>
          </div>
        )}
      </div>
    </div>
  )
}
