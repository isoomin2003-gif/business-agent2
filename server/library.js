// 라디오가 재생할 수 있는 곡: 기본 선곡표(server/tracks.js) + 신청되어 추가된 곡(radio_tracks 표)
import { getDb, nowIso } from './db.js';
import { TRACK_BY_ID } from './tracks.js';

const added = new Map(); // id → 재생용 곡 정보

const LICENSE_NAME = { cc0: 'CC0', pdm: 'Public Domain Mark', by: 'CC BY', 'by-sa': 'CC BY-SA', generated: '이 사이트에서 AI로 만든 곡' };
export const licenseLabel = (license, version) => `${LICENSE_NAME[license] || license.toUpperCase()}${version && license !== 'cc0' && license !== 'pdm' ? ` ${version}` : ''}`;

function toPlayable(r) {
  return {
    id: r.id, kind: r.kind, title: r.title, artist: r.artist, genre: (r.genres || '').split(',').filter(Boolean)[0] || '',
    file: r.audio_url, durationSec: Number(r.duration_ms) / 1000, sourceUrl: r.source_url, source: r.source,
    license: licenseLabel(r.license, r.license_version), licenseUrl: r.license_url || '', attribution: r.attribution || '',
    // 저작자 표시가 필요한 라이선스(CC BY, CC BY-SA)는 화면에 표시
    needsAttribution: r.license === 'by' || r.license === 'by-sa', external: true,
  };
}

export async function loadLibrary() {
  const rows = await getDb().all('SELECT * FROM radio_tracks');
  rows.forEach((r) => added.set(r.id, toPlayable(r)));
  return added.size;
}

export const getTrack = (id) => TRACK_BY_ID[id] || added.get(id) || null;
export const addedIds = () => new Set(added.keys());
export const addedTracks = () => [...added.values()];

/** 신청된 외부 곡을 라디오 목록에 추가 (이미 있으면 그대로) */
export async function registerTrack(t, requestedBy) {
  if (added.has(t.id)) return added.get(t.id);
  const row = {
    id: t.id, kind: t.kind || 'external', source: t.source, title: t.title, artist: t.artist, audio_url: t.audioUrl, source_url: t.sourceUrl,
    license: t.license, license_version: t.licenseVersion || null, license_url: t.licenseUrl || null, attribution: t.attribution || null,
    duration_ms: Math.round(t.durationMs), genres: (t.genres || []).join(','), tags: (t.tags || []).join(','), requested_by: requestedBy || null, created_at: nowIso(),
  };
  await getDb().run(`INSERT INTO radio_tracks (id, kind, source, title, artist, audio_url, source_url, license, license_version, license_url, attribution, duration_ms, genres, tags, requested_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, Object.values(row));
  const p = toPlayable(row);
  added.set(p.id, p);
  return p;
}
