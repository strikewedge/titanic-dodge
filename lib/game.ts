// ============================================================
// Titanic Iceberg Dodge - Game Engine
// ============================================================

// ----- Types -----

export type Difficulty = "easy" | "medium" | "hard";
export type GameState = "title" | "playing" | "gameover";

interface DifficultyConfig {
  baseSpeed: number;
  speedRamp: number; // added per 10 points
  spawnIntervalStart: number; // ms
  spawnIntervalMin: number; // ms
  icebergSizeMin: number;
  icebergSizeMax: number;
  lifeJacketFreqMin: number;
  lifeJacketFreqMax: number;
}

const DIFFICULTY_CONFIGS: Record<Difficulty, DifficultyConfig> = {
  easy: {
    baseSpeed: 1.5,
    speedRamp: 0.05,
    spawnIntervalStart: 1800,
    spawnIntervalMin: 700,
    icebergSizeMin: 30,
    icebergSizeMax: 50,
    lifeJacketFreqMin: 15,
    lifeJacketFreqMax: 20,
  },
  medium: {
    baseSpeed: 2.0,
    speedRamp: 0.08,
    spawnIntervalStart: 1400,
    spawnIntervalMin: 500,
    icebergSizeMin: 35,
    icebergSizeMax: 60,
    lifeJacketFreqMin: 20,
    lifeJacketFreqMax: 25,
  },
  hard: {
    baseSpeed: 2.5,
    speedRamp: 0.12,
    spawnIntervalStart: 1000,
    spawnIntervalMin: 350,
    icebergSizeMin: 40,
    icebergSizeMax: 70,
    lifeJacketFreqMin: 25,
    lifeJacketFreqMax: 30,
  },
};

// ----- Iceberg polygon templates -----

// Each template is an array of [x, y] offsets relative to center, normalized to -1..1
const ICEBERG_TEMPLATES: [number, number][][] = [
  // Jagged irregular shape 1
  [
    [0, -1],
    [0.7, -0.5],
    [1, 0.1],
    [0.6, 0.7],
    [0.1, 1],
    [-0.5, 0.8],
    [-1, 0.2],
    [-0.8, -0.4],
  ],
  // Jagged irregular shape 2
  [
    [-0.2, -1],
    [0.4, -0.8],
    [1, -0.2],
    [0.8, 0.5],
    [0.3, 1],
    [-0.4, 0.9],
    [-1, 0.3],
    [-0.7, -0.6],
  ],
  // Rounder shape
  [
    [0, -1],
    [0.6, -0.7],
    [1, -0.1],
    [0.9, 0.5],
    [0.5, 1],
    [-0.3, 0.9],
    [-0.9, 0.4],
    [-1, -0.2],
    [-0.5, -0.8],
  ],
  // Pointy shape
  [
    [0.1, -1],
    [0.8, -0.3],
    [0.7, 0.6],
    [0, 1],
    [-0.6, 0.7],
    [-1, 0],
    [-0.6, -0.7],
  ],
];

// ----- Smoke particles -----

interface SmokeParticle {
  x: number;
  y: number;
  vy: number;
  alpha: number;
  radius: number;
}

// ----- Game objects -----

interface GameObject {
  x: number;
  y: number;
  size: number;
  vx: number; // lateral drift
  vy: number;
  type: "iceberg" | "lifejacket";
  templateIdx: number; // for icebergs
  scored: boolean;
}

// ----- Wave lines -----

interface WaveLine {
  yOffset: number;
  amplitude: number;
  frequency: number;
  phase: number;
  alpha: number;
}

// ----- Main Game class -----

export class Game {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  dpr: number;

  state: GameState = "title";
  difficulty: Difficulty = "medium";
  score = 0;
  lives = 3;
  maxLives = 5;

  // Ship
  shipX = 0;
  shipY = 0;
  shipWidth = 0;
  shipHeight = 0;

  // Invincibility
  invincible = false;
  invincibleTimer = 0;
  flashRedTimer = 0;

  // Life jacket collect flash
  collectFlashTimer = 0;

