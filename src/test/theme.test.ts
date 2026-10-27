import { describe, expect, it } from 'vitest'
import { parseStoredPreference, resolveTheme } from '@/context/ThemeContext'
import { inkOn } from '@/components/viz/activityScale'

describe('theme resolution', () => {
  it('honours explicit preferences regardless of the OS setting', () => {
    expect(resolveTheme('light', false)).toBe('light')
    expect(resolveTheme('dark', true)).toBe('dark')
  })

  it('follows the OS for "system"', () => {
    expect(resolveTheme('system', true)).toBe('light')
    expect(resolveTheme('system', false)).toBe('dark')
  })

  it('falls back to "system" for missing or corrupt stored values', () => {
    expect(parseStoredPreference(null)).toBe('system')
    expect(parseStoredPreference('purple')).toBe('system')
    expect(parseStoredPreference('light')).toBe('light')
  })
})

describe('legible ink on BAI fills', () => {
  it('uses dark ink on the bright end of the dark palette and light ink on the dark end of the light palette', () => {
    expect(inkOn('extreme', 'dark')).toBe('#111111')
    expect(inkOn('low', 'dark')).toBe('#ffffff')
    expect(inkOn('extreme', 'light')).toBe('#ffffff')
    expect(inkOn('low', 'light')).toBe('#111111')
  })
})
