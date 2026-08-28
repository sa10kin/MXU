import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  FolderOpen,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Save,
  Shield,
  Upload,
  X,
} from 'lucide-react';

import { getInterfaceLangKey } from '@/i18n';
import { useAppStore } from '@/stores/appStore';
import type { OptionValue } from '@/types/interface';
import { ConfirmDialog } from '@/components/ConfirmDialog';

import {
  atlasServerFromFgoClient,
  CHINESE_ATLAS_SERVERS,
  getBasicServants,
} from '../atlas/atlasService';
import {
  battlePlanWarnings,
  emptyBattlePlan,
  parseBattlePlan,
  serializeBattlePlan,
  validateBattlePlan,
  type BattlePlan,
} from './battlePlan';
import { latestBattleProgress, type RecoveryItem } from './loopPolicy';
import { describeAutoBattleErrors } from './autoBattleStatus';
import {
  battlePresetMatches,
  battlePresetSetup,
  loadBattlePresets,
  parseBattlePreset,
  saveBattlePresets,
  serializeBattlePreset,
  upsertBattlePreset,
  type BattlePreset,
} from './battlePresets';
import { BattleEditor, PartyPreview } from './BattleEditor';
import { PartyEditor } from './PartyEditor';
import { SupportEditor } from './SupportEditor';
import { mergeSupportServants } from './supportSearch';
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
  teamName: '',
  teamSource: '',
  teamBaseline: '',
  repeatCount: '1',
  recoveryItem: 'none',
  allowOtherFruits: 'false',
  drainRemainingAp: 'false',
  adjustBattleSettings: 'false',
  ignoreBondOverflow: 'false',
};

/** pipeline_type int 的输入落盘后是数字，数字 0 是 falsy，不能用 || 回退默认值 */
function asDraftString(raw: string | number | undefined, fallback: string): string {
  if (raw == null || raw === '') return fallback;
  return String(raw);
}

function inputValues(value: OptionValue | undefined): Record<string, string> {
  if (value?.type !== 'input') return DEFAULT_VALUES;
  return {
    json: value.values.json || DEFAULT_VALUES.json,
    support: value.values.support || DEFAULT_VALUES.support,
    teamName: asDraftString(value.values.teamName, DEFAULT_VALUES.teamName),
    teamSource: asDraftString(value.values.teamSource, DEFAULT_VALUES.teamSource),
    teamBaseline: asDraftString(value.values.teamBaseline, DEFAULT_VALUES.teamBaseline),
    repeatCount: asDraftString(value.values.repeatCount, DEFAULT_VALUES.repeatCount),
    recoveryItem: value.values.recoveryItem || DEFAULT_VALUES.recoveryItem,
    allowOtherFruits: asDraftString(value.values.allowOtherFruits, DEFAULT_VALUES.allowOtherFruits),
    drainRemainingAp: asDraftString(value.values.drainRemainingAp, DEFAULT_VALUES.drainRemainingAp),
    adjustBattleSettings: asDraftString(
      value.values.adjustBattleSettings,
      DEFAULT_VALUES.adjustBattleSettings,
    ),
    ignoreBondOverflow: asDraftString(
      value.values.ignoreBondOverflow,
      DEFAULT_VALUES.ignoreBondOverflow,
    ),
  };
}

export function getAutoBattleSummary(value: OptionValue | undefined) {
  const values = inputValues(value);
  try {
    return {
      name: values.teamName || parseBattlePlan(values.json).name,
      repeatCount: values.repeatCount,
      recoveryItem: values.recoveryItem as RecoveryItem,
    };
  } catch {
    return { name: '', repeatCount: values.repeatCount, recoveryItem: 'none' as RecoveryItem };
  }
}

