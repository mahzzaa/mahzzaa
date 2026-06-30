const canvas = document.querySelector("#shader-bg");
const gl = canvas.getContext("webgl", {
  antialias: false,
  depth: false,
  stencil: false,
  alpha: false,
  powerPreference: "high-performance",
});

const vertexSource = `
  attribute vec2 a_position;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const fragmentSource = `
  precision highp float;

  uniform vec2 u_resolution;
  uniform float u_time;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float beam(vec2 uv, float angle, float offset, float width, float speed) {
    mat2 r = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
    vec2 p = r * uv;
    float stripe = abs(p.y + sin(p.x * 2.3 + u_time * speed) * 0.055 - offset);
    float core = smoothstep(width, 0.0, stripe);
    float broken = smoothstep(0.18, 0.92, noise(vec2(p.x * 8.0 - u_time * speed, p.y * 24.0)));
    float scan = smoothstep(0.0, 0.18, fract((p.x - u_time * speed * 0.24) * 7.0));
    return core * mix(0.42, 1.0, broken) * mix(0.5, 1.0, scan);
  }

  void main() {
    vec2 frag = gl_FragCoord.xy;
    float px = 4.0;
    vec2 cell = floor(frag / px) * px + px * 0.5;
    vec2 uv = (cell - 0.5 * u_resolution.xy) / u_resolution.y;

    vec2 q = uv;
    q.x += sin(u_time * 0.19) * 0.035;
    q.y += cos(u_time * 0.15) * 0.025;

    float vignette = smoothstep(1.28, 0.1, length(uv * vec2(0.82, 1.25)));
    float grid = step(0.055, min(fract(frag.x / px), fract(frag.y / px)));
    float sparkle = smoothstep(0.985, 1.0, hash(floor(frag / px) + floor(u_time * 16.0)));

    float b1 = beam(q + vec2(0.18, -0.2), -0.73, 0.05, 0.028, 0.88);
    float b2 = beam(q + vec2(-0.14, 0.04), -0.66, -0.16, 0.042, 0.58);
    float b3 = beam(q + vec2(0.34, 0.16), -0.82, 0.31, 0.022, 1.05);
    float b4 = beam(q + vec2(-0.32, -0.18), 0.76, -0.22, 0.026, 0.78);
    float b5 = beam(q + vec2(0.08, 0.26), 0.62, 0.18, 0.038, 0.52);

    float haze = noise(uv * 2.0 + u_time * 0.035) * 0.24;
    float beams = b1 + b2 * 0.78 + b3 * 0.95 + b4 * 0.62 + b5 * 0.5;

    vec3 base = vec3(0.015, 0.01, 0.045);
    vec3 violet = vec3(0.42, 0.16, 1.0);
    vec3 cyan = vec3(0.14, 0.88, 1.0);
    vec3 pink = vec3(1.0, 0.19, 0.86);
    vec3 amber = vec3(1.0, 0.55, 0.16);

    vec3 color = base;
    color += violet * (b1 + b3) * 0.62;
    color += cyan * (b2 + b4) * 0.48;
    color += pink * (b1 * b2 + b5) * 0.78;
    color += amber * b3 * 0.16;
    color += vec3(0.09, 0.03, 0.18) * haze;
    color += sparkle * vec3(0.9, 0.95, 1.0) * beams * 0.12;

    float pixelMask = mix(0.76, 1.0, grid);
    color *= pixelMask * vignette;
    color = pow(color, vec3(0.82));

    gl_FragColor = vec4(color, 1.0);
  }
`;

function compileShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) || "Shader compile failed");
  }

  return shader;
}

function createProgram() {
  const program = gl.createProgram();
  gl.attachShader(program, compileShader(gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(program, compileShader(gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || "Shader link failed");
  }

  return program;
}

if (gl) {
  const program = createProgram();
  const positionLocation = gl.getAttribLocation(program, "a_position");
  const resolutionLocation = gl.getUniformLocation(program, "u_resolution");
  const timeLocation = gl.getUniformLocation(program, "u_time");
  const buffer = gl.createBuffer();
  const vertices = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);

  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

  const resize = () => {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.floor(window.innerWidth * pixelRatio);
    const height = Math.floor(window.innerHeight * pixelRatio);

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      gl.viewport(0, 0, width, height);
    }
  };

  const render = (time) => {
    resize();
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
    gl.uniform1f(timeLocation, time * 0.001);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    requestAnimationFrame(render);
  };

  window.addEventListener("resize", resize);
  requestAnimationFrame(render);
} else {
  document.body.classList.add("no-webgl");
}
