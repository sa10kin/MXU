import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';

import {
  CHINESE_ATLAS_SERVERS,
  getBasicServants,
  readCachedBasicServantFace,
  type AtlasServer,
} from '../atlas/atlasService';
import type { BattleAction, BattlePlan, Turn } from './battlePlan';
import {
  addAction,
  addAttackCard,
  addTurn,
  addWave,
  formationBeforeAction,
  moveAction,
  removeAction,
  removeAttackCard,
  removeTurn,
  removeWave,
  updateAction,
  updateAttackCard,
  updateTurn,
  type DraftActionType,
} from './battleDraft';
import type { SupportPolicy } from './supportPolicy';
import { mergeSupportServants, type SupportServantOption } from './supportSearch';

export function BattleEditor({
  scopeServer,
  displayServer,
  plan,
  supportPolicy,
  disabled,
  text,
  onChange,
}: {
  scopeServer: AtlasServer;
  displayServer: AtlasServer;
  plan: BattlePlan;
  supportPolicy: SupportPolicy;
  disabled: boolean;
  text: (key: string) => string;
  onChange: (plan: BattlePlan) => void;
}) {
  const [waveIndex, setWaveIndex] = useState(0);
  const [turnIndex, setTurnIndex] = useState(0);
  const [actionIndex, setActionIndex] = useState(0);
  const [newAction, setNewAction] = useState<DraftActionType>('servantSkill');
  const [servants, setServants] = useState<SupportServantOption[]>([]);
  const wave = plan.waves[waveIndex];
  const turn = wave?.turns[turnIndex];

  useEffect(() => {
    let active = true;
    setServants([]);
    void Promise.allSettled(
      CHINESE_ATLAS_SERVERS.map(
        async (server) => [server, await getBasicServants(server)] as const,
      ),
    ).then((results) => {
      if (!active) return;
      const entries = results.flatMap((result) =>
        result.status === 'fulfilled' ? [result.value] : [],
      );
      setServants(mergeSupportServants(Object.fromEntries(entries), scopeServer, displayServer));
    });
    return () => {
      active = false;
    };
  }, [displayServer, scopeServer]);

  useEffect(() => {
    if (waveIndex >= plan.waves.length) setWaveIndex(Math.max(0, plan.waves.length - 1));
  }, [plan.waves.length, waveIndex]);
  useEffect(() => {
    if (turnIndex >= (wave?.turns.length ?? 0))
      setTurnIndex(Math.max(0, (wave?.turns.length ?? 1) - 1));
  }, [turnIndex, wave?.turns.length]);
  useEffect(() => {
    if (actionIndex >= (turn?.actions.length ?? 0)) {
      setActionIndex(Math.max(0, (turn?.actions.length ?? 1) - 1));
    }
  }, [actionIndex, turn?.actions.length]);

  const formation = useMemo(
    () => formationBeforeAction(plan, waveIndex, turnIndex, actionIndex),
    [actionIndex, plan, turnIndex, waveIndex],
  );
  const commitTurn = (next: Turn) => onChange(updateTurn(plan, waveIndex, turnIndex, next));

  return (
    <div className="@container space-y-4">
      <div className="grid gap-4 @min-[55rem]:grid-cols-[15rem_minmax(18rem,1fr)_minmax(20rem,1fr)]">
        <section className="space-y-3 rounded-xl border border-border bg-bg-secondary p-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="font-medium text-text-primary">{text('battle.timeline')}</h4>
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                onChange(addWave(plan));
                setWaveIndex(plan.waves.length);
                setTurnIndex(0);
                setActionIndex(0);
              }}
              className="rounded-md p-1.5 text-accent hover:bg-bg-hover disabled:opacity-50"
              title={text('battle.add_wave')}
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          {plan.waves.length === 0 ? (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange(addWave(plan))}
              className="w-full rounded-lg border border-dashed border-border p-4 text-sm text-accent"
            >
              {text('battle.add_first_wave')}
            </button>
          ) : (
            plan.waves.map((item, currentWave) => (
              <div key={currentWave} className="space-y-1">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setWaveIndex(currentWave);
                      setTurnIndex(0);
                      setActionIndex(0);
                    }}
                    className={`flex-1 rounded-lg px-3 py-2 text-left text-sm ${
                      waveIndex === currentWave
                        ? 'border border-accent/30 bg-accent-soft font-medium text-accent'
                        : 'bg-bg-primary text-text-secondary'
                    }`}
                  >
                    Wave {currentWave + 1}
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onChange(removeWave(plan, currentWave))}
                    className="rounded-md p-1.5 text-text-muted hover:text-error disabled:opacity-50"
                    title={text('battle.remove_wave')}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                {waveIndex === currentWave && (
                  <div className="ml-3 space-y-1 border-l border-border pl-2">
                    {item.turns.map((_, currentTurn) => (
                      <div key={currentTurn} className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setTurnIndex(currentTurn);
                            setActionIndex(0);
                          }}
                          className={`flex-1 rounded-md px-2 py-1.5 text-left text-xs ${
                            turnIndex === currentTurn
                              ? 'bg-accent font-medium text-white shadow-sm'
                              : 'text-text-secondary hover:bg-bg-hover'
                          }`}
                        >
                          Turn {currentTurn + 1}
                        </button>
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => onChange(removeTurn(plan, currentWave, currentTurn))}
                          className="p-1 text-text-muted hover:text-error disabled:opacity-50"
                          title={text('battle.remove_turn')}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        onChange(addTurn(plan, currentWave));
                        setTurnIndex(item.turns.length);
                        setActionIndex(0);
                      }}
                      className="flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-xs text-accent hover:bg-bg-hover disabled:opacity-50"
                    >
                      <Plus className="h-3 w-3" /> {text('battle.add_turn')}
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </section>

        <section className="space-y-3 rounded-xl border border-border bg-bg-secondary p-3">
          <h4 className="font-medium text-text-primary">{text('battle.actions')}</h4>
          {!turn ? (
            <p className="text-sm text-text-muted">{text('battle.select_turn')}</p>
          ) : (
            <>
              <div className="space-y-2">
                {turn.actions.map((action, index) => (
                  <button
                    key={`${action.type}-${index}`}
                    type="button"
                    onClick={() => setActionIndex(index)}
                    className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm ${
                      actionIndex === index
                        ? 'border-accent bg-accent-soft text-accent'
                        : 'border-border bg-bg-primary text-text-secondary'
                    }`}
                  >
                    <span className="w-5 text-xs text-text-muted">{index + 1}</span>
                    <span className="flex-1">{text(`battle.action.${action.type}`)}</span>
                    {action.type !== 'attack' && (
                      <>
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(event) => {
                            event.stopPropagation();
                            commitTurn(moveAction(turn, index, -1));
                          }}
                          className="rounded p-1 hover:bg-bg-hover"
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </span>
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(event) => {
                            event.stopPropagation();
                            commitTurn(moveAction(turn, index, 1));
                          }}
                          className="rounded p-1 hover:bg-bg-hover"
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </span>
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(event) => {
                            event.stopPropagation();
                            commitTurn(removeAction(turn, index));
                            setActionIndex(Math.max(0, index - 1));
                          }}
                          className="rounded p-1 hover:bg-bg-hover hover:text-error"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </span>
                      </>
                    )}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <select
                  value={newAction}
                  disabled={disabled}
                  onChange={(event) => setNewAction(event.target.value as DraftActionType)}
                  className="min-w-0 flex-1 rounded-lg border border-border bg-bg-primary px-2 py-2 text-sm"
                >
                  {(['servantSkill', 'masterSkill', 'targetEnemy'] as const).map((type) => (
                    <option key={type} value={type}>
                      {text(`battle.action.${type}`)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    commitTurn(addAction(turn, newAction));
                    setActionIndex(turn.actions.length - 1);
                  }}
                  className="rounded-lg bg-accent px-3 py-2 text-sm text-white disabled:opacity-50"
                >
                  {text('battle.add_action')}
                </button>
              </div>
            </>
          )}
        </section>

        <section className="space-y-3 rounded-xl border border-border bg-bg-secondary p-3">
          <h4 className="font-medium text-text-primary">{text('battle.details')}</h4>
          {turn?.actions[actionIndex] ? (
            <ActionDetails
              action={turn.actions[actionIndex]}
              turn={turn}
              actionIndex={actionIndex}
              frontSlots={formation.slice(0, 3).filter(Boolean)}
              backSlots={formation.slice(3).filter(Boolean)}
              slotNames={
                new Map(
                  plan.party.map((member) => {
                    const servantId = member.support ? supportPolicy.servantId : member.servantId;
                    const name = servants.find((item) => item.servant.id === servantId)?.servant
                      .name;
                    return [member.slot, name ?? (servantId ? `#${servantId}` : '—')];
                  }),
                )
              }
              disabled={disabled}
              text={text}
              onChange={commitTurn}
            />
          ) : (
            <p className="text-sm text-text-muted">{text('battle.select_action')}</p>
          )}
        </section>
      </div>
    </div>
  );
}

