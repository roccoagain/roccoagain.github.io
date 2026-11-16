// Animated background for the hero: a slow, domain-warped noise field drawn
// with WebGL. It renders at a fraction of the screen's resolution, caps its
// frame rate, pauses when the hero is off screen or the tab is hidden, and
// draws a single still frame when the visitor prefers reduced motion. Without
// WebGL the canvas stays hidden and the CSS gradient on .hero shows instead.
(function () {
  var hero = document.querySelector('.hero');
  var canvas = document.querySelector('.hero-shader');
  if (!hero || !canvas) return;

  var gl;
  try {
    var opts = { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'low-power', preserveDrawingBuffer: false };
    gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);
  } catch (e) {}
  if (!gl) return;

  var VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';

  var FRAG = [
    'precision mediump float;',
    'uniform vec2 uRes;',
    'uniform float uTime;',
    'uniform vec3 uBase;',
    'uniform vec3 uCool;',
    'uniform vec3 uWarm;',
    'uniform float uStrength;',
    'uniform float uOctaves;',

    'float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}',
    'float noise(vec2 p){',
    '  vec2 i=floor(p),f=fract(p);',
    '  vec2 u=f*f*(3.-2.*f);',
    '  return mix(mix(hash(i),hash(i+vec2(1.,0.)),u.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),u.x),u.y);',
    '}',
    'float fbm(vec2 p){',
    '  float v=0.,a=.5;',
    '  mat2 r=mat2(.8,.6,-.6,.8);',
    '  for(int i=0;i<5;i++){',
    '    if(float(i)>=uOctaves)break;',
    '    v+=a*noise(p);p=r*p*2.02+vec2(3.1,1.7);a*=.5;',
    '  }',
    '  return v;',
    '}',

    'void main(){',
    '  vec2 uv=gl_FragCoord.xy/uRes;',
    '  vec2 p=(gl_FragCoord.xy-.5*uRes)/min(uRes.x,uRes.y)*.85;',
    '  float t=uTime*.045;',
    // Two layers of domain warping give the slow, folding, smoke-like flow.
    '  vec2 q=vec2(fbm(p+vec2(0.,t)),fbm(p+vec2(5.2,1.3)-t*.8));',
    '  vec2 r=vec2(fbm(p+2.2*q+vec2(1.7,9.2)+t*1.3),fbm(p+2.2*q+vec2(8.3,2.8)-t));',
    '  float f=fbm(p+2.6*r);',

    '  float cool=smoothstep(.25,.8,f);',
    '  float warm=smoothstep(.35,.85,r.x)*smoothstep(.2,.75,q.y);',

    // Keep the field strongest up and to the right, away from the title and
    // links in the lower left, and let it dissolve into the page at the bottom.
    '  float mask=.35+.65*smoothstep(.1,1.,uv.x*.7+uv.y*.8-.1);',
    '  mask*=smoothstep(.0,.3,uv.y);',

    '  vec3 col=uBase;',
    '  col=mix(col,uCool,cool*mask*uStrength);',
    '  col=mix(col,uWarm,warm*mask*uStrength*.85);',
    // A touch of grain breaks up banding in the soft gradients.
    '  col+=(hash(gl_FragCoord.xy+fract(uTime))-.5)/96.;',
    '  gl_FragColor=vec4(col,1.);',
    '}'
  ].join('\n');

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
  }

  var program, loc = {};
  function setup() {
    var vs = compile(gl.VERTEX_SHADER, VERT);
    var fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return false;
    program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return false;
    gl.useProgram(program);

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var a = gl.getAttribLocation(program, 'p');
    gl.enableVertexAttribArray(a);
    gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);

    ['uRes', 'uTime', 'uBase', 'uCool', 'uWarm', 'uStrength', 'uOctaves'].forEach(function (n) {
      loc[n] = gl.getUniformLocation(program, n);
    });
    applyTheme();
    return true;
  }

  // Palettes follow the site's slate accent with a faint warm undertone.
  var THEMES = {
    light: { base: [1, 1, 1], cool: [0.68, 0.75, 0.90], warm: [0.98, 0.82, 0.72], strength: 1.0 },
    dark: { base: [0, 0, 0], cool: [0.20, 0.27, 0.45], warm: [0.40, 0.22, 0.15], strength: 1.0 }
  };

  var darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
  var motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  var small = window.matchMedia('(max-width: 720px), (pointer: coarse)');

  function applyTheme() {
    var th = darkQuery.matches ? THEMES.dark : THEMES.light;
    gl.uniform3fv(loc.uBase, th.base);
    gl.uniform3fv(loc.uCool, th.cool);
    gl.uniform3fv(loc.uWarm, th.warm);
    gl.uniform1f(loc.uStrength, th.strength);
    gl.uniform1f(loc.uOctaves, small.matches ? 4 : 5);
  }

  // The field is soft, so a low resolution looks the same and costs far less.
  function resize() {
    var scale = small.matches ? 0.45 : 0.5;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(1, Math.round(hero.clientWidth * dpr * scale));
    var h = Math.max(1, Math.round(hero.clientHeight * dpr * scale));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(loc.uRes, w, h);
    }
  }

  // Start a little into the flow so the first frame is already interesting.
  var t0 = performance.now() - 40000;
  var frameGap = 1000 / 30;
  var last = 0, raf = 0, onScreen = true, shown = false;

  function draw(now) {
    gl.uniform1f(loc.uTime, (now - t0) / 1000);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!shown) {
      shown = true;
      canvas.classList.add('is-on');
    }
  }

  function frame(now) {
    raf = 0;
    if (!running()) return;
    if (now - last >= frameGap) {
      last = now;
      draw(now);
    }
    raf = requestAnimationFrame(frame);
  }

  function running() {
    return onScreen && !document.hidden && !motionQuery.matches && !gl.isContextLost();
  }

  function update() {
    if (gl.isContextLost()) return;
    resize();
    if (motionQuery.matches) {
      // One still frame, no animation loop.
      draw(t0 + 40000);
      return;
    }
    if (running() && !raf) raf = requestAnimationFrame(frame);
  }

  if (!setup()) return;

  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { resize(); if (motionQuery.matches || !raf) draw(performance.now()); }, 120);
  });
  document.addEventListener('visibilitychange', update);
  function onChange(q, fn) {
    if (q.addEventListener) q.addEventListener('change', fn); else if (q.addListener) q.addListener(fn);
  }
  onChange(darkQuery, function () { applyTheme(); update(); if (!raf) draw(performance.now()); });
  onChange(small, function () { applyTheme(); update(); });
  onChange(motionQuery, update);

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      onScreen = entries[0].isIntersecting;
      update();
    }).observe(hero);
  }

  canvas.addEventListener('webglcontextlost', function (e) {
    e.preventDefault();
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  });
  canvas.addEventListener('webglcontextrestored', function () {
    if (setup()) update();
  });

  update();
})();
