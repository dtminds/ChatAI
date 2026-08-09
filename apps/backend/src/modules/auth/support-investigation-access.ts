import type { JwtUser } from "@chatai/contracts";

type SupportInvestigatorSubject = Pick<JwtUser, "subUserId" | "uid">;

// Mirrors the current platform observation account list. Changes are deployed
// with the backend so this privileged capability has one reviewable boundary.
const SUPPORT_INVESTIGATOR_SUBJECTS: ReadonlySet<string> = new Set([
  "272:1",
]);

export function canStartSupportInvestigation(
  subject: SupportInvestigatorSubject,
) {
  return SUPPORT_INVESTIGATOR_SUBJECTS.has(formatSubject(subject));
}

export function isValidSupportInvestigationUser(user: JwtUser) {
  return user.accessMode === "support_readonly"
    && user.sessionId.startsWith("support:")
    && user.sessionVersion === 0
    && typeof user.actorUid === "number"
    && Number.isSafeInteger(user.actorUid)
    && user.actorUid > 0
    && typeof user.actorSubUserId === "string"
    && user.actorSubUserId.length > 0
    && canStartSupportInvestigation({
      subUserId: user.actorSubUserId,
      uid: user.actorUid,
    });
}

function formatSubject(subject: SupportInvestigatorSubject) {
  return `${subject.uid}:${subject.subUserId}`;
}
