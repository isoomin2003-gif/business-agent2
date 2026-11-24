// 옥상 라디오 음원 목록 (16곡)
// - 원본 배포 페이지(OpenGameArt)에서 라이선스 표시가 CC0뿐인지, 받은 녹음 파일이 그 페이지에 실제로 올라 있는지 확인 (2026-11-24)
// - 받은 파일을 ffmpeg로 처음부터 끝까지 디코딩해 재생 가능 여부 확인, 96kbps MP3로 다시 인코딩(CC0이므로 변형 허용)
// - base: true 인 4곡은 신청곡이 없을 때 순서대로 나오는 기본 방송
//
// 추천용 정보의 근거
// - moods / scenes / instruments: 제작자가 원본 페이지에 단 태그와 설명을 한국어로 옮긴 것 (설명에 악기가 없으면 비워 둠)
// - bpm: 음원 분석(온셋 포락선 자기상관)으로 잰 값. 제작자가 BPM을 밝힌 두 곡(Friends, 2018: 90 / Emotional piano loop: 138)은 89 / 136으로 측정되어 일치
// - tempo: 측정 BPM 기준(느림 < 90, 보통 90–115, 빠름 > 115). 제작자가 빠르기를 직접 밝힌 경우(slow, downtempo)와
//          박자감이 거의 없는 앰비언트(측정 신뢰도 낮음)는 '느림'
const CC0 = { license: 'CC0 1.0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/' };

