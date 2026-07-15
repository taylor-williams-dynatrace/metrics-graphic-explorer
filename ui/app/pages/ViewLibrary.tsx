import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Flex, Grid, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Paragraph, Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { ProgressCircle } from "@dynatrace/strato-components/content";
import { TextInput } from "@dynatrace/strato-components-preview/forms";
import { PlusIcon, DeleteIcon } from "@dynatrace/strato-icons";
import Colors from "@dynatrace/strato-design-tokens/colors";
import type { DocumentMetaData } from "@dynatrace-sdk/client-document";
import {
  createView,
  deleteView,
  fileToDataUrl,
  listViews,
} from "../services/documentService";
import { createEmptyView, MAX_BACKGROUND_BYTES } from "../types/metricsView";
import { CreateViewModal } from "../components/CreateViewModal";
import { MultiSelectField } from "../components/MultiSelectField";

type CategoryFilter = "mine" | "others";

/** A view is "mine" if I own it (owners have delete access; viewers don't). */
function isMine(meta: DocumentMetaData): boolean {
  return meta.access?.includes("delete") ?? false;
}

export const ViewLibrary: React.FC = () => {
  const navigate = useNavigate();
  const [views, setViews] = useState<DocumentMetaData[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [categories, setCategories] = useState<CategoryFilter[]>([
    "mine",
    "others",
  ]);

  const [modalOpen, setModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      setViews(await listViews());
    } catch (e) {
      setListError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const { mine, others } = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = term
      ? views.filter((v) => v.name.toLowerCase().includes(term))
      : views;
    return {
      mine: filtered.filter(isMine),
      others: filtered.filter((v) => !isMine(v)),
    };
  }, [views, search]);

  async function handleCreate(name: string, file: File | null) {
    setCreating(true);
    setCreateError(null);
    try {
      const view = createEmptyView(name);
      if (file) {
        if (file.size > MAX_BACKGROUND_BYTES) {
          throw new Error(
            `Image is too large (max ${Math.round(
              MAX_BACKGROUND_BYTES / (1024 * 1024),
            )} MB). Please choose a smaller image.`,
          );
        }
        view.backgroundImage = await fileToDataUrl(file);
      }
      const meta = await createView(view);
      setModalOpen(false);
      navigate(`/view/${encodeURIComponent(meta.id)}?mode=edit`);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(meta: DocumentMetaData, e: React.MouseEvent) {
    e.stopPropagation();
    if (!window.confirm(`Delete view “${meta.name}”? This cannot be undone.`)) {
      return;
    }
    try {
      await deleteView(meta.id);
      await refresh();
    } catch (err) {
      setListError(err instanceof Error ? err.message : String(err));
    }
  }

  function renderCard(meta: DocumentMetaData) {
    return (
      <Surface
        key={meta.id}
        elevation="raised"
        role="button"
        tabIndex={0}
        onClick={() => navigate(`/view/${encodeURIComponent(meta.id)}`)}
        onKeyDown={(e: React.KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            navigate(`/view/${encodeURIComponent(meta.id)}`);
          }
        }}
        style={{
          cursor: "pointer",
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          minHeight: 110,
        }}
      >
        <Flex justifyContent="space-between" alignItems="flex-start">
          <Heading level={6}>{meta.name}</Heading>
          {meta.access?.includes("delete") && (
            <Button
              variant="default"
              onClick={(e: React.MouseEvent) => void handleDelete(meta, e)}
              aria-label={`Delete ${meta.name}`}
              style={{ minWidth: "auto", padding: 4 }}
            >
              <Button.Prefix>
                <DeleteIcon />
              </Button.Prefix>
            </Button>
          )}
        </Flex>
        <Text style={{ fontSize: 12, color: Colors.Text.Neutral.Default }}>
          Updated{" "}
          {meta.modificationInfo?.lastModifiedTime
            ? new Date(meta.modificationInfo.lastModifiedTime).toLocaleString()
            : "—"}
        </Text>
      </Surface>
    );
  }

  function renderSection(title: string, list: DocumentMetaData[]) {
    return (
      <Flex flexDirection="column" gap={12}>
        <Flex alignItems="baseline" gap={8}>
          <Heading level={4}>{title}</Heading>
          <Text style={{ fontSize: 13, color: Colors.Text.Neutral.Default }}>
            {list.length}
          </Text>
        </Flex>
        {list.length === 0 ? (
          <Text style={{ fontSize: 13, color: Colors.Text.Neutral.Default }}>
            No views in this category.
          </Text>
        ) : (
          <Grid
            gridTemplateColumns="repeat(auto-fill, minmax(240px, 1fr))"
            gap={16}
          >
            {list.map(renderCard)}
          </Grid>
        )}
      </Flex>
    );
  }

  const showMine = categories.includes("mine");
  const showOthers = categories.includes("others");
  const nothingMatches =
    views.length > 0 && mine.length === 0 && others.length === 0;

  return (
    <Flex flexDirection="column" gap={24} padding={32}>
      <Flex justifyContent="space-between" alignItems="center">
        <Flex flexDirection="column" gap={4}>
          <Heading level={2}>Saved Canvas Views</Heading>
          <Paragraph>
            Place live metric tiles on top of a custom background image.
          </Paragraph>
        </Flex>
        <Button variant="accent" onClick={() => setModalOpen(true)}>
          <Button.Prefix>
            <PlusIcon />
          </Button.Prefix>
          New view
        </Button>
      </Flex>

      {loading ? (
        <Flex justifyContent="center" padding={48}>
          <ProgressCircle aria-label="Loading views" />
        </Flex>
      ) : listError ? (
        <Text style={{ color: Colors.Text.Critical.Default }}>
          Failed to load views: {listError}
        </Text>
      ) : views.length === 0 ? (
        <Flex
          flexDirection="column"
          alignItems="center"
          gap={12}
          padding={48}
          style={{
            border: `1px dashed ${Colors.Border.Neutral.Default}`,
            borderRadius: 8,
          }}
        >
          <Text>No views yet.</Text>
          <Button variant="emphasized" onClick={() => setModalOpen(true)}>
            <Button.Prefix>
              <PlusIcon />
            </Button.Prefix>
            Create your first view
          </Button>
        </Flex>
      ) : (
        <>
          <Flex gap={12} alignItems="flex-end" style={{ flexWrap: "wrap" }}>
            <Flex flexDirection="column" gap={4} style={{ width: 240 }}>
              <Text style={{ fontSize: 12, fontWeight: 600 }}>Search</Text>
              <TextInput
                type="search"
                value={search}
                placeholder="Filter by name…"
                onChange={setSearch}
              />
            </Flex>
            <Flex flexDirection="column" gap={4} style={{ width: 240 }}>
              <Text style={{ fontSize: 12, fontWeight: 600 }}>Show</Text>
              <MultiSelectField
                values={categories}
                ariaLabel="Filter by category"
                placeholder="Select categories…"
                onChange={(v) => setCategories(v as CategoryFilter[])}
                options={[
                  { value: "mine", label: "My Saved Canvases" },
                  { value: "others", label: "Other Views" },
                ]}
              />
            </Flex>
          </Flex>

          {categories.length === 0 ? (
            <Text style={{ color: Colors.Text.Neutral.Default }}>
              Select at least one category to show views.
            </Text>
          ) : nothingMatches ? (
            <Text style={{ color: Colors.Text.Neutral.Default }}>
              No views match “{search}”.
            </Text>
          ) : (
            <>
              {showMine && renderSection("My Saved Canvases", mine)}
              {showOthers && renderSection("Other Views", others)}
            </>
          )}
        </>
      )}

      <CreateViewModal
        show={modalOpen}
        busy={creating}
        error={createError}
        onDismiss={() => setModalOpen(false)}
        onCreate={(name, file) => void handleCreate(name, file)}
      />
    </Flex>
  );
};
