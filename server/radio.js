// 옥상 라디오: 서버가 곡과 시작 시각을 정하고 모든 청취자가 같은 지점을 재생합니다.
import crypto from 'node:crypto';
import { BASE_TRACKS } from './tracks.js';
import { getTrack } from './library.js';

export const MAX_QUEUE = 20;
export const ONE_REQUEST_MESSAGE = '이미 곡을 신청하셨어요. 신청한 곡이 끝날 때까지 기다려 주세요!';

export function createRadio(onChange) {
  const state = { current: null, queue: [], defaultIndex: 0 };
  let timer = null;

  function start(trackId, request = null) {
    state.current = { trackId, startedAt: Date.now(), requestedBy: request?.nickname || null, requestId: request?.id || null, requestUserId: request?.userId || null };
    schedule();
    onChange('started');
  }
  function schedule() {
    clearTimeout(timer);
    const t = getTrack(state.current.trackId);
    const endAt = state.current.startedAt + t.durationSec * 1000;
    timer = setTimeout(next, Math.max(0, endAt - Date.now()) + 300);
    timer.unref?.();
  }
  function next() {
    const req = state.queue.shift();
    if (req) return start(req.trackId, req);
    // 신청곡이 없으면 기본 방송 4곡을 순서대로
    const t = BASE_TRACKS[state.defaultIndex % BASE_TRACKS.length];
    state.defaultIndex++;
    start(t.id);
  }

  return {
    state,
    begin() { next(); },
    snapshot() {
      return {
        serverNow: Date.now(),
        current: state.current && { ...state.current, track: getTrack(state.current.trackId) },
        queue: state.queue.map((q) => ({ id: q.id, trackId: q.trackId, title: getTrack(q.trackId)?.title || '', artist: getTrack(q.trackId)?.artist || '', nickname: q.nickname, userId: q.userId })),
      };
    },
    /** 지금 재생 중이거나 대기 중인 곡 id */
    activeIds() { return new Set([state.current?.trackId, ...state.queue.map((q) => q.trackId)].filter(Boolean)); },
    /** 한 사람당 한 번에 한 곡: 내 신청곡이 대기 중이거나 지금 재생 중이면 새 신청 불가 (곡이 끝나면 다시 가능) */
    hasActiveRequest(user) { return state.queue.some((q) => q.userId === user.id) || state.current?.requestUserId === user.id; },
    /** 1인 1곡·대기열 한도를 지금 통과할 수 있는지 (외부 곡·AI 작곡곡을 등록하기 전에 확인) */
    canRequest(user) { return !this.hasActiveRequest(user) && state.queue.length < MAX_QUEUE; },
    request(user, trackId) {
      // 확인과 등록이 한 번에(중간에 await 없이) 일어나므로, 연속 클릭·여러 탭에서 동시에 눌러도 한 건만 들어감
      if (this.hasActiveRequest(user)) return { ok: false, code: 'mine', message: ONE_REQUEST_MESSAGE };
      if (!getTrack(trackId)) return { ok: false, message: '라디오에서 재생할 수 없는 곡이에요.' };
      // 같은 곡이 이미 대기 중이거나 재생 중이면 한 번만 (동시에 눌러도 서버에서 한 건만 등록)
      if (state.queue.some((q) => q.trackId === trackId) || state.current?.trackId === trackId) return { ok: false, code: 'already', message: '이미 신청된 곡이에요.' };
      if (state.queue.length >= MAX_QUEUE) return { ok: false, message: '대기열이 가득 찼어요. 잠시 후 다시 신청해 주세요.' };
      const item = { id: crypto.randomUUID(), trackId, userId: user.id, nickname: user.nickname, at: Date.now() };
      state.queue.push(item);
      onChange('queued');
      return { ok: true, position: state.queue.length };
    },
    /** 시연용: 현재 곡이 secondsLeft초 뒤에 끝나도록 앞당김 */
    fastForward(secondsLeft = 8) {
      const t = getTrack(state.current.trackId);
      state.current.startedAt = Date.now() - (t.durationSec - secondsLeft) * 1000;
      schedule();
      onChange('seek');
    },
    stop() { clearTimeout(timer); },
  };
}
