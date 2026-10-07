import fixtures from "../../../../MeT-Music_Backend/tests/fixtures/provider-contracts.json";
import { describe, expect, it } from "vitest";
import { QmcSongDetailSchema, QmcCommentsResponseSchema, RoomActionRequestSchema, responseSchemas } from "../src/api/contracts";
import { songIdentityKey } from "../src/types/song";
import { songToRoomSong } from "../src/listen-together/song";



describe("shared response contracts", () => {
  it("validates the backend's synthetic song/comment fixtures", () => {
    expect(QmcSongDetailSchema.parse(fixtures.song)).toEqual(fixtures.song);
    expect(QmcCommentsResponseSchema.parse(fixtures.comments)).toEqual(fixtures.comments);
  });
  it("accepts explicit empty and legacy-error branches", () => {
    expect(responseSchemas["/lyric/ttml"].parse({ status: "no_lyrics" })).toEqual({ status: "no_lyrics" });
    expect(responseSchemas["/search/hot/detail"].parse({ code: 404, message: "Failed" })).toEqual({ code: 404, message: "Failed" });
  });
  it("rejects arbitrary room metadata", () => {
    expect(RoomActionRequestSchema.safeParse({ action: "play", userId: "u", extension: true }).success).toBe(false);
    expect(RoomActionRequestSchema.safeParse({ action: "seek", userId: "u", data: { index: 0 } }).success).toBe(false);
    expect(RoomActionRequestSchema.safeParse({ action: "play", userId: "u", data: { index: 0 } }).success).toBe(false);
  });
  it("provider-aware identity normalizes numeric ID representations", () => {
    expect(songIdentityKey({ source: "qqmusic", id: 123 })).toBe(songIdentityKey({ id: "123" }));
    expect(songIdentityKey({ source: "netease", id: "123" })).not.toBe(songIdentityKey({ id: "123" }));
  });
  it("projects domain metadata onto the closed room wire shape", () => {
    const song = songToRoomSong({ id: "123", name: "sample", count: 99, artists: [{ id: "s", name: "artist", mid: "s" }] });
    expect(song.source).toBe("qqmusic");
    expect(song).not.toHaveProperty("count");
    expect(song.artists).toEqual([{ id: "s", name: "artist" }]);
  });
});
