---
name: CopTrax — NERC Copra Trading
description: Procurement management system for Philippine copra trading — green authority, warm cream trust.
colors:
  green-dark: "#1b5e20"
  green-mid: "#2e7d32"
  green-light: "#4caf50"
  green-pale: "#e8f5e9"
  green-deep: "#024023"
  brown-dark: "#3e2723"
  brown-mid: "#5d4037"
  brown-light: "#8d6e63"
  cream: "#fffdf7"
  beige: "#faf6ee"
  beige-dark: "#e8dcc8"
  surface-warm: "#FFFEFB"
  surface-chat-bg: "#f5f0e8"
  text-ink: "#3d2b1f"
  text-muted: "#8b7355"
  text-mid: "#4E342E"
  white: "#ffffff"
typography:
  display:
    fontFamily: "Poppins, system-ui, sans-serif"
    fontSize: "clamp(2.5rem, 7vw, 4.5rem)"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Poppins, system-ui, sans-serif"
    fontSize: "clamp(1.75rem, 4vw, 2.25rem)"
    fontWeight: 700
    lineHeight: 1.2
  title:
    fontFamily: "Poppins, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.4
  body:
    fontFamily: "Poppins, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Poppins, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.08em"
rounded:
  pill: "9999px"
  card: "1.5rem"
  button: "1rem"
  input: "0.75rem"
  sm: "0.5rem"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
  section: "96px"
components:
  button-primary:
    backgroundColor: "{colors.green-dark}"
    textColor: "{colors.white}"
    rounded: "{rounded.button}"
    padding: "16px 32px"
  button-primary-hover:
    backgroundColor: "{colors.green-mid}"
    textColor: "{colors.white}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.green-dark}"
    rounded: "{rounded.button}"
    padding: "14px 32px"
  button-ghost-hover:
    backgroundColor: "{colors.green-pale}"
    textColor: "{colors.green-dark}"
  card:
    backgroundColor: "{colors.white}"
    rounded: "{rounded.card}"
    padding: "32px"
  chip:
    backgroundColor: "{colors.green-pale}"
    textColor: "{colors.green-dark}"
    rounded: "{rounded.pill}"
    padding: "6px 16px"
---

# Design System: CopTrax

## Overview

**Creative North Star: "The Cooperative Ledger"**

CopTrax reads like a well-kept physical ledger brought to life — trustworthy, grounded, and unhurried. Deep forest green carries the authority of an institution that has been here before and will be here after; warm cream and beige surfaces soften that authority into approachability, the way the wooden desk of a local cooperative office feels familiar to farmers who have trusted it for decades. Nothing about the interface screams; everything earns attention through clarity.

The system serves two distinct worlds simultaneously. The public-facing landing pages are clean, minimal, and green-dominant — designed to convert rural copra farmers who arrive via mobile with low trust. The operational dashboards behind login are denser, warmer, and cream-tinted — built for older adult staff who need legibility, predictability, and zero cognitive load on a long working day. Both worlds share the same token vocabulary; only their density and surface temperature shift.

Dark mode is a first-class consideration: every surface has a dark equivalent. Motion is purposeful and restrained — scroll reveals, one-time hero fade-ins, and state transitions only. Decorative animation (floating circles, grain overlays, shimmer gradients) exists only on public marketing surfaces and must never appear inside operational dashboards.

**Key Characteristics:**
- Deep forest green as the single accent color — no competing hues in operational contexts
- Warm cream/beige base on dashboards; clean white on public pages
- Poppins as the sole typeface across all roles — weight and size alone create hierarchy
- Rounded, friendly card shapes (24px) for surface containers; pill (full-radius) for action buttons
- Flat at rest, subtle lift on hover — shadow as a state response, not decoration
- Scroll-reveal entrance animations on public pages only; dashboards are instantly visible
- Dark mode supported via `data-theme="dark"` on `<html>`

---

## Colors

