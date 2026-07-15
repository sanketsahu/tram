/**
 * The tram mark — SINGLE SOURCE OF TRUTH.
 *
 * `LOGO_SVG` is the canonical markup. Everything else is derived from it:
 *   - the header logo renders <Logo /> (this component)
 *   - the favicon (app/icon.svg) is written from LOGO_SVG by scripts/generate-assets.mjs
 *   - the OG image embeds LOGO_SVG and is screenshotted by the same script
 *
 * The mark is three stacked, rounded bars (widest at the base) — the layered cache:
 * one shared vendor base, thin app layers on top. Brand blue.
 */
export const LOGO_SVG = `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="4" y="20" width="24" height="6" rx="3" fill="#2563eb"/>
  <rect x="8" y="12" width="16" height="6" rx="3" fill="#3b82f6"/>
  <rect x="11" y="4" width="10" height="6" rx="3" fill="#60a5fa"/>
</svg>`

export function Logo({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <span
      className={className}
      style={{ display: 'inline-flex', width: size, height: size }}
      aria-hidden
      dangerouslySetInnerHTML={{ __html: LOGO_SVG.replace('width="32" height="32"', `width="${size}" height="${size}"`) }}
    />
  )
}