  // Objects
  objects: GameObject[] = [];
  spawnTimer = 0;
  objectCount = 0; // total spawned, used for life jacket frequency
  nextLifeJacketAt = 0; // spawn count at which next life jacket appears

  // Smoke
  smokeParticles: SmokeParticle[] = [];

  // Waves
  waveLines: WaveLine[] = [];
  waveScroll = 0;

  // Ocean foam dots
  foamDots: { x: number; y: number; alpha: number }[] = [];

  // Input
  shipTargetX = 0;
  tiltAvailable = false;
  tiltCalibrated = false;
  tiltBase = 0; // base gamma when game starts
  touchStartX = 0;
  touchShipStartX = 0;
  isTouching = false;

  // Timing
  lastTime = 0;
  config!: DifficultyConfig;

  // High scores
  highScores: Record<Difficulty, number> = { easy: 0, medium: 0, hard: 0 };

  // Callbacks
  onStateChange?: (state: GameState) => void;

  // Screen dimensions (logical)
  w = 0;
  h = 0;

  // Title screen animation
  titleIcebergs: { x: number; y: number; size: number; speed: number; templateIdx: number }[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.loadHighScores();
    this.resize();
    this.initWaves();
    this.initFoamDots();
    this.initTitleIcebergs();
  }

  // ----- Resize -----

  resize() {
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = this.w * this.dpr;
    this.canvas.height = this.h * this.dpr;
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    this.shipWidth = this.w * 0.15;
    this.shipHeight = this.shipWidth * 2.8;
    this.shipY = this.h - this.h * 0.15;

    if (this.state === "title") {
      this.shipX = this.w / 2;
      this.shipTargetX = this.w / 2;
    }
  }

  // ----- Waves -----

  initWaves() {
    this.waveLines = [];
    for (let i = 0; i < 3; i++) {
      this.waveLines.push({
        yOffset: Math.random() * this.h,
        amplitude: 15 + Math.random() * 20,
        frequency: 0.005 + Math.random() * 0.005,
        phase: Math.random() * Math.PI * 2,
        alpha: 0.06 + Math.random() * 0.06,
      });
    }
  }

  // ----- Foam dots -----

  initFoamDots() {
    this.foamDots = [];
    const count = Math.floor((this.w * this.h) / 8000);
    for (let i = 0; i < count; i++) {
      this.foamDots.push({
        x: Math.random() * this.w,
        y: Math.random() * this.h,
        alpha: 0.15 + Math.random() * 0.25,
      });
    }
  }

  // ----- Title icebergs (background decoration) -----

  initTitleIcebergs() {
    this.titleIcebergs = [];
    for (let i = 0; i < 6; i++) {
      this.titleIcebergs.push({
        x: Math.random() * this.w,
        y: Math.random() * this.h,
        size: 25 + Math.random() * 35,
        speed: 0.3 + Math.random() * 0.5,
        templateIdx: Math.floor(Math.random() * ICEBERG_TEMPLATES.length),
      });
    }
  }

  // ----- High scores -----

  loadHighScores() {
    try {
      const stored = localStorage.getItem("titanic-highscores");
      if (stored) {
        this.highScores = JSON.parse(stored);
      }
    } catch {}
  }

  saveHighScores() {
    try {
      localStorage.setItem(
        "titanic-highscores",
        JSON.stringify(this.highScores)
      );
    } catch {}
  }

  // ----- Start game -----

  startGame(difficulty: Difficulty) {
    this.difficulty = difficulty;
    this.config = DIFFICULTY_CONFIGS[difficulty];
    this.score = 0;
    this.lives = 3;
    this.objects = [];
    this.smokeParticles = [];
    this.spawnTimer = 0;
    this.objectCount = 0;
    this.invincible = false;
    this.invincibleTimer = 0;
    this.flashRedTimer = 0;
    this.collectFlashTimer = 0;
    this.shipX = this.w / 2;
    this.shipTargetX = this.w / 2;
    this.tiltCalibrated = false;
    this.setNextLifeJacket();
    this.state = "playing";
    this.onStateChange?.("playing");
  }

