import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { ProgressCircle } from "@dynatrace/strato-components/content";
import { TextInput } from "@dynatrace/strato-components-preview/forms";
import { Modal } from "@dynatrace/strato-components-preview/overlays";
import {
  ArrowLeftIcon,
  EditIcon,
  ImageIcon,
  MaximizeIcon,
  MinimizeIcon,
  PlusIcon,
  RefreshIcon,
  SaveIcon,
  ShareIcon,
} from "@dynatrace/strato-icons";
import Colors from "@dynatrace/strato-design-tokens/colors";
import {
  fileToDataUrl,
  getBackgroundImage,
  getView,
  updateView,
} from "../services/documentService";
import {
  DEFAULT_TILE_SIZE,
  generateId,
  MAX_BACKGROUND_BYTES,
  type LoadedView,
  type MetricTile,
  type MetricsGraphicView,
} from "../types/metricsView";
import { GlassCanvas } from "../components/GlassCanvas";
import { MetricExplorer } from "../components/MetricExplorer";
import { ShareDialog } from "../components/ShareDialog";
import { TileConfigForm, type TileConfig } from "../components/TileConfigForm";

const VIEW_REFRESH_MS = 30_000;
const EDIT_REFRESH_MS = 60_000;

export const ViewPage: React.FC = () => {
  const { id = "" } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [loaded, setLoaded] = useState<LoadedView | null>(null);
  const [version, setVersion] = useState<string>("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<"view" | "edit">(
    searchParams.get("mode") === "edit" ? "edit" : "view",
  );

  const [bgUrl, setBgUrl] = useState<string | null>(null);
  const [bgError, setBgError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editingTile, setEditingTile] = useState<MetricTile | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [shareOpen, setShareOpen] = useState(false);

  const [presenting, setPresenting] = useState(false);
  const [fitToken, setFitToken] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const bgFileRef = useRef<HTMLInputElement>(null);
  const bgUrlRef = useRef<string | null>(null);
  const fsRef = useRef<HTMLDivElement>(null);
  const bgInfoRef = useRef<{ size: number; type: string } | null>(null);

  // Load the view document.
  useEffect(() => {
    let active = true;
    setLoadError(null);
    getView(id)
      .then((res) => {
        if (!active) return;
        setLoaded(res);
        setVersion(res.version);
      })
      .catch((e) => {
        if (active) setLoadError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      active = false;
    };
  }, [id]);

  const view = loaded?.view ?? null;
  const backgroundImage = view?.backgroundImage ?? null;
  const backgroundDocId = view?.backgroundDocId ?? null;

  // Resolve the background: prefer the embedded data URL (loads for every user);
  // fall back to the legacy separate-document fetch for older views.
  useEffect(() => {
    let active = true;
    const revokePrev = () => {
      if (bgUrlRef.current) {
        URL.revokeObjectURL(bgUrlRef.current);
        bgUrlRef.current = null;
      }
    };

    if (backgroundImage) {
      revokePrev();
      bgInfoRef.current = null;
      setBgUrl(backgroundImage);
      setBgError(null);
      return;
    }
    if (!backgroundDocId) {
      revokePrev();
      setBgUrl(null);
      setBgError(null);
      return;
    }
    getBackgroundImage(backgroundDocId)
      .then(({ url, size, type }) => {
        if (!active) {
          URL.revokeObjectURL(url);
          return;
        }
        if (bgUrlRef.current) URL.revokeObjectURL(bgUrlRef.current);
        bgUrlRef.current = url;
        bgInfoRef.current = { size, type };
        setBgUrl(url);
        // An empty (0-byte) blob is a broken/empty upload, not a permission issue.
        setBgError(
          size === 0
            ? `Background image is empty (0 bytes) — the upload did not store image data. Document id: ${backgroundDocId}`
            : null,
        );
      })
      .catch((e) => {
        if (!active) return;
        setBgUrl(null);
        // Surface the real reason (e.g. 403 Forbidden) instead of a silent blank.
        setBgError(
          `Could not load background image (${backgroundDocId}): ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      });
    return () => {
      active = false;
    };
  }, [backgroundImage, backgroundDocId]);

  // Revoke any object URL on unmount.
  useEffect(
    () => () => {
      if (bgUrlRef.current) URL.revokeObjectURL(bgUrlRef.current);
    },
    [],
  );

  const mutateView = useCallback(
    (updater: (v: MetricsGraphicView) => MetricsGraphicView) => {
      setLoaded((prev) =>
        prev ? { ...prev, view: updater(prev.view) } : prev,
      );
      setDirty(true);
    },
    [],
  );

  function handleTilesChange(tiles: MetricTile[]) {
    mutateView((v) => ({ ...v, tiles }));
  }

  function handleAddTile(config: TileConfig) {
    const tile: MetricTile = {
      id: generateId(),
      source: config.source,
      metricKey: config.metricKey,
      aggregation: config.aggregation,
      lookback: config.lookback,
      dql: config.dql,
      markdown: config.markdown,
      shape: config.shape,
      rotation: config.rotation,
      lineWeight: config.lineWeight,
      lineDashed: config.lineDashed,
      lineArrows: config.lineArrows,
      shapeOnly: config.shapeOnly,
      transparent: config.transparent,
      backgroundColor: config.backgroundColor,
      filters: config.filters,
      thresholds: config.thresholds,
      label: config.label,
      unit: config.unit,
      link: config.link,
      x: 24,
      y: 24,
      width: DEFAULT_TILE_SIZE,
      height: DEFAULT_TILE_SIZE,
    };
    mutateView((v) => ({ ...v, tiles: [...v.tiles, tile] }));
  }

  function addShapeTile() {
    const tile: MetricTile = {
      id: generateId(),
      source: "shape",
      shape: "rectangle",
      backgroundColor: "#134fc9",
      filters: [],
      x: 24,
      y: 24,
      width: DEFAULT_TILE_SIZE,
      height: DEFAULT_TILE_SIZE,
    };
    mutateView((v) => ({ ...v, tiles: [...v.tiles, tile] }));
  }

  function handleApplyTileEdit(config: TileConfig) {
    if (!editingTile) return;
    const updatedId = editingTile.id;
    mutateView((v) => ({
      ...v,
      tiles: v.tiles.map((t) =>
        t.id === updatedId
          ? {
              ...t,
              source: config.source,
              metricKey: config.metricKey,
              aggregation: config.aggregation,
              lookback: config.lookback,
              dql: config.dql,
              markdown: config.markdown,
              shape: config.shape,
              rotation: config.rotation,
              lineWeight: config.lineWeight,
              lineDashed: config.lineDashed,
              lineArrows: config.lineArrows,
              shapeOnly: config.shapeOnly,
              transparent: config.transparent,
              backgroundColor: config.backgroundColor,
              filters: config.filters,
              thresholds: config.thresholds,
              label: config.label,
              unit: config.unit,
              link: config.link,
            }
          : t,
      ),
    }));
    setEditingTile(null);
  }

  function openRename() {
    setNameDraft(view?.name ?? "");
    setRenameOpen(true);
  }

  function applyRename() {
    const next = nameDraft.trim();
    if (next) mutateView((v) => ({ ...v, name: next }));
    setRenameOpen(false);
  }

  function handleBackgroundSize(size: { width: number; height: number }) {
    if (
      view &&
      (view.backgroundWidth !== size.width ||
        view.backgroundHeight !== size.height)
    ) {
      mutateView((v) => ({
        ...v,
        backgroundWidth: size.width,
        backgroundHeight: size.height,
      }));
    }
  }

  async function handleChangeBackground(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = "";
    if (!file) return;
    if (file.size > MAX_BACKGROUND_BYTES) {
      setSaveError(
        `Image is too large (max ${Math.round(
          MAX_BACKGROUND_BYTES / (1024 * 1024),
        )} MB). Please choose a smaller image.`,
      );
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      // Embed the image and drop any legacy separate-document reference.
      mutateView((v) => ({
        ...v,
        backgroundImage: dataUrl,
        backgroundDocId: null,
        backgroundWidth: undefined,
        backgroundHeight: undefined,
      }));
      setSaveError(null);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    }
  }

  // Presentation (full-screen) mode: uses the browser Fullscreen API so the
  // canvas fills the whole display with no Dynatrace chrome. Falls back to an
  // in-app maximized mode if the Fullscreen API is unavailable.
  useEffect(() => {
    function onFsChange() {
      setPresenting(document.fullscreenElement === fsRef.current);
      setFitToken((n) => n + 1);
    }
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  function togglePresent() {
    if (presenting || document.fullscreenElement) {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
      else setPresenting(false);
    } else if (fsRef.current?.requestFullscreen) {
      void fsRef.current.requestFullscreen().catch(() => setPresenting(true));
    } else {
      setPresenting(true);
    }
    setFitToken((n) => n + 1);
  }

  async function save(thenView = false) {
    if (!loaded) return;
    setSaving(true);
    setSaveError(null);
    try {
      const newVersion = await updateView(loaded.id, version, loaded.view);
      setVersion(newVersion);
      setDirty(false);
      if (thenView) setMode("view");
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function handleBack() {
    if (dirty && !window.confirm("Discard unsaved changes and leave?")) return;
    navigate("/");
  }

  if (loadError) {
    return (
      <Flex flexDirection="column" gap={12} padding={32}>
        <Text style={{ color: Colors.Text.Critical.Default }}>
          Failed to load view: {loadError}
        </Text>
        <Button variant="default" onClick={() => navigate("/")}>
          Back to library
        </Button>
      </Flex>
    );
  }

  if (!loaded || !view) {
    return (
      <Flex justifyContent="center" padding={48}>
        <ProgressCircle aria-label="Loading view" />
      </Flex>
    );
  }

  // Non-owners have read-only access, so editing is only allowed with write access.
  const editing = mode === "edit" && loaded.canEdit;

  return (
    <div
      ref={fsRef}
      style={{
        height: "100%",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        background: Colors.Background.Base.Default,
      }}
    >
      {/* Toolbar (hidden in full-screen presentation) */}
      {!presenting && (
      <Flex
        justifyContent="space-between"
        alignItems="center"
        style={{
          padding: "10px 16px",
          borderBottom: `1px solid ${Colors.Border.Neutral.Default}`,
          background: Colors.Background.Surface.Default,
        }}
      >
        <Flex alignItems="center" gap={12}>
          <Button variant="default" onClick={handleBack}>
            <Button.Prefix>
              <ArrowLeftIcon />
            </Button.Prefix>
            Library
          </Button>
          <Heading level={5}>{view.name}</Heading>
          {editing && (
            <Button
              variant="default"
              onClick={openRename}
              aria-label="Rename view"
              style={{ minWidth: "auto", padding: 4 }}
            >
              <Button.Prefix>
                <EditIcon />
              </Button.Prefix>
            </Button>
          )}
          {editing && (
            <Text
              style={{
                fontSize: 12,
                color: dirty
                  ? Colors.Text.Critical.Default
                  : Colors.Text.Neutral.Default,
              }}
            >
              {dirty ? "Unsaved changes" : "All changes saved"}
            </Text>
          )}
        </Flex>

        <Flex alignItems="center" gap={8}>
          {loaded.canShare && (
            <Button variant="default" onClick={() => setShareOpen(true)}>
              <Button.Prefix>
                <ShareIcon />
              </Button.Prefix>
              Share
            </Button>
          )}
          {editing ? (
            <>
              <input
                ref={bgFileRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => void handleChangeBackground(e)}
              />
              <Button
                variant="default"
                onClick={() => bgFileRef.current?.click()}
              >
                <Button.Prefix>
                  <ImageIcon />
                </Button.Prefix>
                {backgroundImage || backgroundDocId
                  ? "Change background"
                  : "Add background"}
              </Button>
              <Button variant="default" onClick={addShapeTile}>
                <Button.Prefix>
                  <PlusIcon />
                </Button.Prefix>
                Add shape
              </Button>
              <Button
                variant="default"
                onClick={() => void save(false)}
                loading={saving}
                disabled={!dirty}
              >
                <Button.Prefix>
                  <SaveIcon />
                </Button.Prefix>
                Save
              </Button>
              <Button
                variant="accent"
                onClick={() => void save(true)}
                loading={saving}
              >
                Done
              </Button>
            </>
          ) : (
            <>
              <Flex alignItems="center" gap={4}>
                {refreshing ? (
                  <ProgressCircle size="small" aria-label="Refreshing data" />
                ) : (
                  <RefreshIcon />
                )}
                <Text style={{ fontSize: 12 }}>
                  {refreshing ? "Refreshing…" : "Auto-refresh 30s"}
                </Text>
              </Flex>
              <Button variant="default" onClick={togglePresent}>
                <Button.Prefix>
                  <MaximizeIcon />
                </Button.Prefix>
                Present
              </Button>
              {loaded.canEdit && (
                <Button variant="accent" onClick={() => setMode("edit")}>
                  <Button.Prefix>
                    <EditIcon />
                  </Button.Prefix>
                  Edit
                </Button>
              )}
            </>
          )}
        </Flex>
      </Flex>
      )}

      {!presenting && saveError && (
        <Text
          style={{
            color: Colors.Text.Critical.Default,
            fontSize: 13,
            padding: "6px 16px",
          }}
        >
          {saveError}
        </Text>
      )}

      {!presenting && bgError && (
        <Text
          style={{
            color: Colors.Text.Critical.Default,
            fontSize: 13,
            padding: "6px 16px",
          }}
        >
          {bgError}
        </Text>
      )}

      {/* Body: canvas (+ explorer in edit mode) */}
      <Flex style={{ flexGrow: 1, minHeight: 0, position: "relative" }}>
        <GlassCanvas
          tiles={view.tiles}
          backgroundUrl={bgUrl}
          backgroundWidth={view.backgroundWidth}
          backgroundHeight={view.backgroundHeight}
          editable={editing}
          refreshIntervalMs={editing ? EDIT_REFRESH_MS : VIEW_REFRESH_MS}
          fitToken={fitToken}
          onActivityChange={setRefreshing}
          onTilesChange={handleTilesChange}
          onEditTile={(t) => setEditingTile(t)}
          onBackgroundSize={handleBackgroundSize}
          onBackgroundError={() => {
            const info = bgInfoRef.current;
            setBgError(
              `Background image was fetched (${
                info ? `${info.size} bytes, type "${info.type || "unknown"}"` : "unknown size"
              }) but the browser could not display it — the stored file is likely not a valid image.`,
            );
          }}
        />
        {editing && (
          <MetricExplorer
            onAddTile={handleAddTile}
            currentViewId={loaded.id}
          />
        )}

        {/* Refreshing indicator (top-center) while presenting. */}
        {presenting && refreshing && (
          <Flex
            alignItems="center"
            gap={6}
            style={{
              position: "absolute",
              top: 12,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 20,
              padding: "4px 10px",
              borderRadius: 999,
              background: Colors.Background.Surface.Default,
              border: `1px solid ${Colors.Border.Neutral.Default}`,
              boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
            }}
          >
            <ProgressCircle size="small" aria-label="Refreshing data" />
            <Text style={{ fontSize: 12 }}>Refreshing…</Text>
          </Flex>
        )}

        {/* Floating exit control while presenting full-screen. */}
        {presenting && (
          <Button
            variant="default"
            onClick={togglePresent}
            aria-label="Exit full screen"
            style={{ position: "absolute", top: 12, right: 12, zIndex: 20 }}
          >
            <Button.Prefix>
              <MinimizeIcon />
            </Button.Prefix>
            Exit
          </Button>
        )}
      </Flex>

      {/* Share modal */}
      <ShareDialog
        show={shareOpen}
        documentId={loaded.id}
        viewName={view.name}
        isPrivate={loaded.isPrivate}
        version={version}
        legacyBackgroundDocId={backgroundDocId}
        onVisibilityChange={(isPrivate, newVersion) => {
          setVersion(newVersion);
          setLoaded((prev) => (prev ? { ...prev, isPrivate } : prev));
        }}
        onDismiss={() => setShareOpen(false)}
      />

      {/* Rename-view modal */}
      <Modal
        title="Rename view"
        show={renameOpen}
        onDismiss={() => setRenameOpen(false)}
        size="small"
        footer={
          <Flex gap={8} justifyContent="flex-end">
            <Button variant="default" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="accent"
              onClick={applyRename}
              disabled={nameDraft.trim().length === 0}
            >
              Rename
            </Button>
          </Flex>
        }
      >
        <Flex flexDirection="column" gap={4} style={{ paddingTop: 8 }}>
          <Text style={{ fontSize: 12, fontWeight: 600 }}>View name</Text>
          <TextInput
            value={nameDraft}
            onChange={setNameDraft}
            placeholder="View name"
          />
        </Flex>
      </Modal>

      {/* Edit-tile modal */}
      <Modal
        title="Edit metric tile"
        show={editingTile !== null}
        onDismiss={() => setEditingTile(null)}
        size="small"
      >
        {editingTile && (
          <TileConfigForm
            source={editingTile.source ?? "metric"}
            metricKey={editingTile.metricKey}
            currentViewId={loaded.id}
            initial={{
              aggregation: editingTile.aggregation,
              lookback: editingTile.lookback,
              dql: editingTile.dql,
              markdown: editingTile.markdown,
              shape: editingTile.shape,
              rotation: editingTile.rotation,
              lineWeight: editingTile.lineWeight,
              lineDashed: editingTile.lineDashed,
              lineArrows: editingTile.lineArrows,
              shapeOnly: editingTile.shapeOnly,
              transparent: editingTile.transparent,
              backgroundColor: editingTile.backgroundColor,
              filters: editingTile.filters,
              thresholds: editingTile.thresholds,
              label: editingTile.label,
              unit: editingTile.unit,
              link: editingTile.link,
            }}
            submitLabel="Apply"
            onSubmit={handleApplyTileEdit}
            onCancel={() => setEditingTile(null)}
          />
        )}
      </Modal>
    </div>
  );
};