export function validateAutoBattleOption(value: OptionValue | undefined): string[] {
  const values = inputValues(value);
  try {
    const plan = parseBattlePlan(values.json);
    const policy = parseSupportPolicy(values.support);
    const repeatCount = Number(values.repeatCount);
    return [
      ...validateBattlePlan(plan),
      ...(Number.isInteger(repeatCount) && repeatCount >= 1 && repeatCount <= 999
        ? []
        : ['loop.repeatCount']),
      ...supportErrorsForParty(plan.party, validateSupportPolicy(policy)).map(
        (error) => `support.${error}`,
      ),
    ];
  } catch {
    return ['json'];
  }
}

export function AutoBattleEditor({
  instanceId,
  taskId,
  value,
  disabled,
  loopDisabled = disabled,
}: {
  instanceId: string;
  taskId: string;
  value: OptionValue | undefined;
  disabled: boolean;
  loopDisabled?: boolean;
}) {
  const {
    instanceLogs,
    instances,
    language,
    projectInterface,
    resolveI18nText,
    selectedResource,
    setTaskOptionValue,
  } = useAppStore();
  const [tab, setTab] = useState<Tab>('basic');
  const [servantNames, setServantNames] = useState(new Map<number, string>());
  const [presets, setPresets] = useState(loadBattlePresets);
  const [presetName, setPresetName] = useState('');
  const [presetMessage, setPresetMessage] = useState('');
  const [showTeamChooser, setShowTeamChooser] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showSaveChangesConfirm, setShowSaveChangesConfirm] = useState(false);
  const [saveMode, setSaveMode] = useState<'new' | 'copy' | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const moreMenuRef = useRef<HTMLDetailsElement>(null);
  const values = inputValues(value);
  const langKey = getInterfaceLangKey(language);
  const resourceName =
    selectedResource[instanceId] ||
    instances.find((instance) => instance.id === instanceId)?.resourceName ||
    projectInterface?.resource[0]?.name;
  const scopeServer = atlasServerFromFgoClient(resourceName?.split('_').pop());
  const displayServer = langKey === 'zh_tw' ? 'TW' : 'CN';
  const text = (key: string) => resolveI18nText(`$auto_battle.editor.${key}`, langKey);

  const parsed = useMemo(() => {
    try {
      const plan = parseBattlePlan(values.json);
      return {
        plan,
        errors: validateBattlePlan(plan),
        parseError: false,
      };
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
  const baseline = useMemo(() => {
    try {
      return parseBattlePreset(values.teamBaseline);
    } catch {
      return null;
    }
  }, [values.teamBaseline]);
  useEffect(() => {
    let active = true;
    void Promise.all(
      CHINESE_ATLAS_SERVERS.map(
        async (server) => [server, await getBasicServants(server)] as const,
      ),
    )
      .then((entries) => {
        if (active) {
          const servants = mergeSupportServants(
            Object.fromEntries(entries),
            scopeServer,
            displayServer,
          );
          setServantNames(new Map(servants.map(({ servant }) => [servant.id ?? 0, servant.name])));
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [displayServer, scopeServer]);
  useEffect(() => {
    const closeMenu = (event: PointerEvent) => {
      if (!moreMenuRef.current?.contains(event.target as Node)) {
        moreMenuRef.current?.removeAttribute('open');
      }
    };
    document.addEventListener('pointerdown', closeMenu);
    return () => document.removeEventListener('pointerdown', closeMenu);
  }, []);
  useEffect(() => {
    if (!showTeamChooser) return;
    const closeChooser = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowTeamChooser(false);
    };
    document.addEventListener('keydown', closeChooser);
    return () => document.removeEventListener('keydown', closeChooser);
  }, [showTeamChooser]);
  const repeatCountNumber = Number(values.repeatCount);
  const repeatCountValid =
    Number.isInteger(repeatCountNumber) && repeatCountNumber >= 1 && repeatCountNumber <= 999;
  const errors = validateAutoBattleOption(value);
  const setupErrors = [
    ...parsed.errors,
    ...supportErrorsForParty(parsed.plan.party, supportParsed.errors),
  ];
  const readableErrors = describeAutoBattleErrors(errors, parsed.plan, text);
  const presetModified = baseline
    ? !battlePresetMatches(baseline, parsed.plan, supportParsed.policy)
    : false;
  const emptySetup = battlePresetSetup(null);
  const hasCurrentSetup =
    serializeBattlePlan(parsed.plan) !== serializeBattlePlan(emptySetup.plan) ||
    serializeSupportPolicy(supportParsed.policy) !==
      serializeSupportPolicy(emptySetup.supportPolicy);
  const presetNameTaken = presets.some(({ name }) => name === presetName.trim());
  const teamName =
    values.teamName || baseline?.name || parsed.plan.name || text('preset.unsaved_name');
  const allowOtherFruits = values.allowOtherFruits === 'true';
  const drainRemainingAp = values.drainRemainingAp === 'true';
  const adjustBattleSettings = values.adjustBattleSettings === 'true';
  const ignoreBondOverflow = values.ignoreBondOverflow === 'true';
  const loggedProgress = latestBattleProgress(
    (instanceLogs[instanceId] ?? []).map(({ message }) => message),
    parsed.plan.name,
  );
  const completedBattles = loggedProgress?.target === repeatCountNumber ? loggedProgress.done : 0;
  const warnings = battlePlanWarnings(parsed.plan).map((warning) => {
    if (warning.type === 'masterSkill') {
      return text('status.warning_master').replace('{skill}', String(warning.skill));
    }
    const member = parsed.plan.party.find(({ slot }) => slot === warning.servant);
    const servantId = member?.support ? supportParsed.policy.servantId : member?.servantId;
    const name = servantNames.get(servantId ?? 0) ?? (servantId ? `#${servantId}` : '—');
    const target = warning.target
      ? text('status.warning_target').replace('{target}', String(warning.target))
      : '';
    return text('status.warning_servant')
      .replace('{slot}', String(warning.servant))
      .replace('{name}', name)
      .replace('{skill}', String(warning.skill))
      .replace('{target}', target);
  });

  const commitValues = (next: Record<string, string>) =>
    setTaskOptionValue(instanceId, taskId, PAPERMOON_BATTLE_PLAN_OPTION, {
      type: 'input',
      values: { ...values, ...next },
    });
  const commitPlan = (plan: BattlePlan) =>
    commitValues({
      json: serializeBattlePlan({ ...plan, name: values.teamName || plan.name }),
      teamSource: values.teamSource || 'new',
    });
  const commitSupport = (policy: SupportPolicy) =>
    commitValues({ support: serializeSupportPolicy(policy) });
  const commitSetup = (
    plan: BattlePlan,
    policy: SupportPolicy,
    metadata: Record<string, string> = {},
  ) =>
    commitValues({
      json: serializeBattlePlan(plan),
      support: serializeSupportPolicy(policy),
      ...metadata,
    });

  const applyPreset = (preset: BattlePreset, source = 'preset'): boolean => {
    if (
      preset !== baseline &&
      (presetModified || (!baseline && hasCurrentSetup)) &&
      !window.confirm(text('preset.replace_confirm'))
    ) {
      return false;
    }
    const policy = preset.supportPolicy ?? emptySupportPolicy();
    const namedPreset = { ...preset, plan: { ...preset.plan, name: preset.name } };
    if (
      validateBattlePlan(namedPreset.plan).length > 0 ||
      supportErrorsForParty(namedPreset.plan.party, validateSupportPolicy(policy)).length > 0
    ) {
      setPresetMessage('invalid');
      return false;
    }
    const snapshot = { ...namedPreset, supportPolicy: policy };
    const setup = battlePresetSetup(snapshot);
    commitSetup(setup.plan, setup.supportPolicy, {
      teamName: snapshot.name,
      teamSource: source,
      teamBaseline: serializeBattlePreset(snapshot),
    });
    setPresetName('');
    setPresetMessage('applied');
    setShowTeamChooser(false);
    return true;
  };

  const savePreset = (overwrite = false) => {
    const name = overwrite && baseline ? baseline.name : presetName.trim();
    if (!name || (!overwrite && presetNameTaken) || setupErrors.length > 0) return;
    const plan = { ...parsed.plan, name };
    const next = upsertBattlePreset(presets, name, plan, supportParsed.policy);
    const saved = next.find((preset) => preset.name === name) ?? null;
    if (!saved) return;
    saveBattlePresets(next);
    setPresets(next);
    commitSetup(plan, supportParsed.policy, {
      teamName: name,
      teamSource: 'preset',
      teamBaseline: serializeBattlePreset(saved),
    });
    setSaveMode(null);
    setPresetName('');
    setPresetMessage('saved');
  };

  const clearCurrent = () => {
    const setup = battlePresetSetup(null);
    commitSetup(setup.plan, setup.supportPolicy, {
      teamName: '',
      teamSource: '',
      teamBaseline: '',
    });
    setShowClearConfirm(false);
    setPresetName('');
    setPresetMessage('cleared');
  };

  const restoreBaseline = () => {
    if (baseline) applyPreset(baseline, values.teamSource || 'preset');
  };

  const importPreset = async (file: File | undefined) => {
    if (!file) return;
    try {
      const value = JSON.parse(await file.text()) as {
        name?: unknown;
        plan?: unknown;
        supportPolicy?: unknown;
      };
      if (!value.plan) throw new Error('missing plan');
      const plan = parseBattlePlan(JSON.stringify(value.plan));
      const policy = value.supportPolicy
        ? parseSupportPolicy(JSON.stringify(value.supportPolicy))
        : emptySupportPolicy();
      const imported: BattlePreset = {
        id: '',
        name: typeof value.name === 'string' ? value.name : plan.name,
        updatedAt: '',
        plan,
        supportPolicy: policy,
      };
      if (applyPreset(imported, 'import')) {
        setPresetMessage('imported');
      }
    } catch {
      setPresetMessage('import_failed');
    } finally {
      if (importRef.current) importRef.current.value = '';
    }
  };

  const startNewTeam = () => {
    if (hasCurrentSetup && !window.confirm(text('preset.replace_confirm'))) return;
    const setup = battlePresetSetup(null);
    commitSetup(setup.plan, setup.supportPolicy, {
      teamName: '',
      teamSource: 'new',
      teamBaseline: '',
    });
    setShowTeamChooser(false);
    setPresetMessage('');
  };
  const closeMoreMenu = () => moreMenuRef.current?.removeAttribute('open');

  const tabs: { key: Tab; label: string }[] = [
    { key: 'basic', label: text('tab.basic') },
    { key: 'support', label: text('tab.support') },
    { key: 'party', label: text('tab.party') },
    { key: 'battle', label: text('tab.battle') },
  ];

  return (
    <div className="space-y-4">
      <section className="overflow-visible rounded-xl border border-accent/20 bg-gradient-to-r from-accent/5 via-bg-secondary to-bg-secondary p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <Shield className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-text-muted">{text('preset.current')}</p>
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="truncate font-medium text-text-primary">{teamName}</h4>
                {baseline && presetModified && (
                  <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning">
                    {text('preset.modified_badge')}
                  </span>
                )}
                {values.teamSource === 'import' && !presetModified && (
                  <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">
                    {text('preset.imported_badge')}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={disabled}
              onClick={() => setShowTeamChooser((shown) => !shown)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-secondary hover:bg-bg-hover disabled:opacity-40"
            >
              <FolderOpen className="h-4 w-4" />
              {text(hasCurrentSetup || values.teamSource ? 'preset.change' : 'preset.choose')}
            </button>
            {!baseline && !hasCurrentSetup && values.teamSource !== 'new' && (
              <button
                type="button"
                disabled={disabled}
                onClick={startNewTeam}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                <Plus className="h-4 w-4" /> {text('preset.new')}
              </button>
            )}
            {baseline && presetModified && values.teamSource === 'preset' ? (
              <button
                type="button"
                disabled={disabled || setupErrors.length > 0}
                onClick={() => setShowSaveChangesConfirm(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                <Save className="h-4 w-4" /> {text('preset.save_changes')}
              </button>
            ) : (!baseline && (hasCurrentSetup || values.teamSource === 'new')) ||
              values.teamSource === 'import' ? (
              <button
                type="button"
                disabled={disabled || setupErrors.length > 0}
                onClick={() => setSaveMode('new')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                <Save className="h-4 w-4" /> {text('preset.save')}
              </button>
            ) : null}
            <details ref={moreMenuRef} className="relative">
              <summary className="flex cursor-pointer list-none items-center rounded-lg border border-border bg-bg-primary p-2 text-text-secondary hover:bg-bg-hover">
                <MoreHorizontal className="h-5 w-5" />
                <span className="sr-only">{text('preset.more')}</span>
              </summary>
              <div className="absolute right-0 z-20 mt-2 w-48 space-y-1 rounded-lg border border-border bg-bg-primary p-1.5 shadow-xl">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    closeMoreMenu();
                    importRef.current?.click();
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-text-secondary hover:bg-bg-hover disabled:opacity-40"
                >
                  <Upload className="h-4 w-4" /> {text('preset.import')}
                </button>
                {(hasCurrentSetup || values.teamSource === 'new') && (
                  <button
                    type="button"
                    disabled={disabled || setupErrors.length > 0}
                    onClick={() => {
                      closeMoreMenu();
                      setSaveMode('copy');
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-text-secondary hover:bg-bg-hover disabled:opacity-40"
                  >
                    <Save className="h-4 w-4" /> {text('preset.save_as')}
                  </button>
                )}
                {baseline && presetModified && (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      closeMoreMenu();
                      restoreBaseline();
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-text-secondary hover:bg-bg-hover disabled:opacity-40"
                  >
                    <RotateCcw className="h-4 w-4" /> {text('preset.restore')}
                  </button>
                )}
                {hasCurrentSetup && (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      closeMoreMenu();
                      setShowClearConfirm(true);
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-error hover:bg-error/10 disabled:opacity-40"
                  >
                    <RotateCcw className="h-4 w-4" /> {text('preset.clear')}
                  </button>
                )}
              </div>
            </details>
          </div>
        </div>

        <div className="mt-3 border-t border-border/70 pt-3">
          <PartyPreview
            plan={parsed.plan}
            supportPolicy={supportParsed.policy}
            servantNames={servantNames}
            text={text}
          />
        </div>

        <input
          ref={importRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => void importPreset(event.target.files?.[0])}
        />
        {presetMessage && !['applied', 'invalid'].includes(presetMessage) && (
          <p
            className={`mt-3 text-xs ${presetMessage === 'import_failed' ? 'text-warning' : 'text-success'}`}
          >
            {text(`preset.${presetMessage}`)}
          </p>
        )}
      </section>

      {showTeamChooser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowTeamChooser(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="team-chooser-title"
            className="flex max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-bg-secondary shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div>
                <h3 id="team-chooser-title" className="font-semibold text-text-primary">
                  {text('preset.choose_title')}
                </h3>
                <p className="mt-1 text-xs text-text-muted">{text('preset.choose_hint')}</p>
              </div>
              <button
                type="button"
                autoFocus
                onClick={() => setShowTeamChooser(false)}
                className="rounded-lg p-2 text-text-muted hover:bg-bg-hover hover:text-text-primary"
                aria-label={text('preset.cancel')}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {presets.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {presets.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => applyPreset(preset)}
                      className={`rounded-lg border bg-bg-primary p-4 text-left transition-colors hover:border-accent/40 hover:bg-bg-hover ${
                        baseline?.id === preset.id
                          ? 'border-accent ring-1 ring-accent/20'
                          : 'border-border'
                      }`}
                    >
                      <span className="block truncate text-sm font-medium text-text-primary">
                        {preset.name}
                      </span>
                      <span className="mt-1 block text-xs text-text-muted">
                        {text('preset.summary')
                          .replace('{party}', String(preset.plan.party.length))
                          .replace('{waves}', String(preset.plan.waves.length))}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-text-muted">
                  {text('preset.empty')}
                </p>
              )}
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-border bg-bg-tertiary/30 px-5 py-4">
              <button
                type="button"
                onClick={() => importRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-text-secondary hover:bg-bg-hover"
              >
                <Upload className="h-4 w-4" /> {text('preset.import')}
              </button>
              <button
                type="button"
                onClick={startNewTeam}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-text-secondary hover:bg-bg-hover"
              >
                <Plus className="h-4 w-4" /> {text('preset.new')}
              </button>
            </div>
          </div>
        </div>
      )}

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
        <section className="space-y-3 rounded-xl border border-border bg-bg-secondary p-4">
          <h4 className="font-medium text-text-primary">{text('section.loop')}</h4>
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
          <label className="block space-y-1 text-sm text-text-secondary">
            <span>{text('field.repeat_count')}</span>
            <input
              type="number"
              min={1}
              max={999}
              value={values.repeatCount}
              disabled={loopDisabled}
              onChange={(event) => commitValues({ repeatCount: event.target.value })}
              aria-invalid={!repeatCountValid}
              className={`w-full rounded-lg border bg-bg-primary px-3 py-2 text-text-primary ${
                repeatCountValid ? 'border-border' : 'border-warning'
              }`}
            />
            {repeatCountValid && (
              <span className="block text-xs text-text-muted">
                {text('hint.completed_battles')
                  .replace('{done}', String(completedBattles))
                  .replace('{total}', String(repeatCountNumber))}
              </span>
            )}
          </label>
          <label className="flex items-start gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={adjustBattleSettings}
              disabled={disabled}
              onChange={(event) =>
                commitValues({ adjustBattleSettings: String(event.target.checked) })
              }
              className="mt-0.5 h-4 w-4 accent-accent"
            />
            <span>
              {text('field.adjust_battle_settings')}
              <small className="block text-xs text-text-muted">
                {text('hint.adjust_battle_settings')}
              </small>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={ignoreBondOverflow}
              disabled={loopDisabled}
              onChange={(event) =>
                commitValues({ ignoreBondOverflow: String(event.target.checked) })
              }
              className="mt-0.5 h-4 w-4 accent-accent"
            />
            <span>
              {text('field.ignore_bond_overflow')}
              <small className="block text-xs text-text-muted">
                {text('hint.ignore_bond_overflow')}
              </small>
            </span>
          </label>
          <label className="block space-y-1 text-sm text-text-secondary">
            <span>{text('field.recovery_item')}</span>
            <select
              value={values.recoveryItem}
              disabled={loopDisabled}
              onChange={(event) =>
                commitValues(
                  event.target.value === 'none'
                    ? {
                        recoveryItem: 'none',
                        allowOtherFruits: 'false',
                      }
                    : { recoveryItem: event.target.value },
                )
              }
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
            <>
              <label className="flex items-start gap-2 text-sm text-text-secondary">
                <input
                  type="checkbox"
                  checked={allowOtherFruits}
                  disabled={loopDisabled}
                  onChange={(event) =>
                    commitValues({ allowOtherFruits: String(event.target.checked) })
                  }
                  className="mt-0.5 h-4 w-4 accent-accent"
                />
                <span>
                  <span className="inline-flex items-center gap-2">
                    {text('field.allow_other_fruits')}
                    <span
                      title={text('hint.other_fruits_beta')}
                      className="inline-flex rounded-full border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-[10px] font-semibold leading-none tracking-wide text-warning"
                    >
                      BETA
                    </span>
                  </span>
                  <small className="block text-xs text-text-muted">
                    {text('hint.other_fruits_order')}
                  </small>
                </span>
              </label>
              <p className="text-xs text-text-muted">
                {allowOtherFruits
                  ? text('hint.recovery_fallback_limit')
                  : text('hint.recovery_limit')}
              </p>
            </>
          )}
          <label className="flex items-start gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={drainRemainingAp}
              disabled={loopDisabled}
              onChange={(event) => commitValues({ drainRemainingAp: String(event.target.checked) })}
              className="mt-0.5 h-4 w-4 accent-accent"
            />
            <span>
              {text('field.drain_remaining_ap')}
              <small className="block text-xs text-text-muted">
                {text('hint.drain_remaining_ap')}
              </small>
            </span>
          </label>
        </section>
      ) : tab === 'support' ? (
        <SupportEditor
          scopeServer={scopeServer}
          displayServer={displayServer}
          policy={supportParsed.policy}
          disabled={disabled}
          text={text}
          onChange={commitSupport}
        />
      ) : tab === 'party' ? (
        <PartyEditor
          scopeServer={scopeServer}
          displayServer={displayServer}
          plan={parsed.plan}
          supportPolicy={supportParsed.policy}
          disabled={disabled}
          text={text}
          onChange={commitPlan}
        />
      ) : (
        <BattleEditor
          scopeServer={scopeServer}
          displayServer={displayServer}
          plan={parsed.plan}
          supportPolicy={supportParsed.policy}
          disabled={disabled}
          text={text}
          onChange={commitPlan}
        />
      )}

      <div
        className={`rounded-lg border p-3 text-xs ${
          errors.length === 0
            ? 'border-success/20 bg-success/5 text-success'
            : 'border-warning/20 bg-warning/5 text-warning'
        }`}
      >
        <div className="flex items-center gap-2 font-medium">
          {errors.length === 0 ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          <span>
            {errors.length === 0
              ? text('status.valid')
              : text('status.incomplete').replace('{count}', String(readableErrors.length))}
          </span>
        </div>
        {readableErrors.length > 0 && (
          <ul className="mt-2 list-disc space-y-1 pl-6 text-text-secondary">
            {readableErrors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        )}
      </div>
      {warnings.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-warning">
          <AlertCircle className="h-4 w-4" />
          <span>{warnings.join('；')}</span>
        </div>
      )}
      <ConfirmDialog
        open={showClearConfirm}
        title={text('preset.clear')}
        message={text('preset.clear_confirm')}
        confirmText={text('preset.clear')}
        cancelText={text('preset.cancel')}
        destructive
        onConfirm={clearCurrent}
        onCancel={() => setShowClearConfirm(false)}
      />
      <ConfirmDialog
        open={showSaveChangesConfirm}
        title={text('preset.save_changes')}
        message={text('preset.save_changes_confirm')}
        confirmText={text('preset.overwrite')}
        secondaryConfirmText={text('preset.save_as')}
        cancelText={text('preset.cancel')}
        onConfirm={() => {
          setShowSaveChangesConfirm(false);
          savePreset(true);
        }}
        onSecondaryConfirm={() => {
          setShowSaveChangesConfirm(false);
          setSaveMode('copy');
        }}
        onCancel={() => setShowSaveChangesConfirm(false)}
      />
      <ConfirmDialog
        open={saveMode !== null}
        title={text(saveMode === 'copy' ? 'preset.save_as' : 'preset.save')}
        message={text('preset.save_hint')}
        confirmText={text('preset.confirm_save')}
        cancelText={text('preset.cancel')}
        confirmDisabled={!presetName.trim() || presetNameTaken || setupErrors.length > 0}
        onConfirm={() => savePreset(false)}
        onCancel={() => {
          setSaveMode(null);
          setPresetName('');
        }}
      >
        <label className="block space-y-2 text-sm text-text-secondary">
          <span>{text('preset.name')}</span>
          <input
            autoFocus
            value={presetName}
            onChange={(event) => setPresetName(event.target.value)}
            className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-text-primary"
          />
          {presetNameTaken && (
            <span className="block text-xs text-warning">{text('preset.name_taken')}</span>
          )}
        </label>
      </ConfirmDialog>
    </div>
  );
}
