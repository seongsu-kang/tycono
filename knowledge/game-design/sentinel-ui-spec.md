# Sentinel Tower Defense — UI/UX Specification

> **Version**: 1.0
> **Last Updated**: 2026-03-31
> **Target Platform**: Desktop browsers (Chrome, Firefox, Safari, Edge), tablet-friendly
> **Art Direction**: Clean/modern flat design with subtle gradients and soft shadows

---

## Table of Contents

1. [Overall Layout](#1-overall-layout)
2. [Tower Interaction](#2-tower-interaction)
3. [Enemy Visuals](#3-enemy-visuals)
4. [HUD & Feedback](#4-hud--feedback)
5. [Game State Screens](#5-game-state-screens)
6. [Color Palette & Visual Style](#6-color-palette--visual-style)
7. [Responsive Considerations](#7-responsive-considerations)
8. [Animation & Polish](#8-animation--polish)

---

## 1. Overall Layout

### Master Layout Structure

The game uses a fixed-aspect container centered in the viewport. The layout is split horizontally into two regions: the **game board** and the **side panel**.

```
+----------------------------------------------------------------+
|  HEADER (48px height)                                          |
|  [Sentinel Logo]              WAVE 3 / 10         [Pause] [⚙] |
+----------------------------------------------+-----------------+
|                                              |   SIDE PANEL    |
|                                              |   (240px wide)  |
|              GAME BOARD                      |                 |
|           (15 cols x 10 rows)                | ┌─────────────┐ |
|                                              | │  STATS BOX   │ |
|          Each cell: 48x48px                  | │  Gold: 200   │ |
|          Board: 720px x 480px                | │  Lives: 20   │ |
|                                              | │  Wave: 3/10  │ |
|                                              | └─────────────┘ |
|                                              |                 |
|                                              | ┌─────────────┐ |
|                                              | │  TOWER SHOP  │ |
|                                              | │  [Arrow  25] │ |
|                                              | │  [Cannon 50] │ |
|                                              | │  [Slow   35] │ |
|                                              | │  [Sniper 75] │ |
|                                              | └─────────────┘ |
|                                              |                 |
|                                              | ┌─────────────┐ |
|                                              | │SPEED CONTROL │ |
|                                              | │ [1x][2x][3x] │ |
|                                              | └─────────────┘ |
|                                              |                 |
|                                              | [START WAVE]    |
+----------------------------------------------+-----------------+
```

### Dimensions & Proportions

| Element | Size | Notes |
|---|---|---|
| Outer container | `960px x 528px` (min) | Centered horizontally and vertically in viewport |
| Header | `100% x 48px` | Fixed at top of container |
| Game board | `720px x 480px` | 15 columns x 10 rows, each cell 48x48px |
| Side panel | `240px x 480px` | Fixed right of board |
| Grid cell | `48px x 48px` | Square cells with 1px border |

### Header Bar (48px)

- **Left**: Game title "SENTINEL" in bold uppercase, `font-size: 20px`, color `#E8E8E8`
- **Center**: Wave indicator text — e.g. "WAVE 3 / 10" in `font-size: 16px`, color `#B0B0B0`
- **Right**: Pause button (⏸ icon, 32x32px) and Settings gear icon (32x32px), spaced 8px apart
- **Background**: `#1A1A2E` (dark navy), with a subtle `1px` bottom border of `#2A2A4E`

### Side Panel Sections

The side panel uses a vertical stack layout with `12px` padding and `16px` gaps between sections.

**Section Order (top to bottom):**

1. **Stats Box** (height: ~100px)
2. **Tower Shop** (height: ~200px)
3. **Speed Controls** (height: ~48px)
4. **Start Wave Button** (height: 44px) — fills remaining space at bottom

Side panel background: `#16213E`

---

## 2. Tower Interaction

### 2.1 Tower Shop Panel

Each tower is displayed as a **shop card** inside the side panel.

**Shop Card Layout** (`208px x 44px` per card, `8px` gap between cards):

```
+----------------------------------------------+
| [Icon 32x32]  Arrow Tower           25g [🪙] |
+----------------------------------------------+
```

- **Icon**: 32x32px colored circle with tower silhouette
- **Name**: `font-size: 13px`, `font-weight: 600`, color `#E0E0E0`
- **Cost**: `font-size: 13px`, `font-weight: 700`, color `#FFD700` (gold), right-aligned
- **Card background**: `#1A1A2E`
- **Card border-radius**: `6px`
- **Card padding**: `6px 10px`

**States:**

| State | Visual |
|---|---|
| **Default** | Background `#1A1A2E`, subtle border `1px solid #2A2A4E` |
| **Hover** | Background `#222244`, border `1px solid #3A3A6E`, cursor pointer |
| **Selected** | Background `#2A2A5E`, border `2px solid #5A7FFF` (blue glow), slight `box-shadow: 0 0 8px rgba(90,127,255,0.4)` |
| **Disabled** (insufficient gold) | Opacity `0.4`, cursor `not-allowed`, cost text turns `#FF4444` |

### 2.2 Tower Placement Flow

1. **Select**: Player clicks a tower card in the shop → card enters **Selected** state
2. **Preview**: Mouse moves over game grid → a ghost preview of the tower follows the cursor, snapping to grid cells
3. **Range indicator**: A semi-transparent circle (`rgba(90,127,255,0.15)`) shows the tower's attack range, centered on the hovered cell. Circle border: `1px dashed rgba(90,127,255,0.5)`
4. **Valid placement**: Cell shows the ghost tower at `opacity: 0.6` with the range circle
5. **Invalid placement**: Cell overlays with `rgba(255,50,50,0.3)` red tint. The ghost tower is not shown. Invalid cells include: occupied cells, path cells, and out-of-bounds
6. **Place**: Click on a valid cell → tower is placed, gold is deducted, selection clears
7. **Cancel**: Right-click or press `Escape` → selection clears, returns to normal cursor

### 2.3 Placed Tower Interaction

**Click on a placed tower** to open the **Tower Info Popup**:

```
+-----------------------------+
|  Arrow Tower  (Lv 1)       |
|  Range: 3 cells             |
|  Damage: 10                 |
|  Speed: Fast                |
|                             |
|  [Upgrade Lv 2 — 40g]      |
|  [Sell — 12g]               |
+-----------------------------+
```

- **Popup position**: Appears adjacent to the tower (left side if tower is on right half of board, right side otherwise). Never overlaps the side panel.
- **Popup size**: `200px x 180px`, `border-radius: 8px`, background `#1E1E3A`, border `1px solid #3A3A6E`
- **Popup shadow**: `0 4px 16px rgba(0,0,0,0.5)`
- **Upgrade button**: Green background `#2ECC71`, text `#FFFFFF`, `font-weight: 700`
  - **Hover**: `#27AE60`
  - **Disabled** (max level or insufficient gold): `opacity: 0.4`, background `#555`
- **Sell button**: Red-tinted text `#E74C3C`, transparent background with `1px border #E74C3C`
  - **Hover**: background `rgba(231,76,60,0.15)`
- **Close**: Click anywhere outside the popup, or press `Escape`

When the tower info popup is open, the tower's **range circle** is displayed at full opacity (`rgba(90,127,255,0.25)` fill, `1px solid rgba(90,127,255,0.6)` border).

### 2.4 Tower Level Visuals

Towers change appearance based on upgrade level:

| Level | Visual Change |
|---|---|
| **Level 1** | Base size (32x32px icon in 48x48 cell), no extra effects |
| **Level 2** | Size increases to 36x36px, subtle pulsing glow (`box-shadow` animation with tower's color at `0.3` alpha) |
| **Level 3** (max) | Size 40x40px, persistent glow ring, small star/chevron badge in top-right corner of cell |

---

## 3. Enemy Visuals

### 3.1 Enemy Type Differentiation

Each enemy type has a distinct **shape**, **size**, and **color** to allow instant recognition:

| Enemy | Shape | Size | Base Color | Details |
|---|---|---|---|---|
| **Scout** | Small circle | 16x16px | `#3498DB` (blue) | Fastest, lightest. Slight motion trail |
| **Soldier** | Square with rounded corners | 22x22px | `#E67E22` (orange) | Standard enemy |
| **Tank** | Large square | 30x30px | `#8E44AD` (purple) | Thick 2px border ring, slowest |
| **Healer** | Diamond (rotated square) | 20x20px | `#2ECC71` (green) | Pulsing green aura |
| **Boss** | Octagon | 36x36px | `#E74C3C` (red) | Glowing red outline, slow pulse animation |

### 3.2 HP Bars

HP bars are drawn **above** each enemy, horizontally centered:

- **Bar width**: Same as enemy width (e.g., 22px for Soldier)
- **Bar height**: 4px
- **Bar offset**: 4px above the enemy shape
- **Background** (depleted area): `#333333`
- **Border**: none (clean look)
- **Border-radius**: `2px`

**HP Color Gradient** (based on % remaining):

| HP Range | Color |
|---|---|
| 100%–60% | `#2ECC71` (green) |
| 59%–30% | `#F1C40F` (yellow) |
| 29%–0% | `#E74C3C` (red) |

Boss enemies have a **thicker** HP bar: `6px` height, `width: 40px`.

### 3.3 Movement Animation

- Enemies move along the defined path with **smooth linear interpolation** between cells
- Movement is continuous (not cell-by-cell snapping)
- Enemies are rendered at sub-pixel positions using CSS `transform: translate(x, y)` or canvas draw
- At path turns, enemies smoothly change direction (no instant rotation)
- Speed variants: Scout moves ~2x the speed of Tank

### 3.4 Death Animation

- **Duration**: 300ms
- **Effect**: Enemy shrinks to 0 scale (`transform: scale(0)`) while fading to `opacity: 0`
- Simultaneously, 4–6 small particles (3x3px squares of the enemy's color) burst outward in random directions, fading over 400ms
- Boss death: larger particle burst (8–10 particles), brief screen flash (`rgba(255,255,255,0.1)` overlay for 100ms)

### 3.5 Healer Visual

- **Healing Aura**: Persistent radial gradient centered on the Healer — `radial-gradient(circle, rgba(46,204,113,0.2) 0%, transparent 70%)`, radius `60px`
- **Healing Beam**: When actively healing, draw a `2px` wide line from Healer to target, color `#2ECC71` at `opacity: 0.7`, with a gentle sine-wave wobble animation (2 full cycles per second)
- Small `+` symbols float upward from healed enemies (see HUD section for floating text)

---

## 4. HUD & Feedback

### 4.1 Stats Display (Side Panel)

The stats box at the top of the side panel shows critical information:

```
+-----------------------------------+
|  🪙  200          ❤️  18 / 20     |
|        WAVE  3 / 10               |
+-----------------------------------+
```

- **Gold**: Icon + value, `font-size: 18px`, `font-weight: 700`, color `#FFD700`
- **Lives**: Heart icon + current/max, `font-size: 18px`, `font-weight: 700`, color `#E74C3C`
- **Wave**: Centered below, `font-size: 14px`, `font-weight: 600`, color `#B0B0B0`
- **Background**: `#1A1A2E`, `border-radius: 8px`, `padding: 12px`

When gold changes (gain or spend), the gold number briefly **scales up** to `1.2x` for 200ms, then returns to `1.0x`.

When lives decrease, the lives number **flashes red** (background pulses `rgba(231,76,60,0.3)` → transparent) over 500ms.

### 4.2 Gold Popup Animation

When an enemy dies and awards gold:

- A floating text "+10g" appears at the enemy's death position
- Color: `#FFD700` (gold)
- `font-size: 14px`, `font-weight: 700`
- Animation: floats upward 30px over 800ms while fading from `opacity: 1` to `opacity: 0`
- If multiple enemies die simultaneously, stack the popups with 16px vertical offset

### 4.3 Damage Numbers

When a tower hits an enemy:

- A floating number (e.g. "-10") appears at the point of impact
- Color: `#FFFFFF` (white) for normal damage, `#FF6B6B` for critical/high damage
- `font-size: 12px`, `font-weight: 600`
- Animation: floats upward 20px over 600ms, fading out
- Slight random horizontal offset (±8px) to prevent stacking on rapid hits
- Healing numbers: "+5" in `#2ECC71` (green), same animation but floats upward from healed enemy

### 4.4 Wave Announcement Banner

At the start of each wave, a full-width banner appears over the game board:

```
+----------------------------------------------+
|          ⚔️  WAVE 3 INCOMING!  ⚔️             |
+----------------------------------------------+
```

- **Position**: Centered horizontally and vertically over the game board
- **Size**: `400px x 60px`
- **Background**: `rgba(26,26,46,0.9)`, `border-radius: 8px`, border `2px solid #5A7FFF`
- **Text**: `font-size: 24px`, `font-weight: 800`, `letter-spacing: 2px`, color `#FFFFFF`
- **Animation**:
  - 0ms: Scale from `0.5` to `1.0` with `ease-out` (200ms)
  - 200ms–1500ms: Visible and static
  - 1500ms–2000ms: Fade out to `opacity: 0`
  - Total duration: 2000ms

**Boss wave** (wave 10): Banner uses red border `2px solid #E74C3C`, text includes "FINAL WAVE" subtext in `font-size: 14px` below.

### 4.5 Lives Lost Warning

When an enemy reaches the end of the path:

- The **entire game board border** flashes red: `box-shadow: inset 0 0 20px rgba(231,76,60,0.6)` for 400ms
- The lives counter in the side panel pulses (see 4.1)
- A brief screen shake: `transform: translateX(±3px)` oscillating 3 times over 300ms

### 4.6 Speed Controls

Three toggle buttons in a horizontal row:

| Button | Label | Active Color |
|---|---|---|
| Normal | `1x` | `#5A7FFF` |
| Fast | `2x` | `#5A7FFF` |
| Fastest | `3x` | `#5A7FFF` |

- **Size**: Each button `56px x 36px`
- **Default**: Background `#1A1A2E`, text `#888`, border `1px solid #2A2A4E`
- **Active**: Background `#5A7FFF`, text `#FFFFFF`, `font-weight: 700`
- **Hover** (non-active): Background `#222244`
- Only one can be active at a time (radio-button behavior)

### 4.7 Start Wave Button

- **Size**: `208px x 44px` (full width of side panel minus padding)
- **Default**: Background `#2ECC71`, text `#FFFFFF`, `font-size: 15px`, `font-weight: 700`, `border-radius: 8px`
- **Hover**: Background `#27AE60`
- **Active/Pressed**: Background `#1E8449`
- **Disabled** (wave in progress): Background `#555`, text `#888`, cursor `not-allowed`
- **Label**: "START WAVE" when idle, "WAVE IN PROGRESS..." when active

---

## 5. Game State Screens

### State Machine

```
[Start Screen] → [Playing] ⇄ [Paused]
                  [Playing] → [Game Over]  (lives reach 0)
                  [Playing] → [Victory]    (wave 10 cleared)
```

### 5.1 Start Screen

A full-screen overlay on top of the game board (board is visible but dimmed underneath).

```
+----------------------------------------------+
|                                              |
|              S E N T I N E L                 |
|           Tower Defense                       |
|                                              |
|           [ ▶  PLAY ]                        |
|                                              |
|        Best: Wave 10  |  Time: 12:34         |
+----------------------------------------------+
```

- **Overlay**: `rgba(10,10,26,0.92)`, covers entire game container
- **Title**: "SENTINEL" in `font-size: 48px`, `font-weight: 800`, `letter-spacing: 8px`, color `#FFFFFF`
- **Subtitle**: "Tower Defense" in `font-size: 18px`, `font-weight: 400`, color `#888`
- **Play button**: `200px x 56px`, background `#5A7FFF`, `border-radius: 12px`, text "PLAY" in `font-size: 20px`, `font-weight: 700`
  - Hover: `#4A6FEE`, `transform: scale(1.05)` over 150ms
  - Active: `#3A5FDD`
- **Best score** (if available): `font-size: 13px`, color `#666`, below the play button with `24px` margin

### 5.2 Game Over Screen

Triggered when lives reach 0. Overlay appears with a red-tinted vignette.

```
+----------------------------------------------+
|                                              |
|             GAME OVER                        |
|                                              |
|   Waves Survived:          7 / 10            |
|   Enemies Killed:            42              |
|   Towers Built:              11              |
|   Gold Earned:              680              |
|                                              |
|           [ RETRY ]    [ MENU ]              |
+----------------------------------------------+
```

- **Overlay**: `rgba(20,5,5,0.92)` (dark red tint)
- **Title**: "GAME OVER" in `font-size: 40px`, `font-weight: 800`, color `#E74C3C`
- **Stats table**: Left-aligned labels and right-aligned values
  - Labels: `font-size: 15px`, color `#999`
  - Values: `font-size: 15px`, `font-weight: 700`, color `#FFFFFF`
  - Row height: `32px`, with subtle `1px` bottom border `#2A2A2A`
- **Retry button**: `140px x 48px`, background `#E74C3C`, text `#FFF`, `border-radius: 8px`
  - Hover: `#C0392B`
- **Menu button**: `140px x 48px`, background `transparent`, border `1px solid #666`, text `#CCC`, `border-radius: 8px`
  - Hover: background `rgba(255,255,255,0.05)`
- **Entry animation**: Overlay fades in (300ms), then title drops in from above (200ms, `ease-out`), then stats rows appear one by one (100ms stagger each), then buttons fade in (200ms)

### 5.3 Victory Screen

Triggered when wave 10 is cleared. Overlay with a golden glow.

```
+----------------------------------------------+
|                                              |
|            ⭐ VICTORY! ⭐                    |
|                                              |
|   Time:                     8:42             |
|   Enemies Killed:           68 / 68          |
|   Towers Built:              14              |
|   Gold Earned:             1250              |
|   Lives Remaining:        14 / 20            |
|                                              |
|           [ PLAY AGAIN ]                     |
+----------------------------------------------+
```

- **Overlay**: `rgba(10,10,26,0.92)` with a radial golden glow at center — `radial-gradient(circle at center, rgba(255,215,0,0.08) 0%, transparent 60%)`
- **Title**: "VICTORY!" in `font-size: 44px`, `font-weight: 800`, color `#FFD700`
- **Stats**: Same layout as Game Over stats
- **Play Again button**: `180px x 48px`, background `#FFD700`, text `#1A1A2E`, `font-weight: 700`, `border-radius: 8px`
  - Hover: `#FFC300`
- **Entry animation**: Similar to Game Over, but with particle/sparkle effects around the title (8 small golden dots orbiting the text over 3 seconds)

### 5.4 Pause Overlay

Triggered by clicking the pause button or pressing `Space` / `P`.

```
+----------------------------------------------+
|                                              |
|              ⏸ PAUSED                        |
|                                              |
|            [ ▶ RESUME ]                      |
|            [ ↩ RESTART ]                     |
|            [ 🏠 MENU ]                       |
+----------------------------------------------+
```

- **Overlay**: `rgba(10,10,26,0.85)` with a subtle blur (`backdrop-filter: blur(4px)`) on the game board behind it
- **Title**: "PAUSED" in `font-size: 36px`, `font-weight: 700`, color `#FFFFFF`
- **Buttons**: Stacked vertically with `12px` gap
  - Resume: `180px x 44px`, background `#5A7FFF`, text `#FFF`
  - Restart: `180px x 44px`, background `transparent`, border `1px solid #5A7FFF`, text `#5A7FFF`
  - Menu: `180px x 44px`, background `transparent`, border `1px solid #666`, text `#999`
- **Keyboard**: `Escape` or `P` or `Space` to toggle pause

---

## 6. Color Palette & Visual Style

### 6.1 Core Palette

| Role | Name | Hex | Usage |
|---|---|---|---|
| **Background (Dark)** | Midnight | `#0A0A1A` | Viewport background behind game |
| **Background (Panel)** | Deep Navy | `#16213E` | Side panel background |
| **Background (Card)** | Dark Indigo | `#1A1A2E` | Cards, inputs, header |
| **Surface** | Muted Indigo | `#222244` | Hover states, elevated surfaces |
| **Border** | Subtle Edge | `#2A2A4E` | Borders, dividers |
| **Primary** | Royal Blue | `#5A7FFF` | Primary buttons, active states, selection |
| **Primary Hover** | Deep Blue | `#4A6FEE` | Hover on primary elements |
| **Success** | Emerald | `#2ECC71` | Upgrade button, healing, positive actions |
| **Success Hover** | Dark Emerald | `#27AE60` | Hover on success elements |
| **Danger** | Crimson | `#E74C3C` | Lives, sell, game over, warnings |
| **Danger Hover** | Dark Crimson | `#C0392B` | Hover on danger elements |
| **Gold** | Gold | `#FFD700` | Currency, victory, rewards |
| **Text Primary** | Light Gray | `#E8E8E8` | Primary text |
| **Text Secondary** | Mid Gray | `#B0B0B0` | Secondary / descriptive text |
| **Text Muted** | Dark Gray | `#666666` | Disabled, footnotes |
| **Grid Line** | Faint Line | `#1E1E3A` | Grid cell borders |
| **Path** | Path Tan | `#3D3522` | Enemy path cells |

### 6.2 Tower Colors

Each tower type has a **primary** and **accent** color:

| Tower | Primary | Accent | Icon Motif |
|---|---|---|---|
| **Arrow** | `#3498DB` (Sky Blue) | `#2980B9` | Upward arrow / bow |
| **Cannon** | `#E67E22` (Orange) | `#D35400` | Circle with explosion lines |
| **Slow** | `#1ABC9C` (Teal) | `#16A085` | Snowflake / frost crystal |
| **Sniper** | `#9B59B6` (Purple) | `#8E44AD` | Crosshair / target |

Tower projectiles match the tower's primary color.

### 6.3 Enemy Colors

| Enemy | Fill Color | Border/Accent |
|---|---|---|
| **Scout** | `#3498DB` | `#2980B9` |
| **Soldier** | `#E67E22` | `#D35400` |
| **Tank** | `#8E44AD` | `#6C3483` |
| **Healer** | `#2ECC71` | `#1ABC9C` |
| **Boss** | `#E74C3C` | `#C0392B` |

### 6.4 Grid & Board Styling

- **Board background**: `#111122`
- **Grid lines**: `1px solid #1E1E3A` (very subtle, visible but not distracting)
- **Path cells**: Background `#3D3522` (muted tan/brown), with `1px` inner border `#4D4532` to distinguish from buildable cells
- **Path direction indicators**: Small `4px` chevron arrows in `#5D5542` along the path direction (optional, subtle)
- **Buildable cells (hover)**: When a tower is selected for placement, buildable cells show a faint highlight `rgba(90,127,255,0.05)` on hover
- **Spawn point**: Pulsing green circle (4px border `#2ECC71` at `opacity: 0.6`, pulse animation)
- **Exit point**: Pulsing red circle (4px border `#E74C3C` at `opacity: 0.6`, pulse animation)

### 6.5 Typography

| Context | Font | Size | Weight | Color |
|---|---|---|---|---|
| Game title (header) | `'Inter', sans-serif` | `20px` | `800` | `#E8E8E8` |
| Start screen title | `'Inter', sans-serif` | `48px` | `800` | `#FFFFFF` |
| Section headers (side panel) | `'Inter', sans-serif` | `12px` | `700` | `#666` (uppercase, `letter-spacing: 1.5px`) |
| Stat values | `'Inter', sans-serif` | `18px` | `700` | `#FFD700` / `#E74C3C` |
| Tower card name | `'Inter', sans-serif` | `13px` | `600` | `#E0E0E0` |
| Button text | `'Inter', sans-serif` | `15px` | `700` | varies |
| Floating damage/gold | `'Inter', sans-serif` | `12–14px` | `600–700` | varies |
| Wave banner | `'Inter', sans-serif` | `24px` | `800` | `#FFFFFF` |

Fallback stack: `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`

---

## 7. Responsive Considerations

### 7.1 Minimum Viewport

- **Minimum supported**: `1024px x 768px`
- Below this size, display a message: "Please use a larger screen for the best experience." centered on a `#0A0A1A` background.

### 7.2 Scaling Strategy

The game container is **fixed-size** (`960px x 528px`) at base. On larger viewports, the container is centered and the surrounding area fills with the viewport background color `#0A0A1A`.

**Wider screens (>1200px)**: The game container remains centered. No layout changes — extra space is background.

**Very large screens (>1600px)**: Optionally scale the entire container up using `transform: scale()` to fill more of the viewport while maintaining aspect ratio. Max scale factor: `1.5x`.

### 7.3 Touch / Tablet Considerations

For viewports ≥1024px in width with touch input:

- **Tower selection**: Tap on shop card to select, tap on grid to place (same as click)
- **Tower info popup**: Tap on placed tower to open; tap outside to close (no right-click available)
- **Cancel placement**: Add a visible "Cancel" button (`32x32px`, `✕` icon) in the top-right corner of the game board whenever a tower is selected
- **Hit targets**: All interactive elements maintain a minimum touch target of `44x44px` (per WCAG guidelines)
- **No hover states for touch**: Range preview appears only after tapping a valid grid cell (confirm placement with a second tap)
- **Tooltip alternative**: Long-press on a shop card (500ms) shows a tooltip with tower stats

### 7.4 Font Sizing & Readability

- Minimum font size anywhere in the UI: `12px`
- Stat values (gold, lives): `18px` bold — large enough to read at a glance
- Contrast ratios meet WCAG AA:
  - `#E8E8E8` on `#1A1A2E` = ~12:1 ✓
  - `#FFD700` on `#1A1A2E` = ~9:1 ✓
  - `#666666` on `#1A1A2E` = ~3.5:1 (muted text, acceptable for non-essential info)

---

## 8. Animation & Polish

### 8.1 Tower Attack Animations

| Tower | Projectile | Animation |
|---|---|---|
| **Arrow** | Small line (8x2px) in `#3498DB` oriented toward target | Travels from tower center to target at 600px/s. On hit: disappears instantly |
| **Cannon** | Circle (6px diameter) in `#E67E22` | Arced trajectory (slight parabola using CSS or canvas). On hit: small explosion ring (expanding circle from 6px to 20px, fading out over 200ms, color `#E67E22` at `opacity: 0.5`) |
| **Slow** | Ring pulse (no projectile) | Expanding circle from tower center outward to range radius over 400ms, color `#1ABC9C` at `opacity: 0.3`, fading to `0`. Affected enemies briefly flash teal |
| **Sniper** | Laser line (2px) from tower to target in `#9B59B6` | Line appears instantly, holds for 100ms, then fades over 100ms. Brief flash at impact point (8px circle, `#9B59B6`, 150ms) |

### 8.2 Enemy Spawn Animation

- Enemies appear at the spawn point with a **scale-in** effect:
  - 0ms: `scale(0)`, `opacity: 0`
  - 200ms: `scale(1.1)`, `opacity: 1` (slight overshoot)
  - 300ms: `scale(1.0)` (settle)
- A brief circular "portal" effect at the spawn point: expanding ring in `#2ECC71` from 0 to 20px radius, fading out over 300ms

### 8.3 Tower Placement Animation

When a tower is placed on the grid:

- **Drop-in**: Tower starts 20px above its cell at `opacity: 0`, drops to final position with `ease-out` easing over 250ms, reaching `opacity: 1`
- **Landing impact**: Brief circular ripple from the cell center (expanding ring in tower's primary color, 0 to 30px, fading over 200ms)
- **Grid cell**: The cell background briefly flashes the tower's color at `opacity: 0.2` for 200ms

### 8.4 UI Transition Animations

| Transition | Animation | Duration |
|---|---|---|
| **Screen overlay appear** | Fade in background, then content scales from `0.95` to `1.0` | 300ms + 200ms |
| **Screen overlay dismiss** | Fade out all | 200ms |
| **Side panel stat change** | Number scales to `1.2x` then back to `1.0x` | 200ms |
| **Button hover** | Background color transition | 150ms `ease` |
| **Tower popup open** | Scale from `0.9` to `1.0` with `ease-out`, fade in | 150ms |
| **Tower popup close** | Fade out | 100ms |
| **Wave banner** | Scale in → hold → fade out | 200ms + 1300ms + 500ms |
| **Gold popup float** | Translate Y -30px + fade out | 800ms `ease-out` |
| **Damage number float** | Translate Y -20px + fade out | 600ms `ease-out` |

### 8.5 Recommended Timing Guidelines

- **Micro-interactions** (hover, press): `100–150ms`
- **UI element transitions** (popups, panels): `150–250ms`
- **Feedback animations** (floating text, ripples): `300–800ms`
- **Narrative/banner animations**: `1500–2500ms` total (including hold time)
- **Game object animations** (projectiles, spawns): `200–400ms`
- Easing function defaults: `ease-out` for entries, `ease-in` for exits, `ease` for transitions

### 8.6 Performance Notes

- All floating text and particle effects should be pooled and reused (object pooling) to avoid GC pressure
- Cap simultaneous floating text instances at 20; oldest instance is removed if exceeded
- Projectile animations use `requestAnimationFrame`; do not use `setInterval`
- Consider using CSS animations/transitions for UI elements and canvas for game board rendering
- Particle effects should be rendered on a separate canvas layer above the game board

---

## Appendix: Keyboard Shortcuts

| Key | Action |
|---|---|
| `1` | Select Arrow Tower |
| `2` | Select Cannon Tower |
| `3` | Select Slow Tower |
| `4` | Select Sniper Tower |
| `Escape` | Cancel tower selection / Close popup / Unpause |
| `Space` | Pause / Unpause |
| `P` | Pause / Unpause |
| `Enter` | Start next wave (when idle) |

---

## Appendix: Asset List

For implementation, the following assets are needed (can be generated programmatically or as sprites):

| Asset | Type | Notes |
|---|---|---|
| Tower icons (4) | SVG or Canvas drawn | 32x32px base, colored per tower |
| Enemy shapes (5) | Canvas drawn | Geometric shapes, no sprite sheets needed |
| Projectiles (4) | Canvas drawn | Lines, circles, rings, beams |
| Particles | Canvas drawn | Small colored squares/circles |
| UI Icons | SVG | Pause, settings, heart, coin, play |
| Font | Web font | Inter (Google Fonts) |
