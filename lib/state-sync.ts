type IdentifiedRecord = {
  id?: string;
};

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

export function mergeCollectionState<T extends Record<string, unknown>>(
  base: T,
  local: T,
  remote: T,
  collections: readonly (keyof T)[],
  normalize: (state: T) => T
) {
  const merged = { ...remote } as T;

  for (const key of collections) {
    const baseItems = (base[key] as IdentifiedRecord[]) || [];
    const localItems = (local[key] as IdentifiedRecord[]) || [];
    const remoteItems = (remote[key] as IdentifiedRecord[]) || [];
    const baseById = new Map(baseItems.map((item) => [item.id, item]));
    const localById = new Map(localItems.map((item) => [item.id, item]));
    const remoteById = new Map(remoteItems.map((item) => [item.id, item]));
    const ids = [
      ...remoteItems.map((item) => item.id),
      ...localItems.map((item) => item.id).filter((id) => !remoteById.has(id))
    ];

    merged[key] = ids
      .filter((id): id is string => Boolean(id))
      .map((id) => {
        const baseItem = baseById.get(id);
        const localItem = localById.get(id);
        const remoteItem = remoteById.get(id);
        const localChanged = stableSerialize(localItem) !== stableSerialize(baseItem);
        const remoteChanged = stableSerialize(remoteItem) !== stableSerialize(baseItem);

        if (localChanged && !remoteChanged) return localItem;
        if (!localChanged && remoteChanged) return remoteItem;

        // A concurrent deletion is intentional archive state. Do not let a
        // stale copy from the other device resurrect a deleted record.
        if (localChanged && remoteChanged && (!localItem || !remoteItem)) {
          return undefined;
        }

        return localItem ?? remoteItem;
      })
      .filter((item): item is IdentifiedRecord => Boolean(item)) as T[keyof T];
  }

  return normalize(merged);
}