  setNextLifeJacket() {
    const { lifeJacketFreqMin, lifeJacketFreqMax } = this.config;
    this.nextLifeJacketAt =
      this.objectCount +
      lifeJacketFreqMin +
      Math.floor(Math.random() * (lifeJacketFreqMax - lifeJacketFreqMin + 1));
  }

  // ----- Speed / spawn calculations -----

  getCurrentSpeed(): number {
    const ramps = Math.floor(this.score / 10);
    return this.config.baseSpeed + ramps * this.config.speedRamp;
  }

  getCurrentSpawnInterval(): number {
    const ramps = Math.floor(this.score / 10);
    const reduction = ramps * 50;
    return Math.max(
      this.config.spawnIntervalMin,
      this.config.spawnIntervalStart - reduction
    );
  }

  // ----- Spawn -----

  spawnObject() {
    const isLifeJacket = this.objectCount >= this.nextLifeJacketAt;
    const sizeMin = this.config.icebergSizeMin;
    const sizeMax = this.config.icebergSizeMax;
    const size = sizeMin + Math.random() * (sizeMax - sizeMin);
    const padding = size / 2 + 10;
    const x = padding + Math.random() * (this.w - 2 * padding);

    // 40% of icebergs get lateral drift
    let vx = 0;
    if (!isLifeJacket && Math.random() < 0.4) {
      vx = (Math.random() - 0.5) * 0.6; // -0.3 to 0.3
    }

    this.objects.push({
      x,
      y: -size,
      size,
      vx,
      vy: this.getCurrentSpeed(),
      type: isLifeJacket ? "lifejacket" : "iceberg",
      templateIdx: Math.floor(Math.random() * ICEBERG_TEMPLATES.length),
      scored: false,
    });

    this.objectCount++;
    if (isLifeJacket) {
      this.setNextLifeJacket();
    }
  }

  // ----- Input handlers -----

  handleTilt(gamma: number) {
    if (!this.tiltCalibrated) {
      this.tiltBase = gamma;
      this.tiltCalibrated = true;
    }
    const adjusted = gamma - this.tiltBase;
    // Map tilt angle to ship position. ~30 degrees = full width
    const normalized = Math.max(-1, Math.min(1, adjusted / 30));
    this.shipTargetX = this.w / 2 + normalized * (this.w / 2 - 10);
    this.tiltAvailable = true;
  }

  handleTouchStart(x: number) {
    this.isTouching = true;
    this.touchStartX = x;
    this.touchShipStartX = this.shipX;
  }

  handleTouchMove(x: number) {
    if (!this.isTouching) return;
    const dx = x - this.touchStartX;
    this.shipTargetX = this.touchShipStartX + dx;
  }

  handleTouchEnd() {
    this.isTouching = false;
  }

  handleKeyboard(key: string) {
    if (this.state !== "playing") return;
    const speed = 12;
    if (key === "ArrowLeft") {
      this.shipTargetX = this.shipX - speed;
    } else if (key === "ArrowRight") {
      this.shipTargetX = this.shipX + speed;
    }
  }

  // ----- Collision -----

  checkCollision(obj: GameObject): boolean {
    // Use circular hitbox, slightly smaller than visual for forgiveness
    const shipCenterX = this.shipX;
    const shipCenterY = this.shipY - this.shipHeight * 0.35;
    const shipRadius = this.shipWidth * 0.35;
    const objRadius = obj.size * 0.35;

    const dx = shipCenterX - obj.x;
    const dy = shipCenterY - obj.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    return dist < shipRadius + objRadius;
  }

  // ----- Update -----

