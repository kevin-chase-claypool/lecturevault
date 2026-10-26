import { stableSerialize } from './state-sync';

type Draft = { id: string };

export function replaceDraft<T extends Draft>(drafts: T[], selected: T): T[] {
  return [selected, ...drafts.filter(draft => draft.id !== selected.id)];
}

export function sameDraft(left: unknown, right: unknown) {
  return stableSerialize(left) === stableSerialize(right);
}

export function retireDraft<T extends Draft>(drafts: T[], id: string): T[] {
  return drafts.filter(draft => draft.id !== id);
}
