// ─────────────────────────────────────────────────────────────
//  GLSL шейдеры: световые стены, пол-сетка, ярусы арены,
//  трамплины, небо, город, частицы и кинематографичный пост-эффект
// ─────────────────────────────────────────────────────────────

export const trailVertex = /* glsl */ `
uniform float uHeight;
uniform float uCollapse;
uniform float uActive;
varying float vH;
varying float vTop;
varying float vActive;
varying vec3 vWorld;
void main() {
  vec3 p = position;
  vH = p.y;
  vTop = step(0.5, normal.y);
  p.y *= uHeight * uCollapse;
  #ifdef USE_INSTANCING
    vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
    vActive = abs(float(gl_InstanceID) - uActive) < 0.5 ? 1.0 : 0.0;
  #else
    vec4 wp = modelMatrix * vec4(p, 1.0);
    vActive = 0.0;
  #endif
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

export const trailFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uIntensity;
uniform vec3 uTail;
uniform float uCollapse;
uniform vec2 uFade;
uniform float uPlayer;
uniform float uMaxTrailDist;
varying float vH;
varying float vTop;
varying float vActive;
varying vec3 vWorld;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  float along = vWorld.x + vWorld.z;
  float top = smoothstep(0.80, 0.985, vH);
  float topCore = smoothstep(0.955, 1.0, vH);
  float bottom = 1.0 - smoothstep(0.0, 0.07, vH);
  float body = 0.13 + 0.2 * vH * vH;
  float lines = 0.05 * smoothstep(0.38, 0.5, abs(fract(vH * 5.0) - 0.5));
  float pulse = pow(0.5 + 0.5 * sin(along * 0.42 - uTime * 7.0), 14.0) * 0.4;
  float d = distance(vWorld.xz, uTail.xz);

  // В гонке: плавное таяние конца светового хвоста
  float tailFade = 1.0;
  if (uMaxTrailDist < 90000.0) {
    if (d > uMaxTrailDist) discard;
    tailFade = smoothstep(uMaxTrailDist, uMaxTrailDist * 0.55, d);
  }

  float fresh = exp(-d * 0.16);
  vec3 col = uColor * (body + lines + pulse * (0.25 + vH) + bottom * 0.7 + top * 1.5 + fresh * (0.3 + top * 1.3));
  col += vec3(1.0) * topCore * (0.4 + fresh * 0.5);
  // верхняя грань тусклее — сверху стена не должна слепить
  col = mix(col, uColor * (0.4 + fresh * 0.45) + vec3(0.08), vTop);
  float dcam = distance(vWorld, cameraPosition);
  col *= mix(smoothstep(0.8, 4.5, dcam), smoothstep(uFade.x, uFade.y, dcam), vActive);
  // Keep the player's own wall from obscuring the chase camera.
  col *= mix(1.0, smoothstep(2.0, 8.5, d), uPlayer);
  col *= tailFade;

  if (uCollapse < 0.999) {
    float n = hash(floor(vec2(along * 3.0, vH * 8.0)) + floor(uTime * 24.0));
    col *= mix(0.15, 1.8, n);
    col += uColor * (1.0 - uCollapse) * 1.6;
  }
  gl_FragColor = vec4(col * uIntensity, 1.0);
}`;

export const arenaWallVertex = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