A deliberate monochrome palette anchored by forest green, graduated from deep authority (`#024023`) through institutional green (`#1b5e20`) to friendly accent (`#4caf50`), sitting on warm cream surfaces that read like natural parchment.

### Primary — Forest Green Scale
- **Copra Green Deep** (`#024023`): Darkest green; used for sidebar backgrounds and section headers in the most authoritative UI contexts (e.g. chat layout headers). Never used for body text.
- **Forest Green** (`#1b5e20`): Primary brand color. Used for all primary buttons, active navigation states, section headings in operational dashboards, and key metric values. The main identity anchor.
- **Grove Green** (`#2e7d32`): Mid-tone; used for hover states on Forest Green elements, secondary action buttons, and selected-state backgrounds.
- **Meadow Green** (`#4caf50`): Lighter accent; used for icon fills, success states, progress bar fills, `animate-pulse` dots, and hover fills on ghost buttons.
- **Mist Green** (`#e8f5e9`): Near-white green tint; used for chip/badge backgrounds, section-label pills, light icon surrounds, and subtle hover fills. The "green on white" safe zone.

### Neutral — Warm Cream & Earth
- **Cream** (`#fffdf7`): Base HTML background. The warmest white — used for the overall page canvas in dashboard contexts.
- **Parchment** (`#faf6ee`): Slightly richer warm white; used for alternating section backgrounds and beige section zones.
- **Bisque** (`#e8dcc8`): Warm medium beige; used for borders, dividers, and low-contrast separators on cream surfaces.
- **Chat Surface** (`#FFFEFB`): Nearly identical to Cream; used specifically for the received-message bubble and chat scroll-area background.
- **Copra Tan** (`#f5f0e8`): Warm mid-beige; used for chat panel sidebars and conversation list backgrounds.

### Text
- **Ink** (`#3d2b1f`): Primary text on cream/white. The darkest warm-brown used for running text in chat and dense operational contexts.
- **Espresso** (`#4E342E`): Dark brown; heading text on cream surfaces in dashboard components where the context is warm.
- **Driftwood** (`#8b7355`): Muted warm text for secondary labels, timestamps, and metadata.
- **Fog** (`#b09a7a`): Lightest warm text; placeholder and tertiary caption use only.
- **Sage Ink** (`#2d5a27`): Darker green text; used for green-colored body copy (e.g. "accepted" labels, price values) where full-saturation green would feel too bright.

### Named Rules
**The One Green Rule.** The green scale is the only non-neutral accent used in the UI. Yellow, orange, red, and purple accent colors must not be introduced to the dashboard. Status indicators (success, warning, error) use green, amber-neutral, and red-neutral from Tailwind's default scale — never a brand-new hue that would compete with Copra Green.

**The Warm Neutrals Rule.** Pure `#000000` black and pure neutral gray backgrounds (`#f5f5f5`) are avoided. All surfaces carry at least a whisper of warmth. This keeps the cream base from reading as clinical.

---

## Typography

**Display & Body Font:** Poppins (with `system-ui, sans-serif` fallback)
**Label / Uppercase Tracking Font:** Poppins at 700 weight with 0.08em letter-spacing

**Character:** A single humanist geometric sans that does all the work across every role. Hierarchy is expressed entirely through weight (400 → 800) and size. The uniformity reads as institutional confidence; there is no decorative typeface competing for attention.

### Hierarchy
- **Display** (800 weight, `clamp(2.5rem, 7vw, 4.5rem)`, line-height 1.1): Hero headlines on landing pages only. The largest, boldest expression of the brand.
- **Headline** (700–800 weight, `clamp(1.75rem, 4vw, 2.25rem)`, line-height 1.2): Page-level titles on landing sections and modal headings. Also used for `<h1>` inside authenticated page headers.
- **Title** (700 weight, `1.125rem–1.25rem`, line-height 1.4): Card headings, sidebar section labels, table column group headers.
- **Body** (400–500 weight, `0.875rem–1rem`, line-height 1.6): All running text, descriptions, form field values, chat messages. Max line length ~70ch on wider containers.
- **Label** (700 weight, `0.75rem`, letter-spacing 0.08em, ALL CAPS): Status badges, filter pills, section eyebrow labels ("WHY FARMERS CHOOSE US"), table column headers.

