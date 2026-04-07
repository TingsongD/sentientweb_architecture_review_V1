# Hero Section Specification - Browserbase

## Visual Overview
![Browserbase Hero Section](https://sc02.alicdn.com/kf/A78d8e8e46c274bf88a6bd338cc3f4e0fS.png)

## Text Content
- **H1:** "We help AI use the web."
- **Subheadline (H2):** "Autonomously read, write, and perform tasks on the web with a headless browser."
- **Primary CTA:** "Try for free"
- **Secondary CTA:** "Get a demo"
- **Footer Note:** "No credit card required."
- **Announcement Bar:** "Introducing our Search API: Web search, built for agents"

## Assets
- **Logo Block Animation:** Sprite based animation ([logo_block_animation_sprite.png](https://www.browserbase.com/assets/hero/logo_block_animation_sprite.png))
- **Announcement Icons:** Browserbase logo and Exa logo SVGs.

## Computed Styles (Desktop)

### Container (Section)
- **Display:** `block`
- **Position:** `relative`
- **Width:** `~3082px` (Full viewport)
- **Height:** `~854px`
- **Background:** Transparent / White background (Grid texture likely a background image on a parent or pseudo-element).

### Main Heading (H1)
- **Font Family:** `"PP Neue Montreal", "Helvetica Neue", Arial, sans-serif`
- **Font Size:** `90px`
- **Font Weight:** `400`
- **Line Height:** `99px` (1.1x)
- **Color:** `rgb(0, 0, 0)` (#000000)
- **Text Align:** `center`
- **Margin:** `0px`

### Subheadline (H2)
- **Font Family:** `"PP Neue Montreal", "Helvetica Neue", Arial, sans-serif`
- **Font Size:** `28px`
- **Font Weight:** `400`
- **Line Height:** `39.2px` (1.4x)
- **Color:** `rgba(16, 13, 13, 0.7)` (Muted black)
- **Text Align:** `center`
- **Max Width:** `900px`
- **Margin Top:** `15px`

### Primary CTA (Button - "Try for free")
- **Background Color:** `rgb(240, 54, 3)` (#F03603)
- **Text Color:** `rgb(255, 255, 255)` (#FFFFFF)
- **Font Family:** `"PP Supply Sans"`
- **Font Size:** `30px`
- **Border Radius:** `2px`
- **Height:** `86px`
- **Padding:** Custom (The computed width is `~220px`)

### Secondary CTA (Button - "Get a demo")
- **Background Color:** `rgb(255, 255, 255)` (#FFFFFF)
- **Border:** `1px solid rgb(16, 13, 13)` (Inferred from screenshot)
- **Text Color:** `rgb(16, 13, 13)`
- **Font Family:** `"PP Supply Sans"`
- **Font Size:** `30px`
- **Border Radius:** `2px`
- **Height:** `86px`
- **Padding:** `24px 33px`
