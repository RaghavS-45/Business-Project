import api from "@/lib/axios";

/**
 * Fetch a PDF from the API (with the auth header) and open it in a new tab,
 * or download it if pop-ups are blocked.
 */
export async function openPdf(path: string, filename: string) {
  // Open the tab synchronously, inside the click, so pop-up blockers allow it
  const tab = window.open("", "_blank");
  try {
    const { data } = await api.get(path, { responseType: "blob" });
    const url = URL.createObjectURL(new Blob([data], { type: "application/pdf" }));
    if (tab) {
      tab.location.href = url;
    } else {
      const a = document.createElement("a");
      a.href = url;
      a.download = `${filename}.pdf`;
      a.click();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e) {
    tab?.close();
    throw e;
  }
}
