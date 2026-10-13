import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { VideoGenerateRequest } from "@shared/types";
import * as api from "@/lib/api";
import { describeApiError } from "@/lib/api";
import { useGenerations, usePage } from "@/store/generations";
import { useSettings } from "@/store/settings";
import { Page } from "@/components/layout/Page";
import { VideoPanel } from "@/components/video/VideoPanel";
import { VideoCanvas, type CanvasTab } from "@/components/video/VideoCanvas";

const CANVAS_ID = "video-canvas";

/** Two-column video studio: sticky settings panel on the left, History / How it works canvas on the right. */
export default function VideoPage() {
  const page = usePage({ type: "video" });
  const fetchPage = useGenerations((s) => s.fetchPage);
  const server = useSettings((s) => s.server);
  const [tab, setTab] = useState<CanvasTab>("history");

  useEffect(() => {
    void fetchPage({ type: "video" });
  }, [fetchPage]);

  // First load failed while the server was down → fetch once it's back.
  useEffect(() => {
    if (server === "online" && !page.loaded && !page.loading) void fetchPage({ type: "video" });
  }, [server, page.loaded, page.loading, fetchPage]);

  const handleSubmit = async (req: VideoGenerateRequest) => {
    try {
      const res = await api.generateVideo(req);
      useGenerations.getState().upsert(res.generations);
      setTab("history");
      const name = res.generations[0]?.modelName ?? "the model";
      toast.success(`Rendering with ${name}…`, { description: "Usually 2–5 min. Leave the page and the job keeps going." });
      // On stacked layouts the canvas sits below the panel: bring the new card into view.
      if (window.matchMedia("(max-width: 767px)").matches) {
        document.getElementById(CANVAS_ID)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    } catch (err) {
      toast.error("Generation failed", { description: describeApiError(err) });
    }
  };

  return (
    <Page className="flex flex-1 flex-col">
      <div className="grid flex-1 gap-4 md:grid-cols-[280px_minmax(0,1fr)] md:items-start md:gap-5 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-6">
        <VideoPanel
          onSubmit={handleSubmit}
          className="-m-0.5 p-0.5 md:sticky md:top-20 md:max-h-[calc(100dvh-104px)] md:overflow-y-auto md:overscroll-contain"
        />
        <VideoCanvas id={CANVAS_ID} tab={tab} onTabChange={setTab} className="min-h-[420px] scroll-mt-20" />
      </div>
    </Page>
  );
}
