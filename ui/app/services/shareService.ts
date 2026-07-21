/**
 * Sharing helpers for Metrics Graphical Views.
 *
 * Three capabilities are layered on top of the Document Service:
 *  1. Public/private visibility — toggling `isPrivate` on the view document.
 *  2. Direct shares — granting specific users/groups `read` or `read-write`
 *     access via {@link directSharesClient}.
 *  3. A people picker — searching users/groups by name via the IAM client.
 *
 * Required app scopes (see app.config.json):
 *   document:direct-shares:read, document:direct-shares:write,
 *   document:direct-shares:delete, iam:users:read, iam:groups:read
 */
import {
  directSharesClient,
  documentsClient,
} from "@dynatrace-sdk/client-document";
import {
  usersAndGroupsClient,
  type RestGroupPublic,
  type RestUserPublic,
} from "@dynatrace-sdk/client-iam";
import { getEnvironmentId } from "@dynatrace-sdk/app-environment";
import { makeDocumentPublic } from "./documentService";

/** Access level granted by a direct share. */
export type ShareAccess = "read" | "read-write";

/** A user or group that a view can be shared with. */
export interface Recipient {
  /** SSO id — a user `uid` or a group `uuid`. */
  id: string;
  type: "user" | "group";
  /** Human-readable label (name, or group name). Falls back to the id. */
  label: string;
  /** Secondary text (email for users, group type for groups). */
  detail?: string;
}

/** One recipient's access to a view, tied to the direct-share that grants it. */
export interface ShareRow {
  /** Id of the direct-share granting this access (needed to revoke). */
  shareId: string;
  access: ShareAccess;
  recipient: Recipient;
}

/** IAM search is scoped to the current environment. */
const LEVEL = { levelType: "environment", get levelId() { return getEnvironmentId(); } };

/** Minimum query length accepted by the IAM search endpoints. */
export const MIN_SEARCH_LENGTH = 3;

/** Search users by partial name/email; returns [] on any error. */
async function searchUsers(q: string): Promise<RestUserPublic[]> {
  const { levelType, levelId } = LEVEL;
  try {
    const r = await usersAndGroupsClient.getActiveUsersForOrganizationalLevel({
      levelType,
      levelId,
      partialString: q,
      pageSize: 25,
    });
    return r.results ?? [];
  } catch {
    return [];
  }
}

/** Search groups by partial name; returns [] on any error. */
async function searchGroups(q: string): Promise<RestGroupPublic[]> {
  const { levelType, levelId } = LEVEL;
  try {
    const r = await usersAndGroupsClient.getVisibleGroupsForAccount({
      levelType,
      levelId,
      partialGroupName: q,
      pageSize: 25,
    });
    return r.results ?? [];
  } catch {
    return [];
  }
}

/**
 * Search users and groups by a partial name/email string. Returns a merged
 * list (groups first, then users). Requires at least {@link MIN_SEARCH_LENGTH}
 * characters; shorter terms return `[]`.
 */
export async function searchRecipients(term: string): Promise<Recipient[]> {
  const q = term.trim();
  if (q.length < MIN_SEARCH_LENGTH) return [];

  const [users, groups] = await Promise.all([searchUsers(q), searchGroups(q)]);

  const groupRows: Recipient[] = groups.map((g) => ({
    id: g.uuid,
    type: "group" as const,
    label: g.groupName,
    detail: "Group",
  }));
  const userRows: Recipient[] = users.map((u) => ({
    id: u.uid,
    type: "user" as const,
    label: [u.name, u.surname].filter(Boolean).join(" ") || u.email,
    detail: u.email,
  }));
  return [...groupRows, ...userRows];
}

/**
 * Best-effort resolution of raw SSO entities into labelled {@link Recipient}s
 * so existing shares render with names instead of opaque ids. On any failure,
 * the raw id is used as the label.
 */