export function PartyPreview({
  plan,
  supportPolicy,
  servantNames,
  text,
}: {
  plan: BattlePlan;
  supportPolicy: SupportPolicy;
  servantNames: Map<number, string>;
  text: (key: string) => string;
}) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {[1, 2, 3, 4, 5, 6].map((slot) => {
        const member = plan.party.find((item) => item.slot === slot);
        const servantId = member?.support ? supportPolicy.servantId : member?.servantId;
        return (
          <div
            key={slot}
            className="flex min-w-0 items-center gap-2 rounded-lg bg-bg-primary p-2 text-xs"
          >
            <PartyFace servantId={servantId} />
            <div className="min-w-0 text-left">
              <div className="text-text-muted">
                {text('party.slot').replace('{number}', String(slot))}
                {member?.support ? ` · ${text('party.support')}` : ''}
              </div>
              <div className={`truncate ${member ? 'text-text-primary' : 'text-text-muted'}`}>
                {servantNames.get(servantId ?? 0) ?? (servantId ? `#${servantId}` : '—')}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PartyFace({ servantId }: { servantId?: number }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    setUrl(null);
    if (servantId) {
      void readCachedBasicServantFace(servantId).then((bytes) => {
        if (!active || !bytes) return;
        objectUrl = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
        setUrl(objectUrl);
      });
    }
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [servantId]);
  return (
    <div className="h-9 w-9 shrink-0 overflow-hidden rounded-md bg-bg-secondary">
      {url && <img src={url} alt="" className="h-full w-full object-cover" draggable={false} />}
    </div>
  );
}

function ActionDetails({
  action,
  turn,
  actionIndex,
  frontSlots,
  backSlots,
  slotNames,
  disabled,
  text,
  onChange,
}: {
  action: BattleAction;
  turn: Turn;
  actionIndex: number;
  frontSlots: number[];
  backSlots: number[];
  slotNames: Map<number, string>;
  disabled: boolean;
  text: (key: string) => string;
  onChange: (turn: Turn) => void;
}) {
  const patch = (next: Partial<BattleAction>) =>
    onChange(updateAction(turn, actionIndex, { ...action, ...next }));
  if (action.type === 'attack') {
    return (
      <AttackDetails
        turn={turn}
        frontSlots={frontSlots}
        slotNames={slotNames}
        disabled={disabled}
        text={text}
        onChange={onChange}
      />
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {action.type === 'servantSkill' && (
        <>
          <NumberSelect
            label={text('battle.servant')}
            value={action.servant ?? 0}
            options={frontSlots}
            disabled={disabled}
            onChange={(servant) => patch({ servant })}
            optionLabels={slotNames}
          />
          <NumberSelect
            label={text('battle.skill')}
            value={action.skill ?? 1}
            options={[1, 2, 3]}
            disabled={disabled}
            onChange={(skill) => patch({ skill })}
          />
          <NumberSelect
            label={text('battle.target')}
            value={action.target ?? 0}
            options={[0, ...frontSlots]}
            disabled={disabled}
            onChange={(target) => patch({ target: target || undefined })}
            zeroLabel={text('battle.no_target')}
            optionLabels={slotNames}
          />
          <SpecialEffectSelect
            value={action.specialEffect?.type ?? 'none'}
            options={['none', 'moveSelfToBack', 'retire']}
            disabled={disabled}
            text={text}
            onChange={(effect) =>
              patch({
                specialEffect:
                  effect === 'none'
                    ? undefined
                    : effect === 'retire'
                      ? { type: effect, servant: action.servant }
                      : { type: 'moveSelfToBack' },
              })
            }
          />
          {action.specialEffect?.type === 'retire' && (
            <NumberSelect
              label={text('battle.retiring_servant')}
              value={action.specialEffect.servant ?? action.servant ?? 0}
              options={frontSlots}
              disabled={disabled}
              onChange={(servant) =>
                patch({ specialEffect: { ...action.specialEffect!, servant } })
              }
              optionLabels={slotNames}
            />
          )}
        </>
      )}
      {action.type === 'masterSkill' && (
        <>
          <NumberSelect
            label={text('battle.skill')}
            value={action.skill ?? 1}
            options={[1, 2, 3]}
            disabled={disabled}
            onChange={(skill) => patch({ skill })}
          />
          {!action.specialEffect && (
            <NumberSelect
              label={text('battle.target')}
              value={action.target ?? 0}
              options={[0, ...frontSlots]}
              disabled={disabled}
              onChange={(target) => patch({ target: target || undefined })}
              zeroLabel={text('battle.no_target')}
              optionLabels={slotNames}
            />
          )}
          <SpecialEffectSelect
            value={action.specialEffect?.type ?? 'none'}
            options={['none', 'orderChange']}
            disabled={disabled}
            text={text}
            onChange={(effect) =>
              patch({
                target: undefined,
                specialEffect:
                  effect === 'orderChange'
                    ? {
                        type: effect,
                        front: frontSlots[0],
                        back: backSlots[0],
                      }
                    : undefined,
              })
            }
          />
          {action.specialEffect?.type === 'orderChange' && (
            <>
              <NumberSelect
                label={text('battle.front')}
                value={action.specialEffect.front ?? 0}
                options={frontSlots}
                disabled={disabled}
                invalidLabel={text('battle.select_slot')}
                onChange={(front) => patch({ specialEffect: { ...action.specialEffect!, front } })}
                optionLabels={slotNames}
              />
              <NumberSelect
                label={text('battle.back')}
                value={action.specialEffect.back ?? 0}
                options={backSlots}
                disabled={disabled}
                invalidLabel={text('battle.select_slot')}
                onChange={(back) => patch({ specialEffect: { ...action.specialEffect!, back } })}
                optionLabels={slotNames}
              />
              {backSlots.length === 0 && (
                <p className="text-xs text-warning sm:col-span-2">{text('battle.no_reserve')}</p>
              )}
            </>
          )}
        </>
      )}
      {action.type === 'targetEnemy' && (
        <NumberSelect
          label={text('battle.enemy')}
          value={action.enemy ?? 1}
          options={[1, 2, 3]}
          disabled={disabled}
          onChange={(enemy) => patch({ enemy })}
        />
      )}
    </div>
  );
}

function SpecialEffectSelect({
  value,
  options,
  disabled,
  text,
  onChange,
}: {
  value: string;
  options: string[];
  disabled: boolean;
  text: (key: string) => string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1 text-xs text-text-secondary sm:col-span-2">
      <span>{text('battle.special_effect')}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-border bg-bg-primary px-2 py-1.5 text-text-primary"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {text(`battle.special_effect.${option}`)}
          </option>
        ))}
      </select>
    </label>
  );
}

function AttackDetails({
  turn,
  frontSlots,
  slotNames,
  disabled,
  text,
  onChange,
}: {
  turn: Turn;
  frontSlots: number[];
  slotNames: Map<number, string>;
  disabled: boolean;
  text: (key: string) => string;
  onChange: (turn: Turn) => void;
}) {
  const attack = turn.actions.find((action) => action.type === 'attack')!;
  return (
    <div className="space-y-3">
      {attack.cards?.map((card, index) => (
        <div key={index} className="space-y-2 rounded-lg border border-border bg-bg-primary p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-text-primary">
              {index + 1}. {text(`battle.card.${card.type}`)}
            </span>
            <button
              type="button"
              disabled={disabled || (attack.cards?.length ?? 0) <= 1}
              onClick={() => onChange(removeAttackCard(turn, index))}
              className="text-text-muted hover:text-error disabled:opacity-30"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          {card.type === 'np' ? (
            <div className="grid grid-cols-2 gap-2">
              <NumberSelect
                label={text('battle.servant')}
                value={card.servant ?? 0}
                options={frontSlots}
                disabled={disabled}
                invalidLabel={text('battle.select_slot')}
                onChange={(servant) =>
                  onChange(updateAttackCard(turn, index, { ...card, servant }))
                }
                optionLabels={slotNames}
              />
              <label className="space-y-1 text-xs text-text-secondary">
                <span>{text('battle.on_missing')}</span>
                <select
                  value={card.onMissing ?? 'stop'}
                  disabled={disabled}
                  onChange={(event) =>
                    onChange(
                      updateAttackCard(turn, index, { ...card, onMissing: event.target.value }),
                    )
                  }
                  className="w-full rounded-md border border-border bg-bg-secondary px-2 py-1.5"
                >
                  <option value="stop">{text('battle.stop')}</option>
                  <option value="skip">{text('battle.skip')}</option>
                </select>
              </label>
              <SpecialEffectSelect
                value={card.specialEffect?.type ?? 'none'}
                options={['none', 'moveSelfToBack', 'retire']}
                disabled={disabled}
                text={text}
                onChange={(effect) =>
                  onChange(
                    updateAttackCard(turn, index, {
                      ...card,
                      specialEffect:
                        effect === 'none'
                          ? undefined
                          : effect === 'retire'
                            ? { type: effect, servant: card.servant }
                            : { type: 'moveSelfToBack' },
                    }),
                  )
                }
              />
              {card.specialEffect?.type === 'retire' && (
                <NumberSelect
                  label={text('battle.retiring_servant')}
                  value={card.specialEffect.servant ?? card.servant ?? 0}
                  options={frontSlots}
                  disabled={disabled}
                  onChange={(servant) =>
                    onChange(
                      updateAttackCard(turn, index, {
                        ...card,
                        specialEffect: { ...card.specialEffect!, servant },
                      }),
                    )
                  }
                  optionLabels={slotNames}
                />
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <NumberSelect
                label={text('battle.servant_optional')}
                value={card.servant ?? 0}
                options={[0, ...frontSlots]}
                disabled={disabled}
                onChange={(servant) =>
                  onChange(
                    updateAttackCard(turn, index, { ...card, servant: servant || undefined }),
                  )
                }
                zeroLabel={text('battle.any_servant')}
                invalidLabel={text('battle.select_slot')}
                optionLabels={slotNames}
              />
              <label className="space-y-1 text-xs text-text-secondary">
                <span>{text('battle.color_order')}</span>
                <select
                  value={(card.colors ?? []).join(',')}
                  disabled={disabled}
                  onChange={(event) =>
                    onChange(
                      updateAttackCard(turn, index, {
                        ...card,
                        colors: event.target.value.split(','),
                      }),
                    )
                  }
                  className="w-full rounded-md border border-border bg-bg-secondary px-2 py-1.5"
                >
                  {['buster,arts,quick', 'arts,quick,buster', 'quick,arts,buster'].map((colors) => (
                    <option key={colors} value={colors}>
                      {colors.replaceAll(',', ' > ')}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </div>
      ))}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={disabled || (attack.cards?.length ?? 0) >= 3}
          onClick={() => onChange(addAttackCard(turn, { type: 'np', onMissing: 'stop' }))}
          className="flex-1 rounded-lg border border-border px-2 py-2 text-xs text-accent disabled:opacity-40"
        >
          {text('battle.add_np')}
        </button>
        <button
          type="button"
          disabled={disabled || (attack.cards?.length ?? 0) >= 3}
          onClick={() =>
            onChange(
              addAttackCard(turn, {
                type: 'command',
                servant: -1,
                colors: ['buster', 'arts', 'quick'],
              }),
            )
          }
          className="flex-1 rounded-lg border border-border px-2 py-2 text-xs text-accent disabled:opacity-40"
        >
          {text('battle.add_command')}
        </button>
      </div>
    </div>
  );
}

function NumberSelect({
  label,
  value,
  options,
  disabled,
  onChange,
  zeroLabel,
  invalidLabel = '—',
  optionLabels,
}: {
  label: string;
  value: number;
  options: number[];
  disabled: boolean;
  onChange: (value: number) => void;
  zeroLabel?: string;
  invalidLabel?: string;
  optionLabels?: Map<number, string>;
}) {
  const valid = options.includes(value);
  return (
    <label className="space-y-1 text-xs text-text-secondary">
      <span>{label}</span>
      <select
        value={valid ? value : ''}
        disabled={disabled || options.length === 0}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full rounded-md border border-border bg-bg-primary px-2 py-1.5 text-text-primary"
      >
        {!valid && (
          <option value="" disabled>
            {invalidLabel}
          </option>
        )}
        {options.map((option) => (
          <option key={option} value={option}>
            {option === 0 ? zeroLabel : option}
          </option>
        ))}
      </select>
      {valid && value !== 0 && optionLabels?.get(value) && (
        <span className="block truncate text-[11px] text-text-muted">
          {optionLabels.get(value)}
        </span>
      )}
    </label>
  );
}
