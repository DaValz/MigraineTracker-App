import { h } from './dom.js';

const circle = (cx, cy, r, extra = {}) => ['circle', { cx, cy, r, ...extra }];
const dot = (cx, cy) => ['circle', { cx, cy, r: 1.5, fill: 'currentColor', stroke: 'none' }];

const ICONS = {
  home: [['path', { d: 'M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z' }]],
  calendar: [['rect', { x: 3.5, y: 5, width: 17, height: 15.5, rx: 3 }], ['path', { d: 'M3.5 10h17M8 3v4M16 3v4' }]],
  'calendar-check': [['rect', { x: 3.5, y: 5, width: 17, height: 15.5, rx: 3 }], ['path', { d: 'M3.5 10h17M8 3v4M16 3v4M9 15l2.2 2.2L15.5 13' }]],
  plus: [['path', { d: 'M12 5v14M5 12h14' }]],
  minus: [['path', { d: 'M5 12h14' }]],
  chart: [['path', { d: 'M5 20v-7M12 20V5M19 20v-11' }]],
  more: [dot(5, 12), dot(12, 12), dot(19, 12)],
  'chevron-left': [['path', { d: 'M14.5 5 7.5 12l7 7' }]],
  'chevron-right': [['path', { d: 'm9.5 5 7 7-7 7' }]],
  'chevron-down': [['path', { d: 'm5 9.5 7 7 7-7' }]],
  x: [['path', { d: 'M6 6l12 12M18 6 6 18' }]],
  check: [['path', { d: 'm5 12.5 4.5 4.5L19 7.5' }]],
  'check-circle': [circle(12, 12, 9), ['path', { d: 'm8 12.5 3 3 5-6' }]],
  trash: [['path', { d: 'M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 .5.5V7' }]],
  edit: [['path', { d: 'M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z' }], ['path', { d: 'm14.5 7.5 3 3' }]],
  clock: [circle(12, 12, 9), ['path', { d: 'M12 7v5l3.5 2' }]],
  pill: [['g', { transform: 'rotate(-45 12 12)' }, ['rect', { x: 2, y: 8.5, width: 20, height: 7, rx: 3.5 }], ['path', { d: 'M12 8.5v7' }]]],
  sun: [circle(12, 12, 4), ['path', { d: 'M12 2.5V5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8' }]],
  moon: [['path', { d: 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z' }]],
  cloud: [['path', { d: 'M7 19a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 17.8 9.3 4.85 4.85 0 0 1 17 19z' }]],
  download: [['path', { d: 'M12 4v11M7.5 10.5 12 15l4.5-4.5M5 20h14' }]],
  upload: [['path', { d: 'M12 16V5M7.5 9.5 12 5l4.5 4.5M5 20h14' }]],
  lock: [['rect', { x: 5, y: 10.5, width: 14, height: 10, rx: 2.5 }], ['path', { d: 'M8 10.5V8a4 4 0 0 1 8 0v2.5' }]],
  bell: [['path', { d: 'M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15zM10 21a2 2 0 0 0 4 0' }]],
  sliders: [['path', { d: 'M4 7h9M17 7h3M4 17h3M11 17h9' }], circle(15, 7, 2), circle(9, 17, 2)],
  info: [circle(12, 12, 9), ['path', { d: 'M12 11v5.5M12 7.5v.01' }]],
  wind: [['path', { d: 'M3.5 8.5h10A2.5 2.5 0 1 0 11 6M3.5 12.5h14a2.5 2.5 0 1 1-2.5 2.5M3.5 16.5h6a2.5 2.5 0 1 1-2.5 2.5' }]],
  share: [['path', { d: 'M12 3.5v12M8 7.5l4-4 4 4M6.5 11H6a1.5 1.5 0 0 0-1.5 1.5v7A1.5 1.5 0 0 0 6 21h12a1.5 1.5 0 0 0 1.5-1.5v-7A1.5 1.5 0 0 0 18 11h-.5' }]],
  search: [circle(11, 11, 6.5), ['path', { d: 'm16 16 4.5 4.5' }]],
  alert: [['path', { d: 'M12 3.5 2.8 19.5h18.4z' }], ['path', { d: 'M12 10v4.5M12 17.2v.01' }]],
  heart: [['path', { d: 'M12 20.5S4 15.5 4 9.8A4.3 4.3 0 0 1 12 8a4.3 4.3 0 0 1 8 1.8c0 5.7-8 10.7-8 10.7z' }]],
  activity: [['path', { d: 'M3 12h4l2.5-7 5 14 2.5-7H21' }]],
  file: [['path', { d: 'M7 3.5h7l4.5 4.5V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1zM14 3.5V8h4.5M9 13h6M9 16.5h6' }]],
  drop: [['path', { d: 'M12 3.5c3.5 4.5 6 7.4 6 10.5a6 6 0 0 1-12 0c0-3.1 2.5-6 6-10.5z' }]],
  list: [['path', { d: 'M8.5 6.5H20M8.5 12H20M8.5 17.5H20M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01' }]],
  refresh: [['path', { d: 'M19.5 11.5A7.5 7.5 0 1 0 17.3 17M19.5 5v6.5H13' }]],
  bolt: [['path', { d: 'M13 3 5 13.5h6L10 21l8-10.5h-6z' }]],
  'trend-down': [['path', { d: 'm3 7 6.5 6.5 4-4L21 17M15.5 17H21v-5.5' }]],
  'trend-up': [['path', { d: 'm3 17 6.5-6.5 4 4L21 7M15.5 7H21v5.5' }]],
  user: [circle(12, 8, 4), ['path', { d: 'M4.5 20.5a7.5 7.5 0 0 1 15 0' }]],
  shield: [['path', { d: 'M12 3.5 5 6v5.5c0 4.5 3 7.7 7 9 4-1.3 7-4.5 7-9V6z' }]],
  book: [['path', { d: 'M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15.5H6.5A1.5 1.5 0 0 0 5 20zM5 20a1.5 1.5 0 0 0 1.5 1.5H19' }]],
  play: [['path', { d: 'M8 5v14l11-7z' }]],
  pin: [['path', { d: 'M12 21s-6.5-5.7-6.5-11A6.5 6.5 0 0 1 12 3.5 6.5 6.5 0 0 1 18.5 10c0 5.3-6.5 11-6.5 11z' }], circle(12, 10, 2.3)],
  tag: [['path', { d: 'M3.5 12.5V4.5a1 1 0 0 1 1-1h8L21 12l-8.5 8.5a1 1 0 0 1-1.4 0z' }], circle(8.3, 8.3, 1.2)],
  face: [circle(12, 12, 9), ['path', { d: 'M8.5 14.5c1 1.4 2.2 2 3.5 2s2.5-.6 3.5-2M9 9.5v.01M15 9.5v.01' }]],
  backspace: [['path', { d: 'M9 5h10.5a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9L3.5 12z' }], ['path', { d: 'm12.5 9.5 5 5m0-5-5 5' }]],
  hospital: [['path', { d: 'M4.5 20.5V8a1 1 0 0 1 1-1h3.5V4.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1V7h3.5a1 1 0 0 1 1 1v12.5M3 20.5h18M12 5.8v3.4M10.3 7.5h3.4M8 12.5h.01M12 12.5h.01M16 12.5h.01M8 16h.01M16 16h.01M10.5 20.5V17h3v3.5' }]],
  stethoscope: [['path', { d: 'M6 3.5H5v4.5a4 4 0 0 0 8 0V3.5h-1M9 12v2.5a4.5 4.5 0 0 0 9 0v-2' }], circle(18, 10.5, 2)],
  scan: [['path', { d: 'M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16' }], circle(12, 12, 3.5)],
  folder: [['path', { d: 'M3.5 7.5A1.5 1.5 0 0 1 5 6h4.2l2 2.2H19a1.5 1.5 0 0 1 1.5 1.5v8.3a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z' }]],
  phone: [['path', { d: 'M7 3.5h2.8l1.5 4-2 1.6a11 11 0 0 0 5.6 5.6l1.6-2 4 1.5V17a2.5 2.5 0 0 1-2.6 2.5A15 15 0 0 1 4.5 6.1 2.5 2.5 0 0 1 7 3.5z' }]],
  mail: [['rect', { x: 3.5, y: 5.5, width: 17, height: 13, rx: 2.5 }], ['path', { d: 'm4.5 7.5 7.5 5.5 7.5-5.5' }]],
  syringe: [['path', { d: 'm17.5 3.5 3 3M19 5l-3 3M16 8l-8.5 8.5H5v-2.5L13.5 5.5zM11 8l1.5 1.5M8.5 10.5 10 12M5 19l-1.5 1.5' }]],
  camera: [['rect', { x: 3, y: 7, width: 18, height: 13, rx: 2.5 }], ['path', { d: 'M8.5 7 10 4.5h4L15.5 7' }], circle(12, 13.5, 3.5)],
  image: [['rect', { x: 3.5, y: 4.5, width: 17, height: 15, rx: 2.5 }], circle(9, 10, 1.8), ['path', { d: 'm20.5 15.5-4.5-4.5-8.5 8.5' }]],
  'zoom-in': [circle(11, 11, 6.5), ['path', { d: 'm16 16 4.5 4.5M11 8v6M8 11h6' }]],
  'zoom-out': [circle(11, 11, 6.5), ['path', { d: 'm16 16 4.5 4.5M8 11h6' }]],
  external: [['path', { d: 'M14 4h6v6M20 4l-8.5 8.5M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10' }]],
  clipboard: [['rect', { x: 5, y: 4.5, width: 14, height: 16.5, rx: 2 }], ['path', { d: 'M9 4.5V3h6v1.5M9 10h6M9 13.5h6M9 17h3.5' }]],
  history: [['path', { d: 'M4 12a8 8 0 1 0 2.4-5.7M4 4.5V8h3.5M12 8v4l2.8 1.8' }]],
  sparkles: [['path', { d: 'M11 3.5l1.7 4.6 4.6 1.7-4.6 1.7L11 16.1l-1.7-4.6-4.6-1.7 4.6-1.7zM18 14.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z' }]],
  'chart-line': [['path', { d: 'M4 19.5h16M5 15l4-4.5 3.5 3L19 6.5' }]],
  paperclip: [['path', { d: 'm19.5 11.5-7.4 7.4a4.8 4.8 0 0 1-6.8-6.8l8-8a3.2 3.2 0 0 1 4.5 4.5l-8 8a1.6 1.6 0 0 1-2.3-2.3l7.4-7.4' }]],
  'calendar-plus': [['rect', { x: 3.5, y: 5, width: 17, height: 15.5, rx: 3 }], ['path', { d: 'M3.5 10h17M8 3v4M16 3v4M12 12.5v5M9.5 15h5' }]],
  flag: [['path', { d: 'M5.5 21V4M5.5 4.5h11.5l-2.2 4 2.2 4H5.5' }]],
  'doc-plus': [['path', { d: 'M7 3.5h7l4.5 4.5V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1zM14 3.5V8h4.5M12 11.5v6M9 14.5h6' }]],
  person: [circle(12, 8, 3.8), ['path', { d: 'M5 20.5c.6-3.7 3.4-6 7-6s6.4 2.3 7 6' }]],
};

function build(spec) {
  const [tag, attrs, ...kids] = spec;
  return h(tag, attrs, ...kids.map(build));
}

export function icon(name, size = 22, cls = '') {
  const spec = ICONS[name];
  if (!spec) throw new Error(`Icona sconosciuta: ${name}`);
  return h(
    'svg',
    {
      class: `icon${cls ? ` ${cls}` : ''}`,
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': 2,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': 'true',
      focusable: 'false',
    },
    ...spec.map(build),
  );
}

export const hasIcon = (name) => name in ICONS;
