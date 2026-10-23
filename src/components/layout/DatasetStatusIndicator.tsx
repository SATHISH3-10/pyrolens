import { Database, FileSpreadsheet } from 'lucide-react'
import { useFireData } from '@/context/FireDataContext'
import { Badge } from '@/components/ui'

/** Dynamic dataset status indicator connected to the active data context. */
export function DatasetStatusIndicator() {
  const { metadata, setIsCsvModalOpen } = useFireData()
  const isSynthetic = metadata.isSynthetic
  const label = isSynthetic ? 'Demo dataset' : 'Imported CSV'
  const detail = isSynthetic
    ? `Synthetic demo (${metadata.recordCount.toLocaleString()} records). Not connected to NASA FIRMS.`
    : `${metadata.title} (${metadata.recordCount.toLocaleString()} records).`

  return (
    <div
      className="flex items-center gap-3"
      role="status"
      aria-label={`Dataset status: ${label}. ${detail}`}
    >
      <p className="hidden max-w-[17rem] text-right text-xs leading-snug text-fg-faint xl:block">
        {detail}
      </p>
      <button
        type="button"
        onClick={() => setIsCsvModalOpen(true)}
        className="focus:outline-none group cursor-pointer"
        title="Click to view dataset or import custom NASA FIRMS CSV"
      >
        <Badge tone={isSynthetic ? 'ember' : 'signal'} dot className="group-hover:opacity-90">
          {isSynthetic ? (
            <Database className="size-3" aria-hidden="true" />
          ) : (
            <FileSpreadsheet className="size-3" aria-hidden="true" />
          )}
          {label}
        </Badge>
      </button>
    </div>
  )
}
