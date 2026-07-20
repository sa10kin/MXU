import type { PartySlot } from './battlePlan';

export function updatePartySlot(
  party: PartySlot[],
  slot: number,
  patch: Partial<PartySlot> | null,
): PartySlot[] {
  const existing = party.find((member) => member.slot === slot);
  const next = party.filter((member) => member.slot !== slot);
  if (patch) next.push({ slot, ...existing, ...patch });
  return next.sort((left, right) => left.slot - right.slot);
}

export function setPartySupport(party: PartySlot[], slot: number, support: boolean): PartySlot[] {
  // Clearing the support flag from a previous support slot leaves an empty
  // placeholder (support slots have no servantId, they reuse SupportPolicy);
  // drop any such orphaned slot rather than let it fail BattlePlan validation.
  const next = party
    .map((member) => ({
      ...member,
      support: member.slot === slot ? support || undefined : undefined,
    }))
    .filter((member) => member.slot === slot || member.servantId || member.support);
  if (support) {
    const existing = next.find((member) => member.slot === slot);
    return updatePartySlot(next, slot, { ...existing, servantId: undefined, craftEssenceId: undefined, support: true });
  }
  const existing = next.find((member) => member.slot === slot);
  return existing && !existing.servantId ? updatePartySlot(next, slot, null) : next;
}
