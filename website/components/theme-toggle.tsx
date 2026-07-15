'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Monitor, Moon, Sun } from 'lucide-react'

// Cycles system → light → dark → system. Default is system (set in layout).
const ORDER = ['system', 'light', 'dark'] as const
const ICON = { system: Monitor, light: Sun, dark: Moon }

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const current = (mounted ? theme : 'system') as keyof typeof ICON
  const Icon = ICON[current] ?? Monitor

  return (
    <button
      type="button"
      aria-label={`Theme: ${current}. Click to change.`}
      title={`Theme: ${current}`}
      onClick={() => {
        const i = ORDER.indexOf((current as (typeof ORDER)[number]) ?? 'system')
        setTheme(ORDER[(i + 1) % ORDER.length])
      }}
      className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
    >
      <Icon className="size-4" />
    </button>
  )
}
