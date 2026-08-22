import type { BattlePlan } from './battlePlan';

export function describeAutoBattleErrors(
  errors: string[],
  plan: BattlePlan,
  text: (key: string) => string,
): string[] {
  return [
    ...new Set(
      errors.map((error) => {
        if (error === 'name') return text('status.error.name');
        if (error === 'json' || error === 'schemaVersion') return text('status.error.format');
        if (error === 'party') return text('status.error.party');
        if (error === 'party.support') return text('status.error.party_support');
        if (error === 'waves') return text('status.error.waves');
        if (error === 'maxTurns' || error === 'waves.maxTurns')
          return text('status.error.max_turns');
        if (error === 'loop.repeatCount') return text('status.error.repeat_count');
        if (error.startsWith('support.')) return text('status.error.support');
        const waveTurns = error.match(/^waves\[(\d+)]\.turns$/);
        if (waveTurns) {
          return text('status.error.turns').replace('{wave}', String(Number(waveTurns[1]) + 1));
        }
        const party = error.match(/^party\[(\d+)]/);
        if (party) {
          const slot = plan.party[Number(party[1])]?.slot ?? Number(party[1]) + 1;
          return text('status.error.party_slot').replace('{slot}', String(slot));
        }
        const action = error.match(
          /^waves\[(\d+)]\.turns\[(\d+)]\.actions(?:\[(\d+)])?(?:\.cards\[(\d+)])?(.*)$/,
        );
        if (!action) return text('status.error.other');
        const [, wave, turn, actionIndex, cardIndex, field] = action;
        const location = text('status.error.location')
          .replace('{wave}', String(Number(wave) + 1))
          .replace('{turn}', String(Number(turn) + 1))
          .replace('{action}', actionIndex == null ? '—' : String(Number(actionIndex) + 1));
        let detail = text('status.error.action');
        if (field === '.servant') detail = text('status.error.servant');
        else if (field === '.skill') detail = text('status.error.skill');
        else if (field === '.target') detail = text('status.error.target');
        else if (field === '.enemy') detail = text('status.error.enemy');
        else if (field === '.cards') detail = text('status.error.cards');
        else if (field === '.onMissing') detail = text('status.error.on_missing');
        else if (field === '.colors') detail = text('status.error.colors');
        else if (field === '.type') detail = text('status.error.card_type');
        else if (field === '.specialEffect.front') detail = text('status.error.order_front');
        else if (field === '.specialEffect.back') detail = text('status.error.order_back');
        else if (field.includes('.specialEffect')) detail = text('status.error.special_effect');
        else if (cardIndex != null) {
          detail = text('status.error.card').replace('{card}', String(Number(cardIndex) + 1));
        }
        return `${location}${detail}`;
      }),
    ),
  ];
}
