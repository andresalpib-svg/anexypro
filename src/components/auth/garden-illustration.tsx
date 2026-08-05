// Ilustración del panel de autenticación — plano de Área Común en
// estilo de línea arquitectónica (sin relleno sólido), traducida 1:1
// del prototipo (ver diseno-ajustes-visuales-globales.md secciones
// 9-10: por qué el jardín y no las otras 5 áreas, y por qué línea y
// no círculos rellenos).
const TREES: Array<[number, number, number]> = [
  [70, 100, 1.9], [140, 75, 1.5], [205, 110, 1.7],
  [280, 80, 1.4], [350, 105, 1.8], [420, 78, 1.4],
  [490, 112, 1.6], [560, 88, 1.3],
  [45, 190, 1.6], [120, 175, 2.0], [200, 200, 1.5],
  [290, 180, 1.75], [375, 195, 1.4], [455, 172, 1.9],
  [535, 200, 1.4], [595, 170, 1.2],
  [90, 285, 1.6], [175, 270, 1.3], [255, 295, 1.7],
  [335, 275, 1.4], [415, 290, 1.6], [500, 268, 1.25],
  [565, 300, 1.5],
  [150, 380, 1.25], [240, 400, 1.1], [460, 385, 1.4], [540, 410, 1.1],
];
const FOCAL: Array<[number, number, number]> = [
  [310, 440, 2.9], [270, 470, 1.9], [352, 475, 2.0],
];

export function GardenIllustration() {
  return (
    <svg
      className="absolute inset-0 h-full w-full"
      viewBox="0 0 640 960"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="authBg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#132038" />
          <stop offset="100%" stopColor="#0B1220" />
        </linearGradient>
        <linearGradient id="fadeBottom" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0B1220" stopOpacity="0" />
          <stop offset="100%" stopColor="#0B1220" stopOpacity=".94" />
        </linearGradient>
        <pattern id="dots" width="26" height="26" patternUnits="userSpaceOnUse">
          <circle cx="1.4" cy="1.4" r="1.4" fill="#24324A" />
        </pattern>
        <g id="canopy" fill="none">
          <circle cx="0" cy="0" r="15" />
          <circle cx="-10" cy="7" r="10" />
          <circle cx="10" cy="6" r="9" />
          <circle cx="-2" cy="-10" r="9" />
        </g>
      </defs>

      <rect width="640" height="960" fill="url(#authBg)" />
      <rect width="640" height="960" fill="url(#dots)" opacity=".5" />
      <circle cx="90" cy="140" r="240" fill="#3F6DF6" opacity=".10" />
      <circle cx="540" cy="560" r="260" fill="#5B8CFF" opacity=".07" />

      <g stroke="#4A6FA8" strokeWidth="1" opacity=".4">
        <path d="M18 40h604M18 40v10M78 40v8M138 40v8M198 40v8M258 40v8M318 40v8M378 40v8M438 40v8M498 40v8M558 40v8M622 40v10" />
      </g>
      <text x="320" y="28" textAnchor="middle" fontSize="9" letterSpacing="2" fill="#5B7FC7" opacity=".55">
        ÁREA COMÚN · PLANO DE JARDÍN
      </text>

      <path
        d="M-10 330c90 60 180 70 260 30s160-90 260-70 140 80 140 80"
        stroke="#5B8CFF"
        strokeWidth="1.3"
        strokeOpacity=".45"
        fill="none"
      />
      <path
        d="M-10 470c110 40 230 20 320-30s190-70 330-20"
        stroke="#5B8CFF"
        strokeWidth="1"
        strokeOpacity=".3"
        fill="none"
      />

      <g stroke="#8FB0FF" strokeWidth=".9" strokeOpacity=".5" fill="none">
        {TREES.map(([x, y, s], i) => (
          <use key={i} href="#canopy" transform={`translate(${x},${y}) scale(${s})`} />
        ))}
      </g>
      <g stroke="#A9C3FF" strokeWidth="1" strokeOpacity=".55" fill="none">
        {FOCAL.map(([x, y, s], i) => (
          <use key={i} href="#canopy" transform={`translate(${x},${y}) scale(${s})`} />
        ))}
      </g>

      <g stroke="#8FB0FF" strokeWidth="1" strokeOpacity=".5" fill="none">
        <rect x="60" y="340" width="34" height="10" rx="2" transform="rotate(-8 77 345)" />
        <rect x="440" y="330" width="34" height="10" rx="2" transform="rotate(10 457 335)" />
        <rect x="230" y="510" width="34" height="10" rx="2" transform="rotate(-4 247 515)" />
      </g>

      <text x="320" y="590" textAnchor="middle" fontSize="14" letterSpacing="3" fill="#fff" fillOpacity=".85" fontWeight="600">
        ÁREA COMÚN
      </text>

      <rect y="600" width="640" height="360" fill="url(#fadeBottom)" />
    </svg>
  );
}
