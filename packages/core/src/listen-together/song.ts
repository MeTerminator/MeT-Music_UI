import { RoomPlaylistSongSchema, type RoomPlaylistSong } from "../api/contracts";
import type { Song } from "../types/song";

/** Convert nullable wire values into the UI domain's optional display fields. */
export function roomSongToSong(song: RoomPlaylistSong): Song {
  return {
    id: song.id,
    name: song.name,
    source: song.source ?? (song.path ? "local" : "qqmusic"),
    artists: typeof song.artists === "string" ? song.artists : song.artists?.map(a => ({ id: a.id ?? undefined, name: a.name })),
    album: typeof song.album === "string" ? song.album : song.album ? { id: song.album.id ?? undefined, name: song.album.name } : undefined,
    coverSize: song.coverSize ? { s: song.coverSize.s ?? undefined, m: song.coverSize.m ?? undefined, l: song.coverSize.l ?? undefined, xl: song.coverSize.xl ?? undefined } : undefined,
    cover: song.cover ?? undefined,
    duration: song.duration ?? undefined,
    path: song.path ?? undefined,
    localCover: song.localCover ?? undefined,
    pc: song.pc ?? undefined,
    mv: song.mv,
    alia: song.alia ?? undefined,
    fee: song.fee ?? undefined,
    size: song.size ?? undefined,
    ttml: song.ttml ?? undefined,
    added_by: song.added_by,
    added_by_uid: song.added_by_uid,
  };
}

export function songToRoomSong(song: Song): RoomPlaylistSong {
  return RoomPlaylistSongSchema.parse({
    id: song.id, name: song.name, source: song.source ?? (song.path ? "local" : "qqmusic"),
    artists: typeof song.artists === "string" ? song.artists : song.artists?.map(a => ({ id: a.id, name: a.name })),
    album: typeof song.album === "string" ? song.album : song.album ? { id: song.album.id, name: song.album.name } : undefined,
    coverSize: song.coverSize, cover: song.cover, duration: song.duration,
    path: song.path, localCover: song.localCover, pc: song.pc, mv: song.mv, alia: song.alia,
    fee: song.fee, size: typeof song.size === "number" ? song.size : undefined, ttml: song.ttml,
    added_by: song.added_by, added_by_uid: song.added_by_uid,
  });
}
