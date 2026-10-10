import { useState, useEffect } from 'react'
import { Settings2, X } from 'lucide-react'
import { useEscalation } from '../hooks/useEscalation'
import AssignmentGroupManager from '../components/AssignmentGroupManager'
import EscalationMatrixBuilder from '../components/EscalationMatrixBuilder'
import MatrixUploadManager from '../components/MatrixUploadManager'

type Tab = 'groups' | 'rules' | 'thresholds' | 'documents'

interface EscalationPageProps {
  teamId: string
  onClose: () => void
}

export default function EscalationPage({ teamId, onClose }: EscalationPageProps) {
  const [activeTab, setActiveTab] = useState<Tab>('groups')
  const escalation = useEscalation(teamId)

  // Load data on mount
  useEffect(() => {
    escalation.loadGroups()
    escalation.loadRules()
  }, [teamId])

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
        <Settings2 size={20} className="text-blue-600 flex-shrink-0 mt-0.5" />
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
          { id: 'documents', label: 'Reference Documents' },
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

      {/* Error display */}
      {escalation.error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          {escalation.error}
        </div>
      )}

      {/* Content */}
      <div className="bg-white rounded-lg">
        {activeTab === 'groups' && (
          <AssignmentGroupManager
            teamId={teamId}
            groups={escalation.groups}
            loading={escalation.loading}
            error={escalation.error}
            onGroupCreate={escalation.createGroup}
            onGroupUpdate={escalation.updateGroup}
            onGroupDelete={escalation.deleteGroup}
            onGroupsRefresh={escalation.loadGroups}
          />
        )}

        {activeTab === 'rules' && (
          <EscalationMatrixBuilder
            teamId={teamId}
            rules={escalation.rules}
            groups={escalation.groups}
            loading={escalation.loading}
            error={escalation.error}
            onRuleCreate={escalation.createRule}
            onRuleUpdate={escalation.updateRule}
            onRuleDelete={escalation.deleteRule}
            onRulesRefresh={escalation.loadRules}
          />
        )}

        {activeTab === 'thresholds' && (
          <div className="p-6 text-center text-gray-600">
            <p>Time threshold configuration coming soon</p>
            <p className="text-sm text-gray-500">Configure minutes before escalation from each tier</p>
          </div>
        )}

        {activeTab === 'documents' && (
          <div className="p-6 space-y-6">
            <MatrixUploadManager
              teamId={teamId}
              type="escalation"
              title="Escalation Matrix"
              description="Upload your escalation matrix as a reference document (PDF, image, or document). This serves as a visual guide for your team."
            />
            <MatrixUploadManager
              teamId={teamId}
              type="sla"
              title="SLA Matrix"
              description="Upload your SLA matrix as a reference document (PDF, image, or document). This serves as a visual guide for response and resolution times."
            />
          </div>
        )}
      </div>
    </div>
  )
}
