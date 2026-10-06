import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const STUDENT_EMAIL = /^[a-z0-9._%+-]+@student\.cuk\.ac\.ke$/i;
export const STAFF_EMAIL = /^([a-z0-9._%+-]+@cuk\.ac\.ke|k\.o\.deb\.collection@gmail\.com)$/i;

export async function uploadPhoto(userId: string, name: string, file: File) {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${userId}/${name}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from("photos")
    .upload(path, file, { contentType: file.type || "image/jpeg", upsert: true });
  if (error) throw error;
  return path;
}

export function useSignedUrl(path: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setUrl(null);
    if (!path) return;
    supabase.storage
      .from("photos")
      .createSignedUrl(path, 600)
      .then(({ data }) => alive && setUrl(data?.signedUrl ?? null));
    return () => {
      alive = false;
    };
  }, [path]);
  return url;
}

export function errMsg(err: unknown) {
  if (err && typeof err === "object" && "message" in err) return String((err as { message: string }).message);
  return "Could not reach the server. Check your connection and try again.";
}
