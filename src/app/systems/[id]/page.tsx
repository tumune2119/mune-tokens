import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSystem, uiConfigState } from "@/lib/systems";
import { SystemEditor } from "@/components/editor/system-editor";

export async function generateMetadata({ params }: PageProps<"/systems/[id]">): Promise<Metadata> {
  const { id } = await params;
  return { title: getSystem(id)?.name ?? "System" };
}

export default async function SystemPage({ params }: PageProps<"/systems/[id]">) {
  const { id } = await params;
  const rec = getSystem(id);
  if (!rec) notFound();
  const ui = uiConfigState(rec);
  return (
    <SystemEditor
      key={rec.id}
      initial={{
        id: rec.id,
        name: rec.name,
        brief: rec.brief,
        settings: rec.settings,
        tokens: rec.tokens,
        version: rec.version,
        status: rec.status,
        folder: rec.folder,
        folderError: rec.folderError,
        uiConfigEdited: ui.state === "edited",
      }}
    />
  );
}
