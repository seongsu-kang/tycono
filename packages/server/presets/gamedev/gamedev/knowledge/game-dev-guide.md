---
title: "Game Development Guide"
akb_type: node
status: active
tags: ["game", "gamedev", "canvas", "phaser", "webgl", "engine"]
domain: engineering
---

# Game Development Guide — Technical Reference

> "Pick the right game engine and you're halfway there."

## TL;DR

- **Browser games**: Canvas 2D, Phaser, PixiJS
- **3D/complex games**: Unity, Godot (WebGL export)
- **Core concepts**: Game loop, physics engine, input handling, rendering
- **Optimization**: Maintain 60fps, memory management, asset loading

---

## 1. Tech Stack Selection

### 1.1 Decision Matrix

| Criteria | Vanilla Canvas | Phaser | PixiJS | Unity WebGL |
|----------|---------------|--------|--------|-------------|
| Learning curve | Low | Medium | Medium | High |
| 2D games | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| 3D games | ❌ | ❌ | ❌ | ⭐⭐⭐⭐⭐ |
| Physics engine | DIY | Built-in | Plugin | Built-in |
| File size | Minimal | ~1MB | ~500KB | 10MB+ |
| Community | Large | Large | Medium | Large |

### 1.2 Selection Guide

```
⛔ Library selection principles:
  - For production-quality games, always use a game framework (Phaser/PixiJS)
  - Vanilla Canvas is for learning/prototypes only
  - "Can't use libraries because it needs to run from file://" = wrong conclusion
    → Bundle the library locally in a lib/ folder — works fine from file://
    → e.g., download phaser.min.js → save as lib/phaser.min.js
          <script src="lib/phaser.min.js"></script>

┌─────────────────────────────────────────────────────────┐
│  Vanilla Canvas (prototypes/learning only)              │
├─────────────────────────────────────────────────────────┤
│  - Very simple games (Snake, Pong)                      │
│  - Learning purposes                                    │
│  - ⛔ Not recommended for production — 5-10x worse      │
│    results for the same time investment                  │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  Phaser Recommended                                     │
├─────────────────────────────────────────────────────────┤
│  - 2D arcade/platformer/RPG                             │
│  - Physics engine needed (Arcade Physics, Matter.js)    │
│  - Asset loading, scene management needed               │
│  - Rich tutorials available                             │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  PixiJS Recommended                                     │
├─────────────────────────────────────────────────────────┤
│  - High-performance 2D rendering needed                 │
│  - Many sprites (particles, shooters)                   │
│  - Prefer custom game logic                             │
│  - WebGL optimization needed                            │
└─────────────────────────────────────────────────────────┘
```

---

## 2. Game Loop

### 2.1 Basic Structure

```javascript
// Basic game loop
class Game {
    constructor() {
        this.lastTime = 0;
        this.running = false;
    }

    start() {
        this.running = true;
        requestAnimationFrame((time) => this.loop(time));
    }

    loop(currentTime) {
        if (!this.running) return;

        // Calculate delta time (ms → seconds)
        const deltaTime = (currentTime - this.lastTime) / 1000;
        this.lastTime = currentTime;

        // Game logic order
        this.processInput();      // 1. Handle input
        this.update(deltaTime);   // 2. Update state
        this.render();            // 3. Render screen

        requestAnimationFrame((time) => this.loop(time));
    }

    processInput() {
        // Handle keyboard, mouse, touch input
    }

    update(dt) {
        // Game logic, physics, AI
        // Multiply by dt for frame-independent movement
        player.x += player.speed * dt;
    }

    render() {
        // Draw to screen
        ctx.clearRect(0, 0, width, height);
        // ... draw sprites
    }
}
```

### 2.2 Fixed Timestep

```javascript
// Fixed timestep for physics simulation
const FIXED_TIMESTEP = 1/60; // 60 FPS physics
let accumulator = 0;

function gameLoop(currentTime) {
    const deltaTime = (currentTime - lastTime) / 1000;
    lastTime = currentTime;

    accumulator += deltaTime;

    // Update physics at fixed intervals
    while (accumulator >= FIXED_TIMESTEP) {
        fixedUpdate(FIXED_TIMESTEP);
        accumulator -= FIXED_TIMESTEP;
    }

    // Interpolated rendering with remaining fraction
    const alpha = accumulator / FIXED_TIMESTEP;
    render(alpha);

    requestAnimationFrame(gameLoop);
}
```

---

## 3. Core Systems

### 3.1 Input Handling

```javascript
class InputManager {
    constructor() {
        this.keys = {};
        this.mouse = { x: 0, y: 0, buttons: {} };

        window.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
        });
        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });
        // ... mouse, touch events
    }

    isKeyDown(code) {
        return this.keys[code] === true;
    }

    isKeyPressed(code) {
        // Detect if pressed this frame (single trigger)
        if (this.keys[code] && !this.prevKeys[code]) {
            return true;
        }
        return false;
    }
}

// Usage
if (input.isKeyDown('ArrowRight')) {
    player.x += speed * dt;
}
if (input.isKeyPressed('Space')) {
    player.jump();
}
```

### 3.2 Collision Detection (AABB)

```javascript
// Axis-Aligned Bounding Box collision
function checkCollision(a, b) {
    return (
        a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y
    );
}

// Circle collision
function checkCircleCollision(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return distance < a.radius + b.radius;
}
```

### 3.3 Sprite Animation

