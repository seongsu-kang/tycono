---
title: "Game Development Guide"
akb_type: node
status: active
tags: ["game", "gamedev", "canvas", "phaser", "webgl", "engine"]
domain: engineering
---

# Game Development Guide — 게임 개발 기술 가이드

> "좋은 게임 엔진을 선택하면 절반은 성공이다."

## TL;DR

- **브라우저 게임**: Canvas 2D, Phaser, PixiJS
- **3D/복잡한 게임**: Unity, Godot (WebGL export)
- **핵심 개념**: 게임 루프, 물리 엔진, 입력 처리, 렌더링
- **최적화**: 60fps 유지, 메모리 관리, 에셋 로딩

---

## 1. 기술 스택 선택

### 1.1 의사결정 매트릭스

| 기준 | Vanilla Canvas | Phaser | PixiJS | Unity WebGL |
|------|---------------|--------|--------|-------------|
| 학습 곡선 | 낮음 | 중간 | 중간 | 높음 |
| 2D 게임 | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| 3D 게임 | ❌ | ❌ | ❌ | ⭐⭐⭐⭐⭐ |
| 물리 엔진 | 직접 구현 | 내장 | 플러그인 | 내장 |
| 파일 크기 | 최소 | ~1MB | ~500KB | 10MB+ |
| 커뮤니티 | 대형 | 대형 | 중형 | 대형 |

### 1.2 선택 가이드

```
⛔ 라이브러리 선택 원칙:
  - 상용 수준 게임이면 반드시 게임 프레임워크 사용 (Phaser/PixiJS)
  - Vanilla Canvas는 학습/프로토타입에만
  - "file://에서 실행해야 하니까 라이브러리 못 씀" = 잘못된 판단
    → 라이브러리를 lib/ 폴더에 로컬 번들로 포함하면 file://에서도 동작
    → 예: phaser.min.js를 다운로드 → lib/phaser.min.js로 저장
          <script src="lib/phaser.min.js"></script>

┌─────────────────────────────────────────────────────────┐
│  Vanilla Canvas 추천 (프로토타입/학습만)                 │
├─────────────────────────────────────────────────────────┤
│  - 매우 간단한 게임 (Snake, Pong)                       │
│  - 학습 목적                                            │
│  - ⛔ 상용 게임에는 비추천 — 같은 시간에 5~10배 나쁜 결과│
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  Phaser 추천                                           │
├─────────────────────────────────────────────────────────┤
│  - 2D 아케이드/플랫포머/RPG                            │
│  - 물리 엔진 필요 (Arcade Physics, Matter.js)          │
│  - 에셋 로딩, 씬 관리 필요                              │
│  - 풍부한 튜토리얼 원함                                 │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  PixiJS 추천                                           │
├─────────────────────────────────────────────────────────┤
│  - 고성능 2D 렌더링 필요                                │
│  - 많은 스프라이트 (파티클, 슈팅)                       │
│  - 커스텀 게임 로직 선호                                │
│  - WebGL 최적화 필요                                    │
└─────────────────────────────────────────────────────────┘
```

---

## 2. 게임 루프

### 2.1 기본 구조

```javascript
// 기본 게임 루프
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
        
        // Delta time 계산 (ms → seconds)
        const deltaTime = (currentTime - this.lastTime) / 1000;
        this.lastTime = currentTime;
        
        // 게임 로직 순서
        this.processInput();      // 1. 입력 처리
        this.update(deltaTime);   // 2. 상태 업데이트
        this.render();            // 3. 화면 렌더링
        
        requestAnimationFrame((time) => this.loop(time));
    }
    
    processInput() {
        // 키보드, 마우스, 터치 입력 처리
    }
    
    update(dt) {
        // 게임 로직, 물리, AI
        // dt를 곱해서 프레임 독립적 이동
        player.x += player.speed * dt;
    }
    
    render() {
        // 화면 그리기
        ctx.clearRect(0, 0, width, height);
        // ... 스프라이트 그리기
    }
}
```

### 2.2 고정 시간 스텝 (Fixed Timestep)

```javascript
// 물리 시뮬레이션용 고정 스텝
const FIXED_TIMESTEP = 1/60; // 60 FPS 물리
let accumulator = 0;

function gameLoop(currentTime) {
    const deltaTime = (currentTime - lastTime) / 1000;
    lastTime = currentTime;
    
    accumulator += deltaTime;
    
    // 고정 간격으로 물리 업데이트
    while (accumulator >= FIXED_TIMESTEP) {
        fixedUpdate(FIXED_TIMESTEP);
        accumulator -= FIXED_TIMESTEP;
    }
    
    // 남은 비율로 보간 렌더링
    const alpha = accumulator / FIXED_TIMESTEP;
    render(alpha);
    
    requestAnimationFrame(gameLoop);
}
```

