---
name: Zo Plays Pokemon
status: active
version: 0.1.0

## Colors

This product uses one shared token system with multiple retail-inspired presets. Keep one `DESIGN.md` and treat each shell as a token override, not as a separate design document.

### Retail Themes

- `Atomic Purple` — translucent lavender baseline
- `Teal` — cool blue-green shell
- `Berry` — saturated raspberry shell
- `Kiwi` — bright translucent green shell
- `Dandelion` — warm yellow shell
- `Grape` — darker violet shell
- `Clear` — neutral translucent shell

### Plastic Shell
| Token | Hex | RGB | Use |
|-------|-----|-----|-----|
| `shell-primary` | `#E0E0C0` | 224,224,192 | Body, bezel, main surface |
| `shell-secondary` | `#C0C0A0` | 192,192,160 | Shading, recessed surfaces |
| `shell-warm` | `#E0C0A0` | 224,192,160 | Button highlights, warm tones |
| `shell-accent` | `#E0E0A0` | 224,224,160 | Light catch, specular |
| `shell-dark` | `#A0A080` | 160,160,128 | Shadow, depth |

### Screen Bezel
| Token | Hex | RGB | Use |
|-------|-----|-----|-----|
| `bezel-dark` | `#202020` | 32,32,32 | Inner bezel, deep shadow |
| `bezel-teal` | `#002020` | 0,32,32 | Screen void, dark teal |
| `bezel-indigo` | `#000020` | 0,0,32 | Corner shadow |
| `bezel-muted` | `#608080` | 96,128,128 | Mid-tone bezel |

### In-Game (Game Boy LCD — 4-tone green)
| Token | Hex | RGB | Use |
|-------|-----|-----|-----|
| `lcd-light` | `#E0E0A0` | 224,224,160 | Lightest LCD tone |
| `lcd-mid` | `#A0A080` | 160,160,128 | Mid-light LCD |
| `lcd-dark` | `#406040` | 64,96,64 | Dark LCD |
| `lcd-void` | `#002020` | 0,32,32 | Blackest LCD pixel |

### Interactive
| Token | Hex | RGB | Use |
|-------|-----|-----|-----|
| `button-a` | `#D03030` | 208,48,48 | A button (red) |
| `button-b` | `#8030A0` | 128,48,160 | B button (purple) |
| `dpad` | `#303030` | 48,48,48 | D-pad surface |
| `dpad-highlight` | `#505050` | 80,80,80 | D-pad ridge highlight |
| `success` | `#30A030` | 48,160,48 | Confirmation spinner |
| `error` | `#C03020` | 192,48,32 | Error toast |
| `warning` | `#C09020` | 192,144,32 | Warning |

## Typography

| Token | Value | Use |
|-------|-------|-----|
| `font-mono` | `"Press Start 2P"` (Google Fonts) | All text — pixel aesthetic |
| `font-body` | `"VT323"` (Google Fonts) | Fallback pixel font |
| `text-xs` | 8px | Timestamps, labels |
| `text-sm` | 10px | Secondary labels |
| `text-base` | 12px | Body, descriptions |
| `text-lg` | 16px | Headings |
| `text-xl` | 24px | Title |
| `text-2xl` | 32px | Hero title |

## Spacing

Uses 4px base grid. Components align to multiples of 4.
- `space-1`: 4px
- `space-2`: 8px
- `space-3`: 12px
- `space-4`: 16px
- `space-6`: 24px
- `space-8`: 32px
- `space-12`: 48px

## Border Radius

- `radius-none`: 0px — pixel-perfect edges where appropriate
- `radius-sm`: 4px — subtle softening
- `radius-md`: 8px — button wells, input areas
- `radius-lg`: 12px — card containers

## Components

### Game Frame
- 480×432px PNG (PyBoy renders 160×144, upscaled 3x with `Image.NEAREST`)
- Displayed with `pixelated` CSS to preserve crispness
- Wrapped in a "bento tray" border using `shell-primary` / `shell-secondary`

### D-Pad
- CSS-drawn cross shape, `dpad` color with `dpad-highlight` ridge
- Active state: inset shadow, darkened fill
- States: default, pressed (inset), disabled (opacity 0.5)

### Action Buttons
- A: red (`button-a`), B: purple (`button-b`)
- Circular with slight bevel (CSS `box-shadow` for depth)
- Active state: scale(0.95), deeper shadow
- Hover: subtle glow matching button color

### Menu Buttons (Select, Start)
- Rounded rectangle, `shell-secondary` fill
- Embossed text label in `font-mono`
- Pressed: inset shadow, text darkens

### Loading Spinner
- CSS pixel-art spinner (rotating square frames)
- Color: `success` green
- Appears on button press, fades when queue processed
- Duration: 400ms fade-in, persists until first frame refresh after input

### Error Toast
- Appears bottom-center, `error` background, white `font-mono` text
- Auto-dismiss after 3000ms
- Slide-up entrance, fade-out exit
- Icon: pixel ⚠ character or inline SVG triangle

### Queue Feedback
- Small pill badge showing "queued: N" in corner
- `shell-secondary` background, `text-xs`
- Increments on each queued input, decrements on frame refresh

### Keyboard Toggle
- Small pill switch in top-right corner
- Off: muted gray, "KEYBOARD: OFF"
- On: `button-a` red tint, "KEYBOARD: ON"
- Tooltip on hover explaining keyboard is available

### Theme Picker
- Opens as a dialog from the header
- Shows retail shell presets with small swatches
- First visit picks a random preset, then persists via local storage
- Includes a randomize action for fast rotation

### Floating Controller
- Controller is a movable overlay, not a fixed in-flow section
- Default anchor: bottom-center on small screens, lower-right on larger screens
- Dragging happens from a dedicated handle so game buttons do not move the panel
- Can minimize into a compact chip to get out of the way
- Position and minimized state persist via local storage

## Interaction Rules

1. **Button press** → loading spinner appears immediately (optimistic)
2. **Input sent** → spinner stays, queue badge updates
3. **Frame refreshes** → spinner hides, game state visible
4. **Failed input** → error toast, spinner hides
5. **Keyboard controls** → opt-in only, toggle in corner
6. **Held buttons** → held for 400ms before repeat triggers
7. **Queue depth** → max 5 pending inputs, excess rejected with error toast
8. **Theme selection** → first load is random, later loads reuse the saved retail preset
9. **Controller placement** → drag position clamps to the visible viewport and survives reloads
10. **Controller minimize** → collapsing the overlay should leave a small visible reopen affordance

## Background

- Subtle backdrop gradient is allowed behind the shell
- Shell surfaces should still read like Game Boy plastic, not glossy glass UI
- Page content centered in max-width 600px container
