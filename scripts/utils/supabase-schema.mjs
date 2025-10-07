export function summarizeSurtaxEntry(entry) {
  return {
    state: entry.state_code,
    county: entry.county_name,
    rate: entry.rate_decimal,
    effective: entry.effective_date,
    expiration: entry.expiration_date,
    component: entry.component_label,
  };
}

export function previewEntries(entries, { limit = 5 } = {}) {
  if (!Array.isArray(entries) || entries.length === 0) {
    console.info("[tax-import] No entries to preview.");
    return;
  }
  console.info(`[tax-import] Previewing first ${Math.min(limit, entries.length)} entries:`);
  console.table(entries.slice(0, limit).map(summarizeSurtaxEntry));
}

export function confirmSurtaxSummary(entries) {
  const summary = entries.reduce(
    (acc, entry) => {
      if (!acc.states.has(entry.state_code)) {
        acc.states.add(entry.state_code);
      }
      acc.count += 1;
      return acc;
    },
    { count: 0, states: new Set() }
  );
  console.info(`[tax-import] Summary: ${summary.count} entries across ${summary.states.size} state(s).`);
}

