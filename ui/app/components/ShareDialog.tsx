import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { ProgressCircle } from "@dynatrace/strato-components/content";
import { Modal } from "@dynatrace/strato-components-preview/overlays";
import { TextInput } from "@dynatrace/strato-components-preview/forms";
import {
  AccountIcon,
  CheckmarkIcon,
  CopyIcon,
  GroupIcon,
  LinkIcon,
  LockIcon,
  UnlockIcon,
  XmarkIcon,
} from "@dynatrace/strato-icons";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { SelectField } from "./SelectField";
import {
  buildViewLink,
  getViewShares,
  MIN_SEARCH_LENGTH,
  removeRecipient,
  searchRecipients,
  setVisibility,
  shareWith,
  type Recipient,
  type ShareAccess,
  type ShareRow,
} from "../services/shareService";

interface ShareDialogProps {
  show: boolean;
  documentId: string;
  viewName: string;
  isPrivate: boolean;
  version: string;
  legacyBackgroundDocId?: string | null;
  /** Called after visibility is changed so the parent can sync its state. */
  onVisibilityChange: (isPrivate: boolean, newVersion: string) => void;
  onDismiss: () => void;
}

const ACCESS_OPTIONS = [
  { value: "read", label: "Can view" },
  { value: "read-write", label: "Can edit" },
];

function RecipientIcon({ type }: { type: "user" | "group" }) {
  return type === "group" ? <GroupIcon /> : <AccountIcon />;
}