### Named Rules
**The Weight-Only Rule.** Type hierarchy is expressed by weight and size alone — never by switching to a second typeface or introducing a serif accent. The uniformity of Poppins is what makes the system feel cohesive across 20+ page types.

---

## Layout

The content model uses a 12-column conceptual grid with a `max-w-6xl` (72rem) container and `mx-auto` centering, with `px-4 sm:px-5` horizontal padding at the page level. Dashboard pages use a fixed sidebar (240px collapsed / 64px icon mode) with a fluid main content area.

**Breakpoints (Tailwind defaults):**
- Mobile: < 640px
- Tablet: 640px–1023px
- Desktop: ≥ 1024px

**Public pages:** Full-bleed hero sections stack vertically. Feature grids use `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`. Content sections carry `py-16 sm:py-24` vertical rhythm.

**Dashboard pages:** The main content area uses `p-4 sm:p-6 lg:p-8` internal padding. Stat/metric rows use `grid-cols-2 sm:grid-cols-4`. Card content uses `p-6 sm:p-8`. Filter bars and action bars are flex-row on desktop, stacked on mobile. Mobile filter menus collapse the button group into a single `<select>` or dropdown to prevent overflow.

**Spacing rhythm:** Based on a 4px base unit. Component internal padding follows `sm: 8px`, `md: 16px`, `lg: 24px`. Section gaps follow `gap-5 sm:gap-6` for card grids and `gap-3 sm:gap-4` for form rows.

---

## Elevation & Depth

The system is **flat at rest, lifted on interaction**. Depth is not used decoratively; shadow appears only as a state-response to tell the user something is active or elevated above the canvas.

### Shadow Vocabulary
- **Card rest** (`0 2px 20px rgba(0,0,0,0.06)`): All cards, panels, and modal surfaces at rest. Extremely subtle — just enough to float the surface off the cream background.
- **Card hover** (`0 8px 30px rgba(0,0,0,0.12)`): Cards on hover. The increased blur and y-offset confirm the hover lift (-2px translate) without drama.
- **Glow Green** (`0 0 40px rgba(76,175,80,0.25)`): Used sparingly on green CTA buttons and active navigation items to radiate brand energy. Exclusively for primary interactive success states.
- **Ambient small** (`box-shadow: sm` in Tailwind: `0 1px 2px rgba(0,0,0,0.05)`): Utility-class fallback for inline elements like avatar badges and stat count chips.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are at rest with only `shadow-card` (or no shadow). Stronger shadows (`shadow-card-hover`, `glow-green`) appear only as a response to interaction. No surface permanently floats at full elevation.

---

## Shapes

CopTrax uses a **rounded-first form language** — generously curved at the macro (cards, modals, section containers) and pill-shaped at the micro (buttons, chips, badges). Hard angles are absent except inside data tables.

- **Pills** (`border-radius: 9999px`): All action buttons, filter chips, nav links, status badges, avatar rings, and the top nav bar itself. The pill is the primary action-element shape.
- **Cards** (`border-radius: 1.5rem` / `rounded-3xl`): Page-level content containers on the public landing pages and large dashboard panels.
- **Dashboard cards** (`border-radius: 0.75rem–1rem` / `rounded-xl`, `rounded-2xl`): Tighter radius for denser dashboard components. `rounded-xl` (12px) is the dominant radius inside authenticated pages.
- **Modals** (`border-radius: 1.5rem` / `rounded-3xl`): Full modals use `rounded-3xl` to feel inviting; inner panes may use `rounded-2xl`.
- **Inputs** (`border-radius: 0.75rem` / `rounded-xl`): Form fields. Rounded enough to feel friendly, tight enough to feel precise.
- **Image thumbnails**: `rounded-2xl` or `rounded-3xl` with `overflow-hidden`. Never hard-clipped square.