  update(dt: number) {
    if (this.state === "title") {
      this.updateTitle(dt);
      return;
    }
    if (this.state !== "playing") return;

    // Move ship toward target
    const shipPadding = this.shipWidth / 2 + 10;
    this.shipTargetX = Math.max(
      shipPadding,
      Math.min(this.w - shipPadding, this.shipTargetX)
    );
    // Smooth interpolation
    this.shipX += (this.shipTargetX - this.shipX) * 0.15;
    this.shipX = Math.max(
      shipPadding,
      Math.min(this.w - shipPadding, this.shipX)
    );

    // Timers
    if (this.invincible) {
      this.invincibleTimer -= dt;
      if (this.invincibleTimer <= 0) {
        this.invincible = false;
      }
    }
    if (this.flashRedTimer > 0) this.flashRedTimer -= dt;
    if (this.collectFlashTimer > 0) this.collectFlashTimer -= dt;

    // Spawn
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnObject();
      this.spawnTimer = this.getCurrentSpawnInterval();
    }

    // Update objects
    const currentSpeed = this.getCurrentSpeed();
    for (let i = this.objects.length - 1; i >= 0; i--) {
      const obj = this.objects[i];
      obj.vy = currentSpeed;
      obj.y += obj.vy * (dt / 16.67); // normalize to ~60fps
      obj.x += obj.vx * (dt / 16.67);

      // Check if passed ship
      if (!obj.scored && obj.y > this.shipY + this.shipHeight / 2) {
        if (obj.type === "iceberg") {
          obj.scored = true;
          this.score++;
        }
      }

      // Remove if off screen
      if (obj.y > this.h + obj.size) {
        this.objects.splice(i, 1);
        continue;
      }

      // Collision check
      if (this.checkCollision(obj)) {
        if (obj.type === "lifejacket") {
          // Collect life jacket
          this.lives = Math.min(this.maxLives, this.lives + 1);
          this.collectFlashTimer = 300;
          this.objects.splice(i, 1);
        } else if (!this.invincible) {
          // Hit iceberg
          this.lives--;
          this.invincible = true;
          this.invincibleTimer = 1500;
          this.flashRedTimer = 200;
          this.objects.splice(i, 1);

          if (this.lives <= 0) {
            this.gameOver();
            return;
          }
        }
      }
    }

    // Update smoke
    this.updateSmoke(dt);

    // Update waves
    this.waveScroll += currentSpeed * 0.3 * (dt / 16.67);
    for (const wave of this.waveLines) {
      wave.phase += 0.008 * (dt / 16.67);
    }

