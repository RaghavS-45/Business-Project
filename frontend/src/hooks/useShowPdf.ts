import { useState } from "react";
import { toast } from "sonner";
import { openPdf } from "@/lib/pdf";
import { getErrorMessage } from "@/lib/errors";

/** Open a document PDF in a new tab; `loading` holds the key being fetched. */
export function useShowPdf() {
  const [loading, setLoading] = useState<string | null>(null);
  const show = async (key: string, path: string, filename: string) => {
    setLoading(key);
    try {
      await openPdf(path, filename);
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't load the PDF"));
    } finally {
      setLoading(null);
    }
  };
  return { show, loading };
}