### Named Rules
**The No Right-Angle Rule.** No visible UI container uses a `0` or `2px` border-radius. The only hard rectangles allowed are table rows and horizontal dividers — structural elements where radius would look odd, not surfaced containers.

---

## Components

### Buttons
Bold, pill-shaped, transition to darker-green on hover. Never decorative — every button is a direct invitation to act.

- **Shape:** `border-radius: 9999px` (pill). Large CTA: `padding: 16px 32px`. Small: `padding: 8px 20px`.
- **Primary:** `background: #1b5e20`, `color: white`. On hover: `background: #2e7d32`, `transform: translateY(-1px)`, shadow-glow-green optional.
- **Ghost / Outline:** `background: transparent`, `color: #1b5e20`, `border: 2px solid #1b5e20`. On hover: `background: #e8f5e9`.
- **Destructive:** `background: transparent`, `color: #dc2626`, `border: 2px solid #dc2626`. On hover: `background: #fee2e2`. Used only in delete-confirmation contexts.
- **Disabled:** 40% opacity, `cursor: not-allowed`, no hover lift.
- **Transition:** `all 0.3s ease` on all interactive state changes.

### Chips / Badges
The chip vocabulary covers filter selections, status labels, and category tags.

- **Default chip:** `background: #e8f5e9`, `color: #1b5e20`, `font-size: 0.75rem`, `font-weight: 700`, `letter-spacing: 0.08em`, `padding: 6px 16px`, `border-radius: 9999px`.
- **Active / selected filter chip:** `background: #1b5e20`, `color: white`.
- **Status chip (Pending / Active / Completed / Breached):** Same pill shape, color varies by state. "Active" uses green; "Breached" uses red-neutral; "Completed" uses a muted green; "Pending" uses a warm amber-neutral.

### Cards / Containers
The workhorse container of the system. Two density modes:

- **Landing page card:** `background: white`, `border-radius: 1.5rem`, `box-shadow: 0 2px 20px rgba(0,0,0,0.06)`, `border: 1px solid #e8dcc8`, `padding: 32px`. On hover: `transform: translateY(-8px)`, `box-shadow: 0 8px 30px rgba(0,0,0,0.12)`.
- **Dashboard card:** `background: white`, `border-radius: 0.75rem` (or 1rem), `box-shadow: 0 2px 20px rgba(0,0,0,0.06)`, `border: 1px solid rgba(27,94,32,0.1)`, `padding: 24px`.

### Inputs / Fields
- **Style:** `background: white`, `border: 1px solid #e8dcc8`, `border-radius: 0.75rem`, `padding: 10px 14px`, `font-size: 0.875rem`, `color: #3d2b1f`.
- **Focus:** `border-color: #1b5e20`, `box-shadow: 0 0 0 3px rgba(27,94,32,0.1)`.
- **Error:** `border-color: #dc2626`, `box-shadow: 0 0 0 3px rgba(220,38,38,0.1)`.
- **Disabled:** `background: #faf6ee`, `color: #b09a7a`, `cursor: not-allowed`.
- **Placeholder:** `color: #b09a7a`.

### Navigation
The sidebar and top nav are the identity anchors of the authenticated experience.

- **Sidebar (dashboard):** `background: #FFFEFB` (light cream), `border-right: 1px solid #e8dcc8`. Active link: `background: #e8f5e9`, `color: #1b5e20`, left-border accent `3px solid #1b5e20`. Width: 240px expanded, 64px icon-only collapsed.
- **Top nav (public landing):** Frosted white pill — `background: rgba(255,255,255,0.9)`, `backdrop-filter: blur(24px)`, `border: 1px solid rgba(27,94,32,0.1)`, `border-radius: 9999px`. Fixed to top, floats above page content.
- **Mobile nav drawer:** Slides in as a panel; links are full-width with `padding: 12px 20px`, `border-radius: 12px` on active state.

