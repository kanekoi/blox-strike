// Blox Strike - Custom WebGL2 3D Block Engine
// Zero external dependencies. Procedural Roblox stud/crate/tile/face textures,
// sunlit plastic shading, blocky avatars, shatter physics, tracers, and 1st/3rd-person camera!

(function (global) {
  const BS = (global.BloxStrike = global.BloxStrike || {});

  // --- Minimal fast column-major Mat4 library ---
  const Mat4 = {
    create() {
      const m = new Float32Array(16);
      m[0] = m[5] = m[10] = m[15] = 1;
      return m;
    },
    identity(out) {
      out.fill(0);
      out[0] = out[5] = out[10] = out[15] = 1;
      return out;
    },
    multiply(out, a, b) {
      const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
      const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
      const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
      const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

      for (let i = 0; i < 4; i++) {
        const b0 = b[i * 4], b1 = b[i * 4 + 1], b2 = b[i * 4 + 2], b3 = b[i * 4 + 3];
        out[i * 4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
        out[i * 4 + 1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
        out[i * 4 + 2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
        out[i * 4 + 3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
      }
      return out;
    },
    perspective(out, fovyRad, aspect, near, far) {
      const f = 1.0 / Math.tan(fovyRad * 0.5);
      out.fill(0);
      out[0] = f / aspect;
      out[5] = f;
      out[10] = (far + near) / (near - far);
      out[11] = -1;
      out[14] = (2 * far * near) / (near - far);
      return out;
    },
    lookAt(out, ex, ey, ez, cx, cy, cz, ux, uy, uz) {
      let zx = ex - cx, zy = ey - cy, zz = ez - cz;
      let len = Math.hypot(zx, zy, zz) || 1;
      zx /= len; zy /= len; zz /= len;

      let xx = uy * zz - uz * zy;
      let xy = uz * zx - ux * zz;
      let xz = ux * zy - uy * zx;
      len = Math.hypot(xx, xy, xz) || 1;
      xx /= len; xy /= len; xz /= len;

      const yx = zy * xz - zz * xy;
      const yy = zz * xx - zx * xz;
      const yz = zx * xy - zy * xx;

      out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
      out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
      out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
      out[12] = -(xx * ex + xy * ey + xz * ez);
      out[13] = -(yx * ex + yy * ey + yz * ez);
      out[14] = -(zx * ex + zy * ey + zz * ez);
      out[15] = 1;
      return out;
    },
    fromTRS(out, tx, ty, tz, rx, ry, rz, sx, sy, sz) {
      const cx = Math.cos(rx), sxr = Math.sin(rx);
      // Negate ry so +yaw rotates clockwise from above (matching sim forward: (sin(yaw), 0, -cos(yaw)))
      const cy = Math.cos(-ry), syr = Math.sin(-ry);
      const cz = Math.cos(rz), szr = Math.sin(rz);

      // Rotation order: Ry * Rx * Rz (ideal for FPS yaw -> pitch -> roll)
      const m00 = cy * cz + syr * sxr * szr;
      const m01 = cx * szr;
      const m02 = -syr * cz + cy * sxr * szr;

      const m10 = -cy * szr + syr * sxr * cz;
      const m11 = cx * cz;
      const m12 = syr * szr + cy * sxr * cz;

      const m20 = syr * cx;
      const m21 = -sxr;
      const m22 = cy * cx;

      out[0] = m00 * sx; out[1] = m01 * sx; out[2] = m02 * sx; out[3] = 0;
      out[4] = m10 * sy; out[5] = m11 * sy; out[6] = m12 * sy; out[7] = 0;
      out[8] = m20 * sz; out[9] = m21 * sz; out[10] = m22 * sz; out[11] = 0;
      out[12] = tx; out[13] = ty; out[14] = tz; out[15] = 1;
      return out;
    },
  };

  // --- Shaders ---
  const BLOCK_VS = `#version 300 es
    precision highp float;
    layout(location = 0) in vec3 aPos;
    layout(location = 1) in vec3 aNorm;
    layout(location = 2) in vec2 aUV;

    uniform mat4 uViewProj;
    uniform mat4 uModel;
    uniform vec3 uTexScale;
    uniform int uUseWorldUV;

    out vec3 vNormal;
    out vec3 vWorldPos;
    out vec2 vUV;
    out vec3 vLocalNorm;

    void main() {
      vec4 wp = uModel * vec4(aPos, 1.0);
      vWorldPos = wp.xyz;
      vNormal = normalize(mat3(uModel) * aNorm);
      vLocalNorm = aNorm;
      if (uUseWorldUV == 1) {
        vec3 p = (aPos + 0.5) * uTexScale;
        if (abs(aNorm.y) > 0.5) vUV = p.xz;
        else if (abs(aNorm.x) > 0.5) vUV = p.zy;
        else vUV = p.xy;
      } else {
        vUV = aUV;
      }
      gl_Position = uViewProj * wp;
    }
  `;

  const BLOCK_FS = `#version 300 es
    precision highp float;
    in vec3 vNormal;
    in vec3 vWorldPos;
    in vec2 vUV;
    in vec3 vLocalNorm;

    uniform sampler2D uTex;
    uniform vec3 uColor;
    uniform float uEmissive;
    uniform float uAlpha;
    uniform int uTexMode; // 0=studs(top only), 1=full tex, 2=face(front only), 3=solid
    uniform vec3 uCamPos;
    uniform vec3 uFogColor;
    uniform float uFogDensity;
    uniform vec3 uSunDir;

    out vec4 outColor;

    void main() {
      vec3 N = normalize(vNormal);
      vec3 L = normalize(uSunDir);
      vec3 V = normalize(uCamPos - vWorldPos);

      // Base color & procedural texture modulation
      vec3 albedo = uColor;
      if (uTexMode == 0) {
        // Classic Roblox studs on top faces, crisp slight bevel on sides
        if (vLocalNorm.y > 0.5) {
          vec4 t = texture(uTex, vUV);
          albedo *= t.rgb;
        } else {
          // Subtle plastic block seam
          vec2 edge = abs(fract(vUV * 0.5) - 0.5);
          float seam = smoothstep(0.47, 0.5, max(edge.x, edge.y));
          albedo *= (1.0 - seam * 0.08);
        }
      } else if (uTexMode == 1) {
        vec4 t = texture(uTex, vUV);
        albedo *= t.rgb;
      } else if (uTexMode == 2) {
        // Roblox avatar head: draw smiley face on front (-Z local face)
        if (vLocalNorm.z < -0.5) {
          vec4 face = texture(uTex, vUV);
          albedo = mix(albedo, face.rgb, face.a);
        }
      }

      // Hemisphere ambient + directional sunlight + glossy Roblox plastic specular
      float ndl = max(dot(N, L), 0.0);
      float hemi = N.y * 0.5 + 0.5;
      vec3 ambient = mix(vec3(0.32, 0.34, 0.42), vec3(0.68, 0.74, 0.84), hemi);
      vec3 diffuse = vec3(1.0, 0.97, 0.92) * ndl * 0.72;

      vec3 H = normalize(L + V);
      float spec = pow(max(dot(N, H), 0.0), 36.0) * 0.24 * step(0.01, ndl);

      vec3 lit = albedo * (ambient * 0.72 + diffuse) + vec3(spec);
      vec3 finalCol = mix(lit, albedo * 1.15, clamp(uEmissive, 0.0, 1.0));

      // Atmospheric depth fog (disabled for viewmodel when uFogDensity == 0)
      if (uFogDensity > 0.0) {
        float dist = length(vWorldPos - uCamPos);
        float fogFactor = 1.0 - exp(-pow(dist * uFogDensity, 1.45));
        finalCol = mix(finalCol, uFogColor, clamp(fogFactor, 0.0, 0.92));
      }

      outColor = vec4(finalCol, uAlpha);
    }
  `;

  const SKY_VS = `#version 300 es
    precision highp float;
    const vec2 POS[3] = vec2[](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
    out vec2 vClip;
    void main() {
      vClip = POS[gl_VertexID];
      gl_Position = vec4(POS[gl_VertexID], 0.9999, 1.0);
    }
  `;

  const SKY_FS = `#version 300 es
    precision highp float;
    in vec2 vClip;
    uniform vec3 uCamForward;
    uniform vec3 uCamRight;
    uniform vec3 uCamUp;
    uniform float uTanHalfFov;
    uniform float uAspect;
    uniform vec3 uSkyTop;
    uniform vec3 uSkyHorizon;
    uniform vec3 uSunDir;
    uniform float uTime;
    out vec4 outColor;

    void main() {
      vec3 dir = normalize(
        uCamForward +
        uCamRight * (vClip.x * uAspect * uTanHalfFov) +
        uCamUp * (vClip.y * uTanHalfFov)
      );
      float h = clamp(dir.y * 0.85 + 0.15, 0.0, 1.0);
      vec3 col = mix(uSkyHorizon, uSkyTop, pow(h, 0.65));

      // Below horizon subtle tint
      if (dir.y < 0.0) {
        col = mix(uSkyHorizon, uSkyHorizon * 0.65, clamp(-dir.y * 2.2, 0.0, 1.0));
      }

      // Glowing stylized sun + halo
      float sunDot = max(dot(dir, normalize(uSunDir)), 0.0);
      col += vec3(1.0, 0.92, 0.72) * pow(sunDot, 22.0) * 0.35;
      col += vec3(1.0, 0.98, 0.9) * smoothstep(0.994, 0.998, sunDot) * 0.9;

      // Subtle blocky floating clouds in upper sky
      if (dir.y > 0.06) {
        vec2 cloudUV = dir.xz / (dir.y + 0.12) * 1.4 + vec2(uTime * 0.015, 0.0);
        vec2 cell = floor(cloudUV);
        float rnd = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
        float cloud = step(0.76, rnd) * smoothstep(0.06, 0.25, dir.y) * smoothstep(0.85, 0.35, dir.y);
        col = mix(col, vec3(1.0), cloud * 0.32);
      }

      outColor = vec4(col, 1.0);
    }
  `;

  function createUnitCubeMesh(gl) {
    // 24 vertices (4 per face), strictly counter-clockwise (CCW) outward winding!
    // prettier-ignore
    const verts = new Float32Array([
      // Front (-Z)
       0.5,-0.5,-0.5,  0,0,-1,  0,1,
      -0.5,-0.5,-0.5,  0,0,-1,  1,1,
      -0.5, 0.5,-0.5,  0,0,-1,  1,0,
       0.5, 0.5,-0.5,  0,0,-1,  0,0,
      // Back (+Z)
      -0.5,-0.5, 0.5,  0,0, 1,  0,1,
       0.5,-0.5, 0.5,  0,0, 1,  1,1,
       0.5, 0.5, 0.5,  0,0, 1,  1,0,
      -0.5, 0.5, 0.5,  0,0, 1,  0,0,
      // Top (+Y)
      -0.5, 0.5, 0.5,  0, 1,0,  0,1,
       0.5, 0.5, 0.5,  0, 1,0,  1,1,
       0.5, 0.5,-0.5,  0, 1,0,  1,0,
      -0.5, 0.5,-0.5,  0, 1,0,  0,0,
      // Bottom (-Y)
      -0.5,-0.5,-0.5,  0,-1,0,  0,1,
       0.5,-0.5,-0.5,  0,-1,0,  1,1,
       0.5,-0.5, 0.5,  0,-1,0,  1,0,
      -0.5,-0.5, 0.5,  0,-1,0,  0,0,
      // Right (+X)
       0.5,-0.5, 0.5,  1,0,0,   0,1,
       0.5,-0.5,-0.5,  1,0,0,   1,1,
       0.5, 0.5,-0.5,  1,0,0,   1,0,
       0.5, 0.5, 0.5,  1,0,0,   0,0,
      // Left (-X)
      -0.5,-0.5,-0.5, -1,0,0,   0,1,
      -0.5,-0.5, 0.5, -1,0,0,   1,1,
      -0.5, 0.5, 0.5, -1,0,0,   1,0,
      -0.5, 0.5,-0.5, -1,0,0,   0,0,
    ]);

    // prettier-ignore
    const indices = new Uint16Array([
       0, 1, 2,  0, 2, 3,
       4, 5, 6,  4, 6, 7,
       8, 9,10,  8,10,11,
      12,13,14, 12,14,15,
      16,17,18, 16,18,19,
      20,21,22, 20,22,23,
    ]);

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);

    const ebo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    const stride = 8 * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 3 * 4);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, 6 * 4);

    gl.bindVertexArray(null);
    return { vao, count: indices.length };
  }

  function makeCanvasTexture(gl, size, drawFn, repeat = true) {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d');
    drawFn(ctx, size);

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    return tex;
  }

  class Renderer3D {
    constructor(canvas) {
      this.canvas = canvas;
      this.gl = canvas.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance' });
      if (!this.gl) {
        throw new Error('WebGL2 is required to play Blox Strike.');
      }

      this.cube = createUnitCubeMesh(this.gl);
      this.blockProg = this._createProgram(BLOCK_VS, BLOCK_FS);
      this.skyProg = this._createProgram(SKY_VS, SKY_FS);
      this.skyVao = this.gl.createVertexArray();

      this._cacheUniforms();
      this._createTextures();

      // Matrices
      this.proj = Mat4.create();
      this.view = Mat4.create();
      this.viewProj = Mat4.create();
      this.model = Mat4.create();
      this.vmProj = Mat4.create();
      this.vmIdentity = Mat4.create();
      this._mRoot = Mat4.create();
      this._mA = Mat4.create();
      this._mB = Mat4.create();
      this._mC = Mat4.create();
      this._mLocal = Mat4.create();
      this._mPart = Mat4.create();

      // Camera state
      this.camPos = [0, 3, 10];
      this.camForward = [0, 0, -1];
      this.camRight = [1, 0, 0];
      this.camUp = [0, 1, 0];
      this.fovDeg = 78;
      this.thirdPerson = false;
      this.tpDist = 4.2;
      this.adsBlend = 0;
      this.shakeTime = 0;
      this._dt = 1 / 60;
      this.sunDir = [0.48, 0.78, 0.39];

      // Visual FX pools (client-side cosmetic particles & tracers)
      this.tracers = [];
      this.particles = [];
      this.explosions = [];
      this.muzzleFlashTimer = 0;
      this.muzzleColor = [1, 0.85, 0.35];
      this.screenShake = 0;

      this.resize();
    }

    _compile(type, src) {
      const gl = this.gl;
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(sh));
      }
      return sh;
    }

    _createProgram(vs, fs) {
      const gl = this.gl;
      const p = gl.createProgram();
      gl.attachShader(p, this._compile(gl.VERTEX_SHADER, vs));
      gl.attachShader(p, this._compile(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(p));
      }
      return p;
    }

    _cacheUniforms() {
      const gl = this.gl;
      const bp = this.blockProg;
      this.u = {
        viewProj: gl.getUniformLocation(bp, 'uViewProj'),
        model: gl.getUniformLocation(bp, 'uModel'),
        texScale: gl.getUniformLocation(bp, 'uTexScale'),
        useWorldUV: gl.getUniformLocation(bp, 'uUseWorldUV'),
        tex: gl.getUniformLocation(bp, 'uTex'),
        color: gl.getUniformLocation(bp, 'uColor'),
        emissive: gl.getUniformLocation(bp, 'uEmissive'),
        alpha: gl.getUniformLocation(bp, 'uAlpha'),
        texMode: gl.getUniformLocation(bp, 'uTexMode'),
        camPos: gl.getUniformLocation(bp, 'uCamPos'),
        fogColor: gl.getUniformLocation(bp, 'uFogColor'),
        fogDensity: gl.getUniformLocation(bp, 'uFogDensity'),
        sunDir: gl.getUniformLocation(bp, 'uSunDir'),
      };
      const sp = this.skyProg;
      this.su = {
        camForward: gl.getUniformLocation(sp, 'uCamForward'),
        camRight: gl.getUniformLocation(sp, 'uCamRight'),
        camUp: gl.getUniformLocation(sp, 'uCamUp'),
        tanHalfFov: gl.getUniformLocation(sp, 'uTanHalfFov'),
        aspect: gl.getUniformLocation(sp, 'uAspect'),
        skyTop: gl.getUniformLocation(sp, 'uSkyTop'),
        skyHorizon: gl.getUniformLocation(sp, 'uSkyHorizon'),
        sunDir: gl.getUniformLocation(sp, 'uSunDir'),
        time: gl.getUniformLocation(sp, 'uTime'),
      };
    }

    _createTextures() {
      const gl = this.gl;
      // 0: Classic Roblox Studs texture (1 stud per 1 world unit)
      this.texStuds = makeCanvasTexture(gl, 128, (ctx, s) => {
        ctx.fillStyle = '#f2f2f2';
        ctx.fillRect(0, 0, s, s);
        // Subtle grid bevel
        ctx.strokeStyle = 'rgba(0,0,0,0.08)';
        ctx.lineWidth = 3;
        ctx.strokeRect(1.5, 1.5, s - 3, s - 3);
        // Stud drop shadow
        ctx.beginPath();
        ctx.arc(s * 0.53, s * 0.54, s * 0.28, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fill();
        // Stud rim
        ctx.beginPath();
        ctx.arc(s * 0.5, s * 0.5, s * 0.27, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.14)';
        ctx.stroke();
        // Inner circular top
        ctx.beginPath();
        ctx.arc(s * 0.48, s * 0.47, s * 0.2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fill();
      });

      // 1: Crate texture
      this.texCrate = makeCanvasTexture(gl, 128, (ctx, s) => {
        ctx.fillStyle = '#eaeaea';
        ctx.fillRect(0, 0, s, s);
        ctx.strokeStyle = '#b4b4b4';
        ctx.lineWidth = 14;
        ctx.strokeRect(7, 7, s - 14, s - 14);
        // Cross brace
        ctx.beginPath();
        ctx.moveTo(14, 14);
        ctx.lineTo(s - 14, s - 14);
        ctx.moveTo(s - 14, 14);
        ctx.lineTo(14, s - 14);
        ctx.lineWidth = 10;
        ctx.strokeStyle = '#c5c5c5';
        ctx.stroke();
        // Corner rivets
        ctx.fillStyle = '#888';
        [18, s - 18].forEach((x) =>
          [18, s - 18].forEach((y) => {
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fill();
          })
        );
      });

      // 3: Arena Tile texture
      this.texTile = makeCanvasTexture(gl, 128, (ctx, s) => {
        ctx.fillStyle = '#ececec';
        ctx.fillRect(0, 0, s, s);
        ctx.fillStyle = '#dcdcdc';
        ctx.fillRect(0, 0, s / 2, s / 2);
        ctx.fillRect(s / 2, s / 2, s / 2, s / 2);
        ctx.strokeStyle = 'rgba(0,0,0,0.08)';
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, s - 2, s - 2);
      });

      // Roblox Smiley / Visor Face texture (transparent background)
      this.texFace = makeCanvasTexture(
        gl,
        128,
        (ctx, s) => {
          ctx.clearRect(0, 0, s, s);
          // Classic expressive eyes
          ctx.fillStyle = '#151822';
          ctx.beginPath();
          ctx.ellipse(s * 0.34, s * 0.42, s * 0.065, s * 0.095, 0, 0, Math.PI * 2);
          ctx.ellipse(s * 0.66, s * 0.42, s * 0.065, s * 0.095, 0, 0, Math.PI * 2);
          ctx.fill();
          // Eye sparkles
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(s * 0.32, s * 0.39, s * 0.024, 0, Math.PI * 2);
          ctx.arc(s * 0.64, s * 0.39, s * 0.024, 0, Math.PI * 2);
          ctx.fill();
          // Confident Roblox smirk!
          ctx.strokeStyle = '#151822';
          ctx.lineWidth = 7;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.arc(s * 0.5, s * 0.53, s * 0.19, 0.15 * Math.PI, 0.85 * Math.PI);
          ctx.stroke();
        },
        false
      );
    }

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.floor(window.innerWidth * dpr));
      const h = Math.max(1, Math.floor(window.innerHeight * dpr));
      if (this.canvas.width !== w || this.canvas.height !== h) {
        this.canvas.width = w;
        this.canvas.height = h;
      }
      this.gl.viewport(0, 0, w, h);
    }

    // --- Client-side VFX spawners ---
    addTracer(x1, y1, z1, x2, y2, z2, color, width = 0.045, life = 0.12) {
      this.tracers.push({ x1, y1, z1, x2, y2, z2, color, width, life, maxLife: life });
    }

    addBlockShatter(x, y, z, colors) {
      const palette = [colors.head, colors.torso, colors.legs, [1, 0.9, 0.3]];
      for (let i = 0; i < 16; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 2.8 + Math.random() * 6.5;
        this.particles.push({
          x: x + (Math.random() - 0.5) * 0.6,
          y: y + (Math.random() - 0.5) * 0.8,
          z: z + (Math.random() - 0.5) * 0.6,
          vx: Math.cos(angle) * speed,
          vy: 3.5 + Math.random() * 6.5,
          vz: Math.sin(angle) * speed,
          rx: Math.random() * 6,
          ry: Math.random() * 6,
          vrx: (Math.random() - 0.5) * 14,
          vry: (Math.random() - 0.5) * 14,
          size: 0.18 + Math.random() * 0.24,
          color: palette[i % palette.length],
          emissive: 0.15,
          life: 1.1 + Math.random() * 0.6,
          maxLife: 1.7,
          gravity: 19.0,
        });
      }
    }

    addImpactSparks(x, y, z, color, count = 6) {
      for (let i = 0; i < count; i++) {
        this.particles.push({
          x,
          y,
          z,
          vx: (Math.random() - 0.5) * 7,
          vy: 1.5 + Math.random() * 4.5,
          vz: (Math.random() - 0.5) * 7,
          rx: 0,
          ry: 0,
          vrx: 10,
          vry: 10,
          size: 0.08 + Math.random() * 0.07,
          color,
          emissive: 0.95,
          life: 0.22 + Math.random() * 0.18,
          maxLife: 0.4,
          gravity: 14.0,
        });
      }
    }

    addExplosion(x, y, z, radius) {
      this.explosions.push({ x, y, z, radius, life: 0.35, maxLife: 0.35 });
      for (let i = 0; i < 20; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 3 + Math.random() * 11;
        this.particles.push({
          x,
          y,
          z,
          vx: Math.cos(a) * sp,
          vy: 2 + Math.random() * 9,
          vz: Math.sin(a) * sp,
          rx: Math.random() * 3,
          ry: Math.random() * 3,
          vrx: 12,
          vry: 9,
          size: 0.22 + Math.random() * 0.28,
          color: i % 2 === 0 ? [1.0, 0.52, 0.12] : [1.0, 0.85, 0.22],
          emissive: 1.0,
          life: 0.45 + Math.random() * 0.35,
          maxLife: 0.8,
          gravity: 12.0,
        });
      }
    }

    triggerMuzzleFlash(color) {
      this.muzzleFlashTimer = 0.055;
      this.muzzleColor = color || [1, 0.88, 0.4];
    }

    addScreenShake(amount) {
      this.screenShake = Math.min(0.35, this.screenShake + amount);
    }

    updateVFX(dt) {
      if (this.muzzleFlashTimer > 0) this.muzzleFlashTimer = Math.max(0, this.muzzleFlashTimer - dt);
      if (this.screenShake > 0) this.screenShake = Math.max(0, this.screenShake - dt * 1.8);

      for (let i = this.tracers.length - 1; i >= 0; i--) {
        this.tracers[i].life -= dt;
        if (this.tracers[i].life <= 0) this.tracers.splice(i, 1);
      }

      for (let i = this.explosions.length - 1; i >= 0; i--) {
        this.explosions[i].life -= dt;
        if (this.explosions[i].life <= 0) this.explosions.splice(i, 1);
      }

      for (let i = this.particles.length - 1; i >= 0; i--) {
        const pt = this.particles[i];
        pt.life -= dt;
        if (pt.life <= 0) {
          this.particles.splice(i, 1);
          continue;
        }
        pt.vy -= pt.gravity * dt;
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.z += pt.vz * dt;
        pt.rx += pt.vrx * dt;
        pt.ry += pt.vry * dt;
        if (pt.y < pt.size * 0.5 && pt.vy < 0) {
          pt.y = pt.size * 0.5;
          pt.vy *= -0.45;
          pt.vx *= 0.72;
          pt.vz *= 0.72;
        }
      }
    }

    projectToScreen(wx, wy, wz) {
      const m = this.viewProj;
      const cx = m[0] * wx + m[4] * wy + m[8] * wz + m[12];
      const cy = m[1] * wx + m[5] * wy + m[9] * wz + m[13];
      const cw = m[3] * wx + m[7] * wy + m[11] * wz + m[15];
      if (cw <= 0.1) return null;
      const ndcX = cx / cw;
      const ndcY = cy / cw;
      if (ndcX < -1.15 || ndcX > 1.15 || ndcY < -1.15 || ndcY > 1.15) return null;
      return {
        x: (ndcX * 0.5 + 0.5) * window.innerWidth,
        y: (1 - (ndcY * 0.5 + 0.5)) * window.innerHeight,
        dist: cw,
      };
    }

    _drawWithMatrix(mat, sx, sy, sz, color, texType = 4, emissive = 0, alpha = 1, worldUV = false) {
      const gl = this.gl;
      gl.uniformMatrix4fv(this.u.model, false, mat);
      gl.uniform3f(this.u.color, color[0], color[1], color[2]);
      gl.uniform1f(this.u.emissive, emissive);
      gl.uniform1f(this.u.alpha, alpha);
      gl.uniform3f(this.u.texScale, sx, sy, sz);
      gl.uniform1i(this.u.useWorldUV, worldUV ? 1 : 0);

      if (texType === 0) {
        gl.bindTexture(gl.TEXTURE_2D, this.texStuds);
        gl.uniform1i(this.u.texMode, 0);
      } else if (texType === 1) {
        gl.bindTexture(gl.TEXTURE_2D, this.texCrate);
        gl.uniform1i(this.u.texMode, 1);
      } else if (texType === 3) {
        gl.bindTexture(gl.TEXTURE_2D, this.texTile);
        gl.uniform1i(this.u.texMode, 1);
      } else if (texType === 5) {
        gl.bindTexture(gl.TEXTURE_2D, this.texFace);
        gl.uniform1i(this.u.texMode, 2);
      } else {
        gl.uniform1i(this.u.texMode, 3);
      }

      gl.drawElements(gl.TRIANGLES, this.cube.count, gl.UNSIGNED_SHORT, 0);
    }

    _drawBox(tx, ty, tz, rx, ry, rz, sx, sy, sz, color, texType = 4, emissive = 0, alpha = 1, worldUV = false) {
      Mat4.fromTRS(this.model, tx, ty, tz, rx, ry, rz, sx, sy, sz);
      this._drawWithMatrix(this.model, sx, sy, sz, color, texType, emissive, alpha, worldUV);
    }

    _resolvePartColor(c, palette, flash) {
      let col;
      if (typeof c === 'string') {
        if (palette && palette[c]) col = palette[c];
        else if (c === 'dark') col = [0.12, 0.13, 0.16];
        else if (c === 'metal') col = [0.55, 0.58, 0.64];
        else if (c === 'wood') col = [0.55, 0.34, 0.18];
        else if (c === 'gold') col = [1.0, 0.8, 0.2];
        else col = [1.0, 1.0, 1.0];
      } else {
        col = c;
      }
      if (!flash) return col;
      return [
        Math.min(1, col[0] + flash * 0.7),
        Math.max(0, col[1] * (1 - flash * 0.5) + flash * 0.2),
        Math.max(0, col[2] * (1 - flash * 0.5) + flash * 0.2),
      ];
    }

    _drawModel(parts, parentMat, palette, opts = {}) {
      const gl = this.gl;
      const flash = opts.flash || 0;
      const emBoost = opts.emBoost || 0;
      const alphaMul = opts.alphaMul !== undefined ? opts.alphaMul : 1;
      let hasTranslucent = false;

      for (let i = 0; i < parts.length; i++) {
        const pt = parts[i];
        if (pt.a !== undefined && pt.a < 1) {
          hasTranslucent = true;
          continue;
        }
        const r = pt.r;
        Mat4.fromTRS(
          this._mLocal,
          pt.p[0],
          pt.p[1],
          pt.p[2],
          r ? r[0] : 0,
          r ? r[1] : 0,
          r ? r[2] : 0,
          pt.s[0],
          pt.s[1],
          pt.s[2]
        );
        Mat4.multiply(this._mPart, parentMat, this._mLocal);
        const col = this._resolvePartColor(pt.c, palette, flash);
        this._drawWithMatrix(
          this._mPart,
          pt.s[0],
          pt.s[1],
          pt.s[2],
          col,
          pt.t !== undefined ? pt.t : 4,
          (pt.e || 0) + emBoost,
          alphaMul,
          false
        );
      }

      if (hasTranslucent) {
        const wasBlend = gl.isEnabled(gl.BLEND);
        if (!wasBlend) {
          gl.enable(gl.BLEND);
          gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        }
        gl.depthMask(false);
        for (let i = 0; i < parts.length; i++) {
          const pt = parts[i];
          if (pt.a === undefined || pt.a >= 1) continue;
          const r = pt.r;
          Mat4.fromTRS(
            this._mLocal,
            pt.p[0],
            pt.p[1],
            pt.p[2],
            r ? r[0] : 0,
            r ? r[1] : 0,
            r ? r[2] : 0,
            pt.s[0],
            pt.s[1],
            pt.s[2]
          );
          Mat4.multiply(this._mPart, parentMat, this._mLocal);
          const col = this._resolvePartColor(pt.c, palette, flash);
          this._drawWithMatrix(
            this._mPart,
            pt.s[0],
            pt.s[1],
            pt.s[2],
            col,
            pt.t !== undefined ? pt.t : 4,
            (pt.e || 0) + emBoost,
            pt.a * alphaMul,
            false
          );
        }
        gl.depthMask(true);
        if (!wasBlend) gl.disable(gl.BLEND);
      }
    }

    render(snapshot, localId, localView, simForCameraCollide, dt, isMenuDemo = false) {
      this._dt = dt;
      this.shakeTime += dt;
      this.updateVFX(dt);
      this.resize();
      const gl = this.gl;
      const map = BS.MAPS[snapshot.mapId] || BS.MAPS.crossroads;
      const localPlayer = snapshot.players.find((p) => p.id === localId);

      // Compute Camera position & orientation
      let yaw = localView.yaw;
      let pitch = localView.pitch;
      let targetFov = 78;

      if (isMenuDemo || !localPlayer) {
        // Dramatic sweeping cinematic camera over the Roblox arena during menu!
        const a = snapshot.time * 0.28 + 0.5;
        this.camPos = [Math.sin(a) * 24, 12.5, Math.cos(a) * 24];
        yaw = Math.atan2(-this.camPos[0], this.camPos[2]);
        pitch = -0.34;
        targetFov = 70;
      } else {
        const w = BS.WEAPON_BY_ID[localPlayer.weaponId] || BS.WEAPONS[0];
        if (localPlayer.ads && localPlayer.alive) {
          targetFov = w.adsFov;
        } else if (localPlayer.speedBoostTimer > 0) {
          targetFov = 88;
        }

        // Smooth angular screen shake (never random per-frame position jitter)
        if (this.screenShake > 0) {
          const st = this.shakeTime;
          yaw += this.screenShake * 0.03 * (Math.sin(st * 31) + 0.6 * Math.sin(st * 17.7));
          pitch += this.screenShake * 0.03 * (Math.sin(st * 27.3) + 0.6 * Math.sin(st * 13.1));
          pitch = Math.max(-1.48, Math.min(1.48, pitch));
        }

        const baseY =
          localView.footY !== undefined && localView.footY !== null ? localView.footY : localPlayer.y;
        const eyeX = localPlayer.x;
        const eyeY = baseY + (localPlayer.alive ? BS.PLAYER.EYE_HEIGHT : 2.6);
        const eyeZ = localPlayer.z;

        const cp = Math.cos(pitch);
        const sp = Math.sin(pitch);
        const sy = Math.sin(yaw);
        const cy = Math.cos(yaw);
        const fx = sy * cp, fy = sp, fz = -cy * cp;
        const rx = cy, rz = sy;

        if (!localPlayer.alive) {
          // Orbiting death cam around KO spot!
          const dist = 5.5;
          this.camPos = [eyeX - fx * dist, eyeY + 1.8, eyeZ - fz * dist];
        } else if (this.thirdPerson) {
          // Smooth over-the-shoulder Roblox 3rd person cam with full diagonal collision pull-in
          const desX = eyeX - fx * 4.2 + rx * 0.72;
          const desY = eyeY + 0.35 - fy * 4.2;
          const desZ = eyeZ - fz * 4.2 + rz * 0.72;
          const ox = eyeX;
          const oy = eyeY + 0.2;
          const oz = eyeZ;
          const vx = desX - ox;
          const vy = desY - oy;
          const vz = desZ - oz;
          const fullLen = Math.hypot(vx, vy, vz) || 1;
          let targetDist = fullLen;
          if (simForCameraCollide) {
            const hit = simForCameraCollide.raycastBlocks(ox, oy, oz, vx / fullLen, vy / fullLen, vz / fullLen, fullLen);
            if (hit.hit) targetDist = Math.max(0.6, hit.dist - 0.3);
          }
          if (targetDist < this.tpDist) {
            this.tpDist = targetDist;
          } else {
            this.tpDist += (targetDist - this.tpDist) * Math.min(1, dt * 6);
          }
          const ratio = this.tpDist / fullLen;
          this.camPos = [ox + vx * ratio, oy + vy * ratio, oz + vz * ratio];
        } else {
          // Crisp 1st person camera with walkAmp-damped walk bob
          const amp = localPlayer.walkAmp !== undefined ? localPlayer.walkAmp : localPlayer.grounded ? 1 : 0;
          const bob = Math.sin(localPlayer.walkPhase * 1.0) * 0.045 * amp;
          this.camPos = [eyeX, eyeY + bob, eyeZ];
        }
      }

      // Smooth FOV transition
      this.fovDeg += (targetFov - this.fovDeg) * Math.min(1, dt * 14);
      const fovRad = (this.fovDeg * Math.PI) / 180;
      const aspect = this.canvas.width / Math.max(1, this.canvas.height);

      const cp = Math.cos(pitch);
      const sp = Math.sin(pitch);
      const sy = Math.sin(yaw);
      const cy = Math.cos(yaw);
      this.camForward = [sy * cp, sp, -cy * cp];
      this.camRight = [cy, 0, sy];
      this.camUp = [-sy * sp, cp, cy * sp];

      Mat4.perspective(this.proj, fovRad, aspect, 0.12, 260);
      Mat4.lookAt(
        this.view,
        this.camPos[0],
        this.camPos[1],
        this.camPos[2],
        this.camPos[0] + this.camForward[0],
        this.camPos[1] + this.camForward[1],
        this.camPos[2] + this.camForward[2],
        0,
        1,
        0
      );
      Mat4.multiply(this.viewProj, this.proj, this.view);

      // 1. Draw Procedural Sunlit Skybox
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.useProgram(this.skyProg);
      gl.bindVertexArray(this.skyVao);
      gl.uniform3fv(this.su.camForward, this.camForward);
      gl.uniform3fv(this.su.camRight, this.camRight);
      gl.uniform3fv(this.su.camUp, this.camUp);
      gl.uniform1f(this.su.tanHalfFov, Math.tan(fovRad * 0.5));
      gl.uniform1f(this.su.aspect, aspect);
      gl.uniform3fv(this.su.skyTop, map.skyTop);
      gl.uniform3fv(this.su.skyHorizon, map.skyHorizon);
      gl.uniform3fv(this.su.sunDir, this.sunDir);
      gl.uniform1f(this.su.time, snapshot.time);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // 2. Setup 3D World Pass
      gl.depthMask(true);
      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);
      gl.clear(gl.DEPTH_BUFFER_BIT);

      gl.useProgram(this.blockProg);
      gl.bindVertexArray(this.cube.vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform1i(this.u.tex, 0);
      gl.uniformMatrix4fv(this.u.viewProj, false, this.viewProj);
      gl.uniform3fv(this.u.camPos, this.camPos);
      gl.uniform3fv(this.u.fogColor, map.fogColor);
      gl.uniform1f(this.u.fogDensity, map.fogDensity);
      gl.uniform3fv(this.u.sunDir, this.sunDir);

      // Draw Map Blocks
      const blocks = map.blocks;
      for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        this._drawBox(b.x, b.y, b.z, 0, 0, 0, b.w, b.h, b.d, b.color, b.tex, b.emissive || 0, 1.0, true);
      }

      // Draw World Scenery Props (trees, lamps, barrels, crystals, flags, benches, rocks)
      const mapProps = map.props || [];
      const propModels = BS.MODELS && BS.MODELS.props;
      if (propModels) {
        for (let i = 0; i < mapProps.length; i++) {
          const pr = mapProps[i];
          const parts = propModels[pr.m];
          if (!parts) continue;
          const s = pr.s || 1;
          Mat4.fromTRS(this._mRoot, pr.x, pr.y, pr.z, 0, pr.ry || 0, 0, s, s, s);
          this._drawModel(parts, this._mRoot, pr.tint ? { tint: pr.tint } : null);
        }
      }

      // Draw Jump Pads (pulsing glowing rings)
      const pulse = 0.5 + 0.5 * Math.sin(snapshot.time * 6.0);
      for (let i = 0; i < map.jumpPads.length; i++) {
        const pad = map.jumpPads[i];
        this._drawBox(pad.x, pad.y, pad.z, 0, 0, 0, 2.4, 0.22, 2.4, [0.18, 0.22, 0.3], 4, 0);
        this._drawBox(
          pad.x,
          pad.y + 0.14,
          pad.z,
          0,
          snapshot.time * 1.4,
          0,
          1.7 + pulse * 0.2,
          0.1,
          1.7 + pulse * 0.2,
          [0.12, 0.96, 0.82],
          2,
          1.0
        );
      }

      // Draw KOTH Capture Zone if in KOTH mode
      if (snapshot.modeId === 'koth' && map.kothZone) {
        const kz = map.kothZone;
        const zCol =
          snapshot.kothOwner === 'blue'
            ? [0.18, 0.58, 1.0]
            : snapshot.kothOwner === 'red'
            ? [1.0, 0.24, 0.3]
            : snapshot.kothOwner === 'contested'
            ? [1.0, 0.78, 0.14]
            : [0.88, 0.94, 1.0];
        const s = kz.radius * 2;
        this._drawBox(kz.x, kz.y + 0.04, kz.z, 0, 0, 0, s, 0.08, 0.35, zCol, 2, 1.0);
        this._drawBox(kz.x, kz.y + 0.04, kz.z, 0, Math.PI * 0.5, 0, s, 0.08, 0.35, zCol, 2, 1.0);
        // Perimeter corner posts
        const off = kz.radius * 0.72;
        [[-off, -off], [off, -off], [-off, off], [off, off]].forEach(([ox, oz]) => {
          this._drawBox(kz.x + ox, kz.y + 1.8, kz.z + oz, 0, 0, 0, 0.24, 3.6, 0.24, zCol, 2, 0.95);
        });
      }

      // Draw Pickup Spawner Pads & Floating Custom Models
      const pickupModels = BS.MODELS && BS.MODELS.pickups;
      for (let i = 0; i < snapshot.pickups.length; i++) {
        const pk = snapshot.pickups[i];
        const padCol =
          pk.type === 'health'
            ? [0.16, 0.96, 0.45]
            : pk.type === 'shield'
            ? [0.18, 0.78, 1.0]
            : [1.0, 0.84, 0.16];
        this._drawBox(pk.x, pk.y - 0.95, pk.z, 0, 0, 0, 1.1, 0.12, 1.1, [0.12, 0.13, 0.16], 4, 0);
        this._drawBox(pk.x, pk.y - 0.94, pk.z, 0, 0, 0, 0.8, 0.13, 0.8, padCol, 2, pk.active ? 0.9 : 0.25);
        if (!pk.active) continue;
        const bobY = pk.y + Math.sin(snapshot.time * 3.5 + i) * 0.22;
        const rotY = snapshot.time * 2.1 + i;
        if (pickupModels && pickupModels[pk.type]) {
          Mat4.fromTRS(this._mRoot, pk.x, bobY, pk.z, 0, rotY, 0, 1, 1, 1);
          this._drawModel(pickupModels[pk.type], this._mRoot, null);
        }
      }

      // Draw Blocky Roblox Players!
      for (let i = 0; i < snapshot.players.length; i++) {
        const p = snapshot.players[i];
        if (!p.alive) continue;
        if (!isMenuDemo && p.id === localId && !this.thirdPerson) continue;
        this._drawRobloxAvatar(p, snapshot.time);
      }

      // Draw Active Projectiles (Rockets!)
      for (let i = 0; i < snapshot.projectiles.length; i++) {
        const pr = snapshot.projectiles[i];
        const pyaw = Math.atan2(pr.vx, -pr.vz);
        const ppitch = Math.atan2(pr.vy, Math.hypot(pr.vx, pr.vz) || 0.001);
        this._drawBox(pr.x, pr.y, pr.z, ppitch, pyaw, 0, 0.24, 0.24, 0.72, [0.98, 0.28, 0.18], 4, 0.4);
        this._drawBox(
          pr.x - pr.vx * 0.012,
          pr.y - pr.vy * 0.012,
          pr.z - pr.vz * 0.012,
          0,
          0,
          0,
          0.32,
          0.32,
          0.32,
          [1.0, 0.85, 0.25],
          2,
          1.0
        );
      }

      // Draw Translucent VFX (Forcefields, Tracers, Explosions, Shatter Particles)
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);

      // Roblox-style spawn protection forcefields
      for (let i = 0; i < snapshot.players.length; i++) {
        const p = snapshot.players[i];
        if (!p.alive || p.spawnProtect <= 0) continue;
        if (!isMenuDemo && p.id === localId && !this.thirdPerson) continue;
        Mat4.fromTRS(this._mRoot, p.x, p.y, p.z, 0, p.yaw, 0, 1, 1, 1);
        Mat4.fromTRS(this._mLocal, 0, 0.98, 0, 0, 0, 0, 1.25, 2.1, 0.95);
        Mat4.multiply(this._mA, this._mRoot, this._mLocal);
        const ffAlpha = 0.16 + 0.08 * Math.sin(snapshot.time * 10);
        this._drawWithMatrix(this._mA, 1.25, 2.1, 0.95, [0.35, 0.75, 1.0], 2, 0.8, ffAlpha);
      }

      // Shatter & spark particles
      for (let i = 0; i < this.particles.length; i++) {
        const pt = this.particles[i];
        const a = Math.min(1, pt.life / Math.min(0.4, pt.maxLife));
        this._drawBox(pt.x, pt.y, pt.z, pt.rx, pt.ry, 0, pt.size, pt.size, pt.size, pt.color, 4, pt.emissive, a);
      }

      // Bullet Tracers
      for (let i = 0; i < this.tracers.length; i++) {
        const tr = this.tracers[i];
        const dx = tr.x2 - tr.x1;
        const dy = tr.y2 - tr.y1;
        const dz = tr.z2 - tr.z1;
        const len = Math.hypot(dx, dy, dz);
        if (len < 0.05) continue;
        const mx = (tr.x1 + tr.x2) * 0.5;
        const my = (tr.y1 + tr.y2) * 0.5;
        const mz = (tr.z1 + tr.z2) * 0.5;
        const tyaw = Math.atan2(dx, -dz);
        const tpitch = Math.atan2(dy, Math.hypot(dx, dz) || 0.0001);
        const alpha = tr.life / tr.maxLife;
        this._drawBox(mx, my, mz, tpitch, tyaw, 0, tr.width, tr.width, len, tr.color, 2, 1.0, alpha * 0.88);
      }

      // Expanding Blocky Explosions
      for (let i = 0; i < this.explosions.length; i++) {
        const ex = this.explosions[i];
        const prog = 1 - ex.life / ex.maxLife;
        const sc = ex.radius * (0.35 + prog * 0.95);
        this._drawBox(ex.x, ex.y, ex.z, prog * 2, prog * 3, 0, sc, sc, sc, [1.0, 0.55, 0.16], 2, 1.0, (1 - prog) * 0.58);
      }

      gl.depthMask(true);
      gl.disable(gl.BLEND);

      // 3. Draw Crisp 1st-Person Weapon Viewmodel (depth-cleared so it never clips walls!)
      if (!isMenuDemo && localPlayer && localPlayer.alive && !this.thirdPerson) {
        const w = BS.WEAPON_BY_ID[localPlayer.weaponId] || BS.WEAPONS[0];
        // Hide gun when fully scoped in with Railgun Sniper!
        if (!(w.id === 'sniper' && localPlayer.ads && this.fovDeg < 42)) {
          this._renderViewmodel(localPlayer, w, aspect, localView);
        }
      }
    }

    _drawChild(parentMat, tx, ty, tz, rx, ry, rz, sx, sy, sz, color, texType = 4, emissive = 0, alpha = 1) {
      Mat4.fromTRS(this._mLocal, tx, ty, tz, rx, ry, rz, sx, sy, sz);
      Mat4.multiply(this._mC, parentMat, this._mLocal);
      this._drawWithMatrix(this._mC, sx, sy, sz, color, texType, emissive, alpha, false);
    }

    _drawRobloxAvatar(p, time) {
      const flash = p.hurtFlash || 0;
      const tint = (c) => [
        Math.min(1, c[0] + flash * 0.7),
        Math.max(0, c[1] * (1 - flash * 0.5) + flash * 0.2),
        Math.max(0, c[2] * (1 - flash * 0.5) + flash * 0.2),
      ];
      const em = flash * 0.6 + (p.spawnProtect > 0 ? 0.35 : 0);
      const amp = p.walkAmp !== undefined ? p.walkAmp : 0;

      const legCol = tint(p.colors.legs);
      const torsoCol = tint(p.colors.torso);
      const headCol = tint(p.colors.head);
      const darkCol = tint([0.12, 0.13, 0.16]);

      // Avatar root transform
      Mat4.fromTRS(this._mRoot, p.x, p.y, p.z, 0, p.yaw, 0, 1, 1, 1);

      // Ground contact shadow
      this._drawChild(this._mRoot, 0, 0.02, 0, 0, 0, 0, 0.95, 0.02, 0.72, [0.06, 0.07, 0.1], 4, 0, 1);

      // Left & Right Legs (hierarchical hip pivot + shoes)
      const legRxL = p.grounded ? Math.sin(p.walkPhase) * 0.7 * amp : 0.35;
      const legRxR = p.grounded ? -Math.sin(p.walkPhase) * 0.7 * amp : -0.25;

      Mat4.fromTRS(this._mLocal, -0.2, 0.72, 0, legRxL, 0, 0, 1, 1, 1);
      Mat4.multiply(this._mB, this._mRoot, this._mLocal);
      this._drawChild(this._mB, 0, -0.3, 0, 0, 0, 0, 0.34, 0.6, 0.36, legCol, 4, em);
      this._drawChild(this._mB, 0, -0.66, -0.03, 0, 0, 0, 0.36, 0.14, 0.42, darkCol, 4, em);

      Mat4.fromTRS(this._mLocal, 0.2, 0.72, 0, legRxR, 0, 0, 1, 1, 1);
      Mat4.multiply(this._mB, this._mRoot, this._mLocal);
      this._drawChild(this._mB, 0, -0.3, 0, 0, 0, 0, 0.34, 0.6, 0.36, legCol, 4, em);
      this._drawChild(this._mB, 0, -0.66, -0.03, 0, 0, 0, 0.36, 0.14, 0.42, darkCol, 4, em);

      // Torso, tactical belt, glowing chest emblem, and shield trim
      this._drawChild(this._mRoot, 0, 1.07, 0, 0, 0, 0, 0.78, 0.72, 0.42, torsoCol, 4, em);
      this._drawChild(this._mRoot, 0, 0.75, 0, 0, 0, 0, 0.8, 0.08, 0.44, darkCol, 4, em);
      const emblemCol =
        p.team === 'blue' ? [0.3, 0.75, 1.0] : p.team === 'red' ? [1.0, 0.4, 0.45] : p.colors.legs;
      this._drawChild(this._mRoot, 0, 1.15, -0.215, 0, 0, 0, 0.22, 0.22, 0.02, emblemCol, 2, 0.6 + em);
      if (p.shield > 0) {
        this._drawChild(this._mRoot, 0, 1.07, 0, 0, 0, 0, 0.84, 0.2, 0.48, [0.18, 0.85, 1.0], 2, 0.9);
      }

      // Head pivot + smiley face + custom Roblox accessory/hat
      Mat4.fromTRS(this._mLocal, 0, 1.43, 0, p.pitch * 0.5, 0, 0, 1, 1, 1);
      Mat4.multiply(this._mB, this._mRoot, this._mLocal);
      Mat4.fromTRS(this._mLocal, 0, 0.26, 0, 0, 0, 0, 1, 1, 1);
      Mat4.multiply(this._mA, this._mB, this._mLocal);
      this._drawChild(this._mA, 0, 0, 0, 0, 0, 0, 0.52, 0.52, 0.52, headCol, 5, em);

      const accParts = BS.MODELS && BS.MODELS.accessories && BS.MODELS.accessories[p.accessory];
      if (accParts) {
        this._drawModel(accParts, this._mA, { skin: p.colors.head, shirt: p.colors.torso }, { flash, emBoost: em });
      }

      // Arms (sleeves + forearms)
      const w = BS.WEAPON_BY_ID[p.weaponId] || BS.WEAPONS[0];
      const isBlade = w.modelType === 'blade';
      const lRx = isBlade ? (p.grounded ? -Math.sin(p.walkPhase) * 0.6 * amp : -0.3) : Math.PI * 0.5 + p.pitch;
      const lRy = isBlade ? 0 : 0.45;

      // Left arm (support hand on gun, or swings with blade)
      Mat4.fromTRS(this._mLocal, -0.54, 1.38, 0, lRx, lRy, 0, 1, 1, 1);
      Mat4.multiply(this._mB, this._mRoot, this._mLocal);
      this._drawChild(this._mB, 0, -0.14, 0, 0, 0, 0, 0.3, 0.3, 0.32, torsoCol, 4, em);
      this._drawChild(this._mB, 0, -0.45, 0, 0, 0, 0, 0.28, 0.34, 0.3, headCol, 4, em);

      // Right arm (primary weapon hand)
      Mat4.fromTRS(this._mLocal, 0.54, 1.38, 0, Math.PI * 0.5 + p.pitch, 0, 0, 1, 1, 1);
      Mat4.multiply(this._mB, this._mRoot, this._mLocal);
      this._drawChild(this._mB, 0, -0.14, 0, 0, 0, 0, 0.3, 0.3, 0.32, torsoCol, 4, em);
      this._drawChild(this._mB, 0, -0.45, 0, 0, 0, 0, 0.28, 0.34, 0.3, headCol, 4, em);

      // Detailed multi-part 3D world weapon held in hands
      const wModel = BS.MODELS && BS.MODELS.weapons && BS.MODELS.weapons[w.id];
      if (wModel) {
        Mat4.fromTRS(this._mLocal, 0.54, 1.38, 0, p.pitch, 0, 0, 1, 1, 1);
        Mat4.multiply(this._mB, this._mRoot, this._mLocal);
        Mat4.fromTRS(this._mLocal, -0.08, -0.06, -0.58, isBlade ? -1.0 : 0, 0, 0, 1, 1, 1);
        Mat4.multiply(this._mA, this._mB, this._mLocal);
        this._drawModel(
          wModel.parts,
          this._mA,
          { body: w.color, accent: w.accent, skin: p.colors.head, shirt: p.colors.torso },
          { flash: flash * 0.4, emBoost: em * 0.25 }
        );
      }
    }

    _renderViewmodel(p, w, aspect, localView) {
      const gl = this.gl;
      const dt = this._dt || 1 / 60;
      const vm = BS.MODELS && BS.MODELS.weapons && BS.MODELS.weapons[w.id];
      if (!vm) return;

      gl.clear(gl.DEPTH_BUFFER_BIT);
      Mat4.perspective(this.vmProj, (64 * Math.PI) / 180, aspect, 0.05, 25);
      gl.uniformMatrix4fv(this.u.viewProj, false, this.vmProj);
      gl.uniform3f(this.u.camPos, 0, 0, 0);
      gl.uniform1f(this.u.fogDensity, 0.0);

      // Smooth ADS transition
      this.adsBlend += ((p.ads ? 1 : 0) - this.adsBlend) * Math.min(1, dt * 14);
      const ads = this.adsBlend;

      let x = vm.vmHip[0] + (vm.vmAds[0] - vm.vmHip[0]) * ads;
      let y = vm.vmHip[1] + (vm.vmAds[1] - vm.vmHip[1]) * ads;
      let z = vm.vmHip[2] + (vm.vmAds[2] - vm.vmHip[2]) * ads;

      // Damped walk bob (reduced 70% while ADS)
      const amp = p.walkAmp !== undefined ? p.walkAmp : 0;
      const bobScale = 1 - ads * 0.7;
      x += Math.cos(p.walkPhase * 0.5) * 0.018 * amp * bobScale;
      y -= Math.abs(Math.sin(p.walkPhase * 0.5)) * 0.022 * amp * bobScale;

      // Smooth mouse sway
      const swayX = (localView && localView.swayX) || 0;
      const swayY = (localView && localView.swayY) || 0;
      x += swayX * 0.6;
      y += swayY * 0.6;

      let rx = vm.vmRot ? vm.vmRot[0] : 0;
      let ry = (vm.vmRot ? vm.vmRot[1] : 0) - swayX * 1.5;
      let rz = (vm.vmRot ? vm.vmRot[2] : 0) + swayX * 2.0;

      // Recoil kick (halved when ADS) & reload dip
      const recScale = 1 - ads * 0.5;
      z += p.recoilKick * 0.12 * recScale;
      rx += p.recoilKick * 0.22 * recScale;

      if (p.reloading) {
        const dip = Math.sin(p.reloadProgress * Math.PI);
        y -= dip * 0.3;
        rx -= dip * 1.2;
        rz += dip * 0.6;
      }

      if (w.modelType === 'blade') {
        rx -= p.recoilKick * 1.2;
        rz -= p.recoilKick * 1.0;
      }

      Mat4.fromTRS(this._mRoot, x, y, z, rx, ry, rz, 1, 1, 1);

      const palette = {
        body: w.color,
        accent: w.accent,
        skin: p.colors.head,
        shirt: p.colors.torso,
      };
      this._drawModel(vm.parts, this._mRoot, palette);

      // Right hand & sleeve gripping weapon
      this._drawChild(this._mRoot, 0, -0.06, 0.05, 0, 0, 0, 0.09, 0.1, 0.14, p.colors.head, 4, 0);
      this._drawChild(this._mRoot, 0.03, -0.13, 0.24, 0.5, 0, 0, 0.1, 0.1, 0.36, p.colors.torso, 4, 0);

      // Support left hand & sleeve (for 2-handed firearms)
      if (vm.leftHand) {
        const lh = vm.leftHand;
        this._drawChild(this._mRoot, lh[0], lh[1] - 0.03, lh[2], 0, 0, 0, 0.1, 0.09, 0.14, p.colors.head, 4, 0);
        this._drawChild(
          this._mRoot,
          lh[0] - 0.08,
          lh[1] - 0.12,
          lh[2] + 0.24,
          0.5,
          0.35,
          0,
          0.1,
          0.1,
          0.38,
          p.colors.torso,
          4,
          0
        );
      }

      // Dynamic Glowing Muzzle Flash at exact model muzzle
      if (this.muzzleFlashTimer > 0 && vm.muzzle) {
        const ms = 0.16 + Math.random() * 0.12;
        this._drawChild(
          this._mRoot,
          vm.muzzle[0],
          vm.muzzle[1],
          vm.muzzle[2],
          Math.random() * 3,
          Math.random() * 3,
          Math.random() * 3,
          ms,
          ms,
          ms,
          this.muzzleColor,
          2,
          1.0
        );
      }
    }
  }

  BS.Renderer3D = Renderer3D;
})(window);
