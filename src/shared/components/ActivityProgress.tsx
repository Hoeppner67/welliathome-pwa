export function ActivityProgress({ label }: { label: string }) {
  return <progress className="activity-progress" aria-label={label} />
}