export const ShareDialog: React.FC<ShareDialogProps> = ({
  show,
  documentId,
  viewName,
  isPrivate,
  version,
  legacyBackgroundDocId,
  onVisibilityChange,
  onDismiss,
}) => {
  const [shares, setShares] = useState<ShareRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [term, setTerm] = useState("");
  const [results, setResults] = useState<Recipient[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [staged, setStaged] = useState<Recipient[]>([]);
  const [newAccess, setNewAccess] = useState<ShareAccess>("read");
  const [sharing, setSharing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [visBusy, setVisBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const searchTimer = useRef<number | null>(null);

  const loadShares = useCallback(async () => {
    setLoadError(null);
    try {
      setShares(await getViewShares(documentId));
    } catch (e) {
      setShares([]);
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, [documentId]);

  // (Re)load shares whenever the dialog opens.
  useEffect(() => {
    if (!show) return;
    setStaged([]);
    setTerm("");
    setResults([]);
    setActionError(null);
    void loadShares();
  }, [show, loadShares]);

  // Ids already shared or staged — hidden from the search results.
  const excludedIds = useMemo(() => {
    const s = new Set<string>(staged.map((r) => r.id));
    for (const row of shares ?? []) s.add(row.recipient.id);
    return s;
  }, [staged, shares]);

  // Debounced people search.
  useEffect(() => {
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    const q = term.trim();
    if (q.length < MIN_SEARCH_LENGTH) {
      setResults([]);
      setSearching(false);
      setSearchError(null);
      return;
    }
    setSearching(true);
    searchTimer.current = window.setTimeout(() => {
      searchRecipients(q)
        .then((r) => {
          setResults(r);
          setSearchError(null);
        })
        .catch((e) =>
          setSearchError(e instanceof Error ? e.message : String(e)),
        )
        .finally(() => setSearching(false));
    }, 300);
    return () => {
      if (searchTimer.current) window.clearTimeout(searchTimer.current);
    };
  }, [term]);

  const visibleResults = results.filter((r) => !excludedIds.has(r.id));

  function stageRecipient(r: Recipient) {
    setStaged((prev) => (prev.some((p) => p.id === r.id) ? prev : [...prev, r]));
    setTerm("");
    setResults([]);
  }

  function unstage(id: string) {
    setStaged((prev) => prev.filter((p) => p.id !== id));
  }

  async function handleShare() {
    if (staged.length === 0) return;
    setSharing(true);
    setActionError(null);
    try {
      await shareWith(documentId, newAccess, staged);
      setStaged([]);
      await loadShares();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setSharing(false);
    }
  }

  async function handleRemove(row: ShareRow) {
    setActionError(null);
    try {
      await removeRecipient(row.shareId, row.recipient.id);
      await loadShares();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleVisibility(makePrivate: boolean) {
    if (makePrivate === isPrivate || visBusy) return;
    setVisBusy(true);
    setActionError(null);
    try {
      const newVersion = await setVisibility(
        documentId,
        version,
        makePrivate,
        legacyBackgroundDocId,
      );
      onVisibilityChange(makePrivate, newVersion);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setVisBusy(false);
    }
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(buildViewLink(documentId));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setActionError("Could not copy link to clipboard.");
    }
  }

  const sectionTitleStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: Colors.Text.Neutral.Subdued,
  };

  return (
    <Modal
      title={`Share “${viewName}”`}
      show={show}
      onDismiss={onDismiss}
      size="small"
      footer={
        <Flex justifyContent="flex-end">
          <Button variant="default" onClick={onDismiss}>
            Done
          </Button>
        </Flex>
      }
    >
      <Flex flexDirection="column" gap={20} style={{ paddingTop: 8 }}>
        {/* Visibility */}
        <Flex flexDirection="column" gap={8}>
          <Text style={sectionTitleStyle}>General access</Text>
          <Flex gap={8}>
            <Button
              variant={isPrivate ? "emphasized" : "default"}
              onClick={() => void handleVisibility(true)}
              disabled={visBusy}
            >
              <Button.Prefix>
                <LockIcon />
              </Button.Prefix>
              Private
            </Button>
            <Button
              variant={!isPrivate ? "emphasized" : "default"}
              onClick={() => void handleVisibility(false)}
              disabled={visBusy}
            >
              <Button.Prefix>
                <UnlockIcon />
              </Button.Prefix>
              Anyone in environment
            </Button>
            {visBusy && <ProgressCircle size="small" aria-label="Updating visibility" />}
          </Flex>
          <Text style={{ fontSize: 12, color: Colors.Text.Neutral.Subdued }}>
            {isPrivate
              ? "Only you and the people below can open this view."
              : "Everyone in your environment can view this. People below can also edit if granted."}
          </Text>
        </Flex>

        {/* Add people */}
        <Flex flexDirection="column" gap={8}>
          <Text style={sectionTitleStyle}>Add people or groups</Text>

          {staged.length > 0 && (
            <Flex gap={6} style={{ flexWrap: "wrap" }}>
              {staged.map((r) => (
                <Flex
                  key={r.id}
                  alignItems="center"
                  gap={6}
                  style={{
                    padding: "4px 8px",
                    borderRadius: 999,
                    background: Colors.Background.Container.Neutral.Default,
                    border: `1px solid ${Colors.Border.Neutral.Default}`,
                    fontSize: 13,
                  }}
                >
                  <RecipientIcon type={r.type} />
                  <span>{r.label}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${r.label}`}
                    onClick={() => unstage(r.id)}
                    style={{
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      display: "flex",
                      color: Colors.Text.Neutral.Subdued,
                    }}
                  >
                    <XmarkIcon />
                  </button>
                </Flex>
              ))}
            </Flex>
          )}

          <div style={{ position: "relative" }}>
            <TextInput
              value={term}
              onChange={setTerm}
              placeholder="Search by name or email…"
            />
            {(searching || visibleResults.length > 0 || term.trim().length >= MIN_SEARCH_LENGTH) && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 4px)",
                  left: 0,
                  right: 0,
                  zIndex: 10,
                  maxHeight: 240,
                  overflowY: "auto",
                  padding: 4,
                  borderRadius: 6,
                  background: Colors.Background.Surface.Default,
                  border: `1px solid ${Colors.Border.Neutral.Default}`,
                  boxShadow: "0 4px 16px rgba(0,0,0,0.22)",
                }}
              >
                {searching ? (
                  <Flex alignItems="center" gap={8} style={{ padding: "8px" }}>
                    <ProgressCircle size="small" aria-label="Searching" />
                    <Text style={{ fontSize: 13 }}>Searching…</Text>
                  </Flex>
                ) : searchError ? (
                  <Text
                    style={{ fontSize: 13, padding: 8, color: Colors.Text.Critical.Default }}
                  >
                    {searchError}
                  </Text>
                ) : visibleResults.length === 0 ? (
                  <Text style={{ fontSize: 13, padding: 8, color: Colors.Text.Neutral.Subdued }}>
                    No matches.
                  </Text>
                ) : (
                  visibleResults.map((r) => (
                    <div
                      key={`${r.type}:${r.id}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => stageRecipient(r)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") stageRecipient(r);
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "6px 8px",
                        borderRadius: 4,
                        cursor: "pointer",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background =
                          Colors.Background.Container.Neutral.Default)
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "transparent")
                      }
                    >
                      <RecipientIcon type={r.type} />
                      <Flex flexDirection="column" style={{ minWidth: 0 }}>
                        <Text style={{ fontSize: 13 }}>{r.label}</Text>
                        {r.detail && (
                          <Text
                            style={{ fontSize: 11, color: Colors.Text.Neutral.Subdued }}
                          >
                            {r.detail}
                          </Text>
                        )}
                      </Flex>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          <Flex gap={8} alignItems="center">
            <div style={{ width: 140 }}>
              <SelectField
                value={newAccess}
                onChange={(v) => setNewAccess(v as ShareAccess)}
                options={ACCESS_OPTIONS}
                ariaLabel="Access level for new recipients"
              />
            </div>
            <Button
              variant="accent"
              onClick={() => void handleShare()}
              disabled={staged.length === 0}
              loading={sharing}
            >
              Share
            </Button>
          </Flex>
        </Flex>

        {/* People with access */}
        <Flex flexDirection="column" gap={8}>
          <Text style={sectionTitleStyle}>People with access</Text>
          {loadError ? (
            <Text style={{ fontSize: 13, color: Colors.Text.Critical.Default }}>
              Couldn’t load shares: {loadError}
            </Text>
          ) : shares === null ? (
            <Flex alignItems="center" gap={8}>
              <ProgressCircle size="small" aria-label="Loading shares" />
              <Text style={{ fontSize: 13 }}>Loading…</Text>
            </Flex>
          ) : shares.length === 0 ? (
            <Text style={{ fontSize: 13, color: Colors.Text.Neutral.Subdued }}>
              Not shared with anyone yet.
            </Text>
          ) : (
            <Flex flexDirection="column" gap={4}>
              {shares.map((row) => (
                <Flex
                  key={`${row.shareId}:${row.recipient.id}`}
                  alignItems="center"
                  justifyContent="space-between"
                  gap={8}
                  style={{
                    padding: "6px 8px",
                    borderRadius: 4,
                    background: Colors.Background.Container.Neutral.Default,
                  }}
                >
                  <Flex alignItems="center" gap={8} style={{ minWidth: 0 }}>
                    <RecipientIcon type={row.recipient.type} />
                    <Flex flexDirection="column" style={{ minWidth: 0 }}>
                      <Text style={{ fontSize: 13 }}>{row.recipient.label}</Text>
                      {row.recipient.detail && (
                        <Text
                          style={{ fontSize: 11, color: Colors.Text.Neutral.Subdued }}
                        >
                          {row.recipient.detail}
                        </Text>
                      )}
                    </Flex>
                  </Flex>
                  <Flex alignItems="center" gap={8}>
                    <Text style={{ fontSize: 12, color: Colors.Text.Neutral.Subdued }}>
                      {row.access === "read-write" ? "Can edit" : "Can view"}
                    </Text>
                    <Button
                      variant="default"
                      onClick={() => void handleRemove(row)}
                      aria-label={`Remove ${row.recipient.label}`}
                      style={{ minWidth: "auto", padding: 4 }}
                    >
                      <Button.Prefix>
                        <XmarkIcon />
                      </Button.Prefix>
                    </Button>
                  </Flex>
                </Flex>
              ))}
            </Flex>
          )}
        </Flex>

        {actionError && (
          <Text style={{ fontSize: 13, color: Colors.Text.Critical.Default }}>
            {actionError}
          </Text>
        )}

        {/* Copy link */}
        <Flex
          alignItems="center"
          justifyContent="space-between"
          gap={8}
          style={{
            paddingTop: 12,
            borderTop: `1px solid ${Colors.Border.Neutral.Default}`,
          }}
        >
          <Flex alignItems="center" gap={8} style={{ minWidth: 0 }}>
            <LinkIcon />
            <Text style={{ fontSize: 12, color: Colors.Text.Neutral.Subdued }}>
              Link opens for people who already have access.
            </Text>
          </Flex>
          <Button variant="default" onClick={() => void handleCopyLink()}>
            <Button.Prefix>{copied ? <CheckmarkIcon /> : <CopyIcon />}</Button.Prefix>
            {copied ? "Copied" : "Copy link"}
          </Button>
        </Flex>
      </Flex>
    </Modal>
  );
};
