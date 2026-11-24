export interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform?: string }>
}

type InstallPromptListener = (event: InstallPromptEvent) => void

let pendingInstallPrompt: InstallPromptEvent | null = null
const listeners = new Set<InstallPromptListener>()

export function captureInstallPrompt(event: Event): void {
  event.preventDefault()
  pendingInstallPrompt = event as InstallPromptEvent
  for (const listener of listeners) listener(pendingInstallPrompt)
}

export function subscribeToInstallPrompt(listener: InstallPromptListener): () => void {
  listeners.add(listener)
  if (pendingInstallPrompt) listener(pendingInstallPrompt)
  return () => listeners.delete(listener)
}

export function clearInstallPrompt(): void {
  pendingInstallPrompt = null
}
