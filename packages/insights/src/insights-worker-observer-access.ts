export type InsightsWorkerObserverSubject = {
  subUserId: string;
  uid: number;
};

export function parseInsightsWorkerObserverSubjects(
  value: string | undefined,
): ReadonlySet<string> {
  if (!value?.trim()) {
    return new Set();
  }

  const subjects = new Set<string>();

  for (const rawEntry of value.split(",")) {
    const entry = rawEntry.trim();
    const separatorIndex = entry.indexOf(":");

    if (
      separatorIndex <= 0
      || separatorIndex !== entry.lastIndexOf(":")
    ) {
      throw invalidConfig(
        "INSIGHTS_WORKER_OBSERVER_SUBJECTS",
        "positive uid:subUserId entries",
      );
    }

    const rawUid = entry.slice(0, separatorIndex).trim();
    const subUserId = entry.slice(separatorIndex + 1).trim();
    const uid = Number(rawUid);

    if (!isPositiveUidText(rawUid) || !Number.isSafeInteger(uid) || !subUserId) {
      throw invalidConfig(
        "INSIGHTS_WORKER_OBSERVER_SUBJECTS",
        "positive uid:subUserId entries",
      );
    }

    subjects.add(formatInsightsWorkerObserverSubject({ subUserId, uid }));
  }

  return subjects;
}

export function parseInsightsWorkerTraceUids(
  value: string | undefined,
): ReadonlySet<number> {
  if (!value?.trim()) {
    return new Set();
  }

  const uids = new Set<number>();

  for (const rawEntry of value.split(",")) {
    const rawUid = rawEntry.trim();
    const uid = Number(rawUid);

    if (!isPositiveUidText(rawUid) || !Number.isSafeInteger(uid)) {
      throw invalidConfig(
        "INSIGHTS_WORKER_TRACE_UID_ALLOWLIST",
        "positive UID entries",
      );
    }

    uids.add(uid);
  }

  return uids;
}

export function canViewInsightsWorkerObservability(
  subjects: ReadonlySet<string>,
  subject: InsightsWorkerObserverSubject,
) {
  return subjects.has(formatInsightsWorkerObserverSubject(subject));
}

function formatInsightsWorkerObserverSubject(
  subject: InsightsWorkerObserverSubject,
) {
  return `${subject.uid}:${subject.subUserId}`;
}

function isPositiveUidText(value: string) {
  return /^[1-9]\d*$/.test(value);
}

function invalidConfig(name: string, entryFormat: string) {
  return new Error(
    `${name} must be a comma-separated list of ${entryFormat}`,
  );
}
