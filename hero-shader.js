// Hero background: a Chladni plate. Sand on a vibrating square plate collects
// along the lines that stay still, and rearranges each time the mode changes.
// The grains are simulated on the GPU with WebGL 2 transform feedback. The
// animation pauses off screen or in a hidden tab, and shows a single settled
// pattern when the visitor prefers reduced motion. Without WebGL 2 the canvas
// stays hidden and the hero is plain.
(function () {
  var hero = document.querySelector('.hero');
  var canvas = document.querySelector('.hero-shader');
  var title = document.querySelector('.title');
  var strip = document.querySelector('.strip');
  if (!hero || !canvas || !title || !strip) return;

  var gl;
  try {
    gl = canvas.getContext('webgl2', { antialias: false, depth: false, stencil: false, powerPreference: 'low-power' });
  } catch (e) {}
  if (!gl) return;

  // Each mode is a pair of wave numbers and how strongly the mirrored wave is
  // mixed in. Mixes short of 1 bend the lines into curves instead of a grid.
  var MODES = [
    [1, 2, -0.8], [1, 3, 0.75], [2, 3, 0.7], [1, 4, -0.65], [2, 5, -0.8],
    [3, 4, 0.85], [3, 5, 0.7], [1, 6, 0.8], [3, 7, -0.75], [4, 5, -0.7],
    [2, 7, 0.65], [5, 6, 0.8]
  ];
  var HOLD = 8;        // seconds on each pattern
  var MORPH = 0.9;     // seconds to cross from one pattern to the next
  var MAX_GRAINS = 56000;
  var PAD = 14;        // space between the plate's edge and the sand, in CSS px

  var UPDATE_VERT = `#version 300 es
  precision highp float;
  layout(location = 0) in vec2 aPos;
  uniform vec3 uFrom, uTo;
  uniform vec3 uPointer;   // x, y on the plate, and whether it is there
  uniform float uMix, uShake, uDt;
  uniform uint uFrame;
  out vec2 vPos;
  const float PI = 3.14159265359;

  uint hash(uint v) {
    v = v * 747796405u + 2891336453u;
    v = ((v >> ((v >> 28u) + 4u)) ^ v) * 277803737u;
    return (v >> 22u) ^ v;
  }

  // Plate displacement (x) and its slope (yz, without the factor of PI).
  vec3 wave(vec2 p, vec3 mode) {
    float m = mode.x, n = mode.y, s = mode.z;
    vec2 cn = cos(n * PI * p), cm = cos(m * PI * p);
    vec2 sn = sin(n * PI * p), sm = sin(m * PI * p);
    return vec3(
      cn.x * cm.y + s * cm.x * cn.y,
      -n * sn.x * cm.y - s * m * sm.x * cn.y,
      -m * cn.x * sm.y - s * n * cm.x * sn.y
    );
  }

  void main() {
    uint id = uint(gl_VertexID);
    uint a = hash(id * 3u + uFrame * 2654435761u);
    uint b = hash(a);
    vec2 jitter = vec2(float(a), float(b)) / 4294967295.0 - 0.5;
    float loose = float(hash(id)) / 4294967295.0;   // fixed per grain

    vec3 w = mix(wave(aPos, uFrom), wave(aPos, uTo), uMix);
    float frames = uDt * 30.0;

    // Slide toward the nearest still line, no faster than sand would.
    vec2 slide = -w.x * w.yz / (dot(w.yz, w.yz) + 6.0) / PI;
    slide *= 1.0 - exp(-3.2 * uDt);
    float len = length(slide), most = 0.008 * frames;
    if (len > most) slide *= most / len;

    // Grains jump where the plate moves most and barely stir on the lines.
    float jump = abs(w.x) * (0.006 + 0.075 * uShake) + 0.0048 + 0.022 * pow(loose, 7.0);
    vec2 p = aPos + slide + jitter * jump * sqrt(frames);

    if (uPointer.z > 0.0) {
      vec2 away = p - uPointer.xy;
      float d = length(away), R = 0.11;
      if (d < R) p += away / max(d, 0.001) * (R - d) * min(1.0, uDt * 9.0);
    }

    p = abs(p);                 // bounce off the edges
    p = 1.0 - abs(1.0 - p);
    vPos = p;
  }`;

  var UPDATE_FRAG = `#version 300 es
  precision mediump float;
  out vec4 o;
  void main() { o = vec4(0.0); }`;

  var DRAW_VERT = `#version 300 es
  precision highp float;
  layout(location = 0) in vec2 aPos;
  uniform vec3 uFrom, uTo, uInk, uHot;
  uniform float uMix, uShake, uInset, uScale;
  out vec3 vColor;
  out float vAlpha, vSize;
  const float PI = 3.14159265359;

  float wave(vec2 p, vec3 mode) {
    float m = mode.x, n = mode.y;
    return cos(n * PI * p.x) * cos(m * PI * p.y) + mode.z * cos(m * PI * p.x) * cos(n * PI * p.y);
  }

  void main() {
    float r = fract(sin(float(gl_VertexID) * 12.9898) * 43758.5453);
    // Grains that are still being thrown around glow warm.
    float moving = abs(mix(wave(aPos, uFrom), wave(aPos, uTo), uMix));
    float heat = smoothstep(0.08, 0.7, moving) * (0.35 + 0.65 * uShake);
    vColor = mix(uInk, uHot, heat);
    vAlpha = 0.4 + 0.5 * r;
    vSize = (0.75 + 0.95 * r * r) * uScale;
    gl_PointSize = vSize + 1.0;
    vec2 at = uInset + aPos * (1.0 - 2.0 * uInset);
    gl_Position = vec4(at.x * 2.0 - 1.0, 1.0 - at.y * 2.0, 0.0, 1.0);
  }`;

  var DRAW_FRAG = `#version 300 es
  precision mediump float;
  in vec3 vColor;
  in float vAlpha, vSize;
  out vec4 o;
  void main() {
    float d = length(gl_PointCoord - 0.5) * (vSize + 1.0);
    float a = vAlpha * clamp(vSize * 0.5 + 0.5 - d, 0.0, 1.0);
    o = vec4(vColor * a, a);
  }`;

  var THEMES = {
    light: { ink: [0.20, 0.25, 0.37], hot: [0.74, 0.38, 0.20] },
    dark: { ink: [0.72, 0.78, 0.90], hot: [0.96, 0.65, 0.46] }
  };

  var darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
  var motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  function program(vert, frag, varyings, names) {
    var p = gl.createProgram();
    [[gl.VERTEX_SHADER, vert], [gl.FRAGMENT_SHADER, frag]].forEach(function (s) {
      var shader = gl.createShader(s[0]);
      gl.shaderSource(shader, s[1]);
      gl.compileShader(shader);
      gl.attachShader(p, shader);
    });
    if (varyings) gl.transformFeedbackVaryings(p, varyings, gl.SEPARATE_ATTRIBS);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return null;
    var u = {};
    names.forEach(function (n) { u[n] = gl.getUniformLocation(p, n); });
    return { p: p, u: u };
  }

  var update, paint, buffers, vaos, feedback;
  function setup() {
    update = program(UPDATE_VERT, UPDATE_FRAG, ['vPos'], ['uFrom', 'uTo', 'uPointer', 'uMix', 'uShake', 'uDt', 'uFrame']);
    paint = program(DRAW_VERT, DRAW_FRAG, null, ['uFrom', 'uTo', 'uInk', 'uHot', 'uMix', 'uShake', 'uInset', 'uScale']);
    if (!update || !paint) return false;

    // Start with the sand scattered evenly.
    var start = new Float32Array(MAX_GRAINS * 2);
    for (var i = 0; i < start.length; i++) start[i] = Math.random();

    buffers = [start, start.byteLength].map(function (data) {
      var b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_COPY);
      return b;
    });
    vaos = buffers.map(function (b) {
      var v = gl.createVertexArray();
      gl.bindVertexArray(v);
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      return v;
    });
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    feedback = gl.createTransformFeedback();

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    return true;
  }

  var from = Math.floor(Math.random() * MODES.length), to = from;
  var since = 0, frameNo = 0, grains = 0, size = 0, scale = 1;
  var front = 0; // which buffer holds the current positions
  var pointer = { x: 0, y: 0, on: 0 };

  function nextMode() {
    from = to;
    to = (from + 1 + Math.floor(Math.random() * (MODES.length - 1))) % MODES.length;
    since = 0;
  }

  function morph() {
    var k = Math.min(1, since / MORPH);
    return k * k * (3 - 2 * k);
  }

  function step(dt) {
    since += dt;
    if (since > HOLD) nextMode();
    gl.useProgram(update.p);
    gl.uniform3fv(update.u.uFrom, MODES[from]);
    gl.uniform3fv(update.u.uTo, MODES[to]);
    gl.uniform3f(update.u.uPointer, pointer.x, pointer.y, pointer.on);
    gl.uniform1f(update.u.uMix, morph());
    gl.uniform1f(update.u.uShake, Math.exp(-since * 2.4));
    gl.uniform1f(update.u.uDt, dt);
    gl.uniform1ui(update.u.uFrame, ++frameNo);

    gl.bindVertexArray(vaos[front]);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, feedback);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, buffers[1 - front]);
    gl.enable(gl.RASTERIZER_DISCARD);
    gl.beginTransformFeedback(gl.POINTS);
    gl.drawArrays(gl.POINTS, 0, grains);
    gl.endTransformFeedback();
    gl.disable(gl.RASTERIZER_DISCARD);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
    front = 1 - front;
  }

  function draw() {
    var th = darkQuery.matches ? THEMES.dark : THEMES.light;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(paint.p);
    gl.uniform3fv(paint.u.uFrom, MODES[from]);
    gl.uniform3fv(paint.u.uTo, MODES[to]);
    gl.uniform3fv(paint.u.uInk, th.ink);
    gl.uniform3fv(paint.u.uHot, th.hot);
    gl.uniform1f(paint.u.uMix, morph());
    gl.uniform1f(paint.u.uShake, Math.exp(-since * 2.4));
    gl.uniform1f(paint.u.uInset, PAD / size);
    gl.uniform1f(paint.u.uScale, scale);
    gl.bindVertexArray(vaos[front]);
    gl.drawArrays(gl.POINTS, 0, grains);
    canvas.classList.add('is-on');
  }

  // Put the plate in the larger clear space: beside the name, or above it.
  function layout() {
    var box = hero.getBoundingClientRect();
    var range = document.createRange();
    range.selectNodeContents(title);
    var name = range.getBoundingClientRect();
    var gutter = parseFloat(getComputedStyle(hero).paddingLeft);
    var top = parseFloat(getComputedStyle(hero).getPropertyValue('--bar')) || 56;
    var bottom = box.height - strip.offsetHeight;
    var listTop = bottom, listRight = 0;
    Array.prototype.forEach.call(hero.querySelectorAll('.index-link'), function (link) {
      var r = link.getBoundingClientRect();
      listTop = Math.min(listTop, r.top - box.top);
      listRight = Math.max(listRight, r.right - box.left);
    });

    // Beside the name, the plate either clears the links sideways or stops
    // short of them.
    function fit(left, floor) {
      return { size: Math.min(box.width - gutter - left - 48, floor - top - 24, 600), floor: floor };
    }
    var nameRight = name.right - box.left;
    var clear = fit(Math.max(nameRight, listRight), bottom - 24);
    var short = fit(nameRight, listTop - 24);
    var beside = clear.size >= short.size ? clear : short;
    var titleTop = title.getBoundingClientRect().top - box.top;
    var above = Math.min(box.width - 2 * gutter, titleTop - top - 48, 600);

    var useBeside = beside.size >= above * 0.9;
    size = Math.floor(useBeside ? beside.size : above);
    canvas.hidden = size < 120;
    if (canvas.hidden) { grains = 0; return; }

    var x = !useBeside && box.width < 720 ? (box.width - size) / 2 : box.width - gutter - size;
    var y = useBeside
      ? Math.min(top + (bottom - top - size) / 2, beside.floor - size)
      : top + (titleTop - top - size) / 2;
    canvas.style.left = Math.round(x) + 'px';
    canvas.style.top = Math.round(y) + 'px';
    canvas.style.width = canvas.style.height = size + 'px';

    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var px = Math.round(size * dpr);
    if (canvas.width !== px) canvas.width = canvas.height = px;
    // The same density of sand, and slightly finer grains on small plates.
    grains = Math.round(Math.max(4000, Math.min(MAX_GRAINS, size * size * 0.16)));
    scale = dpr * Math.max(0.7, Math.min(1.1, size / 500));
  }

  var raf = 0, last = 0, onScreen = true;

  function running() {
    return onScreen && !document.hidden && !motionQuery.matches && !gl.isContextLost() && grains > 0;
  }

  function frame(now) {
    raf = 0;
    if (!running()) return;
    raf = requestAnimationFrame(frame);
    var elapsed = now - last;
    if (elapsed < 15) return; // no more than about 60 frames a second
    last = now;
    step(Math.min(elapsed / 1000, 0.05));
    draw();
  }

  // One finished pattern, with no animation.
  function still() {
    from = to;
    since = 0;
    for (var i = 0; i < 240; i++) step(1 / 30);
    draw();
  }

  function refresh() {
    if (gl.isContextLost() || !grains) return;
    if (motionQuery.matches) { pointer.on = 0; still(); return; }
    draw();
    if (running() && !raf) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  }

  function relayout() {
    if (gl.isContextLost()) return;
    layout();
    refresh();
  }

  // The pointer brushes the sand aside; a click or tap strikes the next mode.
  function locate(e) {
    var r = canvas.getBoundingClientRect();
    var inner = r.width - 2 * PAD;
    pointer.x = (e.clientX - r.left - PAD) / inner;
    pointer.y = (e.clientY - r.top - PAD) / inner;
    return !canvas.hidden && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  }
  function release() { pointer.on = 0; hero.style.cursor = ''; }
  hero.addEventListener('pointermove', function (e) {
    var over = locate(e) && !motionQuery.matches;
    pointer.on = over ? 1 : 0;
    hero.style.cursor = over ? 'pointer' : '';
  });
  hero.addEventListener('pointerleave', release);
  hero.addEventListener('pointercancel', release);
  hero.addEventListener('pointerup', function (e) { if (e.pointerType !== 'mouse') release(); });
  hero.addEventListener('click', function (e) {
    if (!motionQuery.matches && !e.target.closest('a') && locate(e)) nextMode();
  });

  if (!setup()) return;

  function onChange(q, fn) {
    if (q.addEventListener) q.addEventListener('change', fn); else if (q.addListener) q.addListener(fn);
  }
  onChange(darkQuery, refresh);
  onChange(motionQuery, relayout);
  document.addEventListener('visibilitychange', refresh);
  if ('ResizeObserver' in window) new ResizeObserver(relayout).observe(hero);
  else window.addEventListener('resize', relayout);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      onScreen = entries[0].isIntersecting;
      refresh();
    }).observe(hero);
  }
  canvas.addEventListener('webglcontextlost', function (e) {
    e.preventDefault();
    cancelAnimationFrame(raf);
    raf = 0;
  });
  canvas.addEventListener('webglcontextrestored', function () {
    if (setup()) relayout();
  });

  // The name's width decides the layout, so wait for its font.
  if (document.fonts) document.fonts.ready.then(relayout);
  else relayout();
})();
