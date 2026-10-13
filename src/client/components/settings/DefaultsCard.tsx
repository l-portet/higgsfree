import { useEffect, useRef, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import type { CatalogModel, SettingsResponse } from "@shared/types";
import { describeApiError } from "@/lib/api";
import { useImageModel, useVideoModel } from "@/store/models";
import { useSettings } from "@/store/settings";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Skeleton } from "@/components/ui/Skeleton";
import { ModelPicker } from "@/components/ModelPicker";
import { ProviderTile } from "@/components/ProviderTile";
import { SettingsCard } from "./SettingsCard";

function ModelField({
  kind,
  label,
  value,
  onChange,
}: {
  kind: "image" | "video";
  label: string;
  value: string;
  onChange: (id: string) => void;
}) {
  const image = useImageModel(kind === "image" ? value : undefined);
  const video = useVideoModel(kind === "video" ? value : undefined);
  const model = kind === "image" ? image : video;
  const provider = model?.provider ?? value.split("/")[0] ?? "openrouter";
  const name = model?.name ?? value;

  return (
    <div className="min-w-0">
      <div className="mb-1.5 text-label" aria-hidden="true">
        {label}
      </div>
      <ModelPicker kind={kind} value={value} onChange={(m: CatalogModel) => onChange(m.id)} side="bottom" align="start">
        <Chip
          icon={<ProviderTile provider={provider} size={18} className="-ml-0.5" />}
          label={name}
          chevron
          aria-label={`${label}: ${name}`}
          className="max-w-full"
        />
      </ModelPicker>
      <p className="mt-1.5 truncate text-mono text-fg-subtle" title={value}>
        {value}
        {!model ? " · not in catalog" : ""}
      </p>
    </div>
  );
}

export function DefaultsCard({ settings }: { settings: SettingsResponse | null }) {
  const save = useSettings((s) => s.save);
  const server = useSettings((s) => s.server);
  const [imageModel, setImageModel] = useState<string>(settings?.defaults.imageModel ?? "");
  const [videoModel, setVideoModel] = useState<string>(settings?.defaults.videoModel ?? "");
  const [saving, setSaving] = useState(false);
  /** Set once the user picks a model; until then local state mirrors the server. */
  const edited = useRef(false);

  const serverImage = settings?.defaults.imageModel;
  const serverVideo = settings?.defaults.videoModel;
  const dirty = Boolean(settings) && (imageModel !== serverImage || videoModel !== serverVideo);

  // Follow server values (initial load, saves from elsewhere) until the user makes local edits.
  useEffect(() => {
    if (edited.current || serverImage === undefined || serverVideo === undefined) return;
    setImageModel(serverImage);
    setVideoModel(serverVideo);
  }, [serverImage, serverVideo]);

  const pickImage = (id: string) => {
    edited.current = true;
    setImageModel(id);
  };
  const pickVideo = (id: string) => {
    edited.current = true;
    setVideoModel(id);
  };

  const onSave = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      await save({ defaults: { imageModel, videoModel } });
      edited.current = false;
      toast.success("Defaults saved");
    } catch (err) {
      toast.error("Couldn't save defaults", { description: describeApiError(err) });
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    if (!settings) return;
    edited.current = false;
    setImageModel(settings.defaults.imageModel);
    setVideoModel(settings.defaults.videoModel);
  };

  return (
    <SettingsCard
      icon={<SlidersHorizontal />}
      title="Defaults"
      description="Preselected on the Image and Video pages until you pick another model."
      actions={
        <>
          {dirty ? (
            <Button size="sm" variant="ghost" onClick={reset} disabled={saving}>
              Reset
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="primary"
            loading={saving}
            aria-disabled={!dirty || server === "offline" ? true : undefined}
            onClick={() => {
              if (!dirty || server === "offline") return;
              void onSave();
            }}
          >
            Save
          </Button>
        </>
      }
    >
      {!settings ? (
        <div className="grid gap-4 sm:grid-cols-2" aria-busy="true">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <ModelField kind="image" label="Image model" value={imageModel} onChange={pickImage} />
          <ModelField kind="video" label="Video model" value={videoModel} onChange={pickVideo} />
        </div>
      )}
    </SettingsCard>
  );
}
