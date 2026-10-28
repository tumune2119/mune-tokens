import type { ComponentRecord } from "@/lib/components/schema";

/** A library entry as the API returns it (StoredComponent, minus server-only types). */
export type StoredComponentClient = ComponentRecord & { plan: { usedIn?: string[]; variants?: string[]; states?: string[] } };
