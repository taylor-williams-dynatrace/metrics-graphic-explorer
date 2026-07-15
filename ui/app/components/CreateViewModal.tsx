import React, { useRef, useState } from "react";
import { Modal } from "@dynatrace/strato-components-preview/overlays";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { TextInput } from "@dynatrace/strato-components-preview/forms";
import { ImageIcon } from "@dynatrace/strato-icons";
import Colors from "@dynatrace/strato-design-tokens/colors";

type BackgroundChoice = "image" | "blank";

/** Light dashed outline for the not-currently-selected toggle, so it reads as a button. */
function unselectedToggleStyle(
  unselected: boolean,
): React.CSSProperties | undefined {
  return unselected
    ? { border: `1px dashed ${Colors.Border.Neutral.Default}` }
    : undefined;
}

interface CreateViewModalProps {
  show: boolean;
  busy: boolean;
  error?: string | null;
  onDismiss: () => void;
  onCreate: (name: string, backgroundFile: File | null) => void;
}

/**
 * Modal for creating a new Metrics Graphical View: a name plus an optional
 * background image which becomes the static backdrop for the view.
 */
export const CreateViewModal: React.FC<CreateViewModalProps> = ({
  show,
  busy,
  error,
  onDismiss,
  onCreate,
}) => {
  const [name, setName] = useState("");
  const [bgChoice, setBgChoice] = useState<BackgroundChoice>("image");
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setName("");
    setBgChoice("image");
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleDismiss() {
    reset();
    onDismiss();
  }

  function chooseBlank() {
    setBgChoice("blank");
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const needsFile = bgChoice === "image";
  const canCreate =
    name.trim().length > 0 && !busy && (!needsFile || file !== null);

  return (
    <Modal
      title="Create a new Metrics Graphical View"
      show={show}
      onDismiss={handleDismiss}
      size="small"
      footer={
        <Flex gap={8} justifyContent="flex-end">
          <Button variant="default" onClick={handleDismiss} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="accent"
            disabled={!canCreate}
            loading={busy}
            onClick={() => onCreate(name.trim(), bgChoice === "image" ? file : null)}
          >
            Create view
          </Button>
        </Flex>
      }
    >
      <Flex flexDirection="column" gap={16} style={{ paddingTop: 8 }}>
        <Flex flexDirection="column" gap={4}>
          <Text style={{ fontSize: 12, fontWeight: 600 }}>View name</Text>
          <TextInput
            value={name}
            onChange={setName}
            placeholder="e.g. Production data flow"
          />
        </Flex>

        <Flex flexDirection="column" gap={8}>
          <Text style={{ fontSize: 12, fontWeight: 600 }}>
            Background — select an option
          </Text>
          <Flex gap={8}>
            <Button
              variant={bgChoice === "image" ? "accent" : "default"}
              onClick={() => setBgChoice("image")}
              style={unselectedToggleStyle(bgChoice !== "image")}
            >
              <Button.Prefix>
                <ImageIcon />
              </Button.Prefix>
              Upload image
            </Button>
            <Button
              variant={bgChoice === "blank" ? "accent" : "default"}
              onClick={chooseBlank}
              style={unselectedToggleStyle(bgChoice !== "blank")}
            >
              Blank background
            </Button>
          </Flex>

          {bgChoice === "image" ? (
            <Flex flexDirection="column" gap={4}>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <Flex gap={8} alignItems="center">
                <Button
                  variant="default"
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    backgroundColor: Colors.Background.Container.Neutral.Emphasized,
                    border: `1px solid ${Colors.Border.Neutral.Default}`,
                  }}
                >
                  <Button.Prefix>
                    <ImageIcon />
                  </Button.Prefix>
                  {file ? "Change image…" : "Choose image…"}
                </Button>
                {file && (
                  <Text
                    style={{
                      fontSize: 12,
                      color: Colors.Text.Neutral.Default,
                    }}
                  >
                    {file.name}
                  </Text>
                )}
              </Flex>
              <Text
                style={{ fontSize: 12, color: Colors.Text.Neutral.Default }}
              >
                You can also change the background later while editing.
              </Text>
            </Flex>
          ) : (
            <Text style={{ fontSize: 12, color: Colors.Text.Neutral.Default }}>
              Starts with a blank canvas. You can add a background image later
              while editing.
            </Text>
          )}
        </Flex>

        {error && (
          <Text style={{ color: Colors.Text.Critical.Default, fontSize: 13 }}>
            {error}
          </Text>
        )}
      </Flex>
    </Modal>
  );
};
