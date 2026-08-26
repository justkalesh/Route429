---
name: Serene Operational Excellence
colors:
  surface: '#f9f9ff'
  surface-dim: '#d0daf0'
  surface-bright: '#f9f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f0f3ff'
  surface-container: '#e7eeff'
  surface-container-high: '#dee8ff'
  surface-container-highest: '#d9e3f9'
  on-surface: '#121c2c'
  on-surface-variant: '#424844'
  inverse-surface: '#273141'
  inverse-on-surface: '#ebf1ff'
  outline: '#727974'
  outline-variant: '#c1c8c3'
  surface-tint: '#476558'
  primary: '#163328'
  on-primary: '#ffffff'
  primary-container: '#2d4a3e'
  on-primary-container: '#99b9a9'
  inverse-primary: '#adcebe'
  secondary: '#685e40'
  on-secondary: '#ffffff'
  secondary-container: '#eddfb9'
  on-secondary-container: '#6c6244'
  tertiary: '#2d2e2c'
  on-tertiary: '#ffffff'
  tertiary-container: '#434442'
  on-tertiary-container: '#b1b1ae'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#c9ead9'
  primary-fixed-dim: '#adcebe'
  on-primary-fixed: '#022016'
  on-primary-fixed-variant: '#304d40'
  secondary-fixed: '#f0e1bc'
  secondary-fixed-dim: '#d3c6a2'
  on-secondary-fixed: '#221b04'
  on-secondary-fixed-variant: '#4f462b'
  tertiary-fixed: '#e3e2e0'
  tertiary-fixed-dim: '#c7c6c4'
  on-tertiary-fixed: '#1a1c1a'
  on-tertiary-fixed-variant: '#464745'
  background: '#f9f9ff'
  on-background: '#121c2c'
  surface-variant: '#d9e3f9'
typography:
  display:
    fontFamily: Geist
    fontSize: 48px
    fontWeight: '600'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Geist
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Geist
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.2'
  headline-md:
    fontFamily: Geist
    fontSize: 24px
    fontWeight: '500'
    lineHeight: '1.3'
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  code-md:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  label-caps:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: '1'
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
  xxl: 64px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 48px
  max-width: 1280px
---

## Brand & Style

The design system is rooted in "SaaS-calm"—a philosophy that prioritizes cognitive ease, professional reliability, and a warm, human touch. It targets high-growth startups and established enterprises that value precision without the cold, clinical feel of traditional corporate tools.

The aesthetic is **Warm Minimalism**. It leverages the structural integrity of high-end productivity tools like Linear, but softens the edges with a palette inspired by nature and architectural materials. The goal is to evoke a sense of focused tranquility, making complex workflows feel manageable and sophisticated.

## Colors

This design system utilizes a high-utility, low-vibration palette to maintain user focus.

- **Primary Action (#2D4A3E):** A deep muted forest green used for main calls to action and critical interactive states. It signals growth and stability.
- **Background (#FAF9F6):** A soft off-white "Alabaster" base that reduces eye strain compared to pure white.
- **Surface (#FFFFFF):** Pure white is reserved for elevated containers (cards, modals) to create clear visual separation from the background.
- **Accents (#D5C7A3):** Warm sand tones used for subtle borders, secondary buttons, and decorative elements that require a softer presence than the primary green.
- **Text (#2D3748):** A charcoal gray that provides high legibility without the harshness of pure black.

## Typography

The typography strategy balances modern technical precision with approachable legibility. 

- **Headlines:** Use **Geist** for its tight apertures and geometric clarity. It feels engineered and premium.
- **Body:** Use **Inter** for all long-form text and interface elements. Its neutrality ensures it stays out of the way of the content.
- **Data & Mono:** Use **JetBrains Mono** for API keys, code snippets, and tabular data. It provides a distinct "technical" texture that separates raw data from interface labels.
- **Hierarchy:** Maintain generous line heights (1.5x+) for body text to reinforce the "calm" narrative.

## Layout & Spacing

The layout philosophy is built on a **Fluid-Fixed Hybrid Grid**. 

1. **Structure:** Use a 12-column grid for desktop with a maximum content width of 1280px. 
2. **Rhythm:** All spacing must be a multiple of 4px. Use `lg` (24px) for standard component padding and `xxl` (64px) for section vertical spacing to ensure an airy, uncrowded feel.
3. **Mobile:** On mobile devices, margins shrink to 16px, and columns collapse to a single-column stack.
4. **Negative Space:** Intentionally leave "dead zones" in the UI to guide the eye toward primary actions without visual noise.

## Elevation & Depth

This design system avoids heavy shadows, instead using **Tonal Layering** and **Ghost Outlines**.

- **Level 0 (Base):** The #FAF9F6 background.
- **Level 1 (Cards/Surfaces):** Pure white surfaces with a 1px solid border of #D5C7A3 at 40% opacity. Use a very subtle ambient shadow: `0px 2px 4px rgba(45, 55, 72, 0.03)`.
- **Level 2 (Dropdowns/Modals):** Pure white surfaces with a slightly more defined shadow: `0px 10px 20px rgba(45, 55, 72, 0.08)`.
- **Transitions:** Hover states on interactive cards should slightly darken the border opacity rather than increasing the shadow depth, maintaining a flat, sophisticated appearance.

## Shapes

The shape language is defined by **Soft Geometricism**. 

- **Standard Radius:** 12px (0.75rem) for cards, input fields, and large buttons. This creates the "soft" feel requested while maintaining a professional SaaS structure.
- **Small Elements:** Use 6px for checkboxes and small tags.
- **Inner Radius:** When nesting elements, the inner border-radius should be the outer radius minus the padding to maintain concentric harmony.

## Components

### Buttons
- **Primary:** Background #2D4A3E, Text #FFFFFF. 12px radius. No shadow, just a solid, confident fill.
- **Secondary:** Background #FFFFFF, Border 1px #D5C7A3, Text #2D3748. 
- **Ghost:** No background or border, Text #2D4A3E. Used for low-priority navigation.

### Input Fields
- **Default State:** White background, 1px border (#D5C7A3 at 40%), 12px radius. 
- **Focus State:** Border color shifts to #2D4A3E (Primary) with a 2px outer ring of the same color at 10% opacity.

### Chips & Tags
- **Informational:** Background #D5C7A3 at 20% opacity, Text #2D3748, Mono font for IDs.
- **Success:** Background #2D4A3E at 10% opacity, Text #2D4A3E.

### Cards
- Pure white background, 12px radius, 1px subtle sand border. Use `lg` (24px) internal padding.

### Lists
- Use subtle #D5C7A3 horizontal dividers (20% opacity). Ensure list items have a minimum height of 48px to remain touch-friendly and visually clear.

### Additional Suggested Components
- **Step Indicators:** Use the Primary Green for active steps and the Warm Beige for incomplete steps to maintain the earthy, calm tone even in complex flows.
- **Empty States:** Use monochromatic illustrations in #D5C7A3 to keep the interface feeling quiet and helpful.