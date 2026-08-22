import { Clock3, RotateCcw } from 'lucide-react';

import { getInterfaceLangKey } from '@/i18n';
import { useAppStore } from '@/stores/appStore';

export const BATTLE_CLICK_DELAY_OPTION = 'battle_click_delays';

export const BATTLE_CLICK_DELAY_DEFAULTS: Record<string, string> = {
  defaultPre: '150',
  defaultPost: '250',
  skillPre: '150',
  skillPost: '4000',
  quickPre: '150',
  quickPost: '800',
  attackPre: '150',
  attackPost: '2000',
  cardPre: '150',
  cardPost: '500',
};

const ROWS = [
  { key: 'default', pre: 'defaultPre', post: 'defaultPost' },
  { key: 'skill', pre: 'skillPre', post: 'skillPost' },
  { key: 'quick', pre: 'quickPre', post: 'quickPost' },
  { key: 'attack', pre: 'attackPre', post: 'attackPost' },
  { key: 'card', pre: 'cardPre', post: 'cardPost' },
] as const;

export function normalizeClickDelay(value: string, fallback: string): string {
  if (!value.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return String(Math.min(60000, Math.max(0, Math.round(parsed))));
}

export function BattleDelaySettingsSection() {
  const { globalOptionValues, language, projectInterface, resolveI18nText, setGlobalOptionValue } =
    useAppStore();
  if (projectInterface?.name !== 'PaperMoon') return null;

  const langKey = getInterfaceLangKey(language);
  const text = (key: string) => resolveI18nText(`$click_delay.${key}`, langKey);
  const option = globalOptionValues[BATTLE_CLICK_DELAY_OPTION];
  const values = option?.type === 'input' ? option.values : BATTLE_CLICK_DELAY_DEFAULTS;
  const commit = (name: string, value: string) =>
    setGlobalOptionValue(BATTLE_CLICK_DELAY_OPTION, {
      type: 'input',
      values: { ...BATTLE_CLICK_DELAY_DEFAULTS, ...values, [name]: value },
    });

  return (
    <section id="section-click-delays" className="scroll-mt-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 rounded-lg bg-accent/10 p-2 text-accent">
            <Clock3 className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">{text('title')}</h2>
            <p className="mt-1 text-sm text-text-secondary">{text('description')}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() =>
            setGlobalOptionValue(BATTLE_CLICK_DELAY_OPTION, {
              type: 'input',
              values: { ...BATTLE_CLICK_DELAY_DEFAULTS },
            })
          }
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text-secondary hover:bg-bg-hover"
        >
          <RotateCcw className="h-4 w-4" />
          {text('reset')}
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-bg-secondary">
        <div className="grid min-w-[30rem] grid-cols-[minmax(10rem,1fr)_8rem_8rem] gap-3 border-b border-border bg-bg-tertiary/40 px-4 py-2 text-xs font-medium text-text-muted">
          <span />
          <span>{text('before')}</span>
          <span>{text('after')}</span>
        </div>
        {ROWS.map((row) => (
          <div
            key={row.key}
            className="grid min-w-[30rem] grid-cols-[minmax(10rem,1fr)_8rem_8rem] items-center gap-3 border-b border-border/70 px-4 py-3 last:border-b-0"
          >
            <div className="min-w-0">
              <div className="text-sm font-medium text-text-primary">{text(row.key)}</div>
              <div className="truncate text-xs text-text-muted">{text(`${row.key}_hint`)}</div>
            </div>
            {[row.pre, row.post].map((name) => (
              <label key={name} className="relative block">
                <input
                  type="number"
                  min={0}
                  max={60000}
                  step={1}
                  value={values[name] ?? BATTLE_CLICK_DELAY_DEFAULTS[name]}
                  onChange={(event) => {
                    if (/^\d{0,5}$/.test(event.target.value)) commit(name, event.target.value);
                  }}
                  onBlur={(event) =>
                    commit(
                      name,
                      normalizeClickDelay(event.target.value, BATTLE_CLICK_DELAY_DEFAULTS[name]),
                    )
                  }
                  aria-label={`${text(row.key)} ${text(name === row.pre ? 'before' : 'after')}`}
                  className="w-full rounded-lg border border-border bg-bg-primary py-2 pl-3 pr-12 text-sm tabular-nums text-text-primary focus:border-accent focus:outline-none"
                />
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-text-muted">
                  {text('milliseconds')}
                </span>
              </label>
            ))}
          </div>
        ))}
      </div>
      <p className="text-xs text-text-muted">{text('saved')}</p>
    </section>
  );
}
