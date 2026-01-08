interface Evidence {
  id: string
  field_path: string
  excerpt: string
}

interface EvidenceViewerProps {
  evidence: Evidence[]
}

export default function EvidenceViewer({ evidence }: EvidenceViewerProps) {
  return (
    <div className="space-y-4 max-h-96 overflow-y-auto">
      {evidence.map((item) => (
        <div
          key={item.id}
          className="border border-gray-200 rounded-lg p-4"
        >
          <div className="text-xs font-medium text-primary-600 mb-2 font-mono">
            {item.field_path}
          </div>
          <blockquote className="text-sm text-gray-700 border-l-2 border-primary-300 pl-3 italic">
            "{item.excerpt}"
          </blockquote>
        </div>
      ))}
    </div>
  )
}
