/**
 * The jetplane mark — SINGLE SOURCE OF TRUTH.
 *
 * `LOGO_SVG` is the canonical markup. Everything else is derived from it:
 *   - the header logo renders <Logo /> (this component)
 *   - the favicon (app/icon.svg) is written from LOGO_SVG by scripts/generate-assets.mjs
 *   - the OG image embeds LOGO_SVG and is screenshotted by the same script
 *
 * A two-tone paper plane (origami dart), brand blue — fast, light, in flight.
 */
export const LOGO_SVG = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M22 2 15 22 11 13Z" fill="#2563eb"/>
  <path d="M22 2 11 13 2 9Z" fill="#60a5fa"/>
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