async function resolveRecipients(
  entities: { id: string; type: string }[],
): Promise<Map<string, Recipient>> {
  const map = new Map<string, Recipient>();
  const userIds = entities.filter((e) => e.type === "user").map((e) => e.id);
  const groupIds = entities.filter((e) => e.type === "group").map((e) => e.id);
  const { levelType, levelId } = LEVEL;

  const tasks: Promise<void>[] = [];
  if (userIds.length) {
    tasks.push(
      usersAndGroupsClient
        .getActiveUsersForOrganizationalLevelPost({
          levelType,
          levelId,
          body: userIds,
          pageSize: 1000,
        })
        .then((r) => {
          for (const u of r.results ?? []) {
            map.set(u.uid, {
              id: u.uid,
              type: "user",
              label: [u.name, u.surname].filter(Boolean).join(" ") || u.email,
              detail: u.email,
            });
          }
        })
        .catch(() => {}),
    );
  }
  if (groupIds.length) {
    tasks.push(
      usersAndGroupsClient
        .getVisibleGroupsForAccountPost({
          levelType,
          levelId,
          body: groupIds,
          pageSize: 1000,
        })
        .then((r) => {
          for (const g of r.results ?? []) {
            map.set(g.uuid, {
              id: g.uuid,
              type: "group",
              label: g.groupName,
              detail: "Group",
            });
          }
        })
        .catch(() => {}),
    );
  }
  await Promise.all(tasks);

  // Fill in any entities that couldn't be resolved.
  for (const e of entities) {
    if (!map.has(e.id)) {
      map.set(e.id, {
        id: e.id,
        type: e.type === "group" ? "group" : "user",
        label: e.id,
      });
    }
  }
  return map;
}

/** Normalise the direct-share `access` array into a single {@link ShareAccess}. */
function accessOf(access: string[] | undefined): ShareAccess {
  return access?.includes("read-write") ? "read-write" : "read";
}

/**
 * List everyone a view is currently shared with, as flat per-recipient rows.
 * Resolves display names best-effort.
 */
export async function getViewShares(documentId: string): Promise<ShareRow[]> {
  const list = await directSharesClient.listDirectShares({
    filter: `documentId=='${documentId}'`,
    pageSize: 1000,
  });
  const shares = list["direct-shares"] ?? [];

  const perShare = await Promise.all(
    shares.map(async (s) => {
      const rec = await directSharesClient.getDirectShareRecipients({
        id: s.id,
        pageSize: 1000,
      });
      return {
        shareId: s.id,
        access: accessOf(s.access),
        entities: rec.recipients ?? [],
      };
    }),
  );

  const all = perShare.flatMap((p) => p.entities);
  const labels = await resolveRecipients(all);

  return perShare.flatMap((p) =>
    p.entities.map((e) => ({
      shareId: p.shareId,
      access: p.access,
      recipient: labels.get(e.id) ?? {
        id: e.id,
        type: e.type === "group" ? "group" : "user",
        label: e.id,
      },
    })),
  );
}

/**
 * Share a view with one or more recipients at the given access level. A
 * document may have at most one `read` and one `read-write` share, so we add to
 * the existing share of that access if present, otherwise create it.
 */
export async function shareWith(
  documentId: string,
  access: ShareAccess,
  recipients: Recipient[],
): Promise<void> {
  if (recipients.length === 0) return;
  const sso = recipients.map((r) => ({ id: r.id, type: r.type }));

  const list = await directSharesClient.listDirectShares({
    filter: `documentId=='${documentId}'`,
    pageSize: 1000,
  });
  const existing = (list["direct-shares"] ?? []).find(
    (s) => accessOf(s.access) === access,
  );

  if (existing) {
    await directSharesClient.addDirectShareRecipients({
      id: existing.id,
      body: { recipients: sso },
    });
  } else {
    await directSharesClient.createDirectShare({
      body: { documentId, access, recipients: sso },
    });
  }
}

/** Revoke a single recipient's access, removing them from their share. */
export async function removeRecipient(
  shareId: string,
  recipientId: string,
): Promise<void> {
  await directSharesClient.removeDirectShareRecipients({
    id: shareId,
    body: { ids: [recipientId] },
  });
}

/**
 * Set a view's visibility. Returns the new optimistic-locking version.
 * When making a view public, any legacy separate background-image document is
 * published too so it loads for other users.
 */
export async function setVisibility(
  documentId: string,
  version: string,
  isPrivate: boolean,
  legacyBackgroundDocId?: string | null,
): Promise<string> {
  const result = await documentsClient.updateDocument({
    id: documentId,
    optimisticLockingVersion: version,
    body: { isPrivate },
  });
  if (!isPrivate && legacyBackgroundDocId) {
    try {
      await makeDocumentPublic(legacyBackgroundDocId);
    } catch {
      // Not the owner / already public — safe to ignore.
    }
  }
  return result.documentMetadata?.version ?? version;
}

/**
 * Build a shareable deep link to a view. Derived from the current location so
 * it is correct regardless of how the app is hosted; strips any query/hash and
 * points at `/view/<id>`.
 */
export function buildViewLink(id: string): string {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  const marker = "/view/";
  const idx = url.pathname.indexOf(marker);
  if (idx >= 0) {
    url.pathname = url.pathname.slice(0, idx) + marker + encodeURIComponent(id);
  }
  return url.toString();
}
