/**
 * The jetplane mark — SINGLE SOURCE OF TRUTH.
 *
 * An Apple-style rounded-square badge: brand-blue base, white paper-plane glyph.
 * `LOGO_SVG` is canonical; the favicon (app/icon.svg), apple-icon, and OG image are all
 * derived from it by scripts/generate-assets.mjs.
 */
export const LOGO_SVG = `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="32" height="32" rx="7.5" fill="#2563eb"/>
  <path d="M25 7 3.5 14.5 12 17.5 25 7Z" fill="#ffffff"/>
  <path d="M25 7 12 17.5 15 26 25 7Z" fill="#ffffff" fill-opacity="0.82"/>
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
