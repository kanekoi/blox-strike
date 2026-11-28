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
    uniform float uMetallic;
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

      // Hemisphere ambient + directional sunlight + metallic / glossy plastic specular
      float ndl = max(dot(N, L), 0.0);
      float hemi = N.y * 0.5 + 0.5;
      vec3 ambient = mix(vec3(0.32, 0.34, 0.42), vec3(0.68, 0.74, 0.84), hemi);
      vec3 diffuse = vec3(1.0, 0.97, 0.92) * ndl * 0.72;

      vec3 H = normalize(L + V);
      float shininess = mix(36.0, 18.0, uMetallic);
      float specStrength = 0.24 + uMetallic * 0.68;
      float spec = pow(max(dot(N, H), 0.0), shininess) * specStrength * step(0.01, ndl);
      vec3 specTint = mix(vec3(1.0), albedo * 1.15 + vec3(0.25), uMetallic * 0.7);
      float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.0) * uMetallic * 0.34;

      vec3 lit = albedo * (ambient * 0.72 + diffuse) + specTint * spec + mix(albedo, vec3(1.0), 0.4) * fresnel;
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

  const STATIC_VS = `#version 300 es
    precision highp float;
    layout(location = 0) in vec3 aPos;
    layout(location = 1) in vec3 aNorm;
    layout(location = 2) in vec2 aUV;
    layout(location = 3) in vec3 aColor;
    layout(location = 4) in vec2 aMeta;

    uniform mat4 uViewProj;

    out vec3 vNormal;
    out vec3 vWorldPos;
    out vec2 vUV;
    out vec3 vColor;
    out vec2 vMeta;

    void main() {
      vWorldPos = aPos;
      vNormal = aNorm;
      vUV = aUV;
      vColor = aColor;
      vMeta = aMeta;
      gl_Position = uViewProj * vec4(aPos, 1.0);
    }
  `;

  const STATIC_FS = `#version 300 es
    precision highp float;
    in vec3 vNormal;
    in vec3 vWorldPos;
    in vec2 vUV;
    in vec3 vColor;
    in vec2 vMeta;

    uniform sampler2D uTex;
    uniform int uTexMode;
    uniform vec3 uCamPos;
    uniform vec3 uFogColor;
    uniform float uFogDensity;
    uniform vec3 uSunDir;

    out vec4 outColor;

    void main() {
      vec3 N = normalize(vNormal);
      vec3 L = normalize(uSunDir);
      vec3 V = normalize(uCamPos - vWorldPos);

      vec3 albedo = vColor;
      if (uTexMode == 0) {
        if (vMeta.y > 0.5) {
          albedo *= texture(uTex, vUV).rgb;
        } else {
          vec2 edge = abs(fract(vUV * 0.5) - 0.5);
          float seam = smoothstep(0.47, 0.5, max(edge.x, edge.y));
          albedo *= (1.0 - seam * 0.08);
        }
      } else if (uTexMode == 1) {
        albedo *= texture(uTex, vUV).rgb;
      }

      float ndl = max(dot(N, L), 0.0);
      float hemi = N.y * 0.5 + 0.5;
      vec3 ambient = mix(vec3(0.32, 0.34, 0.42), vec3(0.68, 0.74, 0.84), hemi);
      vec3 diffuse = vec3(1.0, 0.97, 0.92) * ndl * 0.72;

      vec3 H = normalize(L + V);
      float spec = pow(max(dot(N, H), 0.0), 36.0) * 0.24 * step(0.01, ndl);

      vec3 lit = albedo * (ambient * 0.72 + diffuse) + vec3(spec);
      vec3 finalCol = mix(lit, albedo * 1.15, clamp(vMeta.x, 0.0, 1.0));

      if (uFogDensity > 0.0) {
        float dist = length(vWorldPos - uCamPos);
        float fogFactor = 1.0 - exp(-pow(dist * uFogDensity, 1.45));
        finalCol = mix(finalCol, uFogColor, clamp(fogFactor, 0.0, 0.92));
      }

      outColor = vec4(finalCol, 1.0);
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

  // 24 vertices (4 per face), strictly counter-clockwise (CCW) outward winding!
  // prettier-ignore
  const CUBE_VERTS = new Float32Array([
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
  const CUBE_INDICES = new Uint16Array([
     0, 1, 2,  0, 2, 3,
     4, 5, 6,  4, 6, 7,
     8, 9,10,  8,10,11,
    12,13,14, 12,14,15,
    16,17,18, 16,18,19,
    20,21,22, 20,22,23,
  ]);

  function createUnitCubeMesh(gl) {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, CUBE_VERTS, gl.STATIC_DRAW);

    const ebo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, CUBE_INDICES, gl.STATIC_DRAW);

    const stride = 8 * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 3 * 4);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, 6 * 4);

    gl.bindVertexArray(null);
    return { vao, count: CUBE_INDICES.length };
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
      this.staticProg = this._createProgram(STATIC_VS, STATIC_FS);
      this.skyProg = this._createProgram(SKY_VS, SKY_FS);
      this.skyVao = this.gl.createVertexArray();
      this.staticMapCache = Object.create(null);

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
      this.slideBlend = 0;
      this.shakeTime = 0;
      this._trailAccum = 0;
      this._dt = 1 / 60;
      this.sunDir = [0.48, 0.78, 0.39];

      // Visual FX pools (client-side cosmetic particles, tracers & 3D ejected shell casings)
      this.tracers = [];
      this.particles = [];
      this.shells = [];
      this.explosions = [];
      this.muzzleFlashTimer = 0;
      this.muzzleColor = [1, 0.85, 0.35];
      this.screenShake = 0;
      this.viewW = window.innerWidth || 1280;
      this.viewH = window.innerHeight || 720;
      this._resetBlockState();

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
        metallic: gl.getUniformLocation(bp, 'uMetallic'),
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
      const stp = this.staticProg;
      this.stu = {
        viewProj: gl.getUniformLocation(stp, 'uViewProj'),
        tex: gl.getUniformLocation(stp, 'uTex'),
        texMode: gl.getUniformLocation(stp, 'uTexMode'),
        camPos: gl.getUniformLocation(stp, 'uCamPos'),
        fogColor: gl.getUniformLocation(stp, 'uFogColor'),
        fogDensity: gl.getUniformLocation(stp, 'uFogDensity'),
        sunDir: gl.getUniformLocation(stp, 'uSunDir'),
      };
    }

    _resetBlockState() {
      this._boundTex = undefined;
      this._lastTexMode = -1;
      this._lastWorldUV = -1;
      this._lastEmissive = -999;
      this._lastAlpha = -999;
      this._lastMetallic = -999;
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

      this._createWeaponSkinTextures();
    }

    _createWeaponSkinTextures() {
      const gl = this.gl;
      this.skinTextures = Object.create(null);

      // 1. Asiimov — Crisp white, safety-orange & carbon-black geometric sci-fi stripes
      this.skinTextures.asiimov = makeCanvasTexture(gl, 256, (ctx, s) => {
        ctx.fillStyle = '#f3f5fa';
        ctx.fillRect(0, 0, s, s);
        // Carbon black angular plates
        ctx.fillStyle = '#181b22';
        ctx.beginPath();
        ctx.moveTo(0, s * 0.72);
        ctx.lineTo(s * 0.56, s * 0.16);
        ctx.lineTo(s * 0.78, s * 0.16);
        ctx.lineTo(s * 0.22, s * 0.72);
        ctx.closePath();
        ctx.fill();
        ctx.fillRect(0, s * 0.86, s, s * 0.14);
        // Vibrant safety-orange geometric chevrons
        ctx.fillStyle = '#ff660f';
        ctx.beginPath();
        ctx.moveTo(0, s * 0.52);
        ctx.lineTo(s * 0.52, 0);
        ctx.lineTo(s * 0.72, 0);
        ctx.lineTo(0, s * 0.72);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(s * 0.44, s);
        ctx.lineTo(s, s * 0.44);
        ctx.lineTo(s, s * 0.62);
        ctx.lineTo(s * 0.62, s);
        ctx.closePath();
        ctx.fill();
        // Precision orange & black pinstripes + tech crosshair ticks
        ctx.strokeStyle = '#ff7b24';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(0, s * 0.28);
        ctx.lineTo(s * 0.28, 0);
        ctx.stroke();
        ctx.fillStyle = '#181b22';
        for (let i = 0; i < 6; i++) {
          ctx.fillRect(s * 0.12 + i * 16, s * 0.77, 8, 6);
        }
      });

      // 2. Dragon Lore — Royal gold & olive medieval scales with crimson dragon flames
      this.skinTextures.dragonlore = makeCanvasTexture(gl, 256, (ctx, s) => {
        const g = ctx.createLinearGradient(0, 0, s, s);
        g.addColorStop(0, '#deb03c');
        g.addColorStop(0.5, '#b68c2a');
        g.addColorStop(1, '#685f2c');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, s, s);
        // Subtle diamond gold scales
        ctx.strokeStyle = 'rgba(255, 232, 140, 0.26)';
        ctx.lineWidth = 2;
        for (let y = -32; y < s + 32; y += 24) {
          for (let x = -32; x < s + 32; x += 24) {
            ctx.beginPath();
            ctx.moveTo(x, y - 12);
            ctx.lineTo(x + 12, y);
            ctx.lineTo(x, y + 12);
            ctx.lineTo(x - 12, y);
            ctx.closePath();
            ctx.stroke();
          }
        }
        // Stylized dragon flame ribbons
        ctx.lineWidth = 18;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#991818';
        ctx.beginPath();
        ctx.moveTo(-20, s * 0.75);
        ctx.bezierCurveTo(s * 0.28, s * 0.25, s * 0.65, s * 0.88, s + 20, s * 0.3);
        ctx.stroke();
        ctx.lineWidth = 10;
        ctx.strokeStyle = '#ff7b14';
        ctx.stroke();
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#ffe564';
        ctx.stroke();
        // Celtic border stripes
        ctx.fillStyle = '#2d2818';
        ctx.fillRect(0, 0, s, 14);
        ctx.fillRect(0, s - 14, s, 14);
        ctx.fillStyle = '#f2c84b';
        for (let x = 8; x < s; x += 20) {
          ctx.fillRect(x, 4, 10, 6);
          ctx.fillRect(x, s - 10, 10, 6);
        }
      });

      // 3. Hyper Beast — Electric neon cyan, hot magenta, purple & lime beast slashes
      this.skinTextures.hyperbeast = makeCanvasTexture(gl, 256, (ctx, s) => {
        const g = ctx.createLinearGradient(0, 0, s, s);
        g.addColorStop(0, '#16092c');
        g.addColorStop(0.5, '#35105a');
        g.addColorStop(1, '#101d3b');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, s, s);
        const slashes = [
          { y0: 0.12, y1: 0.55, w: 34, col: '#14ebff' },
          { y0: 0.34, y1: 0.8, w: 38, col: '#ff1f8f' },
          { y0: 0.6, y1: 0.2, w: 28, col: '#8cff24' },
          { y0: 0.82, y1: 0.42, w: 30, col: '#ff6e14' },
          { y0: 0.05, y1: 0.92, w: 18, col: '#b83cff' },
        ];
        slashes.forEach((sl) => {
          ctx.lineCap = 'round';
          ctx.strokeStyle = '#0c0518';
          ctx.lineWidth = sl.w + 10;
          ctx.beginPath();
          ctx.moveTo(-20, s * sl.y0);
          ctx.quadraticCurveTo(s * 0.5, s * (1 - sl.y0), s + 20, s * sl.y1);
          ctx.stroke();
          ctx.strokeStyle = sl.col;
          ctx.lineWidth = sl.w;
          ctx.stroke();
        });
        // Glowing beast eyes / fang accents
        ctx.fillStyle = '#fff55c';
        ctx.beginPath();
        ctx.moveTo(s * 0.32, s * 0.42);
        ctx.lineTo(s * 0.48, s * 0.34);
        ctx.lineTo(s * 0.44, s * 0.5);
        ctx.closePath();
        ctx.fill();
      });

      // 4. Printstream — Sleek pearlescent white with iridescent stripes & jet-black tech markings
      this.skinTextures.printstream = makeCanvasTexture(gl, 256, (ctx, s) => {
        ctx.fillStyle = '#f4f6fc';
        ctx.fillRect(0, 0, s, s);
        // Soft pearlescent iridescent sheen bands
        const pearl = ctx.createLinearGradient(0, 0, s, s);
        pearl.addColorStop(0, 'rgba(110, 238, 255, 0.28)');
        pearl.addColorStop(0.35, 'rgba(255, 255, 255, 0.0)');
        pearl.addColorStop(0.65, 'rgba(255, 130, 220, 0.28)');
        pearl.addColorStop(1, 'rgba(130, 255, 210, 0.26)');
        ctx.fillStyle = pearl;
        ctx.fillRect(0, 0, s, s);
        // Clean jet-black tactical stripes & minimal stencil marks
        ctx.fillStyle = '#12141c';
        ctx.fillRect(0, s * 0.78, s, s * 0.14);
        ctx.fillRect(s * 0.08, s * 0.12, s * 0.34, 6);
        ctx.fillRect(s * 0.62, s * 0.66, s * 0.28, 5);
        ctx.strokeStyle = '#12141c';
        ctx.lineWidth = 4;
        for (let i = 0; i < 3; i++) {
          const cx = s * (0.24 + i * 0.22);
          const cy = s * 0.42;
          ctx.beginPath();
          ctx.moveTo(cx - 10, cy - 10);
          ctx.lineTo(cx + 10, cy + 10);
          ctx.moveTo(cx + 10, cy - 10);
          ctx.lineTo(cx - 10, cy + 10);
          ctx.stroke();
        }
      });

      // 5. Fade — Full-spectrum high-gloss purple -> magenta -> sunset gold metallic fade
      this.skinTextures.fade = makeCanvasTexture(gl, 256, (ctx, s) => {
        const g = ctx.createLinearGradient(0, 0, s, s * 0.45);
        g.addColorStop(0.0, '#4420dc');
        g.addColorStop(0.28, '#9e26eb');
        g.addColorStop(0.54, '#ff2a92');
        g.addColorStop(0.78, '#ff7d26');
        g.addColorStop(1.0, '#ffd836');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, s, s);
        // Subtle brushed anodized sheen lines
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        for (let y = 0; y < s; y += 4) {
          ctx.fillRect(0, y, s, 1);
        }
      });

      // 6. Case Hardened (Blue Gem) — Swirled metallic sky-blue, royal blue, gold & violet patina
      this.skinTextures.casehardened = makeCanvasTexture(gl, 256, (ctx, s) => {
        ctx.fillStyle = '#c89e42';
        ctx.fillRect(0, 0, s, s);
        // Deterministic pseudo-random marbled Blue Gem blobs
        const blobs = [
          [0.2, 0.25, 0.36, '#1486ff'],
          [0.65, 0.3, 0.4, '#0f68eb'],
          [0.45, 0.72, 0.38, '#28aaff'],
          [0.85, 0.78, 0.32, '#1c7cff'],
          [0.12, 0.82, 0.26, '#7636c8'],
          [0.52, 0.46, 0.22, '#6bd0ff'],
          [0.78, 0.14, 0.22, '#8b3ed4'],
          [0.32, 0.56, 0.18, '#e3b854'],
          [0.88, 0.48, 0.16, '#d9a43c'],
        ];
        blobs.forEach(([bx, by, br, col]) => {
          const rad = ctx.createRadialGradient(bx * s, by * s, br * s * 0.1, bx * s, by * s, br * s);
          rad.addColorStop(0, col);
          rad.addColorStop(0.7, col);
          rad.addColorStop(1, 'rgba(180,140,60,0)');
          ctx.fillStyle = rad;
          ctx.fillRect(0, 0, s, s);
        });
        ctx.fillStyle = 'rgba(255,255,255,0.09)';
        for (let i = 0; i < 40; i++) {
          ctx.fillRect((i * 53) % s, (i * 37) % s, 18, 2);
        }
      });

      // 7. Redline — Matte woven carbon-fiber grid with razor-sharp glowing crimson pinstripes
      this.skinTextures.redline = makeCanvasTexture(gl, 256, (ctx, s) => {
        ctx.fillStyle = '#15171d';
        ctx.fillRect(0, 0, s, s);
        const step = 16;
        for (let y = 0; y < s; y += step) {
          for (let x = 0; x < s; x += step) {
            const odd = ((x + y) / step) % 2 === 0;
            ctx.fillStyle = odd ? '#22252e' : '#181a21';
            ctx.fillRect(x, y, step - 1, step - 1);
            ctx.fillStyle = odd ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.22)';
            ctx.fillRect(x, y, step - 1, 3);
          }
        }
        // Signature twin crimson redlines
        ctx.fillStyle = '#ff1c32';
        ctx.fillRect(0, s * 0.38, s, 12);
        ctx.fillStyle = '#ff5464';
        ctx.fillRect(0, s * 0.38 + 3, s, 4);
        ctx.fillStyle = '#d91428';
        ctx.fillRect(0, s * 0.46, s, 5);
      });

      // 8. Doppler Ruby — Deep liquid crimson crystal facets & bright ruby ripples
      this.skinTextures.ruby = makeCanvasTexture(gl, 256, (ctx, s) => {
        const g = ctx.createLinearGradient(0, 0, s, s);
        g.addColorStop(0, '#5a0414');
        g.addColorStop(0.45, '#c40a2c');
        g.addColorStop(0.75, '#ff2652');
        g.addColorStop(1, '#7a051d');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, s, s);
        for (let i = 0; i < 6; i++) {
          ctx.strokeStyle = i % 2 === 0 ? 'rgba(255, 110, 145, 0.38)' : 'rgba(70, 0, 15, 0.35)';
          ctx.lineWidth = 18;
          ctx.beginPath();
          ctx.moveTo(-20, i * 48);
          ctx.bezierCurveTo(s * 0.35, i * 48 - 32, s * 0.65, i * 48 + 38, s + 20, i * 48 - 10);
          ctx.stroke();
        }
      });

      // 9. Doppler Sapphire — Deep cosmic sapphire crystal facets & electric cyan-blue ripples
      this.skinTextures.sapphire = makeCanvasTexture(gl, 256, (ctx, s) => {
        const g = ctx.createLinearGradient(0, 0, s, s);
        g.addColorStop(0, '#07165c');
        g.addColorStop(0.45, '#1246d8');
        g.addColorStop(0.75, '#28baff');
        g.addColorStop(1, '#0b227a');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, s, s);
        for (let i = 0; i < 6; i++) {
          ctx.strokeStyle = i % 2 === 0 ? 'rgba(110, 225, 255, 0.38)' : 'rgba(5, 12, 60, 0.38)';
          ctx.lineWidth = 18;
          ctx.beginPath();
          ctx.moveTo(-20, i * 48);
          ctx.bezierCurveTo(s * 0.35, i * 48 + 34, s * 0.65, i * 48 - 34, s + 20, i * 48 + 12);
          ctx.stroke();
        }
      });
    }

    resize() {
      this.viewW = Math.max(1, window.innerWidth || 1280);
      this.viewH = Math.max(1, window.innerHeight || 720);
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      const w = Math.max(1, Math.floor(this.viewW * dpr));
      const h = Math.max(1, Math.floor(this.viewH * dpr));
      if (this.canvas.width !== w || this.canvas.height !== h) {
        this.canvas.width = w;
        this.canvas.height = h;
        this.gl.viewport(0, 0, w, h);
      }
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

    addShellCasing(x, y, z, vx, vy, vz, color, isShotgun = false, isEnergy = false) {
      if (this.shells.length >= 64) this.shells.shift();
      this.shells.push({
        x,
        y,
        z,
        vx,
        vy,
        vz,
        rx: Math.random() * 6,
        ry: Math.random() * 6,
        rz: Math.random() * 6,
        vrx: (Math.random() - 0.5) * 24,
        vry: (Math.random() - 0.5) * 24,
        sx: isShotgun ? 0.042 : 0.026,
        sy: isShotgun ? 0.042 : 0.026,
        sz: isShotgun ? 0.115 : 0.082,
        color: color || [0.95, 0.78, 0.24],
        emissive: isEnergy ? 0.85 : 0.12,
        metallic: isEnergy ? 0.3 : 0.85,
        life: 1.35,
        maxLife: 1.35,
      });
    }

    addSmokePuff(x, y, z, color, size = 0.16, life = 0.34, emissive = 0.05) {
      if (this.particles.length >= 220) return;
      this.particles.push({
        x: x + (Math.random() - 0.5) * 0.08,
        y: y + (Math.random() - 0.5) * 0.08,
        z: z + (Math.random() - 0.5) * 0.08,
        vx: (Math.random() - 0.5) * 0.9,
        vy: 0.6 + Math.random() * 0.9,
        vz: (Math.random() - 0.5) * 0.9,
        rx: Math.random() * 3,
        ry: Math.random() * 3,
        vrx: 3.5,
        vry: 3.5,
        size,
        color: color || [0.85, 0.88, 0.92],
        emissive,
        life,
        maxLife: life,
        gravity: -1.2,
      });
    }

    addSlideSparks(x, y, z, vx, vz) {
      if (this.particles.length >= 200) return;
      for (let i = 0; i < 2; i++) {
        this.particles.push({
          x: x + (Math.random() - 0.5) * 0.4,
          y: y + 0.08,
          z: z + (Math.random() - 0.5) * 0.4,
          vx: -vx * 0.25 + (Math.random() - 0.5) * 2.4,
          vy: 1.2 + Math.random() * 2.2,
          vz: -vz * 0.25 + (Math.random() - 0.5) * 2.4,
          rx: Math.random() * 3,
          ry: Math.random() * 3,
          vrx: 12,
          vry: 12,
          size: 0.07 + Math.random() * 0.05,
          color: i === 0 ? [1.0, 0.85, 0.32] : [0.82, 0.9, 1.0],
          emissive: 0.9,
          life: 0.22 + Math.random() * 0.14,
          maxLife: 0.36,
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

      for (let i = this.shells.length - 1; i >= 0; i--) {
        const sh = this.shells[i];
        sh.life -= dt;
        if (sh.life <= 0) {
          this.shells.splice(i, 1);
          continue;
        }
        sh.vy -= 19.5 * dt;
        sh.x += sh.vx * dt;
        sh.y += sh.vy * dt;
        sh.z += sh.vz * dt;
        sh.rx += sh.vrx * dt;
        sh.ry += sh.vry * dt;
        if (sh.y < 0.04 && sh.vy < 0) {
          sh.y = 0.04;
          sh.vy *= -0.42;
          sh.vx *= 0.65;
          sh.vz *= 0.65;
          sh.vrx *= 0.5;
          sh.vry *= 0.5;
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
        x: (ndcX * 0.5 + 0.5) * this.viewW,
        y: (1 - (ndcY * 0.5 + 0.5)) * this.viewH,
        dist: cw,
      };
    }

    _appendStaticBox(buckets, mat, sx, sy, sz, color, texType, emissive, worldUV) {
      let key = 'solid';
      let tex = null;
      let texMode = 3;
      if (texType === 0) {
        key = 'studs';
        tex = this.texStuds;
        texMode = 0;
      } else if (texType === 1) {
        key = 'crate';
        tex = this.texCrate;
        texMode = 1;
      } else if (texType === 3) {
        key = 'tile';
        tex = this.texTile;
        texMode = 1;
      }
      let bucket = buckets[key];
      if (!bucket) {
        bucket = buckets[key] = { tex, texMode, verts: [], indices: [], vertCount: 0 };
      }

      const baseVert = bucket.vertCount;
      const vArr = bucket.verts;
      const r = color[0], g = color[1], b = color[2];

      for (let v = 0; v < 24; v++) {
        const off = v * 8;
        const lx = CUBE_VERTS[off];
        const ly = CUBE_VERTS[off + 1];
        const lz = CUBE_VERTS[off + 2];
        const nx = CUBE_VERTS[off + 3];
        const ny = CUBE_VERTS[off + 4];
        const nz = CUBE_VERTS[off + 5];

        const wx = mat[0] * lx + mat[4] * ly + mat[8] * lz + mat[12];
        const wy = mat[1] * lx + mat[5] * ly + mat[9] * lz + mat[13];
        const wz = mat[2] * lx + mat[6] * ly + mat[10] * lz + mat[14];

        let wnx = mat[0] * nx + mat[4] * ny + mat[8] * nz;
        let wny = mat[1] * nx + mat[5] * ny + mat[9] * nz;
        let wnz = mat[2] * nx + mat[6] * ny + mat[10] * nz;
        const nLen = Math.hypot(wnx, wny, wnz) || 1;
        wnx /= nLen;
        wny /= nLen;
        wnz /= nLen;

        let tu, tv;
        if (worldUV) {
          const px = (lx + 0.5) * sx;
          const py = (ly + 0.5) * sy;
          const pz = (lz + 0.5) * sz;
          if (Math.abs(ny) > 0.5) {
            tu = px;
            tv = pz;
          } else if (Math.abs(nx) > 0.5) {
            tu = pz;
            tv = py;
          } else {
            tu = px;
            tv = py;
          }
        } else {
          tu = CUBE_VERTS[off + 6];
          tv = CUBE_VERTS[off + 7];
        }

        vArr.push(wx, wy, wz, wnx, wny, wnz, tu, tv, r, g, b, emissive, ny);
      }

      const iArr = bucket.indices;
      for (let k = 0; k < 36; k++) {
        iArr.push(baseVert + CUBE_INDICES[k]);
      }
      bucket.vertCount += 24;
    }

    _getStaticMapBatches(map) {
      if (this.staticMapCache[map.id]) return this.staticMapCache[map.id];
      const gl = this.gl;
      const buckets = Object.create(null);
      const mRoot = Mat4.create();
      const mLocal = Mat4.create();
      const mPart = Mat4.create();

      // 1. Bake all static map blocks
      const blocks = map.blocks || [];
      for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        Mat4.fromTRS(mRoot, b.x, b.y, b.z, 0, 0, 0, b.w, b.h, b.d);
        this._appendStaticBox(buckets, mRoot, b.w, b.h, b.d, b.color, b.tex, b.emissive || 0, true);
      }

      // 2. Bake all static multi-part world scenery props (skip shootable explosive barrels -> rendered dynamically!)
      const mapProps = map.props || [];
      const propModels = BS.MODELS && BS.MODELS.props;
      if (propModels) {
        for (let i = 0; i < mapProps.length; i++) {
          const pr = mapProps[i];
          if (pr.m === 'barrel') continue;
          const parts = propModels[pr.m];
          if (!parts) continue;
          const s = pr.s || 1;
          const pal = pr.tint ? { tint: pr.tint } : null;
          Mat4.fromTRS(mRoot, pr.x, pr.y, pr.z, 0, pr.ry || 0, 0, s, s, s);
          for (let j = 0; j < parts.length; j++) {
            const pt = parts[j];
            const r = pt.r;
            Mat4.fromTRS(
              mLocal,
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
            Mat4.multiply(mPart, mRoot, mLocal);
            const col = this._resolvePartColor(pt.c, pal, 0);
            this._appendStaticBox(
              buckets,
              mPart,
              pt.s[0],
              pt.s[1],
              pt.s[2],
              col,
              pt.t !== undefined ? pt.t : 4,
              pt.e || 0,
              false
            );
          }
        }
      }

      // 3. Bake static dark bases for jump pads & pickup spawners
      const jumpPads = map.jumpPads || [];
      for (let i = 0; i < jumpPads.length; i++) {
        const pad = jumpPads[i];
        Mat4.fromTRS(mRoot, pad.x, pad.y, pad.z, 0, 0, 0, 2.4, 0.22, 2.4);
        this._appendStaticBox(buckets, mRoot, 2.4, 0.22, 2.4, [0.18, 0.22, 0.3], 4, 0, false);
      }
      const mapPickups = map.pickups || [];
      for (let i = 0; i < mapPickups.length; i++) {
        const pk = mapPickups[i];
        Mat4.fromTRS(mRoot, pk.x, pk.y - 0.95, pk.z, 0, 0, 0, 1.1, 0.12, 1.1);
        this._appendStaticBox(buckets, mRoot, 1.1, 0.12, 1.1, [0.12, 0.13, 0.16], 4, 0, false);
      }

      const batches = [];
      const stride = 13 * 4;
      for (const key of Object.keys(buckets)) {
        const bk = buckets[key];
        if (!bk.indices.length) continue;
        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);

        const vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(bk.verts), gl.STATIC_DRAW);

        const ebo = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(bk.indices), gl.STATIC_DRAW);

        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 3 * 4);
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, 6 * 4);
        gl.enableVertexAttribArray(3);
        gl.vertexAttribPointer(3, 3, gl.FLOAT, false, stride, 8 * 4);
        gl.enableVertexAttribArray(4);
        gl.vertexAttribPointer(4, 2, gl.FLOAT, false, stride, 11 * 4);

        gl.bindVertexArray(null);
        batches.push({ vao, count: bk.indices.length, tex: bk.tex, texMode: bk.texMode });
      }

      this.staticMapCache[map.id] = batches;
      return batches;
    }

    _drawWithMatrix(
      mat,
      sx,
      sy,
      sz,
      color,
      texType = 4,
      emissive = 0,
      alpha = 1,
      worldUV = false,
      customTex = null,
      metallic = 0
    ) {
      const gl = this.gl;
      gl.uniformMatrix4fv(this.u.model, false, mat);
      gl.uniform3f(this.u.color, color[0], color[1], color[2]);

      if (this._lastEmissive !== emissive) {
        this._lastEmissive = emissive;
        gl.uniform1f(this.u.emissive, emissive);
      }
      if (this._lastAlpha !== alpha) {
        this._lastAlpha = alpha;
        gl.uniform1f(this.u.alpha, alpha);
      }
      if (this._lastMetallic !== metallic) {
        this._lastMetallic = metallic;
        gl.uniform1f(this.u.metallic, metallic);
      }

      const wuv = worldUV ? 1 : 0;
      if (this._lastWorldUV !== wuv) {
        this._lastWorldUV = wuv;
        gl.uniform1i(this.u.useWorldUV, wuv);
      }
      if (wuv === 1) {
        gl.uniform3f(this.u.texScale, sx, sy, sz);
      }

      let targetTex = null;
      let texMode = 3;
      if (customTex) {
        targetTex = customTex;
        texMode = 1;
      } else if (texType === 0) {
        targetTex = this.texStuds;
        texMode = 0;
      } else if (texType === 1) {
        targetTex = this.texCrate;
        texMode = 1;
      } else if (texType === 3) {
        targetTex = this.texTile;
        texMode = 1;
      } else if (texType === 5) {
        targetTex = this.texFace;
        texMode = 2;
      }

      if (targetTex && this._boundTex !== targetTex) {
        this._boundTex = targetTex;
        gl.bindTexture(gl.TEXTURE_2D, targetTex);
      }
      if (this._lastTexMode !== texMode) {
        this._lastTexMode = texMode;
        gl.uniform1i(this.u.texMode, texMode);
      }

      gl.drawElements(gl.TRIANGLES, this.cube.count, gl.UNSIGNED_SHORT, 0);
    }

    _drawBox(tx, ty, tz, rx, ry, rz, sx, sy, sz, color, texType = 4, emissive = 0, alpha = 1, worldUV = false) {
      Mat4.fromTRS(this.model, tx, ty, tz, rx, ry, rz, sx, sy, sz);
      this._drawWithMatrix(this.model, sx, sy, sz, color, texType, emissive, alpha, worldUV);
    }

    _getWeaponSkinSetup(w, p) {
      const wsMap = BS.WEAPON_SKIN_BY_ID || Object.create(null);
      const ws = (p && p.weaponSkin && wsMap[p.weaponSkin]) || wsMap.default || null;
      const palette = {
        body: (ws && ws.body) || w.color,
        accent: (ws && ws.accent) || w.accent,
        dark: (ws && ws.dark) || [0.12, 0.13, 0.16],
        metal: (ws && ws.metal) || [0.55, 0.58, 0.64],
        wood: (ws && ws.wood) || [0.55, 0.34, 0.18],
        skin: p.colors.head,
        shirt: p.colors.torso,
      };
      const skinTex = ws && ws.pattern && this.skinTextures ? this.skinTextures[ws.pattern] || null : null;
      const metallic = ws && typeof ws.metallic === 'number' ? ws.metallic : 0.15;
      return { palette, skinTex, metallic, isBlade: w.modelType === 'blade' };
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
      const skinTex = opts.skinTex || null;
      const metallic = opts.metallic || 0;
      const isBlade = !!opts.isBlade;
      const boltOffset = opts.boltOffset || 0;
      const pumpOffset = opts.pumpOffset || 0;
      const coilGlow = opts.coilGlow || 0;
      const hideWarhead = !!opts.hideWarhead;
      let hasTranslucent = false;

      for (let i = 0; i < parts.length; i++) {
        const pt = parts[i];
        if (pt.anim === 'warhead' && hideWarhead) continue;
        if (pt.a !== undefined && pt.a < 1) {
          hasTranslucent = true;
          continue;
        }
        const r = pt.r;
        const animZ = pt.anim === 'bolt' ? boltOffset : pt.anim === 'pump' ? pumpOffset : 0;
        Mat4.fromTRS(
          this._mLocal,
          pt.p[0],
          pt.p[1],
          pt.p[2] + animZ,
          r ? r[0] : 0,
          r ? r[1] : 0,
          r ? r[2] : 0,
          pt.s[0],
          pt.s[1],
          pt.s[2]
        );
        Mat4.multiply(this._mPart, parentMat, this._mLocal);
        const isBladeCore = isBlade && pt.s[1] > 0.5 && pt.t === 2;
        const useSkin =
          !!skinTex &&
          (pt.c === 'body' ||
            pt.c === 'wood' ||
            (pt.c === 'metal' && metallic >= 0.72) ||
            isBladeCore);
        const col = isBladeCore && useSkin ? [1, 1, 1] : this._resolvePartColor(pt.c, palette, flash);
        const coilBoost = pt.anim === 'coil' ? coilGlow : 0;
        const em = isBladeCore && useSkin ? 0.32 + emBoost : (pt.e || 0) + emBoost + coilBoost;
        const uvMult = useSkin ? 1.55 : 1.0;
        const partMetallic = useSkin ? metallic : metallic * 0.45;
        this._drawWithMatrix(
          this._mPart,
          pt.s[0] * uvMult,
          pt.s[1] * uvMult,
          pt.s[2] * uvMult,
          col,
          pt.t !== undefined ? pt.t : 4,
          em,
          alphaMul,
          useSkin,
          useSkin ? skinTex : null,
          partMetallic
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
            false,
            null,
            metallic * 0.4
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
        this.slideBlend += ((localPlayer.sliding && localPlayer.alive ? 1 : 0) - this.slideBlend) * (1 - Math.exp(-dt * 14));
        if (localPlayer.ads && localPlayer.alive) {
          targetFov = w.adsFov;
        } else if (localPlayer.speedBoostTimer > 0) {
          targetFov = 88;
        } else if (this.slideBlend > 0.05) {
          targetFov = 78 + this.slideBlend * 7.5;
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
        const crouchB = localPlayer.crouchBlend || 0;
        const crouchEye = BS.PLAYER.CROUCH_EYE_HEIGHT || 0.96;
        const curEyeH = BS.PLAYER.EYE_HEIGHT + (crouchEye - BS.PLAYER.EYE_HEIGHT) * crouchB;
        const eyeX = localPlayer.x;
        const eyeY = baseY + (localPlayer.alive ? curEyeH : 2.6);
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

      // Subtle exhilarating Dutch-angle camera roll during 1st-person power slide!
      const roll = !isMenuDemo && !this.thirdPerson ? 0.055 * this.slideBlend : 0;
      const upX = Math.sin(roll) * this.camRight[0];
      const upY = Math.cos(roll);
      const upZ = Math.sin(roll) * this.camRight[2];

      Mat4.perspective(this.proj, fovRad, aspect, 0.12, 260);
      Mat4.lookAt(
        this.view,
        this.camPos[0],
        this.camPos[1],
        this.camPos[2],
        this.camPos[0] + this.camForward[0],
        this.camPos[1] + this.camForward[1],
        this.camPos[2] + this.camForward[2],
        upX,
        upY,
        upZ
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

      // 2. Setup 3D World Pass — Static Batched Arena + Props (3-4 draw calls total!)
      gl.depthMask(true);
      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.texStuds);

      const staticBatches = this._getStaticMapBatches(map);
      gl.useProgram(this.staticProg);
      gl.uniform1i(this.stu.tex, 0);
      gl.uniformMatrix4fv(this.stu.viewProj, false, this.viewProj);
      gl.uniform3fv(this.stu.camPos, this.camPos);
      gl.uniform3fv(this.stu.fogColor, map.fogColor);
      gl.uniform1f(this.stu.fogDensity, map.fogDensity);
      gl.uniform3fv(this.stu.sunDir, this.sunDir);
      for (let i = 0; i < staticBatches.length; i++) {
        const sb = staticBatches[i];
        gl.bindVertexArray(sb.vao);
        if (sb.tex) gl.bindTexture(gl.TEXTURE_2D, sb.tex);
        gl.uniform1i(this.stu.texMode, sb.texMode);
        gl.drawElements(gl.TRIANGLES, sb.count, gl.UNSIGNED_INT, 0);
      }

      // Dynamic 3D World Entities
      gl.useProgram(this.blockProg);
      gl.bindVertexArray(this.cube.vao);
      this._resetBlockState();
      gl.uniform1i(this.u.tex, 0);
      gl.uniformMatrix4fv(this.u.viewProj, false, this.viewProj);
      gl.uniform3fv(this.u.camPos, this.camPos);
      gl.uniform3fv(this.u.fogColor, map.fogColor);
      gl.uniform1f(this.u.fogDensity, map.fogDensity);
      gl.uniform3fv(this.u.sunDir, this.sunDir);

      // Draw Jump Pads (pulsing glowing rings; dark bases are in static batch)
      const pulse = 0.5 + 0.5 * Math.sin(snapshot.time * 6.0);
      for (let i = 0; i < map.jumpPads.length; i++) {
        const pad = map.jumpPads[i];
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

      // Draw Pickup Spawner Glow Pads & Floating Custom Models (dark bases are in static batch)
      const pickupModels = BS.MODELS && BS.MODELS.pickups;
      for (let i = 0; i < snapshot.pickups.length; i++) {
        const pk = snapshot.pickups[i];
        const padCol =
          pk.type === 'health'
            ? [0.16, 0.96, 0.45]
            : pk.type === 'shield'
            ? [0.18, 0.78, 1.0]
            : [1.0, 0.84, 0.16];
        this._drawBox(pk.x, pk.y - 0.94, pk.z, 0, 0, 0, 0.8, 0.13, 0.8, padCol, 2, pk.active ? 0.9 : 0.25);
        if (!pk.active) continue;
        const bobY = pk.y + Math.sin(snapshot.time * 3.5 + i) * 0.22;
        const rotY = snapshot.time * 2.1 + i;
        if (pickupModels && pickupModels[pk.type]) {
          Mat4.fromTRS(this._mRoot, pk.x, bobY, pk.z, 0, rotY, 0, 1, 1, 1);
          this._drawModel(pickupModels[pk.type], this._mRoot, null);
        }
      }

      // Draw Dynamic Shootable Explosive Hazard Barrels (or scorched craters while respawning!)
      const barrelParts = BS.MODELS && BS.MODELS.props && BS.MODELS.props.barrel;
      const barrels = snapshot.barrels || [];
      for (let i = 0; i < barrels.length; i++) {
        const brl = barrels[i];
        if (brl.alive && barrelParts) {
          const jx = brl.fusing ? Math.sin(snapshot.time * 55 + i) * 0.045 : 0;
          const jz = brl.fusing ? Math.cos(snapshot.time * 49 + i) * 0.045 : 0;
          const s = brl.s || 1;
          Mat4.fromTRS(this._mRoot, brl.x + jx, brl.y, brl.z + jz, 0, 0, 0, s, s, s);
          this._drawModel(barrelParts, this._mRoot, null, {
            flash: brl.hurtFlash || (brl.fusing ? 0.65 : 0),
            emBoost: brl.fusing ? 0.65 : (brl.hurtFlash || 0) * 0.35,
          });
        } else {
          // Scorched dark blast mark on floor while barrel respawns
          this._drawBox(brl.x, brl.y + 0.015, brl.z, 0, 0.4, 0, 0.92, 0.03, 0.92, [0.09, 0.09, 0.11], 4, 0);
        }
      }

      // Draw Blocky Roblox Players!
      this._trailAccum += dt;
      const emitTrail = this._trailAccum >= 0.028;
      if (emitTrail) this._trailAccum = 0;

      for (let i = 0; i < snapshot.players.length; i++) {
        const p = snapshot.players[i];
        if (!p.alive) continue;
        if (emitTrail && p.sliding && p.grounded) {
          this.addSlideSparks(p.x, p.y, p.z, p.vx, p.vz);
        }
        if (!isMenuDemo && p.id === localId && !this.thirdPerson) continue;
        this._drawRobloxAvatar(p, snapshot.time);
      }

      // Draw Active Projectiles (Rockets + Bouncy 3D Frag Blox Grenades + Exhaust/Fuse Trails!)
      const grenadeModel = BS.MODELS && BS.MODELS.grenade;
      for (let i = 0; i < snapshot.projectiles.length; i++) {
        const pr = snapshot.projectiles[i];
        if (pr.kind === 'grenade') {
          const urgent = pr.life !== undefined && pr.life < 0.55;
          const blink = urgent ? (Math.sin(snapshot.time * 32) > 0 ? 0.9 : 0.15) : 0.2;
          if (grenadeModel) {
            Mat4.fromTRS(this._mRoot, pr.x, pr.y, pr.z, snapshot.time * 9 + pr.id, snapshot.time * 6.5, 0, 1, 1, 1);
            this._drawModel(grenadeModel, this._mRoot, null, { emBoost: blink });
          } else {
            this._drawBox(pr.x, pr.y, pr.z, snapshot.time * 9, snapshot.time * 6, 0, 0.25, 0.3, 0.25, [1.0, 0.25, 0.2], 2, 0.9);
          }
          if (emitTrail) {
            this.addSmokePuff(pr.x, pr.y + 0.1, pr.z, urgent ? [1.0, 0.25, 0.18] : [1.0, 0.65, 0.22], 0.09, 0.22, 0.95);
          }
        } else {
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
          if (emitTrail) {
            this.addSmokePuff(pr.x - pr.vx * 0.02, pr.y - pr.vy * 0.02, pr.z - pr.vz * 0.02, [0.88, 0.9, 0.94], 0.24, 0.42, 0.08);
            this.addSmokePuff(pr.x - pr.vx * 0.015, pr.y - pr.vy * 0.015, pr.z - pr.vz * 0.015, [1.0, 0.62, 0.18], 0.13, 0.18, 0.95);
          }
        }
      }

      // Draw 3D Spinning Ejected Shell Casings (opaque metallic brass/red hulls/rail cells)
      for (let i = 0; i < this.shells.length; i++) {
        const sh = this.shells[i];
        Mat4.fromTRS(this.model, sh.x, sh.y, sh.z, sh.rx, sh.ry, sh.rz, sh.sx, sh.sy, sh.sz);
        this._drawWithMatrix(this.model, sh.sx, sh.sy, sh.sz, sh.color, 4, sh.emissive, 1.0, false, null, sh.metallic);
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
        // Hide sniper 3D model early during scope-in so the scope tube never crosses the center reticle!
        if (!(w.id === 'sniper' && localPlayer.ads && this.adsBlend > 0.35)) {
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

      // Avatar root transform (supports Power Slide lean-back & Tactical Crouch drop!)
      const crouchB = p.crouchBlend || 0;
      const isSlide = !!p.sliding;
      const rootYOff = isSlide ? -0.34 : -0.32 * crouchB;
      const rootRx = isSlide ? -0.58 : 0.14 * crouchB;
      Mat4.fromTRS(this._mRoot, p.x, p.y + rootYOff, p.z, rootRx, p.yaw, 0, 1, 1, 1);

      // Ground contact shadow (flat on floor)
      this._drawBox(p.x, p.y + 0.02, p.z, 0, p.yaw, 0, 0.95, 0.02, isSlide ? 1.25 : 0.72, [0.06, 0.07, 0.1], 4, 0, 1);

      // Left & Right Legs (hierarchical hip pivot + shoes)
      let legRxL = p.grounded ? Math.sin(p.walkPhase) * 0.7 * amp : 0.35;
      let legRxR = p.grounded ? -Math.sin(p.walkPhase) * 0.7 * amp : -0.25;
      if (isSlide) {
        legRxL = -0.55;
        legRxR = 1.2;
      } else if (crouchB > 0.2) {
        legRxL = legRxL * 0.5 + 0.45 * crouchB;
        legRxR = legRxR * 0.5 - 0.35 * crouchB;
      }

      const padCol = tint([0.22, 0.24, 0.29]);
      const soleCol = tint([0.93, 0.94, 0.96]);
      const teamCol =
        p.team === 'blue' ? [0.3, 0.75, 1.0] : p.team === 'red' ? [1.0, 0.4, 0.45] : p.colors.legs;
      for (const [hipX, legRx] of [[-0.2, legRxL], [0.2, legRxR]]) {
        Mat4.fromTRS(this._mLocal, hipX, 0.72, 0, legRx, 0, 0, 1, 1, 1);
        Mat4.multiply(this._mB, this._mRoot, this._mLocal);
        this._drawChild(this._mB, 0, -0.3, 0, 0, 0, 0, 0.34, 0.6, 0.36, legCol, 4, em); // leg
        this._drawChild(this._mB, 0, -0.3, -0.19, 0, 0, 0, 0.28, 0.14, 0.04, padCol, 4, em); // knee pad
        this._drawChild(this._mB, 0, -0.64, -0.03, 0, 0, 0, 0.36, 0.12, 0.42, darkCol, 4, em); // sneaker upper
        this._drawChild(this._mB, 0, -0.715, -0.04, 0, 0, 0, 0.38, 0.04, 0.46, soleCol, 4, em); // white sole
        this._drawChild(this._mB, 0, -0.66, -0.25, 0, 0, 0, 0.34, 0.08, 0.04, soleCol, 4, em); // toe cap
      }

      // Torso, tactical belt, glowing chest emblem, and shield trim
      this._drawChild(this._mRoot, 0, 1.07, 0, 0, 0, 0, 0.78, 0.72, 0.42, torsoCol, 4, em);
      this._drawChild(this._mRoot, 0, 0.75, 0, 0, 0, 0, 0.8, 0.08, 0.44, darkCol, 4, em);
      this._drawChild(this._mRoot, 0, 0.75, -0.225, 0, 0, 0, 0.13, 0.07, 0.02, tint([0.96, 0.78, 0.3]), 4, em); // buckle
      const emblemCol = teamCol;
      this._drawChild(this._mRoot, 0, 1.15, -0.215, 0, 0, 0, 0.22, 0.22, 0.02, emblemCol, 2, 0.6 + em);
      this._drawChild(this._mRoot, 0, 1.43, 0, 0, 0, 0, 0.48, 0.05, 0.34, darkCol, 4, em); // collar
      for (const sx of [-0.4, 0.4]) {
        this._drawChild(this._mRoot, sx, 1.41, 0, 0, 0, 0, 0.32, 0.08, 0.46, padCol, 4, em); // shoulder pad
        this._drawChild(this._mRoot, sx, 1.37, -0.232, 0, 0, 0, 0.32, 0.025, 0.01, emblemCol, 2, 0.7 + em); // team trim
        this._drawChild(this._mRoot, sx * 0.5, 1.1, -0.216, 0, 0, 0, 0.08, 0.6, 0.02, darkCol, 4, em); // backpack strap
      }
      this._drawChild(this._mRoot, 0, 1.08, 0.28, 0, 0, 0, 0.52, 0.52, 0.14, darkCol, 4, em); // backpack
      this._drawChild(this._mRoot, 0, 1.2, 0.352, 0, 0, 0, 0.44, 0.06, 0.01, emblemCol, 2, 0.8 + em); // glowing stripe
      if (p.shield > 0) {
        this._drawChild(this._mRoot, 0, 1.07, 0, 0, 0, 0, 0.84, 0.2, 0.48, [0.18, 0.85, 1.0], 2, 0.9);
      }
      if (p.bounty > 0) {
        // Glowing golden Wanted aura shoulder trim on high-streak bounty targets!
        this._drawChild(this._mRoot, 0, 1.41, 0, 0, 0, 0, 0.86, 0.07, 0.48, [1.0, 0.82, 0.18], 2, 1.0);
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

      // Left arm (support hand on gun, or swings with blade) and right arm (primary weapon hand):
      // sleeve, dark cuff, skin forearm, tactical glove.
      for (const [sx, rx, ry] of [[-0.54, lRx, lRy], [0.54, Math.PI * 0.5 + p.pitch, 0]]) {
        Mat4.fromTRS(this._mLocal, sx, 1.38, 0, rx, ry, 0, 1, 1, 1);
        Mat4.multiply(this._mB, this._mRoot, this._mLocal);
        this._drawChild(this._mB, 0, -0.14, 0, 0, 0, 0, 0.3, 0.3, 0.32, torsoCol, 4, em);
        this._drawChild(this._mB, 0, -0.3, 0, 0, 0, 0, 0.31, 0.05, 0.33, darkCol, 4, em);
        this._drawChild(this._mB, 0, -0.43, 0, 0, 0, 0, 0.28, 0.24, 0.3, headCol, 4, em);
        this._drawChild(this._mB, 0, -0.6, 0, 0, 0, 0, 0.3, 0.12, 0.32, padCol, 4, em);
      }

      // Detailed multi-part 3D world weapon held in hands (with CS2 skin finish!)
      const wModel = BS.MODELS && BS.MODELS.weapons && BS.MODELS.weapons[w.id];
      if (wModel) {
        const skinSetup = this._getWeaponSkinSetup(w, p);
        Mat4.fromTRS(this._mLocal, 0.54, 1.38, 0, p.pitch, 0, 0, 1, 1, 1);
        Mat4.multiply(this._mB, this._mRoot, this._mLocal);
        Mat4.fromTRS(this._mLocal, -0.08, -0.06, -0.58, isBlade ? -1.0 : 0, 0, 0, 1, 1, 1);
        Mat4.multiply(this._mA, this._mB, this._mLocal);
        this._drawModel(wModel.parts, this._mA, skinSetup.palette, {
          flash: flash * 0.4,
          emBoost: em * 0.25,
          skinTex: skinSetup.skinTex,
          metallic: skinSetup.metallic,
          isBlade: skinSetup.isBlade,
        });
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
      this.adsBlend += ((p.ads ? 1 : 0) - this.adsBlend) * (1 - Math.exp(-dt * 16));
      const ads = this.adsBlend;

      let x = vm.vmHip[0] + (vm.vmAds[0] - vm.vmHip[0]) * ads;
      let y = vm.vmHip[1] + (vm.vmAds[1] - vm.vmHip[1]) * ads;
      let z = vm.vmHip[2] + (vm.vmAds[2] - vm.vmHip[2]) * ads;

      // Damped walk bob (reduced 85% while ADS so reticle view stays rock-steady)
      const amp = p.walkAmp !== undefined ? p.walkAmp : 0;
      const bobScale = 1 - ads * 0.85;
      x += Math.cos(p.walkPhase * 0.5) * 0.016 * amp * bobScale;
      y -= Math.abs(Math.sin(p.walkPhase * 0.5)) * 0.018 * amp * bobScale;

      // Smooth mouse sway (reduced while ADS)
      const swayAds = 1 - ads * 0.65;
      const swayX = ((localView && localView.swayX) || 0) * swayAds;
      const swayY = ((localView && localView.swayY) || 0) * swayAds;
      x += swayX * 0.55;
      y += swayY * 0.55;

      let rx = vm.vmRot ? vm.vmRot[0] : 0;
      let ry = (vm.vmRot ? vm.vmRot[1] : 0) - swayX * 1.4;
      let rz = (vm.vmRot ? vm.vmRot[2] : 0) + swayX * 1.8;

      // Stylish inward tactical tilt while power-sliding!
      if (this.slideBlend > 0.01) {
        const sTilt = this.slideBlend * (1 - ads * 0.85);
        rz += 0.26 * sTilt;
        y -= 0.035 * sTilt;
        x -= 0.02 * sTilt;
      }

      // Snappy weapon equip raise animation on slot switch
      const equipDip = (localView && localView.equipDip) || 0;
      if (equipDip > 0) {
        y -= equipDip * 0.24;
        rx -= equipDip * 0.55;
        rz += equipDip * 0.25;
      }

      // CS2-style Weapon Inspect animation ([F] key)
      const insp = (localView && localView.inspectProgress) || 0;
      if (insp > 0 && ads < 0.25) {
        const env =
          Math.sin(Math.min(1, insp * 4.5) * Math.PI * 0.5) *
          Math.sin(Math.min(1, (1 - insp) * 4.5) * Math.PI * 0.5) *
          (1 - ads * 4);
        x -= 0.16 * env;
        y += 0.07 * env;
        z += 0.04 * env;
        ry -= env * (1.02 + Math.sin(insp * Math.PI * 2) * 0.34);
        rx += env * 0.22;
        rz -= env * 0.34;
      }

      // Recoil kick: kicks straight back (+Z) when ADS without pitching gun up over target!
      const zRecScale = 1 - ads * 0.45;
      const pitchRecScale = 1 - ads * 0.85;
      z += p.recoilKick * 0.11 * zRecScale;
      rx += p.recoilKick * 0.18 * pitchRecScale;

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

      // Mechanical moving weapon parts (bolt blowback, shotgun pump rack, railgun coil surge, RPG warhead visibility!)
      const boltOffset =
        p.reloading && p.reloadProgress > 0.75
          ? Math.sin(((p.reloadProgress - 0.75) / 0.25) * Math.PI) * 0.12
          : Math.min(1, p.recoilKick * 1.6) * 0.11;
      let pumpOffset = 0;
      if (w.id === 'shotgun' && p.recoilKick > 0.05 && p.recoilKick < 0.72) {
        pumpOffset = Math.sin(((0.72 - p.recoilKick) / 0.67) * Math.PI) * 0.145;
      }
      const coilGlow = w.id === 'sniper' ? p.recoilKick * 0.9 + (p.ads ? 0.35 : 0) : 0;
      const hideWarhead = w.id === 'rocket' && (p.ammo <= 0 || p.reloading);

      const skinSetup = this._getWeaponSkinSetup(w, p);
      this._drawModel(vm.parts, this._mRoot, skinSetup.palette, {
        skinTex: skinSetup.skinTex,
        metallic: skinSetup.metallic,
        isBlade: skinSetup.isBlade,
        boltOffset,
        pumpOffset,
        coilGlow,
        hideWarhead,
      });

      // Right hand & sleeve gripping weapon
      const gloveCol = [0.2, 0.22, 0.27];
      this._drawChild(this._mRoot, 0, -0.06, 0.05, 0, 0, 0, 0.095, 0.1, 0.14, gloveCol, 4, 0); // glove
      this._drawChild(this._mRoot, 0.01, -0.085, 0.14, 0.5, 0, 0, 0.08, 0.08, 0.06, p.colors.head, 4, 0); // wrist
      this._drawChild(this._mRoot, 0.03, -0.13, 0.24, 0.5, 0, 0, 0.1, 0.1, 0.36, p.colors.torso, 4, 0);
      this._drawChild(this._mRoot, 0.018, -0.105, 0.17, 0.5, 0, 0, 0.108, 0.108, 0.035, [0.12, 0.13, 0.16], 4, 0); // cuff

      // Support left hand & sleeve (tracks the sliding shotgun pump in real time!)
      if (vm.leftHand) {
        const lh = vm.leftHand;
        const lhZ = lh[2] + pumpOffset;
        this._drawChild(this._mRoot, lh[0], lh[1] - 0.03, lhZ, 0, 0, 0, 0.1, 0.09, 0.14, gloveCol, 4, 0);
        this._drawChild(
          this._mRoot,
          lh[0] - 0.08,
          lh[1] - 0.12,
          lhZ + 0.24,
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
