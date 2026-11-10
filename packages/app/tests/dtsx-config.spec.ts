import { describe, expect, it } from "vitest";
import { requireDtsx51 } from "../src/player/spatial/dtsx-config";

function sampleEntry() {
  const data = new Uint8Array(36);
  const view = new DataView(data.buffer);
  view.setUint16(8, 6);
  view.setUint32(16, 48000 * 65536);
  view.setUint32(20, 16);
  view.setUint32(24, 0x75647473);
  data[28] = 1;
  data[29] = 0x20;
  view.setUint32(30, 0x3f);
  data[34] = 0x80;
  return data;
}

describe("QQ DTS:X track configuration", () => {
  it("accepts the Profile 2 5.1 sample description", () => {
    expect(() => requireDtsx51({ data: sampleEntry() })).not.toThrow();
  });

  it("rejects object presentations, different profiles, and truncated boxes", () => {
    const objects = sampleEntry();
    objects[34] |= 4;
    const profile3 = sampleEntry();
    profile3[28] |= 4;
    for (const data of [objects, profile3, sampleEntry().subarray(0, 35)]) {
      expect(() => requireDtsx51({ data })).toThrow();
    }
  });
});
