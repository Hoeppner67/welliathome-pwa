import { PWA_METADATA } from '../../features/pwa/pwaEnvironment'

export type LinkTarget = { href: string; external: boolean }

/** Uses the app's actual origin and manifest scope; native protocols remain native. */
export function classifyLink(
  value: string,
  base: string = globalThis.location?.href ?? 'https://app.welliathome.de/',
  scope: string = PWA_METADATA.scope,
): LinkTarget | undefined {
  const href = value.trim()
  if (!href) return undefined
  try {
    const url = new URL(href, base)
    if (url.protocol === 'mailto:' || url.protocol === 'tel:') return { href, external: false }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
    const app = new URL(base)
    const scopeUrl = new URL(scope, app.origin)
    const prefix = scopeUrl.pathname.endsWith('/') ? scopeUrl.pathname : `${scopeUrl.pathname}/`
    const inScope =
      url.origin === scopeUrl.origin &&
      (url.pathname === scopeUrl.pathname || url.pathname.startsWith(prefix))
    return { href, external: !inScope }
  } catch {
    return undefined
  }
}
