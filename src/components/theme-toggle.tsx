'use client';

import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';

type Theme = 'light' | 'dark' | 'system';

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = theme === 'dark' || (theme === 'system' && prefersDark);
  root.classList.toggle('dark', dark);
  root.style.colorScheme = dark ? 'dark' : 'light';
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<Theme>('system');

  useEffect(() => {
    const stored = (localStorage.getItem('wd-theme') as Theme | null) ?? 'system';
    setTheme(stored);
    applyTheme(stored);
  }, []);

  const update = (next: Theme) => {
    setTheme(next);
    localStorage.setItem('wd-theme', next);
    applyTheme(next);
  };

  const options: { value: Theme; icon: typeof Sun; label: string }[] = [
    { value: 'light', icon: Sun, label: 'Light' },
    { value: 'dark', icon: Moon, label: 'Dark' },
    { value: 'system', icon: Monitor, label: 'System' },
  ];

  return (
    <div
      className={cn('inline-flex items-center gap-0.5 rounded-xl border p-0.5', compact && 'scale-95')}
      role="group"
      aria-label="Colour theme"
    >
      {options.map((option) => {
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => update(option.value)}
            aria-pressed={theme === option.value}
            title={option.label}
            className={cn(
              'rounded-lg p-1.5 transition',
              theme === option.value
                ? 'bg-brand-600 text-white'
                : 'muted hover:bg-[rgb(var(--surface-muted))]',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="sr-only">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Inline script that applies the stored theme before first paint. */
export const themeScript = `(function(){try{var t=localStorage.getItem('wd-theme')||'system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light';}catch(e){}})();`;
