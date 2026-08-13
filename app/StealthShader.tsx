"use client";

import { useEffect, useRef } from "react";

const vertexSource = `
attribute vec2 a_position;
varying vec2 v_texCoord;
void main() {
  v_texCoord = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const fragmentSource = `
precision highp float;
uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_mouse;
varying vec2 v_texCoord;

void main() {
  vec2 uv = v_texCoord;
  vec2 m = u_mouse / u_resolution;
  float noise = 0.0;
  vec2 q = uv * 3.0;
  float strength = 0.8;

  for (int i = 0; i < 4; i++) {
    q += vec2(cos(q.y + u_time * 0.2), sin(q.x + u_time * 0.1));
    noise += strength * (0.5 + 0.5 * cos(q.x + q.y));
    strength *= 0.5;
    q *= 2.1;
  }

  vec3 col1 = vec3(0.055, 0.055, 0.055);
  vec3 col2 = vec3(0.075, 0.075, 0.075);
  vec3 col3 = vec3(0.11, 0.11, 0.11);
  float dist = distance(uv, m);
  float glow = smoothstep(0.4, 0.0, dist) * 0.05;
  vec3 finalCol = mix(col1, col2, noise);
  finalCol = mix(finalCol, col3, noise * 0.5);
  finalCol += glow;
  gl_FragColor = vec4(finalCol, 1.0);
}`;

export default function StealthShader() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      powerPreference: "low-power",
    });
    if (!gl) return;

    function compile(type: number, source: string) {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    }

    const vertex = compile(gl.VERTEX_SHADER, vertexSource);
    const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram();
    if (!vertex || !fragment || !program) return;

    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const timeLocation = gl.getUniformLocation(program, "u_time");
    const resolutionLocation = gl.getUniformLocation(program, "u_resolution");
    const mouseLocation = gl.getUniformLocation(program, "u_mouse");
    const pointer = { x: 0, y: 0 };
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let animationFrame = 0;
    let startTime = performance.now();

    const syncSize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
      const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        pointer.x = width * 0.5;
        pointer.y = height * 0.5;
      }
    };

    const movePointer = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      pointer.x = ((event.clientX - rect.left) / rect.width) * canvas.width;
      pointer.y = (1 - (event.clientY - rect.top) / rect.height) * canvas.height;
    };

    const render = (now: number) => {
      syncSize();
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform1f(timeLocation, (now - startTime) * 0.001);
      gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
      gl.uniform2f(mouseLocation, pointer.x, pointer.y);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (!reduceMotion && !document.hidden) animationFrame = requestAnimationFrame(render);
    };

    const handleVisibility = () => {
      cancelAnimationFrame(animationFrame);
      if (!document.hidden && !reduceMotion) {
        startTime = performance.now();
        animationFrame = requestAnimationFrame(render);
      }
    };

    let resizeFrame: number;
    const resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(syncSize);
    });
    resizeObserver.observe(canvas);
    window.addEventListener("pointermove", movePointer, { passive: true });
    document.addEventListener("visibilitychange", handleVisibility);
    animationFrame = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      window.removeEventListener("pointermove", movePointer);
      document.removeEventListener("visibilitychange", handleVisibility);
      gl.deleteBuffer(buffer);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      gl.deleteProgram(program);
    };
  }, []);

  return <canvas ref={canvasRef} className="stealth-shader" aria-hidden="true" />;
}
