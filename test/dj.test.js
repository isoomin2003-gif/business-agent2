import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { config, PATHS } from '../server/config.js';
import { TRACKS, BASE_TRACKS, VOCAB } from '../server/tracks.js';
import { searchTracks, recommend, SEARCH_TOOL } from '../server/dj.js';
import { startMockOpenRouter } from './mock-openrouter.js';

let mock;
before(async () => { mock = await startMockOpenRouter(); });
after(() => mock.close());
const useAi = (p = '/api/v1', key = 'k') => { config.openrouter.apiKey = key; config.openrouter.baseUrl = mock.url + p; };

test('음원 목록: 16곡, 기본 방송 4곡, 모든 곡 CC0·출처·파일 존재', () => {
  assert.equal(TRACKS.length, 16);
  assert.deepEqual(BASE_TRACKS.map((t) => t.id), ['chill-lofi-inspired', 'emotional-piano-loop', 'lofi-again', 'november-snow']);
  for (const t of TRACKS) {
    assert.equal(t.license, 'CC0 1.0', t.id);
    assert.match(t.sourceUrl, /^https:\/\/opengameart\.org\/content\//);
    assert.ok(fs.existsSync(path.join(PATHS.public, t.file)), t.file);
    assert.ok(t.moods.length && VOCAB.tempo.includes(t.tempo), t.id);
  }
  // 도구 정의의 선택지는 실제 목록의 값과 같음
  assert.deepEqual(SEARCH_TOOL.function.parameters.properties.moods.items.enum, VOCAB.moods);
});

test('search_tracks: 피할 분위기는 제외하고 맞는 조건이 많은 순', () => {
  const r = searchTracks({ scenes: ['밤'], moods: ['따뜻한', '평화로운'], avoid_moods: ['쓸쓸한'] });
  assert.equal(r.results[0].id, 'against-wanderlust');
  assert.ok(r.results.every((t) => !t.moods.includes('쓸쓸한')));
  assert.equal(searchTracks({ scenes: ['없는장면'] }).count, 0);
});

test('AI DJ: 첫 검색에서 고름', async () => {
  useAi();
  const r = await recommend('밤에 산책할 때 들을 곡인데 너무 쓸쓸하지 않았으면 좋겠어');
  assert.equal(r.status, 'ok');
  assert.equal(r.track.id, 'against-wanderlust');
  assert.deepEqual(r.trace.map((t) => t.kind), ['search', 'pick']);
});

test('AI DJ: 맞는 곡이 없으면 조건을 바꿔 한 번 더 검색', async () => {
  useAi();
  const r = await recommend('비 오는 날 듣기 좋은 고토 연주 틀어줘');
  assert.equal(r.status, 'ok'); // '틀어줘'여도 추천만 (대기열은 서버의 radio:request로만)
  assert.equal(r.track.id, 'hot-springs-town');
  assert.deepEqual(r.trace.filter((t) => t.kind === 'search').map((t) => t.round), [1, 2]);
});

test('AI DJ: 끝까지 없으면 none, 검색은 최대 2회', async () => {
  useAi();
  const r = await recommend('헤비 메탈 틀어줘');
  assert.equal(r.status, 'none');
  assert.equal(r.trace.filter((t) => t.kind === 'search').length, 2);
});

test('AI DJ: 연결 실패·키 없음', async () => {
  useAi('/fail/api/v1');
  assert.equal((await recommend('밤 산책')).status, 'api_error');
  useAi('/api/v1', '');
  assert.equal((await recommend('밤 산책')).status, 'no_key');
});