export const TRACKS = [
  // ── 기본 방송 4곡 ──
  {
    id: 'chill-lofi-inspired', title: 'Chill lofi inspired', artist: 'omfgdude', base: true,
    file: '/media/music/chill-lofi-inspired.mp3', durationSec: 123.19, sourceUrl: 'https://opengameart.org/content/chill-lofi-inspired', ...CC0,
    genre: '로파이', moods: ['편안한', '차분한'], scenes: [], instruments: ['피아노', '드럼'], tempo: '보통', bpm: 103,
    basis: '태그: chill, lofi, jazzy, piano, drums / 설명: 로파이 힙합에서 영감, Yamaha CVP-701 스타일로 한 번에 연주', note: '원본 ChillLofiR.mp3를 96kbps로 재인코딩',
  },
  {
    id: 'emotional-piano-loop', title: 'Emotional piano loop', artist: 'extenz', base: true,
    file: '/media/music/emotional-piano-loop.mp3', durationSec: 111.39, sourceUrl: 'https://opengameart.org/content/emotional-piano-loop', ...CC0,
    genre: '피아노', moods: ['감성적인', '쓸쓸한'], scenes: [], instruments: ['피아노'], tempo: '빠름', bpm: 136,
    basis: '태그: piano, sad, emotional / 설명: 138BPM 피아노 루프(측정 136)', note: '27.8초 루프(Piano Loop.wav)를 4회 이어 붙여 96kbps MP3로 변환',
  },
  {
    id: 'lofi-again', title: 'Lofi again', artist: 'omfgdude', base: true,
    file: '/media/music/lofi-again.mp3', durationSec: 87.85, sourceUrl: 'https://opengameart.org/content/lofi-again', ...CC0,
    genre: '로파이', moods: ['편안한', '차분한'], scenes: [], instruments: ['신시사이저', '드럼'], tempo: '빠름', bpm: 117,
    basis: '태그: lofi, hiphop, chill / 설명: Korg Triton 신시사이저로 만든 4개 악기 트랙과 앰비언스', note: '원본 lofiagain.ogg를 96kbps MP3로 변환',
  },
  {
    id: 'november-snow', title: 'November Snow', artist: 'cynicmusic (The Cynic Project)', base: true,
    file: '/media/music/november-snow.mp3', durationSec: 349.54, sourceUrl: 'https://opengameart.org/content/november-snow', ...CC0,
    genre: '앰비언트', moods: ['차분한', '몽환적인', '편안한'], scenes: ['눈', '겨울'], instruments: ['신시사이저', '피아노'], tempo: '느림', bpm: 123,
    basis: '태그: Ambient, downtempo, slow, calm, relaxing, electronic, piano / 설명: ethereal, calm and relaxing (제작자가 slow·downtempo로 밝혀 느림으로 분류)', note: '원본 MP3를 96kbps로 재인코딩 (제작자 요청에 따라 크레딧 표기)',
  },
  // ── AI DJ 추천용 추가 12곡 ──
  {
    id: 'feel-good-slow-ambient', title: 'Feel good slow ambient track with a beat.', artist: 'annandistance',
    file: '/media/music/feel-good-slow-ambient-track-with-a-beat.mp3', durationSec: 114.73, sourceUrl: 'https://opengameart.org/content/feel-good-slow-ambient-track-with-a-beat', ...CC0,
    genre: '앰비언트', moods: ['따뜻한', '아늑한', '밝은', '편안한'], scenes: ['연못'], instruments: ['신시사이저', '드럼'], tempo: '느림', bpm: 96,
    basis: '태그: relaxing, happy, cozy, calm, chill / 설명: 느린 비트가 있는 A장조 앰비언트, 아늑한 연못을 위한 곡 (제작자가 slow beat로 밝혀 느림으로 분류)', note: 'OGG를 96kbps MP3로 변환',
  },
  {
    id: 'catmint', title: 'Catmint', artist: 'Kistol',
    file: '/media/music/catmint.mp3', durationSec: 154.70, sourceUrl: 'https://opengameart.org/content/catmint', ...CC0,
    genre: '피아노', moods: ['차분한', '그리운', '쓸쓸한'], scenes: ['마을'], instruments: ['피아노'], tempo: '느림', bpm: 89,
    basis: '태그: neoclassical, piano, soft, relaxing, gentle, town, bittersweet, sad, calm', note: 'OGG를 96kbps MP3로 변환',
  },
  {
    id: 'etirwer', title: 'Etirwer', artist: 'Kistol',
    file: '/media/music/etirwer.mp3', durationSec: 130.27, sourceUrl: 'https://opengameart.org/content/etirwer', ...CC0,
    genre: '어쿠스틱', moods: ['차분한', '소박한'], scenes: [], instruments: ['나일론 기타'], tempo: '느림', bpm: 70,
    basis: '태그: acoustic, guitar, nylon, simple', note: 'OGG를 96kbps MP3로 변환',
  },
  {
    id: 'hot-springs-town', title: 'Hot Springs Town', artist: 'Kistol',
    file: '/media/music/hot-springs-town.mp3', durationSec: 160.03, sourceUrl: 'https://opengameart.org/content/hot-springs-town', ...CC0,
    genre: '월드', moods: ['아늑한', '경쾌한', '편안한'], scenes: ['마을', '온천'], instruments: ['고토'], tempo: '빠름', bpm: 123,
    basis: '태그: town, cozy, calm, upbeat, Koto, japanese, relaxing', note: '원본 MP3를 96kbps로 재인코딩',
  },
  {
    id: 'happy-lofi-day', title: 'happy lofi day', artist: 'Tarush Singhal',
    file: '/media/music/happy-lofi-day.mp3', durationSec: 116.42, sourceUrl: 'https://opengameart.org/content/happy-lofi-day', ...CC0,
    genre: '로파이', moods: ['밝은', '기분 좋은'], scenes: [], instruments: ['드럼'], tempo: '보통', bpm: 99,
    basis: '태그: happy, lofi, nice, pleasing, drums', note: '원본 MP3를 96kbps로 재인코딩',
  },
  {
    id: 'ladada-guitar', title: 'LaDaDa Guitar', artist: 'Pro Sensory',
    file: '/media/music/ladada-guitar.mp3', durationSec: 153.68, sourceUrl: 'https://opengameart.org/content/ladada-guitar', ...CC0,
    genre: '재즈', moods: ['차분한', '편안한'], scenes: [], instruments: ['기타'], tempo: '보통', bpm: 99,
    basis: '태그: Guitar, Jazz, calm', note: '원본 MP3를 96kbps로 재인코딩',
  },
  {
    id: 'funky-hip-hop-lofi-jam', title: 'Funky Hip Hop Lofi Jam', artist: 'omfgdude',
    file: '/media/music/funky-hip-hop-lofi-jam.mp3', durationSec: 189.36, sourceUrl: 'https://opengameart.org/content/funky-hip-hop-lofi-jam', ...CC0,
    genre: '로파이 힙합', moods: ['경쾌한', '신나는'], scenes: [], instruments: ['키보드', '드럼'], tempo: '느림', bpm: 86,
    basis: '태그: lofi, hip hop, funky, Jazz / 설명: Yamaha CVP-701 반주 스타일로 한 번에 연주', note: 'OGG를 96kbps MP3로 변환',
  },
  {
    id: 'friends-2018', title: 'Friends, 2018', artist: 'Loyalty Freak Music',
    file: '/media/music/friends-2018.mp3', durationSec: 64.03, sourceUrl: 'https://opengameart.org/content/friends-2018', ...CC0,
    genre: '뮤직박스', moods: ['차분한', '다정한'], scenes: [], instruments: ['뮤직박스'], tempo: '느림', bpm: 89,
    basis: '태그: 90bpm, calm, friend / 설명: Calm music, Big Cat music box VST로 제작 (측정 89BPM)', note: '원본 MP3를 96kbps로 재인코딩(앨범 이미지 제거)',
  },
  {
    id: 'champ-de-tournesol', title: 'Champ de tournesol', artist: 'Loyalty Freak Music',
    file: '/media/music/champ-de-tournesol.mp3', durationSec: 117.97, sourceUrl: 'https://opengameart.org/content/champ-de-tournesol', ...CC0,
    genre: '어쿠스틱', moods: ['산뜻한', '다정한'], scenes: ['마을'], instruments: ['기타', '슬라이드 기타'], tempo: '보통', bpm: 108,
    basis: '태그: breezy, guitars, town, gentle, slide', note: '원본 MP3를 96kbps로 재인코딩(앨범 이미지 제거)',
  },
  {
    id: 'contemplation', title: 'Contemplation', artist: 'Joth',
    file: '/media/music/contemplation-0.mp3', durationSec: 120.08, sourceUrl: 'https://opengameart.org/content/contemplation-0', ...CC0,
    genre: '앰비언트', moods: ['사색적인', '쓸쓸한', '차분한'], scenes: [], instruments: [], tempo: '느림', bpm: null,
    basis: '태그: Ambient, calm, thoughtful, melancholy, sad / 설명: 멜로디 없이 분위기만 있는 앰비언트 (악기 정보 없음, 박자감이 약해 느림으로 분류)', note: '원본 MP3를 96kbps로 재인코딩',
  },
  {
    id: 'fantasy-rising-moon', title: 'Fantasy: Rising Moon', artist: 'RandomMind',
    file: '/media/music/fantasy-rising-moon.mp3', durationSec: 224.76, sourceUrl: 'https://opengameart.org/content/fantasy-rising-moon', ...CC0,
    genre: '판타지', moods: ['신비로운', '차분한', '서늘한'], scenes: ['밤', '바람', '겨울'], instruments: [], tempo: '보통', bpm: 103,
    basis: '태그: moon, night, calm, wind, winter, cold, mystical / 설명: 바람 부는 밤을 위한 판타지 곡 (악기 정보 없음)', note: '원본 MP3를 96kbps로 재인코딩',
  },
  {
    id: 'against-wanderlust', title: 'Agaisnt Wanderlust', artist: 'poinl',
    file: '/media/music/agaisnt-wanderlust.mp3', durationSec: 146.08, sourceUrl: 'https://opengameart.org/content/agaisnt-wanderlust', ...CC0,
    genre: '앰비언트', moods: ['평화로운', '아늑한', '밝은'], scenes: ['밤', '모닥불'], instruments: [], tempo: '느림', bpm: null,
    basis: '태그: peaceful, night, cozy, Ambient, fire, bright (원제 철자 그대로, 악기 정보 없음, 박자감이 약해 느림으로 분류)', note: '원본 MP3를 96kbps로 재인코딩',
  },
];

export const TRACK_BY_ID = Object.fromEntries(TRACKS.map((t) => [t.id, t]));
export const BASE_TRACKS = TRACKS.filter((t) => t.base);

/** 추천 검색에 쓰는 고정 어휘 (AI가 이 안에서만 조건을 고르게 함) */
export const VOCAB = {
  moods: [...new Set(TRACKS.flatMap((t) => t.moods))].sort(),
  scenes: [...new Set(TRACKS.flatMap((t) => t.scenes))].sort(),
  instruments: [...new Set(TRACKS.flatMap((t) => t.instruments))].sort(),
  tempo: ['느림', '보통', '빠름'],
};