    // Update foam
    for (const dot of this.foamDots) {
      dot.y += currentSpeed * 0.15 * (dt / 16.67);
      if (dot.y > this.h + 5) {
        dot.y = -5;
        dot.x = Math.random() * this.w;
      }
    }
  }

  updateTitle(dt: number) {
    // Scroll waves and title icebergs
    this.waveScroll += 0.5 * (dt / 16.67);
    for (const wave of this.waveLines) {
      wave.phase += 0.005 * (dt / 16.67);
    }
    for (const dot of this.foamDots) {
      dot.y += 0.2 * (dt / 16.67);
      if (dot.y > this.h + 5) {
        dot.y = -5;
        dot.x = Math.random() * this.w;
      }
    }
    for (const ib of this.titleIcebergs) {
      ib.y += ib.speed * (dt / 16.67);
      if (ib.y > this.h + ib.size) {
        ib.y = -ib.size;
        ib.x = Math.random() * this.w;
      }
    }
  }

  updateSmoke(dt: number) {
    // Spawn smoke from funnels
    const funnelOffsets = [-this.shipWidth * 0.12, this.shipWidth * 0.12];
    for (const fx of funnelOffsets) {
      if (Math.random() < 0.3) {
        this.smokeParticles.push({
          x: this.shipX + fx + (Math.random() - 0.5) * 3,
          y: this.shipY - this.shipHeight * 0.55,
          vy: -(0.3 + Math.random() * 0.4),
          alpha: 0.4 + Math.random() * 0.2,
          radius: 2 + Math.random() * 3,
        });
      }
    }

    // Update particles
    for (let i = this.smokeParticles.length - 1; i >= 0; i--) {
      const p = this.smokeParticles[i];
      p.y += p.vy * (dt / 16.67);
      p.x += (Math.random() - 0.5) * 0.5;
      p.alpha -= 0.008 * (dt / 16.67);
      p.radius += 0.03 * (dt / 16.67);
      if (p.alpha <= 0) {
        this.smokeParticles.splice(i, 1);
      }
    }
  }

  // ----- Game over -----

  gameOver() {
    this.state = "gameover";
    if (this.score > this.highScores[this.difficulty]) {
      this.highScores[this.difficulty] = this.score;
      this.saveHighScores();
    }
    this.onStateChange?.("gameover");
  }

  goToTitle() {
    this.state = "title";
    this.initTitleIcebergs();
    this.shipX = this.w / 2;
    this.onStateChange?.("title");
  }

  // ----- Draw -----

  draw() {
    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);

    // Ocean background
    ctx.fillStyle = "#0A1628";
    ctx.fillRect(0, 0, w, h);

    // Foam dots
    for (const dot of this.foamDots) {
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, 1.2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${dot.alpha})`;
      ctx.fill();
    }

    // Wave lines
    this.drawWaves();

    if (this.state === "title") {
      this.drawTitle();
      return;
    }

    // Flash red overlay
    if (this.flashRedTimer > 0) {
      ctx.fillStyle = `rgba(255, 0, 0, ${0.3 * (this.flashRedTimer / 200)})`;
      ctx.fillRect(0, 0, w, h);
    }

    // Collect flash overlay
    if (this.collectFlashTimer > 0) {
      ctx.fillStyle = `rgba(232, 105, 42, ${0.2 * (this.collectFlashTimer / 300)})`;
      ctx.fillRect(0, 0, w, h);
    }

    // Objects
    for (const obj of this.objects) {
      if (obj.type === "iceberg") {
        this.drawIceberg(obj.x, obj.y, obj.size, obj.templateIdx);
      } else {
        this.drawLifeJacket(obj.x, obj.y, obj.size);
      }
    }

    // Smoke
    for (const p of this.smokeParticles) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(160, 160, 170, ${p.alpha})`;
      ctx.fill();
    }

    // Ship
    if (!this.invincible || Math.floor(Date.now() / 100) % 2 === 0) {
      this.drawShip(this.shipX, this.shipY);
    }

    // HUD
    this.drawHUD();

    // Game over overlay
    if (this.state === "gameover") {
      this.drawGameOver();
    }
  }

  // ----- Draw helpers -----

  drawWaves() {
    const { ctx, w, h } = this;
    for (const wave of this.waveLines) {
      ctx.beginPath();
      const yBase =
        ((wave.yOffset + this.waveScroll) % (h + 100)) - 50;
      for (let x = 0; x <= w; x += 4) {
        const y =
          yBase + Math.sin(x * wave.frequency + wave.phase) * wave.amplitude;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `rgba(100, 150, 200, ${wave.alpha})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  drawShip(x: number, y: number) {
    const { ctx } = this;
    const sw = this.shipWidth;
    const sh = this.shipHeight;

    ctx.save();
    ctx.translate(x, y);

    // Hull - tapered shape, bow pointing up
    ctx.beginPath();
    ctx.moveTo(0, -sh * 0.5); // bow tip
    ctx.lineTo(sw * 0.35, -sh * 0.15);
    ctx.lineTo(sw * 0.4, sh * 0.15);
    ctx.lineTo(sw * 0.35, sh * 0.35);
    ctx.quadraticCurveTo(sw * 0.2, sh * 0.5, 0, sh * 0.5); // stern curve
    ctx.quadraticCurveTo(-sw * 0.2, sh * 0.5, -sw * 0.35, sh * 0.35);
    ctx.lineTo(-sw * 0.4, sh * 0.15);
    ctx.lineTo(-sw * 0.35, -sh * 0.15);
    ctx.closePath();

    // Hull fill
    ctx.fillStyle = "#F0E6D3";
    ctx.fill();
    ctx.strokeStyle = "#8B8070";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Deck area (slightly inset)
    ctx.beginPath();
    ctx.moveTo(0, -sh * 0.38);
    ctx.lineTo(sw * 0.25, -sh * 0.1);
    ctx.lineTo(sw * 0.28, sh * 0.12);
    ctx.lineTo(sw * 0.22, sh * 0.28);
    ctx.quadraticCurveTo(sw * 0.1, sh * 0.38, 0, sh * 0.38);
    ctx.quadraticCurveTo(-sw * 0.1, sh * 0.38, -sw * 0.22, sh * 0.28);
    ctx.lineTo(-sw * 0.28, sh * 0.12);
    ctx.lineTo(-sw * 0.25, -sh * 0.1);
    ctx.closePath();
    ctx.fillStyle = "#D4C8B5";
    ctx.fill();

    // Deck lines
    ctx.strokeStyle = "rgba(139, 128, 112, 0.4)";
    ctx.lineWidth = 0.8;
    for (let i = -2; i <= 3; i++) {
      const ly = sh * 0.07 * i;
      const lw = sw * 0.2 * (1 - Math.abs(i) * 0.12);
      ctx.beginPath();
      ctx.moveTo(-lw, ly);
      ctx.lineTo(lw, ly);
      ctx.stroke();
    }

    // Funnels (smokestacks)
    const funnelW = sw * 0.08;
    const funnelH = sw * 0.14;
    const funnelOffsets = [-sw * 0.12, sw * 0.12];
    for (const fx of funnelOffsets) {
      // Funnel body
      ctx.fillStyle = "#C45B3A";
      ctx.fillRect(
        fx - funnelW / 2,
        -sh * 0.32 - funnelH,
        funnelW,
        funnelH
      );
      // Funnel top (black band)
      ctx.fillStyle = "#2A2A2A";
      ctx.fillRect(
        fx - funnelW / 2,
        -sh * 0.32 - funnelH,
        funnelW,
        funnelH * 0.25
      );
    }

    ctx.restore();
  }

  drawIceberg(x: number, y: number, size: number, templateIdx: number) {
    const { ctx } = this;
    const template = ICEBERG_TEMPLATES[templateIdx % ICEBERG_TEMPLATES.length];
    const half = size / 2;

    ctx.save();
    ctx.translate(x, y);

    // Main shape
    ctx.beginPath();
    for (let i = 0; i < template.length; i++) {
      const px = template[i][0] * half;
      const py = template[i][1] * half;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = "#E8EFF5";
    ctx.fill();
    ctx.strokeStyle = "rgba(180, 212, 231, 0.8)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Shading on one side
    ctx.beginPath();
    const mid = Math.floor(template.length / 2);
    ctx.moveTo(0, 0);
    for (let i = 0; i <= mid; i++) {
      const px = template[i][0] * half;
      const py = template[i][1] * half;
      ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = "rgba(180, 212, 231, 0.35)";
    ctx.fill();

    ctx.restore();
  }

  drawLifeJacket(x: number, y: number, size: number) {
    const { ctx } = this;
    const radius = size * 0.4;
    const innerRadius = radius * 0.55;
    const pulse = 1 + Math.sin(Date.now() * 0.006) * 0.08;

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(pulse, pulse);

    // Glow
    ctx.beginPath();
    ctx.arc(0, 0, radius * 1.4, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(232, 105, 42, 0.15)";
    ctx.fill();

    // Outer ring
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fillStyle = "#E8692A";
    ctx.fill();

    // Inner cutout
    ctx.beginPath();
    ctx.arc(0, 0, innerRadius, 0, Math.PI * 2);
    ctx.fillStyle = "#0A1628";
    ctx.fill();

    // White stripe segments (4 quarter segments)
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2 + Math.PI / 4;
      ctx.beginPath();
      ctx.arc(0, 0, radius, angle - 0.3, angle + 0.3);
      ctx.arc(0, 0, innerRadius, angle + 0.3, angle - 0.3, true);
      ctx.closePath();
      ctx.fillStyle = "#FFFFFF";
      ctx.fill();
    }

    ctx.restore();
  }

  drawHUD() {
    const { ctx, w } = this;

    // Score - top center
    ctx.font = "bold 28px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
    ctx.fillText(`${this.score}`, w / 2 + 1, 43);
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(`${this.score}`, w / 2, 42);

    // Lives - top left as small ship icons
    const lifeSize = 12;
    for (let i = 0; i < this.lives; i++) {
      const lx = 20 + i * (lifeSize + 8);
      const ly = 36;
      this.drawMiniShip(lx, ly, lifeSize);
    }

    // Difficulty - top right
    ctx.font = "14px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    const label =
      this.difficulty.charAt(0).toUpperCase() + this.difficulty.slice(1);
    ctx.fillText(label, w - 16, 40);
  }

  drawMiniShip(x: number, y: number, size: number) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(x, y);

    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(size * 0.6, 0);
    ctx.lineTo(size * 0.5, size * 0.6);
    ctx.quadraticCurveTo(0, size, -size * 0.5, size * 0.6);
    ctx.lineTo(-size * 0.6, 0);
    ctx.closePath();
    ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
    ctx.fill();

    ctx.restore();
  }

  drawTitle() {
    const { ctx, w, h } = this;

    // Background icebergs
    for (const ib of this.titleIcebergs) {
      this.drawIceberg(ib.x, ib.y, ib.size, ib.templateIdx);
    }

    // Ship in center-bottom area
    const titleShipX = w / 2;
    const titleShipY = h * 0.72;
    this.drawShip(titleShipX, titleShipY);

    // Darken overlay for readability
    ctx.fillStyle = "rgba(10, 22, 40, 0.4)";
    ctx.fillRect(0, 0, w, h);

    // Title text
    ctx.textAlign = "center";

    // TITANIC
    ctx.font = `bold ${Math.min(w * 0.16, 72)}px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
    ctx.fillText("TITANIC", w / 2 + 2, h * 0.18 + 2);
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText("TITANIC", w / 2, h * 0.18);

    // Subtitle
    ctx.font = `${Math.min(w * 0.04, 16)}px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.fillStyle = "rgba(200, 220, 240, 0.7)";
    ctx.fillText("ICEBERG DODGE", w / 2, h * 0.18 + 30);

    // High score
    const bestDiff = (["easy", "medium", "hard"] as Difficulty[]).reduce(
      (best, d) => (this.highScores[d] > this.highScores[best] ? d : best),
      "easy" as Difficulty
    );
    const bestScore = this.highScores[bestDiff];
    if (bestScore > 0) {
      ctx.font = "16px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillStyle = "rgba(200, 220, 240, 0.6)";
      ctx.fillText(`Best: ${bestScore}`, w / 2, h * 0.18 + 56);
    }

    // Difficulty buttons - drawn later by React overlay
  }

  drawGameOver() {
    const { ctx, w, h } = this;

    // Overlay
    ctx.fillStyle = "rgba(10, 22, 40, 0.75)";
    ctx.fillRect(0, 0, w, h);

    ctx.textAlign = "center";

    // GAME OVER
    ctx.font = `bold ${Math.min(w * 0.12, 52)}px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText("GAME OVER", w / 2, h * 0.32);

    // Score
    ctx.font = `bold ${Math.min(w * 0.08, 36)}px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.fillText(`Score: ${this.score}`, w / 2, h * 0.42);

    // High score
    const hs = this.highScores[this.difficulty];
    ctx.font = "18px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillStyle = "rgba(200, 220, 240, 0.7)";
    if (this.score >= hs && this.score > 0) {
      ctx.fillStyle = "#FFD700";
      ctx.fillText("NEW HIGH SCORE!", w / 2, h * 0.48);
    } else {
      ctx.fillText(`Best: ${hs}`, w / 2, h * 0.48);
    }

    // Buttons drawn by React overlay
  }

  // ----- Main loop -----

  tick = (time: number) => {
    if (this.lastTime === 0) this.lastTime = time;
    const dt = Math.min(time - this.lastTime, 50); // cap dt to prevent spiral
    this.lastTime = time;

    this.update(dt);
    this.draw();

    requestAnimationFrame(this.tick);
  };

  start() {
    this.lastTime = 0;
    requestAnimationFrame(this.tick);
  }
}