```javascript
class AnimatedSprite {
    constructor(spritesheet, frameWidth, frameHeight) {
        this.image = spritesheet;
        this.frameWidth = frameWidth;
        this.frameHeight = frameHeight;
        this.currentFrame = 0;
        this.animationSpeed = 0.1; // Seconds per frame
        this.elapsedTime = 0;
    }

    update(dt) {
        this.elapsedTime += dt;
        if (this.elapsedTime >= this.animationSpeed) {
            this.currentFrame = (this.currentFrame + 1) % this.totalFrames;
            this.elapsedTime = 0;
        }
    }

    draw(ctx, x, y) {
        const sx = this.currentFrame * this.frameWidth;
        ctx.drawImage(
            this.image,
            sx, 0, this.frameWidth, this.frameHeight,
            x, y, this.frameWidth, this.frameHeight
        );
    }
}
```

---

## 4. Physics Engine Basics

### 4.1 Basic Physics

```javascript
class PhysicsBody {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.vx = 0; // Velocity X
        this.vy = 0; // Velocity Y
        this.ax = 0; // Acceleration X
        this.ay = 0; // Acceleration Y
        this.mass = 1;
        this.friction = 0.98;
        this.gravity = 980; // pixels/sec²
    }

    applyForce(fx, fy) {
        this.ax += fx / this.mass;
        this.ay += fy / this.mass;
    }

    update(dt) {
        // Apply gravity
        this.vy += this.gravity * dt;

        // Acceleration → Velocity
        this.vx += this.ax * dt;
        this.vy += this.ay * dt;

        // Friction
        this.vx *= this.friction;
        this.vy *= this.friction;

        // Velocity → Position
        this.x += this.vx * dt;
        this.y += this.vy * dt;

        // Reset acceleration
        this.ax = 0;
        this.ay = 0;
    }
}
```

### 4.2 Platformer Physics

```javascript
class PlatformerPlayer extends PhysicsBody {
    constructor(x, y) {
        super(x, y);
        this.onGround = false;
        this.jumpForce = -500;
        this.moveSpeed = 300;
    }

    update(dt, input, platforms) {
        // Horizontal movement
        if (input.isKeyDown('ArrowLeft')) {
            this.vx = -this.moveSpeed;
        } else if (input.isKeyDown('ArrowRight')) {
            this.vx = this.moveSpeed;
        } else {
            this.vx *= 0.8; // Deceleration
        }

        // Jump (only when grounded)
        if (input.isKeyPressed('Space') && this.onGround) {
            this.vy = this.jumpForce;
            this.onGround = false;
        }

        super.update(dt);

        // Platform collision
        this.onGround = false;
        for (const platform of platforms) {
            if (this.checkPlatformCollision(platform)) {
                this.y = platform.y - this.height;
                this.vy = 0;
                this.onGround = true;
            }
        }
    }
}
```

---

## 5. Performance Optimization

### 5.1 Checklist

**Rendering:**
- [ ] Cache complex elements with offscreen canvas
- [ ] Use requestAnimationFrame (not setInterval)
- [ ] Redraw only changed areas (dirty rectangles)
- [ ] Use sprite sheets (not individual images)

**Logic:**
- [ ] Spatial partitioning (quadtree, grid) for collision detection
- [ ] Object pooling (bullets, particles)
- [ ] Deactivate off-screen objects

**Memory:**
- [ ] Object pool to prevent GC
- [ ] Image preloading
- [ ] Reuse large arrays

### 5.2 Object Pool

```javascript
class BulletPool {
    constructor(size) {
        this.pool = [];
        for (let i = 0; i < size; i++) {
            this.pool.push({ active: false, x: 0, y: 0, vx: 0, vy: 0 });
        }
    }

    get() {
        for (const bullet of this.pool) {
            if (!bullet.active) {
                bullet.active = true;
                return bullet;
            }
        }
        return null; // Pool exhausted
    }

    release(bullet) {
        bullet.active = false;
    }
}

// Usage
const bulletPool = new BulletPool(100);

function fireBullet(x, y) {
    const bullet = bulletPool.get();
    if (bullet) {
        bullet.x = x;
        bullet.y = y;
        bullet.vx = 500;
    }
}
```

---

## 6. Phaser Quick Start

```javascript
// Phaser 3 basic setup
const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 300 },
            debug: true
        }
    },
    scene: {
        preload: preload,
        create: create,
        update: update
    }
};

const game = new Phaser.Game(config);

function preload() {
    this.load.image('sky', 'assets/sky.png');
    this.load.image('player', 'assets/player.png');
    this.load.image('platform', 'assets/platform.png');
}

function create() {
    this.add.image(400, 300, 'sky');

    // Platform group
    const platforms = this.physics.add.staticGroup();
    platforms.create(400, 568, 'platform').setScale(2).refreshBody();

    // Player
    this.player = this.physics.add.sprite(100, 450, 'player');
    this.player.setBounce(0.2);
    this.player.setCollideWorldBounds(true);

    // Collision setup
    this.physics.add.collider(this.player, platforms);

    // Input
    this.cursors = this.input.keyboard.createCursorKeys();
}

function update() {
    if (this.cursors.left.isDown) {
        this.player.setVelocityX(-160);
    } else if (this.cursors.right.isDown) {
        this.player.setVelocityX(160);
    } else {
        this.player.setVelocityX(0);
    }

    if (this.cursors.up.isDown && this.player.body.touching.down) {
        this.player.setVelocityY(-330);
    }
}
```

---

## Related Documents

- [Game Design Doc](./game-design-doc.md) — Game planning
- [Knowledge Hub](./knowledge.md) — Game development knowledge hub

---

*Preset: gamedev v1.0.0 | Tycono Official*
