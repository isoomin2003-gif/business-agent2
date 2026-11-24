// 옥상 라디오 선곡표.
// 원본 배포 페이지(OpenGameArt)에서 제작자가 CC0로 공개했음을 확인한 곡만 등록합니다. (확인일: 2026-11-24)
// 원본 파일은 저장소 용량을 줄이기 위해 96kbps MP3로 다시 인코딩했습니다(CC0이므로 변형 허용).
export const TRACKS = [
  {
    id: 'chill-lofi-inspired',
    title: 'Chill lofi inspired',
    artist: 'omfgdude',
    genre: '로파이',
    file: '/media/music/chill-lofi-inspired.mp3',
    durationSec: 123.19,
    sourceUrl: 'https://opengameart.org/content/chill-lofi-inspired',
    license: 'CC0 1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    note: '원본 ChillLofiR.mp3를 96kbps로 재인코딩',
  },
  {
    id: 'emotional-piano-loop',
    title: 'Emotional piano loop',
    artist: 'extenz',
    genre: '피아노',
    file: '/media/music/emotional-piano-loop.mp3',
    durationSec: 111.39,
    sourceUrl: 'https://opengameart.org/content/emotional-piano-loop',
    license: 'CC0 1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    note: '27.8초 루프(Piano Loop.wav)를 4회 이어 붙여 96kbps MP3로 변환',
  },
  {
    id: 'lofi-again',
    title: 'Lofi again',
    artist: 'omfgdude',
    genre: '로파이',
    file: '/media/music/lofi-again.mp3',
    durationSec: 87.85,
    sourceUrl: 'https://opengameart.org/content/lofi-again',
    license: 'CC0 1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    note: '원본 lofiagain.ogg를 96kbps MP3로 변환',
  },
  {
    id: 'november-snow',
    title: 'November Snow',
    artist: 'cynicmusic (The Cynic Project)',
    genre: '앰비언트',
    file: '/media/music/november-snow.mp3',
    durationSec: 349.54,
    sourceUrl: 'https://opengameart.org/content/november-snow',
    license: 'CC0 1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    note: '원본 MP3를 96kbps로 재인코딩',
  },
];

export const TRACK_BY_ID = Object.fromEntries(TRACKS.map((t) => [t.id, t]));