---

## 3. 핵심 시스템

### 3.1 입력 처리

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
        // ... 마우스, 터치 이벤트
    }
    
    isKeyDown(code) {
        return this.keys[code] === true;
    }
    
    isKeyPressed(code) {
        // 이번 프레임에 눌렸는지 (1회 감지)
        if (this.keys[code] && !this.prevKeys[code]) {
            return true;
        }
        return false;
    }
}

// 사용
if (input.isKeyDown('ArrowRight')) {
    player.x += speed * dt;
}
if (input.isKeyPressed('Space')) {
    player.jump();
}
```

### 3.2 충돌 감지 (AABB)

```javascript
// Axis-Aligned Bounding Box 충돌
function checkCollision(a, b) {
    return (
        a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y
    );
}

// 원형 충돌
function checkCircleCollision(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return distance < a.radius + b.radius;
}
```

### 3.3 스프라이트 애니메이션

```javascript
class AnimatedSprite {
    constructor(spritesheet, frameWidth, frameHeight) {
        this.image = spritesheet;
        this.frameWidth = frameWidth;
        this.frameHeight = frameHeight;
        this.currentFrame = 0;
        this.animationSpeed = 0.1; // 초당 프레임 전환
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

## 4. 물리 엔진 기초

### 4.1 기본 물리

```javascript
class PhysicsBody {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.vx = 0; // 속도 X
        this.vy = 0; // 속도 Y
        this.ax = 0; // 가속도 X
        this.ay = 0; // 가속도 Y
        this.mass = 1;
        this.friction = 0.98;
        this.gravity = 980; // 픽셀/초²
    }
    
    applyForce(fx, fy) {
        this.ax += fx / this.mass;
        this.ay += fy / this.mass;
    }
    
    update(dt) {
        // 중력 적용
        this.vy += this.gravity * dt;
        
        // 가속도 → 속도
        this.vx += this.ax * dt;
        this.vy += this.ay * dt;
        
        // 마찰
        this.vx *= this.friction;
        this.vy *= this.friction;
        
        // 속도 → 위치
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        
        // 가속도 리셋
        this.ax = 0;
        this.ay = 0;
    }
}
```

### 4.2 플랫포머 물리

```javascript
class PlatformerPlayer extends PhysicsBody {
    constructor(x, y) {
        super(x, y);
        this.onGround = false;
        this.jumpForce = -500;
        this.moveSpeed = 300;
    }
    
    update(dt, input, platforms) {
        // 좌우 이동
        if (input.isKeyDown('ArrowLeft')) {
            this.vx = -this.moveSpeed;
        } else if (input.isKeyDown('ArrowRight')) {
            this.vx = this.moveSpeed;
        } else {
            this.vx *= 0.8; // 감속
        }
        
        // 점프 (땅에 있을 때만)
        if (input.isKeyPressed('Space') && this.onGround) {
            this.vy = this.jumpForce;
            this.onGround = false;
        }
        
        super.update(dt);
        
        // 플랫폼 충돌
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

## 5. 성능 최적화

### 5.1 체크리스트

**렌더링:**
- [ ] 오프스크린 캔버스로 복잡한 요소 캐싱
- [ ] requestAnimationFrame 사용 (setInterval X)
- [ ] 변경된 영역만 다시 그리기 (dirty rectangles)
- [ ] 스프라이트 시트 사용 (개별 이미지 X)

**로직:**
- [ ] 공간 분할 (쿼드트리, 그리드)로 충돌 감지 최적화
- [ ] 오브젝트 풀링 (탄환, 파티클)
- [ ] 화면 밖 오브젝트 비활성화

**메모리:**
- [ ] 오브젝트 풀로 GC 방지
- [ ] 이미지 프리로딩
- [ ] 큰 배열 재사용

### 5.2 오브젝트 풀

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
        return null; // 풀 고갈
    }
    
    release(bullet) {
        bullet.active = false;
    }
}

// 사용
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

## 6. Phaser 퀵스타트

```javascript
// Phaser 3 기본 설정
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
    
    // 플랫폼 그룹
    const platforms = this.physics.add.staticGroup();
    platforms.create(400, 568, 'platform').setScale(2).refreshBody();
    
    // 플레이어
    this.player = this.physics.add.sprite(100, 450, 'player');
    this.player.setBounce(0.2);
    this.player.setCollideWorldBounds(true);
    
    // 충돌 설정
    this.physics.add.collider(this.player, platforms);
    
    // 입력
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

## 관련 문서

- [Game Design Doc](./game-design-doc.md) — 게임 기획
- [Knowledge Hub](./knowledge.md) — 게임 개발 지식 허브

---

*Preset: gamedev v1.0.0 | Tycono Official*
