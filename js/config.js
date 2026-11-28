// Blox Strike - Shared Configuration & Data Definitions
// Pure data module: safe for both browser client and future Node.js multiplayer server.

(function (global) {
  const BS = (global.BloxStrike = global.BloxStrike || {});

  BS.TICK_RATE = 60;
  BS.FIXED_DT = 1 / BS.TICK_RATE;

  BS.PLAYER = {
    RADIUS: 0.42,
    HEIGHT: 1.85,
    EYE_HEIGHT: 1.56,
    HEAD_MIN_Y: 1.32,
    MOVE_SPEED: 8.6,
    ADS_SPEED_MULT: 0.62,
    GROUND_ACCEL: 20,
    GROUND_FRICTION: 24,
    AIR_ACCEL: 6,
    AIR_DRAG: 0.35,
    COYOTE_TIME: 0.1,
    JUMP_BUFFER: 0.12,
    GRAVITY: 25.5,
    JUMP_VEL: 10.6,
    AIR_JUMPS: 1, // double jump: extra jumps allowed in mid-air
    AIR_JUMP_VEL: 9.8,
    DASH_SPEED: 19.5,
    DASH_DURATION: 0.18,
    DASH_COOLDOWN: 2.2,
    CROUCH_HEIGHT: 1.22,
    CROUCH_EYE_HEIGHT: 0.96,
    CROUCH_HEAD_MIN_Y: 0.78,
    CROUCH_SPEED_MULT: 0.6,
    SLIDE_SPEED: 14.4,
    SLIDE_MIN_SPEED: 4.5,
    SLIDE_DURATION: 0.65,
    SLIDE_COOLDOWN: 0.85,
    SLIDE_FRICTION: 2.4,
    SLIDE_HOP_BOOST: 1.25,
    MAX_HP: 100,
    MAX_SHIELD: 50,
    RESPAWN_TIME: 3.0,
    SPAWN_PROTECT: 1.5,
    STEP_HEIGHT: 0.55,
    STEP_DOWN: 0.6,
  };

  BS.WEAPONS = [
    {
      id: 'ar',
      slot: 1,
      name: 'BLOX-AR',
      shortName: 'AR',
      category: 'rifle',
      fireMode: 'auto',
      damage: 22,
      headMult: 1.75,
      fireRate: 9.5, // shots per second
      magSize: 30,
      reloadTime: 1.45,
      spread: 0.014,
      adsSpread: 0.004,
      adsFov: 58,
      range: 130,
      recoilPitch: 0.017,
      recoilKick: 0.11,
      pellets: 1,
      type: 'hitscan',
      tracerColor: [1.0, 0.92, 0.45],
      color: [0.22, 0.27, 0.36],
      accent: [0.18, 0.72, 1.0],
      modelType: 'rifle',
      gunGameOrder: 0,
    },
    {
      id: 'shotgun',
      slot: 2,
      name: 'STUD-12',
      shortName: 'SHOTGUN',
      category: 'shotgun',
      fireMode: 'semi',
      damage: 14,
      headMult: 1.5,
      fireRate: 1.35,
      magSize: 8,
      reloadTime: 1.75,
      spread: 0.072,
      adsSpread: 0.052,
      adsFov: 68,
      range: 46,
      recoilPitch: 0.062,
      recoilKick: 0.24,
      pellets: 8,
      type: 'hitscan',
      tracerColor: [1.0, 0.68, 0.25],
      color: [0.28, 0.24, 0.22],
      accent: [1.0, 0.46, 0.16],
      modelType: 'shotgun',
      gunGameOrder: 1,
    },
    {
      id: 'smg',
      slot: 3,
      name: 'HYPER-SMG',
      shortName: 'SMG',
      category: 'smg',
      fireMode: 'auto',
      damage: 17, // was 15: 7-shot body TTK lost to the AR at 60Hz; 6 shots now wins up close
      headMult: 1.6,
      fireRate: 14.5,
      magSize: 36,
      reloadTime: 1.25,
      spread: 0.028,
      adsSpread: 0.013,
      adsFov: 65,
      range: 75,
      recoilPitch: 0.012,
      recoilKick: 0.075,
      pellets: 1,
      type: 'hitscan',
      tracerColor: [0.35, 1.0, 0.85],
      color: [0.18, 0.22, 0.28],
      accent: [0.16, 0.95, 0.76],
      modelType: 'smg',
      gunGameOrder: 2,
    },
    {
      id: 'sniper',
      slot: 4,
      name: 'RAIL-BLOX',
      shortName: 'SNIPER',
      category: 'sniper',
      fireMode: 'semi',
      damage: 78,
      headMult: 2.0,
      fireRate: 0.9,
      magSize: 5,
      reloadTime: 2.0,
      spread: 0.045,
      adsSpread: 0.0005,
      adsFov: 28,
      range: 220,
      recoilPitch: 0.075,
      recoilKick: 0.28,
      pellets: 1,
      type: 'hitscan',
      tracerColor: [0.65, 0.4, 1.0],
      color: [0.24, 0.25, 0.32],
      accent: [0.68, 0.36, 1.0],
      modelType: 'sniper',
      gunGameOrder: 3,
    },
    {
      id: 'rocket',
      slot: 5,
      name: 'BRICK-RPG',
      shortName: 'RPG',
      category: 'launcher',
      fireMode: 'semi',
      damage: 92,
      headMult: 1.0,
      fireRate: 0.8,
      magSize: 4,
      reloadTime: 2.15,
      spread: 0.008,
      adsSpread: 0.002,
      adsFov: 62,
      range: 140,
      recoilPitch: 0.07,
      recoilKick: 0.3,
      pellets: 1,
      type: 'projectile',
      projSpeed: 34,
      splashRadius: 5.4,
      knockback: 12.5,
      tracerColor: [1.0, 0.35, 0.2],
      color: [0.24, 0.34, 0.25],
      accent: [1.0, 0.28, 0.24],
      modelType: 'rocket',
      gunGameOrder: 4,
    },
    {
      id: 'blade',
      slot: 6,
      name: 'NEON BLADE',
      shortName: 'BLADE',
      category: 'melee',
      fireMode: 'semi',
      damage: 65,
      headMult: 1.6,
      fireRate: 2.2,
      magSize: 999,
      reloadTime: 0.1,
      spread: 0,
      adsSpread: 0,
      adsFov: 76,
      range: 3.4,
      recoilPitch: -0.02,
      recoilKick: 0.32,
      pellets: 1,
      type: 'melee',
      lungeSpeed: 12.5,
      tracerColor: [1.0, 0.85, 0.2],
      color: [0.2, 0.22, 0.26],
      accent: [1.0, 0.82, 0.18],
      modelType: 'blade',
      gunGameOrder: 5,
    },
  ];

  BS.WEAPON_BY_ID = Object.create(null);
  BS.WEAPONS.forEach((w) => {
    BS.WEAPON_BY_ID[w.id] = w;
  });

  BS.SECURITY = {
    MAX_NAME_LEN: 16,
    MAX_BOTS: 11,
    MAX_INPUTS_PER_SEC: 360,
    MAX_PACKET_BYTES: 65536,
  };

  // Match XP Leveling & Killstreak Bounty configuration (applies to both players & AI bots!)
  BS.PROGRESSION = {
    BASE_LEVEL_XP: 100,
    XP_PER_LEVEL_STEP: 35,
    MAX_LEVEL: 25,
    KILL_XP: 60,
    KILL_HEAL: 10, // HP the killer regains on every kill (capped at max HP)
    ASSIST_XP: 25,
    ASSIST_MIN_DAMAGE: 25, // damage to one life needed to earn an assist
    KNOCKOFF_CREDIT_TIME: 5, // seconds: a void fall after your hit counts as your kill
    HEADSHOT_BONUS_XP: 25,
    NOTORIETY_KILL_XP: 15,
    BOUNTY_MIN_STREAK: 3,
    BOUNTY_BASE_XP: 90,
    BOUNTY_PER_EXTRA_KILL: 40,
    BOUNTY_MAX_XP: 350,
    KOTH_XP_PER_SEC: 8,
  };

  BS.GRENADE = {
    COOLDOWN: 7.0,
    THROW_SPEED: 21.5,
    UP_VEL: 4.2,
    GRAVITY: 22.0,
    FUSE: 1.55,
    BOUNCE: 0.52,
    SPLASH_RADIUS: 6.2,
    DAMAGE: 95,
    KNOCKBACK: 15.5,
    SELF_DMG_MULT: 0.3,
  };

  BS.BARREL = {
    MAX_HP: 45,
    RESPAWN_TIME: 14.0,
    SPLASH_RADIUS: 6.8,
    DAMAGE: 115,
    KNOCKBACK: 18.0,
    CHAIN_DELAY: 0.14,
  };

  // CS2-inspired weapon finishes (procedural 256x256 textures + metallic shader sheen)
  BS.WEAPON_SKINS = [
    {
      id: 'default',
      name: 'Factory Stock',
      rarity: 'standard',
      swatch: 'linear-gradient(135deg,#323c52 50%,#24d2ff 50%)',
      pattern: null,
      metallic: 0.15,
    },
    {
      id: 'asiimov',
      name: 'Asiimov',
      rarity: 'covert',
      swatch: 'linear-gradient(135deg,#f4f6fb 38%,#ff6a14 38%,#ff6a14 70%,#1b1d24 70%)',
      pattern: 'asiimov',
      body: [0.98, 0.98, 0.99],
      accent: [1.0, 0.44, 0.08],
      dark: [0.11, 0.12, 0.15],
      metal: [0.88, 0.9, 0.94],
      wood: [0.95, 0.96, 0.98],
      metallic: 0.28,
    },
    {
      id: 'dragonlore',
      name: 'Dragon Lore',
      rarity: 'covert',
      swatch: 'linear-gradient(135deg,#d8a832 35%,#b82820 65%,#5e5528 100%)',
      pattern: 'dragonlore',
      body: [0.98, 0.94, 0.84],
      accent: [1.0, 0.72, 0.14],
      dark: [0.22, 0.2, 0.14],
      metal: [0.64, 0.56, 0.34],
      wood: [0.68, 0.52, 0.2],
      metallic: 0.58,
    },
    {
      id: 'hyperbeast',
      name: 'Hyper Beast',
      rarity: 'covert',
      swatch: 'linear-gradient(135deg,#1ae8ff 20%,#ff2492 55%,#7c24ff 80%,#8cff2e 100%)',
      pattern: 'hyperbeast',
      body: [0.98, 0.98, 1.0],
      accent: [1.0, 0.18, 0.62],
      dark: [0.12, 0.08, 0.2],
      metal: [0.26, 0.84, 0.95],
      wood: [0.35, 0.14, 0.52],
      metallic: 0.36,
    },
    {
      id: 'printstream',
      name: 'Printstream',
      rarity: 'covert',
      swatch: 'linear-gradient(135deg,#f5f7ff 52%,#14161c 52%,#14161c 82%,#66f0ff 100%)',
      pattern: 'printstream',
      body: [0.98, 0.99, 1.0],
      accent: [0.74, 0.96, 1.0],
      dark: [0.08, 0.09, 0.12],
      metal: [0.92, 0.94, 0.98],
      wood: [0.94, 0.95, 0.98],
      metallic: 0.76,
    },
    {
      id: 'fade',
      name: 'Fade',
      rarity: 'covert',
      swatch: 'linear-gradient(135deg,#5a28e8 10%,#ff2e98 52%,#ffd230 95%)',
      pattern: 'fade',
      body: [1.0, 1.0, 1.0],
      accent: [1.0, 0.76, 0.2],
      dark: [0.14, 0.12, 0.19],
      metal: [0.95, 0.62, 0.82],
      wood: [0.82, 0.36, 0.68],
      metallic: 0.92,
    },
    {
      id: 'casehardened',
      name: 'Case Hardened',
      rarity: 'classified',
      swatch: 'linear-gradient(135deg,#1d8eff 36%,#64c8ff 56%,#d8a846 78%,#6c3ac4 100%)',
      pattern: 'casehardened',
      body: [0.98, 0.99, 1.0],
      accent: [0.22, 0.78, 1.0],
      dark: [0.16, 0.18, 0.22],
      metal: [0.42, 0.76, 0.98],
      wood: [0.58, 0.44, 0.24],
      metallic: 0.88,
    },
    {
      id: 'redline',
      name: 'Redline',
      rarity: 'classified',
      swatch: 'linear-gradient(135deg,#17191f 62%,#ff2438 62%,#ff2438 78%,#17191f 78%)',
      pattern: 'redline',
      body: [0.96, 0.96, 0.98],
      accent: [1.0, 0.16, 0.22],
      dark: [0.09, 0.1, 0.12],
      metal: [0.24, 0.26, 0.3],
      wood: [0.14, 0.15, 0.18],
      metallic: 0.32,
    },
    {
      id: 'ruby',
      name: 'Doppler Ruby',
      rarity: 'gem',
      swatch: 'linear-gradient(135deg,#7a061b 15%,#e6143c 55%,#ff5a7a 100%)',
      pattern: 'ruby',
      body: [1.0, 0.96, 0.98],
      accent: [1.0, 0.2, 0.36],
      dark: [0.22, 0.04, 0.08],
      metal: [0.92, 0.16, 0.3],
      wood: [0.62, 0.08, 0.18],
      metallic: 1.0,
    },
    {
      id: 'sapphire',
      name: 'Doppler Sapphire',
      rarity: 'gem',
      swatch: 'linear-gradient(135deg,#081d7a 15%,#1858f0 55%,#44d2ff 100%)',
      pattern: 'sapphire',
      body: [0.96, 0.98, 1.0],
      accent: [0.22, 0.74, 1.0],
      dark: [0.05, 0.09, 0.24],
      metal: [0.16, 0.52, 0.98],
      wood: [0.08, 0.24, 0.62],
      metallic: 1.0,
    },
  ];

  BS.WEAPON_SKIN_BY_ID = Object.create(null);
  BS.WEAPON_SKINS.forEach((ws) => {
    BS.WEAPON_SKIN_BY_ID[ws.id] = ws;
  });
  BS.WEAPON_SKIN_IDS = BS.WEAPON_SKINS.map((ws) => ws.id);

  BS.MODES = {
    tdm: {
      id: 'tdm',
      name: 'Team Blox',
      short: 'TDM',
      description: 'Blue vs Red 4v4 team showdown. First team to 30 eliminations wins!',
      scoreLimit: 30,
      timeLimit: 300,
      teams: true,
    },
    ffa: {
      id: 'ffa',
      name: 'Free-For-All',
      short: 'FFA',
      description: 'Every Bloxxer for themselves! First to 20 eliminations takes the crown.',
      scoreLimit: 20,
      timeLimit: 300,
      teams: false,
    },
    gungame: {
      id: 'gungame',
      name: 'Arsenal Ladder',
      short: 'GUN GAME',
      description: 'Eliminate rivals to advance through all 6 weapons. Win with the Neon Blade!',
      scoreLimit: BS.WEAPONS.length * 2, // 2 kills per weapon tier (12 total)
      timeLimit: 360,
      teams: false,
    },
    koth: {
      id: 'koth',
      name: 'King of the Blox',
      short: 'KOTH',
      description: 'Control the glowing center capture zone to rack up team points to 100!',
      scoreLimit: 100,
      timeLimit: 300,
      teams: true,
    },
    kc: {
      id: 'kc',
      name: 'Kill Confirmed',
      short: 'KC',
      description: 'Kills drop blox tags. Grab enemy tags to score, grab your team’s to deny. First to 25!',
      scoreLimit: 25,
      timeLimit: 300,
      teams: true,
    },
  };

  BS.KILL_CONFIRMED = {
    TAG_LIFE: 25, // seconds a dropped tag stays before vanishing
    CONFIRM_SCORE: 50,
    CONFIRM_XP: 30,
    DENY_SCORE: 25,
    DENY_XP: 15,
  };

  BS.SKINS = [
    { id: 'classic', name: 'Classic Noob', head: [0.98, 0.82, 0.22], torso: [0.16, 0.52, 0.94], legs: [0.42, 0.78, 0.28], accessory: 'hair_classic' },
    { id: 'cyber', name: 'Neon Cyber', head: [0.88, 0.92, 0.98], torso: [0.14, 0.18, 0.28], legs: [0.12, 0.85, 0.88], accessory: 'visor' },
    { id: 'crimson', name: 'Crimson Ace', head: [0.96, 0.82, 0.68], torso: [0.88, 0.2, 0.24], legs: [0.18, 0.18, 0.24], accessory: 'cap' },
    { id: 'gold', name: 'Golden Pro', head: [1.0, 0.84, 0.28], torso: [0.96, 0.72, 0.15], legs: [0.22, 0.2, 0.24], accessory: 'crown' },
    { id: 'phantom', name: 'Void Phantom', head: [0.78, 0.68, 0.98], torso: [0.36, 0.18, 0.64], legs: [0.16, 0.14, 0.26], accessory: 'horns' },
  ];

  BS.ACCESSORIES = [
    { id: 'hair_classic', name: 'Classic Hair' },
    { id: 'visor', name: 'Cyber Visor' },
    { id: 'cap', name: 'Backwards Cap' },
    { id: 'crown', name: 'Gold Crown' },
    { id: 'horns', name: 'Void Horns' },
    { id: 'headphones', name: 'Headphones' },
    { id: 'cone', name: 'Traffic Cone' },
    { id: 'dominus', name: 'Dark Dominus' },
    { id: 'tophat', name: 'Top Hat' },
  ];

  BS.ACCESSORY_IDS = BS.ACCESSORIES.map((a) => a.id);

  BS.PROP_COLLIDERS = {
    tree: { w: 0.6, h: 2.4, d: 0.6 },
    pine: { w: 0.6, h: 2.2, d: 0.6 },
    lamp: { w: 0.3, h: 3.6, d: 0.3 },
    barrel: { w: 0.84, h: 1.2, d: 0.84 },
    crystal: { w: 1.2, h: 2.3, d: 1.2 },
    bench: { w: 1.8, h: 0.55, d: 0.5 },
    bush: { w: 1.3, h: 0.9, d: 1.3 },
  };

  BS.BOT_NAMES = [
    'Builderman99',
    'NoobSlayer_X',
    'StudMaster',
    'BrickWizard',
    'BloxNinja',
    'ObbyKing42',
    'PixelSniper',
    'TurboOof',
    'NeonRival',
    'HyperBrick',
    'LaserBlox',
    'SkyJumper',
  ];

  // Block texture types:
  // 0 = studs (classic Roblox plastic studs)
  // 1 = crate (wooden/tech crate with cross-brace)
  // 2 = neon (emissive glowing surface)
  // 3 = tile (arena floor tiles)
  // 4 = smooth (clean plastic)

  function box(x, y, z, w, h, d, color, tex = 0, emissive = 0) {
    return { x, y, z, w, h, d, color, tex, emissive };
  }

  function buildCrossroadsMap() {
    const blocks = [];
    // Baseplate (classic green grass/stud courtyard + central paved plaza)
    blocks.push(box(0, -1, 0, 72, 2, 72, [0.3, 0.64, 0.3], 0));
    blocks.push(box(0, 0.02, 0, 32, 0.14, 32, [0.58, 0.61, 0.66], 3));
    // Road crossarms
    blocks.push(box(0, 0.03, 0, 70, 0.12, 8, [0.46, 0.49, 0.54], 3));
    blocks.push(box(0, 0.03, 0, 8, 0.12, 70, [0.46, 0.49, 0.54], 3));

    // Outer perimeter walls (bright castle-style Roblox blocks)
    const wallColor = [0.68, 0.71, 0.76];
    const trimColor = [0.24, 0.52, 0.92];
    blocks.push(box(0, 3.5, -36, 74, 7, 2, wallColor, 0));
    blocks.push(box(0, 3.5, 36, 74, 7, 2, wallColor, 0));
    blocks.push(box(-36, 3.5, 0, 2, 7, 74, wallColor, 0));
    blocks.push(box(36, 3.5, 0, 2, 7, 74, wallColor, 0));
    // Neon trim strip along perimeter
    blocks.push(box(0, 6.2, -34.9, 70, 0.45, 0.3, [0.2, 0.78, 1.0], 2, 0.9));
    blocks.push(box(0, 6.2, 34.9, 70, 0.45, 0.3, [1.0, 0.32, 0.36], 2, 0.9));

    // Central Crossroads Tower / Monument (open archways on all 4 sides, upper balcony)
    const towerCol = [0.84, 0.78, 0.62];
    // 4 Corner pillars
    blocks.push(box(-5.5, 3.0, -5.5, 2.2, 6.0, 2.2, towerCol, 0));
    blocks.push(box(5.5, 3.0, -5.5, 2.2, 6.0, 2.2, towerCol, 0));
    blocks.push(box(-5.5, 3.0, 5.5, 2.2, 6.0, 2.2, towerCol, 0));
    blocks.push(box(5.5, 3.0, 5.5, 2.2, 6.0, 2.2, towerCol, 0));
    // Upper deck
    blocks.push(box(0, 5.8, 0, 13.5, 0.7, 13.5, [0.76, 0.7, 0.56], 0));
    // Low parapet cover on deck
    blocks.push(box(0, 6.7, -6.2, 7, 1.2, 0.8, trimColor, 0));
    blocks.push(box(0, 6.7, 6.2, 7, 1.2, 0.8, [0.92, 0.28, 0.3], 0));
    blocks.push(box(-6.2, 6.7, 0, 0.8, 1.2, 7, [0.95, 0.76, 0.2], 0));
    blocks.push(box(6.2, 6.7, 0, 0.8, 1.2, 7, [0.95, 0.76, 0.2], 0));

    // Classic Blue & Red Fortresses (North -Z = Blue, South +Z = Red)
    // Blue base
    blocks.push(box(0, 2.2, -24, 18, 4.4, 2, [0.2, 0.46, 0.88], 0));
    blocks.push(box(-10, 2.5, -20, 2, 5.0, 10, [0.22, 0.52, 0.92], 0));
    blocks.push(box(10, 2.5, -20, 2, 5.0, 10, [0.22, 0.52, 0.92], 0));
    blocks.push(box(0, 4.5, -21, 18, 0.6, 6, [0.3, 0.58, 0.96], 0));
    // Stepped stairs to Blue fort balcony
    for (let i = 0; i < 9; i++) {
      blocks.push(box(-12.5, 0.25 + i * 0.5, -16 - i * 0.8, 2.8, 0.5, 1.0, [0.55, 0.65, 0.8], 0));
    }

    // Red base
    blocks.push(box(0, 2.2, 24, 18, 4.4, 2, [0.88, 0.22, 0.24], 0));
    blocks.push(box(-10, 2.5, 20, 2, 5.0, 10, [0.92, 0.25, 0.28], 0));
    blocks.push(box(10, 2.5, 20, 2, 5.0, 10, [0.92, 0.25, 0.28], 0));
    blocks.push(box(0, 4.5, 21, 18, 0.6, 6, [0.95, 0.34, 0.36], 0));
    for (let i = 0; i < 9; i++) {
      blocks.push(box(12.5, 0.25 + i * 0.5, 16 + i * 0.8, 2.8, 0.5, 1.0, [0.82, 0.52, 0.52], 0));
    }

    // West & East Side Sniper Platforms + Bridges
    blocks.push(box(-23, 2.0, 0, 8, 4.0, 14, [0.92, 0.72, 0.22], 0));
    blocks.push(box(-19.4, 4.5, 0, 0.8, 1.1, 8, [0.22, 0.24, 0.28], 0));
    blocks.push(box(23, 2.0, 0, 8, 4.0, 14, [0.58, 0.34, 0.86], 0));
    blocks.push(box(19.4, 4.5, 0, 0.8, 1.1, 8, [0.22, 0.24, 0.28], 0));

    // Stepped ramps up to West & East platforms
    for (let i = 0; i < 8; i++) {
      blocks.push(box(-23, 0.25 + i * 0.5, 10.5 - i * 0.6, 3.6, 0.5, 0.9, [0.76, 0.62, 0.25], 0));
      blocks.push(box(23, 0.25 + i * 0.5, -10.5 + i * 0.6, 3.6, 0.5, 0.9, [0.56, 0.42, 0.74], 0));
    }

    // Tactical Crates & Mid Cover (classic Roblox wooden/bright crates)
    const crateCoords = [
      [-12, 1.0, -10, 2.4, 2.0, 2.4],
      [-14.5, 0.8, -8.5, 1.8, 1.6, 1.8],
      [12, 1.0, 10, 2.4, 2.0, 2.4],
      [14.5, 0.8, 8.5, 1.8, 1.6, 1.8],
      [12, 1.0, -11, 2.4, 2.0, 2.4],
      [-12, 1.0, 11, 2.4, 2.0, 2.4],
      [-7.5, 0.9, -15.5, 3.2, 1.8, 1.6],
      [7.5, 0.9, 15.5, 3.2, 1.8, 1.6],
      [0, 1.1, -13.5, 4.2, 2.2, 1.6],
      [0, 1.1, 13.5, 4.2, 2.2, 1.6],
      [-16, 1.1, 0, 1.8, 2.2, 4.2],
      [16, 1.1, 0, 1.8, 2.2, 4.2],
    ];
    crateCoords.forEach(([x, y, z, w, h, d]) => {
      blocks.push(box(x, y, z, w, h, d, [0.84, 0.58, 0.3], 1));
    });

    // Decorative glowing corner beacons
    blocks.push(box(-31, 4.5, -31, 3, 9, 3, [0.22, 0.56, 0.95], 0));
    blocks.push(box(31, 4.5, -31, 3, 9, 3, [0.22, 0.56, 0.95], 0));
    blocks.push(box(-31, 4.5, 31, 3, 9, 3, [0.95, 0.28, 0.32], 0));
    blocks.push(box(31, 4.5, 31, 3, 9, 3, [0.95, 0.28, 0.32], 0));

    return {
      id: 'crossroads',
      name: 'Crossroads Arena',
      subtitle: 'Classic Studded Courtyard & Center Tower',
      skyTop: [0.16, 0.52, 0.95],
      skyHorizon: [0.68, 0.87, 1.0],
      fogColor: [0.64, 0.82, 0.96],
      fogDensity: 0.0055,
      voidY: -12,
      blocks,
      props: [
        // Trees on grassy outer quadrants
        { m: 'tree', x: -28, y: 0, z: -13 },
        { m: 'tree', x: 28, y: 0, z: 13 },
        { m: 'tree', x: -27, y: 0, z: 19 },
        { m: 'tree', x: 27, y: 0, z: -19 },
        // Street lamps flanking the center roads near forts
        { m: 'lamp', x: 4.8, y: 0, z: -19, ry: Math.PI * 0.5 },
        { m: 'lamp', x: -4.8, y: 0, z: -19, ry: -Math.PI * 0.5 },
        { m: 'lamp', x: 4.8, y: 0, z: 19, ry: Math.PI * 0.5 },
        { m: 'lamp', x: -4.8, y: 0, z: 19, ry: -Math.PI * 0.5 },
        // Decorative fortress team flags (no collider)
        { m: 'flag', x: -8, y: 4.8, z: -22.5, tint: [0.2, 0.5, 1.0] },
        { m: 'flag', x: 8, y: 4.8, z: -22.5, tint: [0.2, 0.5, 1.0] },
        { m: 'flag', x: -8, y: 4.8, z: 22.5, tint: [1.0, 0.25, 0.3] },
        { m: 'flag', x: 8, y: 4.8, z: 22.5, tint: [1.0, 0.25, 0.3] },
        // Shootable explosive hazard barrels near mid crates (resting on central plaza top y=0.09)
        { m: 'barrel', x: -10.2, y: 0.09, z: -12.2 },
        { m: 'barrel', x: -11.4, y: 0.09, z: -12.2 },
        { m: 'barrel', x: 10.2, y: 0.09, z: 12.2 },
        { m: 'barrel', x: 11.4, y: 0.09, z: 12.2 },
        { m: 'barrel', x: -10.2, y: 0.09, z: 12.2 },
        { m: 'barrel', x: 10.2, y: 0.09, z: -12.2 },
        // Courtyard benches
        { m: 'bench', x: -20, y: 0, z: -30.5 },
        { m: 'bench', x: 20, y: 0, z: 30.5, ry: Math.PI },
      ],
      jumpPads: [
        { x: 0, y: 0.15, z: -8.5, r: 1.5, boostY: 16.5, boostX: 0, boostZ: 3.5 },
        { x: 0, y: 0.15, z: 8.5, r: 1.5, boostY: 16.5, boostX: 0, boostZ: -3.5 },
        { x: -16, y: 0.15, z: -16, r: 1.5, boostY: 16.0, boostX: 3.0, boostZ: 3.0 },
        { x: 16, y: 0.15, z: 16, r: 1.5, boostY: 16.0, boostX: -3.0, boostZ: -3.0 },
      ],
      pickups: [
        { id: 'p1', type: 'health', x: -15, y: 1.1, z: -15 },
        { id: 'p2', type: 'health', x: 15, y: 1.1, z: 15 },
        { id: 'p3', type: 'shield', x: 0, y: 7.2, z: 0 },
        { id: 'p4', type: 'shield', x: -23, y: 5.1, z: 0 },
        { id: 'p5', type: 'shield', x: 23, y: 5.1, z: 0 },
        { id: 'p6', type: 'speed', x: 15, y: 1.1, z: -15 },
        { id: 'p7', type: 'speed', x: -15, y: 1.1, z: 15 },
      ],
      kothZone: { x: 0, y: 0.12, z: 0, radius: 5.2 },
      spawns: {
        blue: [
          { x: -6, y: 0.2, z: -29, yaw: Math.PI },
          { x: 6, y: 0.2, z: -29, yaw: Math.PI },
          { x: 0, y: 0.2, z: -31, yaw: Math.PI },
          { x: -18, y: 0.2, z: -28, yaw: Math.PI },
          { x: 18, y: 0.2, z: -28, yaw: Math.PI },
        ],
        red: [
          { x: -6, y: 0.2, z: 29, yaw: 0 },
          { x: 6, y: 0.2, z: 29, yaw: 0 },
          { x: 0, y: 0.2, z: 31, yaw: 0 },
          { x: -18, y: 0.2, z: 28, yaw: 0 },
          { x: 18, y: 0.2, z: 28, yaw: 0 },
        ],
        ffa: [
          { x: -28, y: 0.2, z: -24, yaw: Math.PI * 0.75 },
          { x: 28, y: 0.2, z: -24, yaw: -Math.PI * 0.75 },
          { x: -28, y: 0.2, z: 24, yaw: Math.PI * 0.25 },
          { x: 28, y: 0.2, z: 24, yaw: -Math.PI * 0.25 },
          { x: 0, y: 0.2, z: -30, yaw: Math.PI },
          { x: 0, y: 0.2, z: 30, yaw: 0 },
          { x: -23, y: 4.2, z: 0, yaw: Math.PI * 0.5 },
          { x: 23, y: 4.2, z: 0, yaw: -Math.PI * 0.5 },
        ],
      },
      waypoints: [
        { x: 0, y: 0.2, z: 0 },
        { x: 0, y: 6.3, z: 0 },
        { x: -15, y: 0.2, z: -15 },
        { x: 15, y: 0.2, z: 15 },
        { x: 15, y: 0.2, z: -15 },
        { x: -15, y: 0.2, z: 15 },
        { x: -23, y: 4.2, z: 0 },
        { x: 23, y: 4.2, z: 0 },
        { x: 0, y: 0.2, z: -18 },
        { x: 0, y: 0.2, z: 18 },
        { x: -10, y: 0.2, z: 0 },
        { x: 10, y: 0.2, z: 0 },
      ],
    };
  }

  function buildNeonPaintballMap() {
    const blocks = [];
    // Sleek dark-synth arena floor with glowing lanes (RIVALS / Paintball vibe)
    blocks.push(box(0, -1, 0, 62, 2, 62, [0.16, 0.19, 0.26], 3));
    blocks.push(box(0, 0.02, 0, 22, 0.1, 60, [0.22, 0.25, 0.34], 3));

    // Arena walls
    blocks.push(box(0, 4, -31, 64, 8, 2, [0.14, 0.17, 0.24], 4));
    blocks.push(box(0, 4, 31, 64, 8, 2, [0.14, 0.17, 0.24], 4));
    blocks.push(box(-31, 4, 0, 2, 8, 64, [0.14, 0.17, 0.24], 4));
    blocks.push(box(31, 4, 0, 2, 8, 64, [0.14, 0.17, 0.24], 4));

    // Glowing wall bands
    blocks.push(box(0, 2.2, -29.8, 60, 0.35, 0.3, [0.1, 0.82, 1.0], 2, 1.0));
    blocks.push(box(0, 2.2, 29.8, 60, 0.35, 0.3, [1.0, 0.22, 0.56], 2, 1.0));
    blocks.push(box(-29.8, 5.5, 0, 0.3, 0.35, 60, [0.7, 0.32, 1.0], 2, 1.0));
    blocks.push(box(29.8, 5.5, 0, 0.3, 0.35, 60, [0.16, 0.96, 0.68], 2, 1.0));

    // Center raised stage
    blocks.push(box(0, 1.0, 0, 10, 2.0, 10, [0.24, 0.28, 0.38], 0));
    blocks.push(box(0, 2.06, 0, 10.2, 0.14, 10.2, [0.18, 0.94, 0.88], 2, 0.7));
    // Steps onto center stage (4 sides)
    for (let i = 0; i < 4; i++) {
      const h = 0.5 * (i + 1);
      const off = 6.8 - i * 0.6;
      blocks.push(box(0, h / 2, -off, 3.6, h, 0.7, [0.3, 0.34, 0.44], 0));
      blocks.push(box(0, h / 2, off, 3.6, h, 0.7, [0.3, 0.34, 0.44], 0));
    }

    // Symmetrical vibrant paintball bunker barriers
    const barriers = [
      // Mid-field angled lane walls
      [-10, 1.6, -9, 5.5, 3.2, 1.6, [0.14, 0.78, 1.0]],
      [10, 1.6, -9, 5.5, 3.2, 1.6, [0.14, 0.78, 1.0]],
      [-10, 1.6, 9, 5.5, 3.2, 1.6, [1.0, 0.24, 0.52]],
      [10, 1.6, 9, 5.5, 3.2, 1.6, [1.0, 0.24, 0.52]],
      // Flank pillars
      [-18, 2.2, 0, 3.0, 4.4, 7.0, [0.68, 0.3, 1.0]],
      [18, 2.2, 0, 3.0, 4.4, 7.0, [0.14, 0.92, 0.62]],
      // Back cover bunkers
      [0, 1.4, -18, 8.0, 2.8, 1.8, [0.2, 0.62, 1.0]],
      [0, 1.4, 18, 8.0, 2.8, 1.8, [1.0, 0.3, 0.38]],
      [-16, 1.3, -18, 3.5, 2.6, 3.5, [1.0, 0.78, 0.16]],
      [16, 1.3, -18, 3.5, 2.6, 3.5, [1.0, 0.78, 0.16]],
      [-16, 1.3, 18, 3.5, 2.6, 3.5, [1.0, 0.78, 0.16]],
      [16, 1.3, 18, 3.5, 2.6, 3.5, [1.0, 0.78, 0.16]],
      // Overhead catwalks on flanks
      [-24, 3.6, 0, 6, 0.7, 26, [0.26, 0.3, 0.42], 0],
      [24, 3.6, 0, 6, 0.7, 26, [0.26, 0.3, 0.42], 0],
    ];
    barriers.forEach((b) => {
      blocks.push(box(b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7] !== undefined ? b[7] : 0));
    });

    return {
      id: 'neon',
      name: 'Neon Paintball',
      subtitle: 'Fast-Paced Competitive Synth Arena',
      skyTop: [0.05, 0.06, 0.16],
      skyHorizon: [0.22, 0.12, 0.34],
      fogColor: [0.15, 0.1, 0.25],
      fogDensity: 0.007,
      voidY: -12,
      blocks,
      props: [
        // Neon energy crystals in the 4 outer corners
        { m: 'crystal', x: -27.5, y: 0, z: -27.5, tint: [0.1, 0.85, 1.0] },
        { m: 'crystal', x: 27.5, y: 0, z: -27.5, tint: [0.1, 0.85, 1.0] },
        { m: 'crystal', x: -27.5, y: 0, z: 27.5, tint: [1.0, 0.25, 0.6] },
        { m: 'crystal', x: 27.5, y: 0, z: 27.5, tint: [1.0, 0.25, 0.6] },
        // Shootable explosive hazard barrels (including chain-reaction flank pairs!)
        { m: 'barrel', x: -6.2, y: 0, z: -9 },
        { m: 'barrel', x: 6.2, y: 0, z: 9 },
        { m: 'barrel', x: -15.5, y: 0, z: -1.8 },
        { m: 'barrel', x: -15.5, y: 0, z: 1.8 },
        { m: 'barrel', x: 15.5, y: 0, z: -1.8 },
        { m: 'barrel', x: 15.5, y: 0, z: 1.8 },
      ],
      jumpPads: [
        { x: -24, y: 0.15, z: -17, r: 1.5, boostY: 15.0, boostX: 0, boostZ: 4.0 },
        { x: 24, y: 0.15, z: 17, r: 1.5, boostY: 15.0, boostX: 0, boostZ: -4.0 },
        { x: -24, y: 0.15, z: 17, r: 1.5, boostY: 15.0, boostX: 0, boostZ: -4.0 },
        { x: 24, y: 0.15, z: -17, r: 1.5, boostY: 15.0, boostX: 0, boostZ: 4.0 },
      ],
      pickups: [
        { id: 'n1', type: 'shield', x: 0, y: 3.1, z: 0 },
        { id: 'n2', type: 'health', x: -24, y: 4.9, z: 0 },
        { id: 'n3', type: 'health', x: 24, y: 4.9, z: 0 },
        { id: 'n4', type: 'speed', x: -11, y: 1.1, z: 0 },
        { id: 'n5', type: 'speed', x: 11, y: 1.1, z: 0 },
      ],
      kothZone: { x: 0, y: 2.15, z: 0, radius: 4.8 },
      spawns: {
        blue: [
          { x: -8, y: 0.2, z: -25, yaw: Math.PI },
          { x: 8, y: 0.2, z: -25, yaw: Math.PI },
          { x: 0, y: 0.2, z: -26, yaw: Math.PI },
          { x: -20, y: 0.2, z: -25, yaw: Math.PI },
          { x: 20, y: 0.2, z: -25, yaw: Math.PI },
        ],
        red: [
          { x: -8, y: 0.2, z: 25, yaw: 0 },
          { x: 8, y: 0.2, z: 25, yaw: 0 },
          { x: 0, y: 0.2, z: 26, yaw: 0 },
          { x: -20, y: 0.2, z: 25, yaw: 0 },
          { x: 20, y: 0.2, z: 25, yaw: 0 },
        ],
        ffa: [
          { x: -22, y: 0.2, z: -24, yaw: Math.PI * 0.75 },
          { x: 22, y: 0.2, z: -24, yaw: -Math.PI * 0.75 },
          { x: -22, y: 0.2, z: 24, yaw: Math.PI * 0.25 },
          { x: 22, y: 0.2, z: 24, yaw: -Math.PI * 0.25 },
          { x: 0, y: 0.2, z: -25, yaw: Math.PI },
          { x: 0, y: 0.2, z: 25, yaw: 0 },
          { x: -24, y: 4.1, z: 0, yaw: Math.PI * 0.5 },
          { x: 24, y: 4.1, z: 0, yaw: -Math.PI * 0.5 },
        ],
      },
      waypoints: [
        { x: 0, y: 2.2, z: 0 },
        { x: -11, y: 0.2, z: 0 },
        { x: 11, y: 0.2, z: 0 },
        { x: 0, y: 0.2, z: -13 },
        { x: 0, y: 0.2, z: 13 },
        { x: -16, y: 0.2, z: -12 },
        { x: 16, y: 0.2, z: 12 },
        { x: 16, y: 0.2, z: -12 },
        { x: -16, y: 0.2, z: 12 },
        { x: -24, y: 4.1, z: 0 },
        { x: 24, y: 4.1, z: 0 },
      ],
    };
  }

  function buildSkybloxMap() {
    const blocks = [];
    // Floating islands! Watch the void below!
    // Center Main Island
    blocks.push(box(0, -1.5, 0, 22, 3, 22, [0.34, 0.74, 0.36], 0));
    blocks.push(box(0, -4.0, 0, 17, 2.2, 17, [0.55, 0.42, 0.28], 0));
    // Center Obelisk + Cover
    blocks.push(box(0, 3.0, 0, 2.6, 6.0, 2.6, [0.95, 0.78, 0.22], 0));
    blocks.push(box(0, 6.6, 0, 1.8, 1.6, 1.8, [0.22, 0.92, 1.0], 2, 1.0));
    blocks.push(box(-6, 1.0, -6, 3.2, 2.0, 1.6, [0.85, 0.58, 0.3], 1));
    blocks.push(box(6, 1.0, 6, 3.2, 2.0, 1.6, [0.85, 0.58, 0.3], 1));
    blocks.push(box(6, 1.0, -6, 1.6, 2.0, 3.2, [0.85, 0.58, 0.3], 1));
    blocks.push(box(-6, 1.0, 6, 1.6, 2.0, 3.2, [0.85, 0.58, 0.3], 1));

    // North Blue Sky Island
    blocks.push(box(0, -1.5, -27, 20, 3, 14, [0.24, 0.58, 0.96], 0));
    blocks.push(box(0, 1.4, -22, 6, 2.8, 1.5, [0.88, 0.92, 0.98], 0));
    blocks.push(box(-7, 1.8, -28, 3, 3.6, 3, [0.18, 0.46, 0.86], 0));
    blocks.push(box(7, 1.8, -28, 3, 3.6, 3, [0.18, 0.46, 0.86], 0));

    // South Red Sky Island
    blocks.push(box(0, -1.5, 27, 20, 3, 14, [0.94, 0.28, 0.34], 0));
    blocks.push(box(0, 1.4, 22, 6, 2.8, 1.5, [0.88, 0.92, 0.98], 0));
    blocks.push(box(-7, 1.8, 28, 3, 3.6, 3, [0.82, 0.2, 0.24], 0));
    blocks.push(box(7, 1.8, 28, 3, 3.6, 3, [0.82, 0.2, 0.24], 0));

    // West & East Side Islands
    blocks.push(box(-24, -0.5, 0, 12, 3, 14, [0.96, 0.74, 0.24], 0));
    blocks.push(box(-24, 2.2, 0, 2.5, 2.4, 5, [0.86, 0.58, 0.24], 1));
    blocks.push(box(24, -0.5, 0, 12, 3, 14, [0.64, 0.36, 0.92], 0));
    blocks.push(box(24, 2.2, 0, 2.5, 2.4, 5, [0.54, 0.28, 0.82], 1));

    // Wide sturdy sky bridges (so bots & players traverse smoothly!)
    blocks.push(box(0, -0.4, -15.5, 6.2, 0.8, 10, [0.82, 0.85, 0.9], 3));
    blocks.push(box(0, -0.4, 15.5, 6.2, 0.8, 10, [0.82, 0.85, 0.9], 3));
    blocks.push(box(-14.5, 0.0, 0, 8, 0.8, 5.5, [0.82, 0.85, 0.9], 3));
    blocks.push(box(14.5, 0.0, 0, 8, 0.8, 5.5, [0.82, 0.85, 0.9], 3));

    return {
      id: 'skyblox',
      name: 'Skyblox Islands',
      subtitle: 'Floating Fortresses & High-Flying Jump Pads',
      skyTop: [0.1, 0.44, 0.92],
      skyHorizon: [0.85, 0.94, 1.0],
      fogColor: [0.78, 0.9, 1.0],
      fogDensity: 0.004,
      voidY: -10,
      blocks,
      props: [
        // Trees on West/East islands (top y=1.0) and Center Island corners (top y=0)
        { m: 'tree', x: -28.5, y: 1.0, z: -5.5 },
        { m: 'tree', x: -28.5, y: 1.0, z: 5.5 },
        { m: 'tree', x: 28.5, y: 1.0, z: -5.5 },
        { m: 'tree', x: 28.5, y: 1.0, z: 5.5 },
        { m: 'tree', x: -9.5, y: 0, z: -9.5 },
        { m: 'tree', x: 9.5, y: 0, z: -9.5 },
        { m: 'tree', x: -9.5, y: 0, z: 9.5 },
        { m: 'tree', x: 9.5, y: 0, z: 9.5 },
        // Pines on North/South team islands (top y=0)
        { m: 'pine', x: 9, y: 0, z: -33 },
        { m: 'pine', x: -9, y: 0, z: -33 },
        { m: 'pine', x: 9, y: 0, z: 33 },
        { m: 'pine', x: -9, y: 0, z: 33 },
        // Shootable explosive hazard barrels on Skyblox platforms
        { m: 'barrel', x: -7.5, y: 0, z: -3.2 },
        { m: 'barrel', x: 7.5, y: 0, z: 3.2 },
        { m: 'barrel', x: -20.5, y: 1.0, z: -3.2 },
        { m: 'barrel', x: 20.5, y: 1.0, z: 3.2 },
        // Decorative rocky island undersides (no collider)
        { m: 'rock', x: 0, y: -6.5, z: 0, s: 2.2 },
        { m: 'rock', x: 0, y: -4.5, z: -27, s: 1.6 },
        { m: 'rock', x: 0, y: -4.5, z: 27, s: 1.6 },
        { m: 'rock', x: -24, y: -3.5, z: 0, s: 1.3 },
        { m: 'rock', x: 24, y: -3.5, z: 0, s: 1.3 },
      ],
      jumpPads: [
        // Old boosts (±5.5, ±7.5) dropped every launch into the void gap; these land on the center island.
        { x: -7, y: 0.1, z: -21, r: 1.5, boostY: 14.5, boostX: -1, boostZ: 14 },
        { x: 7, y: 0.1, z: -21, r: 1.5, boostY: 14.5, boostX: 1, boostZ: 14 },
        { x: -7, y: 0.1, z: 21, r: 1.5, boostY: 14.5, boostX: -1, boostZ: -14 },
        { x: 7, y: 0.1, z: 21, r: 1.5, boostY: 14.5, boostX: 1, boostZ: -14 },
      ],
      pickups: [
        { id: 's1', type: 'shield', x: -24, y: 2.1, z: -4.5 },
        { id: 's2', type: 'shield', x: 24, y: 2.1, z: 4.5 },
        { id: 's3', type: 'health', x: -24, y: 2.1, z: 4.5 },
        { id: 's4', type: 'health', x: 24, y: 2.1, z: -4.5 },
        { id: 's5', type: 'speed', x: 0, y: 1.1, z: -8 },
        { id: 's6', type: 'speed', x: 0, y: 1.1, z: 8 },
      ],
      kothZone: { x: 0, y: 0.1, z: 0, radius: 5.5 },
      spawns: {
        blue: [
          { x: -4, y: 0.2, z: -30, yaw: Math.PI },
          { x: 4, y: 0.2, z: -30, yaw: Math.PI },
          { x: 0, y: 0.2, z: -31, yaw: Math.PI },
          { x: -6, y: 0.2, z: -25, yaw: Math.PI },
          { x: 6, y: 0.2, z: -25, yaw: Math.PI },
        ],
        red: [
          { x: -4, y: 0.2, z: 30, yaw: 0 },
          { x: 4, y: 0.2, z: 30, yaw: 0 },
          { x: 0, y: 0.2, z: 31, yaw: 0 },
          { x: -6, y: 0.2, z: 25, yaw: 0 },
          { x: 6, y: 0.2, z: 25, yaw: 0 },
        ],
        ffa: [
          { x: 0, y: 0.2, z: -30, yaw: Math.PI },
          { x: 0, y: 0.2, z: 30, yaw: 0 },
          { x: -22, y: 1.2, z: 0, yaw: Math.PI * 0.5 }, // moved off the side-island crates
          { x: 22, y: 1.2, z: 0, yaw: -Math.PI * 0.5 },
          { x: -7, y: 0.2, z: -24, yaw: Math.PI },
          { x: 7, y: 0.2, z: 24, yaw: 0 },
          { x: -5.6, y: 0.2, z: 8.4, yaw: Math.PI * 0.25 }, // moved out of central cover
          { x: 5.6, y: 0.2, z: -8.4, yaw: -Math.PI * 0.75 },
        ],
      },
      waypoints: [
        { x: 0, y: 0.2, z: -5 },
        { x: 0, y: 0.2, z: 5 },
        { x: -5, y: 0.2, z: 0 },
        { x: 5, y: 0.2, z: 0 },
        { x: 0, y: 0.2, z: -15 },
        { x: 0, y: 0.2, z: 15 },
        { x: 0, y: 0.2, z: -25 },
        { x: 0, y: 0.2, z: 25 },
        { x: -15, y: 0.6, z: 0 },
        { x: 15, y: 0.6, z: 0 },
        { x: -24, y: 1.2, z: 0 },
        { x: 24, y: 1.2, z: 0 },
      ],
    };
  }

  BS.MAPS = {
    crossroads: buildCrossroadsMap(),
    neon: buildNeonPaintballMap(),
    skyblox: buildSkybloxMap(),
  };
})(window);