### Negotiation Chat Widget (Signature Component)
A floating bottom-right widget on Supplier pages that provides inline price negotiation without leaving the current page.

- **Bubble trigger:** 56×56px circle, `background: #1b5e20`, white icon, optional yellow unread-count badge. Slides up from the bottom-right corner.
- **Panel:** `width: 380px`, `max-height: 520px`, `border-radius: 24px`, `background: white`, `border: 1px solid rgba(27,94,32,0.15)`, `box-shadow: 0 24px 48px rgba(0,0,0,0.18)`. Three panel sections: sticky header (green-tinted), scrollable message area (cream surface `#FFFEFB`), and a sticky input footer.
- **Message bubbles:** Sent (Supplier) bubbles are warm cream `#FFFEFB` with a warm border; received (BO) bubbles are green-pale `#e8f5e9` with a green-dark border. Both use `border-radius: 18px` with a flat corner toward the avatar side (`rounded-bl-sm` / `rounded-br-sm`).
- **Proposal cards:** Centered full-width cards inside the chat thread with a green header band, price/volume details, and action buttons. Distinct from message bubbles — these are system messages, not chat turns.

---

## Do's and Don'ts

### Do:
- **Do** use `#1b5e20` (Forest Green) as the primary action color for all CTA buttons, active states, and primary numeric values (prices, weights).
- **Do** apply `border-radius: 9999px` (pill) to all standalone action buttons and navigation pills.
- **Do** use `border-radius: 1.5rem` (rounded-3xl) for large page-level card containers on landing pages, and `border-radius: 0.75rem–1rem` for dashboard cards.
- **Do** use `box-shadow: 0 2px 20px rgba(0,0,0,0.06)` at rest and upgrade to `0 8px 30px rgba(0,0,0,0.12)` on hover. Never skip the rest shadow entirely on cards.
- **Do** express type hierarchy through Poppins weight (400 → 800) and size alone. No second typeface.
- **Do** restrict scroll-reveal animations (`animate-fade-in-up`, `reveal`, `reveal-left`, `reveal-right`) to public landing pages only. Dashboard content must appear immediately.
- **Do** keep the green scale as the sole accent. Use Tailwind's default `red-500`/`amber-500` for status indicators, then return to green.
- **Do** use cream (`#fffdf7`) or near-white (`#FFFEFB`) for all dashboard content surfaces. Never use pure cool-gray backgrounds.
- **Do** use `transition: all 0.3s ease` as the default state-change transition. Reserve `cubic-bezier(0.16, 1, 0.3, 1)` for entrance animations only.

### Don't:
- **Don't** introduce yellow, orange, brown gradient, or multi-hue gradient accent backgrounds inside operational dashboards. These belong only on legacy marketing sections, if at all.
- **Don't** use the `grain`, `liquid-glass`, `animate-gradient`, or `animate-float` utilities anywhere inside authenticated dashboard pages. They are public-landing-page-only.
- **Don't** use hard right-angle (`border-radius: 0`) corners on surface containers, modals, or action buttons.
- **Don't** use `box-shadow: glow-green` on anything other than primary CTAs or active navigation items. Overuse degrades its signal value.
- **Don't** apply `text-brown-dark`, `text-brown-mid`, or `bg-beige` to public-landing-page headings or card titles. Public-facing typography should use `text-green-dark` as the dominant heading color.
- **Don't** place business logic, calculations, or database queries in the frontend. The UI is a thin presentation layer over Supabase Edge Functions.
- **Don't** use decorative animations (floating circles, gradient shifts, shimmer text) in operational dashboards — they distract staff from their task.
- **Don't** allow multiple simultaneously elevated surfaces (e.g. two `shadow-card-hover` elements side-by-side). Only the element currently under focus/hover should be at maximum elevation.
