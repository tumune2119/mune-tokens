import type { Metadata } from "next";
import { getSettings } from "@/lib/settings";
import { NewSystem } from "@/components/new-system/new-system";
import { SCOPES, type SystemSettings } from "@/lib/tokens/schema";

export const metadata: Metadata = { title: "New system" };

export default function NewSystemPage() {
  const s = getSettings();
  const defaults: SystemSettings = {
    steps: s.defaultSteps,
    modes: s.defaultModes,
    contrast: s.defaultContrast,
    scope: [...SCOPES],
    uiConfig: "tokens+rules",
    figmaUrl: "",
    style: [],
    distinctive: true,
  };
  return <NewSystem defaults={defaults} />;
}
