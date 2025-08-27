export type SqliteDriverKind = "native" | "wasm";

export interface SqliteResolution {
  requested: "auto" | SqliteDriverKind | undefined;
  selected: SqliteDriverKind;
  available: boolean; // whether the selected driver is actually available in this runtime
  tried: SqliteDriverKind[]; // the order of attempts made
  reason?: string; // diagnostic message
}

// Resolve which driver we would use. In this lightweight skeleton, we do not
// import or require any external dependencies. We simply simulate availability
// checks and always report that drivers are unavailable so the caller can
// gracefully fallback without runtime errors.
export function resolveSqliteDriver(
  requested: "auto" | SqliteDriverKind | undefined
): SqliteResolution {
  const tried: SqliteDriverKind[] = [];
  if (!requested || requested === "auto") {
    // Preference: native -> wasm
    tried.push("native");
    tried.push("wasm");
    return {
      requested,
      selected: "wasm",
      available: false,
      tried,
      reason:
        "SQLite drivers not linked in this build. This is a skeleton resolver returning available=false.",
    };
  }
  // Explicit selection
  tried.push(requested);
  return {
    requested,
    selected: requested,
    available: false,
    tried,
    reason:
      "Explicit driver requested, but this skeleton has no runtime driver availability. available=false.",
  };
}
