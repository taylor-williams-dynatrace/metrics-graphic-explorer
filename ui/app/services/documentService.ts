/**
 * Thin wrapper around the Dynatrace Document Service for storing
 * "Metrics Graphical Views" and their background images.
 *
 * Required app scopes (see app.config.json):
 *   document:documents:read, document:documents:write, document:documents:delete
 */
import { documentsClient } from "@dynatrace-sdk/client-document";
import type { DocumentMetaData } from "@dynatrace-sdk/client-document";
import {
  BG_DOC_TYPE,
  VIEW_DOC_TYPE,
  type LoadedView,
  type MetricsGraphicView,
} from "../types/metricsView";

/** List metadata of all saved views, newest first. */
export async function listViews(): Promise<DocumentMetaData[]> {
  const result = await documentsClient.listDocuments({
    filter: `type == '${VIEW_DOC_TYPE}'`,
    sort: "-modificationInfo.lastModifiedTime",
    pageSize: 1000,
  });
  return result.documents ?? [];
}

/**
 * Create a new view document, returning its metadata (including the new id).
 * The document is made public (read-only for everyone in the environment).
 */
export async function createView(
  view: MetricsGraphicView,
): Promise<DocumentMetaData> {
  const meta = await documentsClient.createDocument({
    body: {
      name: view.name,
      type: VIEW_DOC_TYPE,
      content: jsonBlob(view),
    },
  });
  // Documents are private by default; publish so other users can view it.
  await documentsClient.updateDocument({
    id: meta.id,
    optimisticLockingVersion: meta.version,
    body: { isPrivate: false },
  });
  return meta;
}

/** Load a view's content + metadata by id. */
export async function getView(id: string): Promise<LoadedView> {
  const response = await documentsClient.getDocument({ id });
  const meta = response.metadata;
  if (!meta) {
    throw new Error(`Document ${id} has no metadata`);
  }
  const view = (await response.content?.get("json")) as MetricsGraphicView;
  return {
    id: meta.id,
    version: meta.version,
    name: meta.name,
    view,
    // Only the owner (write access) may edit; everyone else is read-only.
    canEdit: meta.access?.includes("write") ?? false,
  };
}

/**
 * Persist changes to an existing view. Returns the new version string so the
 * caller can keep its optimistic-locking version in sync.
 */
export async function updateView(
  id: string,
  version: string,
  view: MetricsGraphicView,
): Promise<string> {
  const result = await documentsClient.updateDocument({
    id,
    optimisticLockingVersion: version,
    body: {
      name: view.name,
      content: jsonBlob(view),
      // Keep the view public (also migrates views created before sharing existed).
      isPrivate: false,
    },
  });
  // Ensure the (separate) background image document is public too, so the
  // image loads for other users — not just the view JSON.
  if (view.backgroundDocId) {
    try {
      await makeDocumentPublic(view.backgroundDocId);
    } catch {
      // Not the owner or already public — safe to ignore.
    }
  }
  return result.documentMetadata?.version ?? version;
}

/** Make a document public (read-only for everyone) if it isn't already. */
async function makeDocumentPublic(id: string): Promise<void> {
  const meta = await documentsClient.getDocumentMetadata({ id });
  if (meta.isPrivate === false) return;
  await documentsClient.updateDocument({
    id,
    optimisticLockingVersion: meta.version,
    body: { isPrivate: false },
  });
}

/** Permanently delete a view (and best-effort its background image). */
export async function deleteView(
  id: string,
  backgroundDocId?: string | null,
): Promise<void> {
  await deleteDocumentById(id);
  if (backgroundDocId) {
    try {
      await deleteDocumentById(backgroundDocId);
    } catch {
      // Background may be shared/already gone — ignore.
    }
  }
}

async function deleteDocumentById(id: string): Promise<void> {
  const meta = await documentsClient.getDocumentMetadata({ id });
  await documentsClient.deleteDocument({
    id,
    optimisticLockingVersion: meta.version,
  });
}

/** Read an image File into a data URL for embedding inside the view document. */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () =>
      reject(reader.error ?? new Error("Failed to read image file"));
    reader.readAsDataURL(file);
  });
}

/**
 * Legacy: upload a background image as a separate document and return its id.
 * Retained for backward compatibility; new views embed the image instead.
 */
export async function uploadBackground(file: File): Promise<string> {
  const meta = await documentsClient.createDocument({
    body: {
      name: `background-${file.name}`,
      type: BG_DOC_TYPE,
      content: file,
    },
  });
  // Publish so the image loads for everyone who can view the parent view.
  await documentsClient.updateDocument({
    id: meta.id,
    optimisticLockingVersion: meta.version,
    body: { isPrivate: false },
  });
  return meta.id;
}

export interface BackgroundImage {
  /** Object URL suitable for an <img> src; revoke with URL.revokeObjectURL. */
  url: string;
  /** Size of the fetched content in bytes (0 usually means a broken upload). */
  size: number;
  /** MIME type reported by the stored blob. */
  type: string;
}

/**
 * Fetch a background image and return an object URL suitable for an <img> src,
 * plus diagnostic info about the fetched content.
 */
export async function getBackgroundImage(id: string): Promise<BackgroundImage> {
  const response = await documentsClient.getDocument({ id });
  const blob = await response.content?.get("blob");
  if (!blob) {
    throw new Error("document returned no content");
  }
  return { url: URL.createObjectURL(blob), size: blob.size, type: blob.type };
}

function jsonBlob(value: unknown): Blob {
  return new Blob([JSON.stringify(value)], { type: "application/json" });
}
