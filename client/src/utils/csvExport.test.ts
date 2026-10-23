import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadCsv } from "./csvExport";

afterEach(() => vi.restoreAllMocks());

describe("downloadCsv", () => {
  it("starts with a byte-order mark, so Excel on Windows shows £ and Ø as written (audit 2026-10-23 in-app)", async () => {
    let blob: Blob | null = null;
    URL.createObjectURL = vi.fn((b: Blob) => {
      blob = b;
      return "blob:x";
    }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    downloadCsv("x.csv", ["Player", "Price"], [["Ødegaard", "£6.8m"]]);
    const bytes = await new Promise<Uint8Array>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
      reader.readAsArrayBuffer(blob!);
    });
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes)).toBe("Player,Price\r\nØdegaard,£6.8m");
  });
});
