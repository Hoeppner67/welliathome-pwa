import type { PendingPackage } from './importFullExport'

function describeRecord(record: Record<string, unknown> | null): string {
  if (!record) return 'Gelöscht / nicht vorhanden'
  return JSON.stringify(
    record,
    (_key, value: unknown) =>
      value instanceof Blob ? `[Datei: ${value.type}, ${value.size} Bytes]` : value,
    2,
  )
}

interface ConflictPackagesProps {
  pendingPackages: PendingPackage[]
  busy: boolean
  onResolve: (packageId: string, choice: 'local' | 'incoming') => void | Promise<void>
  onExportArchive: (pending: PendingPackage) => void | Promise<void>
}

export function ConflictPackages({
  pendingPackages,
  busy,
  onResolve,
  onExportArchive,
}: ConflictPackagesProps) {
  const openPackages = pendingPackages.filter((pending) => !pending.resolvedAt)

  return (
    <>
      {openPackages.map((pending) => (
        <section className="settings-conflicts" key={pending.packageId}>
          <h3>Konflikte im Paket {pending.packageId}</h3>
          {pending.conflicts.map((conflict) => (
            <details key={`${conflict.table}:${conflict.recordId}`}>
              <summary>
                {conflict.table}: {conflict.recordId}
              </summary>
              <p>Auf diesem Gerät:</p>
              <pre>{describeRecord(conflict.local)}</pre>
              <p>Im Paket:</p>
              <pre>{describeRecord(conflict.incoming)}</pre>
            </details>
          ))}
          <p>
            Die Paketversionen bleiben lokal archiviert und sind im vollständigen Export enthalten.
          </p>
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={() => void onResolve(pending.packageId, 'local')}
          >
            Lokale Versionen behalten und Import fortsetzen
          </button>
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={() => void onResolve(pending.packageId, 'incoming')}
          >
            Paketversionen übernehmen und Import fortsetzen
          </button>
        </section>
      ))}
      {pendingPackages.length > 0 && (
        <section className="settings-conflicts">
          <h3>Gespeicherte Konfliktarchive</h3>
          <p>
            Die Archive enthalten beide Versionen und das ursprüngliche Paket. Sie sind im
            vollständigen Export enthalten.
          </p>
          {pendingPackages.map((pending) => (
            <div key={pending.packageId}>
              <p>
                {pending.packageId} – {pending.resolvedAt ? 'Abgeschlossen' : 'Offen'}
              </p>
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={() => void onExportArchive(pending)}
              >
                Konfliktarchiv herunterladen
              </button>
            </div>
          ))}
        </section>
      )}
    </>
  )
}
