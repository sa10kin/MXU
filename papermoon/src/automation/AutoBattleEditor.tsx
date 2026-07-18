import { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

import { getInterfaceLangKey } from '@/i18n';
import { useAppStore } from '@/stores/appStore';
import type { OptionValue } from '@/types/interface';

import {
  emptyBattlePlan,
  parseBattlePlan,
  serializeBattlePlan,
  validateBattlePlan,
  type BattlePlan,
} from './battlePlan';
import { recoveryFruitQuantity, type RecoveryItem } from './loopPolicy';
import { BattleEditor } from './BattleEditor';
import { PartyEditor } from './PartyEditor';
import { SupportEditor } from './SupportEditor';
import {
  emptySupportPolicy,
  parseSupportPolicy,
  serializeSupportPolicy,
  supportErrorsForParty,
  validateSupportPolicy,
  type SupportPolicy,
} from './supportPolicy';

export const PAPERMOON_AUTO_BATTLE_TASK = 'auto_battle';
export const PAPERMOON_BATTLE_PLAN_OPTION = 'battle_plan';

type Tab = 'basic' | 'support' | 'party' | 'battle';
const DEFAULT_VALUES = {
  json: serializeBattlePlan(emptyBattlePlan()),
  support: serializeSupportPolicy(emptySupportPolicy()),
  repeatCount: '1',
  recoveryItem: 'none',
};

function inputValues(value: OptionValue | undefined): Record<string, string> {
  if (value?.type !== 'input') return DEFAULT_VALUES;
  return {
    json: value.values.json || DEFAULT_VALUES.json,
    support: value.values.support || DEFAULT_VALUES.support,
    repeatCount: value.values.repeatCount || DEFAULT_VALUES.repeatCount,
    recoveryItem: value.values.recoveryItem || DEFAULT_VALUES.recoveryItem,
  };
}

export function getAutoBattleSummary(value: OptionValue | undefined) {
  const values = inputValues(value);
  try {
    return {
      name: parseBattlePlan(values.json).name,
      repeatCount: values.repeatCount,
      recoveryItem: values.recoveryItem as RecoveryItem,
    };
  } catch {
    return { name: '', repeatCount: values.repeatCount, recoveryItem: 'none' as RecoveryItem };
  }
}

export function AutoBattleEditor({
  instanceId,
  taskId,
  value,
  disabled,
}: {
  instanceId: string;
  taskId: string;
  value: OptionValue | undefined;
  disabled: boolean;
}) {
  const { language, resolveI18nText, setTaskOptionValue } = useAppStore();
  const [tab, setTab] = useState<Tab>('basic');
  const values = inputValues(value);
  const langKey = getInterfaceLangKey(language);
  const text = (key: string) => resolveI18nText(`$auto_battle.editor.${key}`, langKey);

  const parsed = useMemo(() => {
    try {
      const plan = parseBattlePlan(values.json);
      return { plan, errors: validateBattlePlan(plan), parseError: false };
    } catch {
      return { plan: emptyBattlePlan(), errors: ['json'], parseError: true };
    }
  }, [values.json]);
  const supportParsed = useMemo(() => {
    try {
      const policy = parseSupportPolicy(values.support);
      return { policy, errors: validateSupportPolicy(policy) };
    } catch {
      return { policy: emptySupportPolicy(), errors: ['json'] };
    }
  }, [values.support]);
  const errors = [
    ...parsed.errors,
    ...supportErrorsForParty(parsed.plan.party, supportParsed.errors).map(
      (error) => `support.${error}`,
    ),
  ];
  const fruitQuantity = recoveryFruitQuantity(values.recoveryItem as RecoveryItem);
  const maxFruitQuantity = Math.max(0, Number(values.repeatCount) || 0) * fruitQuantity;

  const commitValues = (next: Record<string, string>) =>
    setTaskOptionValue(instanceId, taskId, PAPERMOON_BATTLE_PLAN_OPTION, {
      type: 'input',
      values: { ...values, ...next },
    });
  const commitPlan = (plan: BattlePlan) => commitValues({ json: serializeBattlePlan(plan) });
  const commitSupport = (policy: SupportPolicy) =>
    commitValues({ support: serializeSupportPolicy(policy) });

  const tabs: { key: Tab; label: string }[] = [
    { key: 'basic', label: text('tab.basic') },
    { key: 'support', label: text('tab.support') },
    { key: 'party', label: text('tab.party') },
    { key: 'battle', label: text('tab.battle') },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4" role="tablist">
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            onClick={() => setTab(item.key)}
            className={`rounded-lg px-3 py-2 text-sm transition-colors ${
              tab === item.key
                ? 'bg-accent text-white'
                : 'bg-bg-secondary text-text-secondary hover:bg-bg-hover'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'basic' ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <section className="space-y-3 rounded-xl border border-border bg-bg-secondary p-4">
            <h4 className="font-medium text-text-primary">{text('section.task')}</h4>
            <label className="block space-y-1 text-sm text-text-secondary">
              <span>{text('field.name')}</span>
              <input
                value={parsed.plan.name}
                disabled={disabled}
                onChange={(event) => commitPlan({ ...parsed.plan, name: event.target.value })}
                className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-text-primary"
              />
            </label>
            <label className="block space-y-1 text-sm text-text-secondary">
              <span>{text('field.max_turns')}</span>
              <input
                type="number"
                min={1}
                max={100}
                value={parsed.plan.maxTurns}
                disabled={disabled}
                onChange={(event) =>
                  commitPlan({ ...parsed.plan, maxTurns: Number(event.target.value) })
                }
                className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-text-primary"
              />
            </label>
          </section>

          <section className="space-y-3 rounded-xl border border-border bg-bg-secondary p-4">
            <h4 className="font-medium text-text-primary">{text('section.loop')}</h4>
            <label className="block space-y-1 text-sm text-text-secondary">
              <span>{text('field.repeat_count')}</span>
              <input
                type="number"
                min={1}
                value={values.repeatCount}
                disabled={disabled}
                onChange={(event) => commitValues({ repeatCount: event.target.value })}
                className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-text-primary"
              />
            </label>
            <label className="block space-y-1 text-sm text-text-secondary">
              <span>{text('field.recovery_item')}</span>
              <select
                value={values.recoveryItem}
                disabled={disabled}
                onChange={(event) => commitValues({ recoveryItem: event.target.value })}
                className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-text-primary"
              >
                {(['none', 'gold', 'silver', 'bronze', 'copper'] as RecoveryItem[]).map((item) => (
                  <option key={item} value={item}>
                    {text(`recovery.${item}`)}
                  </option>
                ))}
              </select>
            </label>
            {values.recoveryItem !== 'none' && (
              <p className="text-xs text-text-muted">
                {text('hint.recovery_limit')
                  .replace('{perRecovery}', String(fruitQuantity))
                  .replace('{battleCount}', values.repeatCount)
                  .replace('{maxTotal}', String(maxFruitQuantity))}
              </p>
            )}
          </section>
        </div>
      ) : tab === 'support' ? (
        <SupportEditor
          policy={supportParsed.policy}
          disabled={disabled}
          text={text}
          onChange={commitSupport}
        />
      ) : tab === 'party' ? (
        <PartyEditor
          plan={parsed.plan}
          supportPolicy={supportParsed.policy}
          disabled={disabled}
          text={text}
          onChange={commitPlan}
        />
      ) : (
        <BattleEditor
          plan={parsed.plan}
          supportPolicy={supportParsed.policy}
          disabled={disabled}
          text={text}
          onChange={commitPlan}
        />
      )}

      <div
        className={`flex items-center gap-2 text-xs ${
          errors.length === 0 ? 'text-success' : 'text-warning'
        }`}
      >
        {errors.length === 0 ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : (
          <AlertCircle className="h-4 w-4" />
        )}
        <span>
          {errors.length === 0
            ? text('status.valid')
            : `${text('status.incomplete')} ${errors.join(', ')}`}
        </span>
      </div>
    </div>
  );
}
