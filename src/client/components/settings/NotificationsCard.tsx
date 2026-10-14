import { useEffect, useId, useState, type ReactNode } from "react";
import { Bell, BellRing, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { notificationSupport, playDing, readAlertPrefs, requestNotificationPermission, showVideoNotification, writeAlertPrefs, type AlertPrefs, type NotifySupport } from "@/lib/alerts";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import { SettingsCard } from "./SettingsCard";

function SettingRow({ title, hint, control, extra }: { title: string; hint: ReactNode; control: (labelId: string, hintId: string) => ReactNode; extra?: ReactNode }) {
  const labelId = useId();
  const hintId = useId();
  return (
    <div className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <div id={labelId} className="text-body font-medium text-fg">
          {title}
        </div>
        <div id={hintId} className="mt-0.5 text-meta">
          {hint}
        </div>
        {extra ? <div className="mt-2">{extra}</div> : null}
      </div>
      <div className="pt-0.5">{control(labelId, hintId)}</div>
    </div>
  );
}

const SAMPLE = { id: "gen_test", modelName: "higgsfree", prompt: "This is what you'll see when a video is ready." };

/** Settings › Notifications: a ding and a system notification when a video finishes rendering. */
export function NotificationsCard() {
  const [prefs, setPrefs] = useState<AlertPrefs>(() => readAlertPrefs());
  const [support, setSupport] = useState<NotifySupport>(() => notificationSupport());
  const [asking, setAsking] = useState(false);

  // Permission can change in the browser's site settings while the dialog is open.
  useEffect(() => {
    const refresh = () => setSupport(notificationSupport());
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  const setSound = (sound: boolean) => {
    setPrefs(writeAlertPrefs({ sound }));
    if (sound) playDing(); // the click unlocks audio, and you hear what you picked
  };

  const setNotify = async (notify: boolean) => {
    if (!notify) {
      setPrefs(writeAlertPrefs({ notify: false }));
      return;
    }
    let state = notificationSupport();
    if (state === "default") {
      setAsking(true);
      state = await requestNotificationPermission();
      setAsking(false);
    }
    setSupport(state);
    if (state === "granted") setPrefs(writeAlertPrefs({ notify: true }));
    else if (state === "denied") toast.error("Notifications are blocked", { description: "Allow them for this site in the browser's settings, then turn this on again." });
  };

  const sendTest = () => {
    if (!showVideoNotification(SAMPLE, undefined, { title: "Video ready (test)", silent: prefs.sound })) {
      toast.error("Couldn't show a notification", { description: "This browser only shows them from an installed app." });
    }
    if (prefs.sound) playDing();
  };

  const notifyOn = prefs.notify && support === "granted";
  const notifyHint: ReactNode =
    support === "unsupported"
      ? "This browser can't show notifications here."
      : support === "denied"
        ? "Blocked for this site. Allow notifications in the browser's site settings first."
        : "A system notification with the model and prompt, even when this tab is in the background. Click it to open the video.";

  return (
    <SettingsCard icon={<BellRing />} title="Video ready" description="Videos take a few minutes. Keep working elsewhere and get told when one is done.">
      <div className="divide-y divide-border">
        <SettingRow
          title="Play a sound"
          hint="A short ding when a video finishes rendering."
          control={(labelId, hintId) => <Switch checked={prefs.sound} onCheckedChange={setSound} aria-labelledby={labelId} aria-describedby={hintId} />}
          extra={
            <Button size="sm" variant="ghost" leftIcon={<Volume2 />} onClick={playDing} className="-ml-3">
              Preview
            </Button>
          }
        />
        <SettingRow
          title="Show a notification"
          hint={notifyHint}
          control={(labelId, hintId) => (
            <Switch
              checked={notifyOn}
              onCheckedChange={(on) => void setNotify(on)}
              disabled={support === "unsupported" || asking}
              aria-labelledby={labelId}
              aria-describedby={hintId}
            />
          )}
          extra={
            notifyOn ? (
              <Button size="sm" variant="ghost" leftIcon={<Bell />} onClick={sendTest} className="-ml-3">
                Send a test
              </Button>
            ) : undefined
          }
        />
      </div>
      <p className="mt-4 text-meta">Both need this site open in a tab; a background tab is fine. They stay in this browser.</p>
    </SettingsCard>
  );
}