export const arenaWallFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uHeight;
uniform float uBeat;
uniform float uKick;
varying vec3 vWorld;
void main() {
  float h = clamp(vWorld.y / uHeight, 0.0, 1.0);
  float along = vWorld.x + vWorld.z;
  vec2 g = vec2(along / 3.0, vWorld.y / 1.5);
  vec2 f = abs(fract(g) - 0.5);
  float grid = smoothstep(0.45, 0.5, max(f.x, f.y));
  float fade = pow(1.0 - h, 2.2);
  float top = smoothstep(0.965, 1.0, h);
  float bottom = 1.0 - smoothstep(0.0, 0.035, h);
  float band = exp(-pow((h - fract(uTime * 0.11)) * 28.0, 2.0));
  float flow = pow(0.5 + 0.5 * sin(along * 0.08 - uTime * 2.0), 18.0);
  float beatBoost = 1.0 + uKick * 0.55 + uBeat * 0.25;
  vec3 col = uColor * (0.01 + grid * 0.07 * fade + bottom * (0.8 + uKick * 0.4) + top * (0.9 + uBeat * 0.3) + band * 0.08 * fade + flow * bottom * 1.0) * beatBoost;
  gl_FragColor = vec4(col, 1.0);
}`;

export const floorVertex = /* glsl */ `
uniform mat4 textureMatrix;
varying vec4 vUvProj;
varying vec3 vWorld;
void main() {
  vUvProj = textureMatrix * vec4(position, 1.0);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

export const floorFragment = /* glsl */ `
uniform vec3 color;
uniform sampler2D tDiffuse;
uniform float uReflect;
uniform float uHalf;
uniform float uTime;
uniform vec3 uGrid;
uniform vec3 uCamPos;
uniform vec3 uFog;
uniform float uBeat;
uniform float uKick;
uniform vec3 uBikePos[8];
uniform vec3 uBikeCol[8];
varying vec4 vUvProj;
varying vec3 vWorld;

float lineAA(float coord, float spacing, float width) {
  float d = abs(fract(coord / spacing + 0.5) - 0.5) * spacing;
  float fw = fwidth(coord);
  return 1.0 - smoothstep(width, width + fw * 1.5, d);
}

void main() {
  vec2 p = vWorld.xz;
  float dist = length(vWorld - uCamPos);
  float edgeDist = max(abs(p.x), abs(p.y));
  float inside = 1.0 - smoothstep(uHalf - 0.05, uHalf + 0.05, edgeDist);

  // Бритвенно-тонкие световодные линии сетки под стеклом
  float minor = max(lineAA(p.x, 2.0, 0.0065), lineAA(p.y, 2.0, 0.0065));
  float major = max(lineAA(p.x, 10.0, 0.022), lineAA(p.y, 10.0, 0.022));
  float fadeMinor = 1.0 - smoothstep(30.0, 110.0, dist);
  float fadeMajor = 1.0 - smoothstep(120.0, 600.0, dist);

  // Стеклянные фаски (bevel) на стыке плит 10х10 метров
  vec2 tileFrac = abs(fract(p / 10.0) - 0.5);
  float seam = max(tileFrac.x, tileFrac.y);
  float bevel = smoothstep(0.482, 0.5, seam);

  vec2 tileId = floor(p / 10.0);
  float th = fract(sin(dot(tileId, vec2(12.9898, 78.233))) * 43758.5453);

  // Глубокий зеркальный черный обсидиан
  vec3 glassBase = vec3(0.0009, 0.0016, 0.0032) + vec3(0.0006, 0.0009, 0.0015) * th;

  // Зеркальное отражение стекла (Mirror Glass Reflection)
  vec2 uv = vUvProj.xy / vUvProj.w;
  vec3 refl = texture2D(tDiffuse, uv).rgb * 0.34;
  refl += texture2D(tDiffuse, uv + vec2(0.0, 0.006)).rgb * 0.22;
  refl += texture2D(tDiffuse, uv - vec2(0.0, 0.006)).rgb * 0.22;
  refl += texture2D(tDiffuse, uv + vec2(0.0, 0.014)).rgb * 0.11;
  refl += texture2D(tDiffuse, uv - vec2(0.0, 0.014)).rgb * 0.11;
  // Микро-блик на стеклянных фасках плит
  vec3 reflBevel = texture2D(tDiffuse, uv + vec2(0.001, 0.002)).rgb * 0.08;
  refl += reflBevel * bevel;

  vec3 V = normalize(uCamPos - vWorld);
  float cosTheta = clamp(V.y, 0.0, 1.0);
  // Физичный Френель для зеркального стекла Трона (отражает до 96% при скользящем угле)
  float fres = 0.10 + 0.30 * pow(1.0 - cosTheta, 3.4);

  // Зеркальный слой стекла
  vec3 tintedRefl = refl * vec3(0.55, 0.72, 0.88);
  vec3 col = glassBase + tintedRefl * uReflect * fres;
  col += vec3(0.0025, 0.006, 0.009);
    // Мягкий спекулярный блик скользящего света на стекле
  float sheen = pow(clamp(dot(reflect(-V, vec3(0.0, 1.0, 0.0)), normalize(vec3(0.3, 0.6, 0.2))), 0.0, 1.0), 22.0);
  col += uGrid * sheen * 0.05;
  col += uGrid * bevel * 0.014;

  // Световодная сетка под стеклом, пульсирующая в такт
  float beatMul = 1.0 + uKick * 0.55 + uBeat * 0.22;
  vec3 g = uGrid * (minor * 0.028 * fadeMinor + major * 0.1 * fadeMajor) * beatMul;
  col += g * (0.2 + 0.8 * inside);

  // Мягкие пятна подсветки под светоциклами (underglow)
  for (int i = 0; i < 8; i++) {
    vec3 bc = uBikeCol[i];
    vec2 dd = p - uBikePos[i].xz;
    float d2 = dot(dd, dd);
    col += bc * (exp(-d2 * 0.22) * 0.22 + exp(-d2 * 0.016) * 0.03) * (1.0 + minor * 2.0 * fadeMinor + major * 1.0);
  }

  // Светящаяся граница арены
  float e = abs(edgeDist - uHalf);
  col += uGrid * (1.0 - smoothstep(0.0, 0.5, e)) * (0.75 + uKick * 0.35);
  col += uGrid * exp(-e * 0.6) * 0.025;

  // Внешняя территория арены
  float outside = step(uHalf, edgeDist);
  if (outside > 0.5) {
    float out_ = edgeDist - uHalf;
    float r1 = exp(-abs(out_ - uHalf * 0.42) * 0.05);
    float r2 = exp(-abs(out_ - uHalf * 0.95) * 0.035);
    float r3 = exp(-abs(out_ - uHalf * 1.7) * 0.022);
    col += uGrid * (r1 * 0.32 + r2 * 0.20 + r3 * 0.11) * (0.8 + uBeat * 0.5);
    float ang = atan(p.y, p.x);
    float spokes = pow(0.5 + 0.5 * cos(ang * 32.0), 10.0);
    col += uGrid * spokes * exp(-out_ * 0.006) * 0.10;
    col += vec3(0.003, 0.012, 0.022) * (1.0 - smoothstep(0.0, uHalf * 3.0, out_));
  }

  col = mix(col, uFog, smoothstep(220.0, 950.0, dist));
  gl_FragColor = vec4(col, 1.0);
}`;

// ── Шейдер платформы второго яруса и пандусов ──
export const tierPlatformVertex = /* glsl */ `
varying vec3 vWorld;
varying vec2 vUv;
varying vec3 vNormal;
void main() {
  vUv = uv;
  vNormal = normalize(normalMatrix * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

export const tierPlatformFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uBeat;
uniform float uKick;
uniform vec3 uCamPos;
uniform vec3 uFog;
varying vec3 vWorld;
varying vec2 vUv;
varying vec3 vNormal;

float lineAA(float coord, float spacing, float width) {
  float d = abs(fract(coord / spacing + 0.5) - 0.5) * spacing;
  float fw = fwidth(coord);
  return 1.0 - smoothstep(width, width + fw * 1.5, d);
}

void main() {
  vec2 p = vWorld.xz;
  float minor = max(lineAA(p.x, 2.0, 0.008), lineAA(p.y, 2.0, 0.008));
  float major = max(lineAA(p.x, 10.0, 0.025), lineAA(p.y, 10.0, 0.025));
  float edge = smoothstep(0.0, 0.03, vUv.x) * smoothstep(1.0, 0.97, vUv.x) *
               smoothstep(0.0, 0.03, vUv.y) * smoothstep(1.0, 0.97, vUv.y);
  float border = 1.0 - edge;

  float beatGlow = 1.0 + uKick * 0.45 + uBeat * 0.2;
  vec3 base = vec3(0.004, 0.009, 0.015);
  vec3 neon = uColor * (minor * 0.08 + major * 0.22 + border * 0.75) * beatGlow;
  vec3 col = base + neon;

  float dist = length(vWorld - uCamPos);
  col = mix(col, uFog, smoothstep(180.0, 800.0, dist));
  gl_FragColor = vec4(col, 0.82);
}`;

// ── Трамплин / Катапульта (Jump Pad) ──
export const jumpPadVertex = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

export const jumpPadFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uBeat;
uniform float uKick;
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vec2 uv = vUv;
  // анимированные шевроны-стрелки вверх
  float y = fract(uv.y * 3.0 - uTime * 4.0);
  float chevron = 1.0 - smoothstep(0.0, 0.35, abs(uv.x - 0.5) * 1.4 - (1.0 - y) * 0.6);
  chevron = clamp(chevron, 0.0, 1.0);

  float border = max(smoothstep(0.06, 0.0, uv.x), smoothstep(0.94, 1.0, uv.x));
  border = max(border, max(smoothstep(0.06, 0.0, uv.y), smoothstep(0.94, 1.0, uv.y)));

  float pulse = 1.0 + uKick * 0.85 + uBeat * 0.35;
  vec3 col = uColor * (0.15 + chevron * 1.2 + border * 1.4) * pulse;
  col += vec3(1.0) * chevron * 0.6 * (1.0 + uKick);
  gl_FragColor = vec4(col, 0.95);
}`;

export const skyVertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

export const skyFragment = /* glsl */ `
uniform float uTime;
varying vec3 vDir;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}
void main() {
  vec3 d = normalize(vDir);
  float y = d.y;
  float az = atan(d.z, d.x);

  // базовый градиент неба
  vec3 zenith = vec3(0.001, 0.003, 0.009);
  vec3 mid = vec3(0.006, 0.022, 0.046);
  vec3 col = mix(mid, zenith, smoothstep(0.02, 0.55, y));

  // яркое свечение горизонта (городская дымка)
  float hz = exp(-max(y, 0.0) * 11.0);
  col += vec3(0.02, 0.075, 0.115) * hz;
  col += vec3(0.10, 0.045, 0.02) * hz * hz * 0.55; // тёплый отблеск мегаполиса

  // слой облаков
  if (y > 0.0) {
    vec2 uv = d.xz / (y + 0.14) * 1.25;
    float n = fbm(uv + vec2(uTime * 0.006, uTime * 0.0022));
    float c = smoothstep(0.46, 0.92, n);
    col += vec3(0.014, 0.042, 0.062) * c * (1.0 - smoothstep(0.0, 0.75, y));
    float n2 = fbm(uv * 2.7 - vec2(uTime * 0.014, 0.0));
    col += vec3(0.0, 0.02, 0.034) * smoothstep(0.58, 0.95, n2) * c;
  }

  // северное сияние — волнистые световые занавеси
  float curtain = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float base = 0.30 + fi * 0.15;
    float wob = sin(az * (2.0 + fi) + uTime * (0.11 + fi * 0.05) + fi * 2.1) * 0.16
              + sin(az * 5.0 - uTime * 0.07) * 0.05;
    float band = exp(-pow((y - base - wob) * 9.0, 2.0));
    float strength = smoothstep(0.0, 0.25, y) * (1.0 - smoothstep(0.75, 1.0, y));
    vec3 tint = mix(vec3(0.05, 0.28, 0.30), vec3(0.16, 0.10, 0.32), fi * 0.5);
    curtain += band * strength;
    col += tint * band * strength * 0.85;
  }

  // звёзды (только выше облаков)
  float starMask = smoothstep(0.10, 0.45, y);
  vec2 sp = d.xz / max(y, 0.06) * 26.0;
  float star = pow(hash(floor(sp)), 42.0) * 2.6;
  float twinkle = 0.6 + 0.4 * sin(uTime * 2.2 + hash(floor(sp) + 3.7) * 30.0);
  col += vec3(0.75, 0.9, 1.0) * star * twinkle * starMask;

  // «портал» — большое светящееся кольцо над горизонтом
  float pd = length(vec2(az - 0.7, (y - 0.19) * 2.2));
  float ring = exp(-pow((pd - 0.20) * 26.0, 2.0));
  float core = exp(-pd * pd * 26.0);
  col += vec3(0.14, 0.5, 0.62) * ring * 0.85;
  col += vec3(0.30, 0.75, 0.85) * core * 0.35;

  // затемнение под горизонтом
  col *= mix(0.18, 1.0, smoothstep(-0.22, 0.02, y));
  gl_FragColor = vec4(col, 1.0);
}`;

export const towerVertex = /* glsl */ `
varying vec3 vLocal;
varying vec3 vScale;
varying vec3 vWorld;
varying float vSeed;
void main() {
  vLocal = position;
  #ifdef USE_INSTANCING
    mat4 im = instanceMatrix;
  #else
    mat4 im = mat4(1.0);
  #endif
  vScale = vec3(length(im[0].xyz), length(im[1].xyz), length(im[2].xyz));
  vec4 wp = modelMatrix * im * vec4(position, 1.0);
  vWorld = wp.xyz;
  vSeed = fract(sin(dot(im[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

export const towerFragment = /* glsl */ `
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uFog;
uniform vec3 uCamPos;
uniform float uTime;
uniform float uKick;
varying vec3 vLocal;
varying vec3 vScale;
varying vec3 vWorld;
varying float vSeed;
void main() {
  // Расстояние до ребер здания
  vec3 d = (0.5 - abs(vLocal)) * vScale;
  float m1 = min(d.x, min(d.y, d.z));
  float m3 = max(d.x, max(d.y, d.z));
  float m2 = d.x + d.y + d.z - m1 - m3;
  // Ребра небоскреба
  float edge = 1.0 - smoothstep(0.14, 0.65, m2);

  // Палитра подсветки башни (циан, электрик, янтарь Системы)
  vec3 tint = mix(uColorA, uColorB, step(0.82, vSeed));
  if (vSeed > 0.94) tint = vec3(0.85, 0.95, 1.0); // белые монаршие обелиски Клу

  // Поэтажные полосы окон / контуров данных
  float floorH = 3.6;
  float wy = fract(vWorld.y / floorH);
  float winBand = smoothstep(0.0, 0.05, wy) * (1.0 - smoothstep(0.09, 0.15, wy));
  float wx = floor((vWorld.x + vWorld.z) / 2.2);
  float lit = step(0.55, fract(sin(wx * 91.7 + floor(vWorld.y / floorH) * 17.3 + vSeed * 47.0) * 4375.5));
  float blink = 0.75 + 0.25 * sin(uTime * (0.8 + vSeed * 2.2) + vSeed * 30.0);

  // Бегущие по вертикали импульсы данных (Data Conduits / Spines)
  float spineSpeed = 1.4 + vSeed * 1.8;
  float dataPulse = exp(-pow(fract(vWorld.y * 0.015 - uTime * spineSpeed * 0.15 + vSeed * 5.0) * 8.0, 2.0));
  // Центральная световая шина на фасаде здания
  float centerSpine = 1.0 - smoothstep(0.0, 0.08, min(abs(vLocal.x), abs(vLocal.z)));

  // Светящаяся корона на крыше башни
  float roofCrown = smoothstep(0.485, 0.5, vLocal.y);

  float beatMod = 1.0 + uKick * 0.55;

  // Темное тело небоскреба
  vec3 col = vec3(0.002, 0.004, 0.007);
  // Неоновые ребра граней
  col += tint * edge * 0.62 * beatMod;
  // Окна данных
  col += tint * winBand * lit * 0.09 * blink;
  // Вертикальный импульс передачи данных
  col += tint * (dataPulse * (edge * 1.2 + centerSpine * 0.55)) * 0.75;
  // Корона на вершине
  col += tint * roofCrown * (0.6 + 0.3 * sin(uTime * 3.0 + vSeed * 10.0)) * beatMod;

  float dist = length(vWorld - uCamPos);
  col = mix(col, uFog, smoothstep(80.0, 950.0, dist));
  gl_FragColor = vec4(col, 1.0);
}`;

export const pointsVertex = /* glsl */ `
attribute vec3 aColor;
attribute float aSize;
attribute float aAlpha;
uniform float uScale;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vColor = aColor;
  vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

export const pointsFragment = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  if (vAlpha <= 0.001) discard;
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float a = smoothstep(0.5, 0.0, d);
  a *= a;
  gl_FragColor = vec4(vColor * a * vAlpha, 1.0);
}`;

export const ringVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

export const ringFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
uniform float uThick;
varying vec2 vUv;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float ring = smoothstep(1.0 - uThick, 1.0 - uThick * 0.3, r) * (1.0 - smoothstep(0.97, 1.0, r));
  float inner = (1.0 - smoothstep(0.0, 1.0, r)) * 0.04;
  gl_FragColor = vec4(uColor * (ring + inner) * uAlpha, 1.0);
}`;

export const beamVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

export const beamFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
varying vec2 vUv;
void main() {
  float fade = pow(1.0 - vUv.y, 1.6);
  gl_FragColor = vec4(uColor * fade * uAlpha, 1.0);
}`;

export const CinematicShader = {
  name: 'CinematicShader',
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uSpeed: { value: 0 },
    uSamples: { value: 1 },
    uChroma: { value: 0.0015 },
    uVignette: { value: 0.55 },
    uGrain: { value: 0.025 },
    uFlash: { value: 0 },
    uDesat: { value: 0 },
    uDamage: { value: 0 },
    uBeat: { value: 0 },
    uRes: { value: [1920, 1080] },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uSpeed;
    uniform int uSamples;
    uniform float uChroma;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uFlash;
    uniform float uDesat;
    uniform float uDamage;
    uniform float uBeat;
    uniform vec2 uRes;
    varying vec2 vUv;
    void main() {
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      float r = length(c);
      float blur = uSpeed * 0.04 * smoothstep(0.12, 0.7, r);
      float ca = (uChroma + uSpeed * 0.0035 + uBeat * 0.001) * r;
      vec3 col = vec3(0.0);
      float total = 0.0;
      for (int i = 0; i < 10; i++) {
        if (i >= uSamples) break;
        float t = float(i) / 9.0;
        vec2 suv = uv - c * blur * t;
        col.r += texture2D(tDiffuse, suv + c * ca).r;
        col.g += texture2D(tDiffuse, suv).g;
        col.b += texture2D(tDiffuse, suv - c * ca).b;
        total += 1.0;
      }
      col /= total;
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, vec3(l) * vec3(1.0, 0.82, 0.78), uDesat);
      col += vec3(0.5, 0.03, 0.02) * uDamage * smoothstep(0.25, 0.85, r);
      col *= 1.0 - uVignette * smoothstep(0.32, 0.9, r);
      col *= 0.975 + 0.025 * sin(uv.y * uRes.y * 1.6);
      float n = fract(sin(dot(uv * uRes + fract(uTime) * 100.0, vec2(12.9898, 78.233))) * 43758.5453);
      col += (n - 0.5) * uGrain * (0.4 + l);
      col += vec3(uFlash);
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
};
