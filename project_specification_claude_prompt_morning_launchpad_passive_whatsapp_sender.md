# Project Specification & Claude Kickoff Prompt: Morning Launchpad (Passive WhatsApp Sender)

> **Instructions for Claude**: You are the Lead Mobile/Frontend Engineer. Your goal is to build a high-performance, ultra-lightweight, local-first web/mobile application called **"Morning Launchpad"**. Follow the exact technical stack, architecture, and feature specifications detailed below.

---

## 1. Executive Summary & Philosophy

### 1.1 The Core Problem
Most productivity and WhatsApp scheduling tools suffer from:
1. **Battery Drain & High Risk**: Relying on Android Accessibility services or background polling services that drain batteries and trigger Meta's anti-spam account bans.
2. **Mobile Usability Nightmare**: Managing contacts and bulk messaging via traditional desktop-oriented spreadsheet/grid tables on a small phone screen.
3. **Friction & Cognitive Overload**: Morning hours are lost to decision fatigue and hunting for links/drafts across multiple apps.

### 1.2 The "Passive" Solution
- **Zero Cloud / Local-First**: 100% of user data remains on the device (IndexedDB/LocalStorage). Zero backend server costs, zero privacy exposure.
- **Passive Triggering (0% Battery Consumption)**: No persistent background process. Leverages OS-level hardware alarms via `@capacitor/local-notifications`. The app can be completely killed; the OS wakes the user at the exact scheduled second.
- **Conveyor-Belt Semi-Automation**: Generates native `whatsapp://` deep links with pre-filled, personalized text. The user triggers with one tap and confirms send in WhatsApp, eliminating ban risk while taking seconds to clear.
- **Neuroscience-Backed Habit Loop**: Integrates the "24-Hour Reset" rule: One daily visible MIT (Most Important Task) and an evening decluttering queue to minimize morning friction.

---

## 2. Tech Stack & Lightweight Constraint

| Layer | Selection | Justification |
| :--- | :--- | :--- |
| **Framework** | **Vue 3 (Composition API, `<script setup>`) + Vite** | Lightweight runtime, blazing-fast reactive rendering. |
| **Styling** | **Tailwind CSS** | Zero runtime CSS overhead, easily purged for minimal bundle size. |
| **Native Wrapper** | **Capacitor 6+** | Bridges Web to Native iOS/Android with zero bloat. |
| **Local Database** | **Dexie.js (IndexedDB wrapper)** or LocalStorage | Handles thousands of contacts & message queues with zero network latency. |
| **Icons** | **Lucide-vue-next** | Tree-shakeable, clean, modern icons. |
| **Notifications** | `@capacitor/local-notifications` | Native system hardware alarm dispatching (UNNotificationRequest / AlarmManager). |

---

## 3. Detailed Feature Specifications (Features 1–5 Included)

### Feature 1: Spintax Engine (Anti-Ban Semantic Randomizer)
* **Problem**: Blasting identical text to 10+ people triggers WhatsApp spam heuristics.
* **Implementation**:
  * Support nested Spintax format: `{Hello|Hi|Good morning} {{name}}, {just checking in on|wanted to follow up regarding} {{topic}}...`
  * During queue generation, dynamically resolve random choices so every outgoing message is syntactically distinct.
  * Preview button in UI to cycle and sample generated variations.

### Feature 2: 1-Click Follow-Up Snooze & Cadence Loop
* **Problem**: Hitting "Send" is not the end of a communication cycle. Tracking who replied is messy.
* **Implementation**:
  * Upon marking an item as `Sent`, present an instant micro-action sheet:
    * `[ ⏱️ Follow up in 2 Days ]`
    * `[ 🌅 Tomorrow Morning ]`
    * `[ ✅ Done / No Follow-up ]`
  * Selecting a snooze duration automatically schedules a new local notification reminder tied to that contact's thread.

### Feature 3: Native `whatsapp://` Protocol Acceleration (No Browser Tab Leftover)
* **Problem**: `https://wa.me/` opens intermediate browser tabs that clutter the phone.
* **Implementation**:
  * Use the native URL scheme on mobile: `whatsapp://send?phone=[SANITIZED_PHONE]&text=[ENCODED_TEXT]`.
  * Fallback gracefully to `https://web.whatsapp.com/send?...` if running in a desktop browser.
  * **Conveyor Belt Mode**: A single, prominent button in the UI: **"Send to [Next Person] (1/8)"**. Tapping it fires the link, flags the item, and smoothly advances to the next recipient.

### Feature 4: Clipboard Auto-Detection & Smart Paste Parser
* **Problem**: Manually typing or editing tabular data on mobile is tedious.
* **Implementation**:
  * **Clipboard Hook**: On app focus / resume, inspect the clipboard via `navigator.clipboard.readText()`. If a phone number or contact pattern is detected, display a discreet floating action banner: *"Detected phone number: [852xxxxxxxx]. Add to Launch Queue?"*
  * **Smart Paste Parser**: User can paste unstructured text directly into a raw text box (e.g., copied from email or WhatsApp group). Regex automatically extracts:
    * Contact Name
    * Phone Number (removes dashes, spaces, and auto-prepends local prefix such as `852` if missing)
    * Custom note

### Feature 5: Mobile-First Card Stream & Contact Micro-Notes
* **Problem**: Excel-style grid tables are unusable on touchscreens.
* **Implementation**:
  * **Card Stream**: Contacts are displayed as compact vertical cards with swipe actions (Swipe right to launch WhatsApp, Swipe left to snooze/delete).
  * **Micro-Notes**: A single-line contextual note attached to each contact (e.g., *"Prefers text over calls"*, *"Budget sensitive"*), visible directly in the card preview before sending.
  * **Variable Quick-Chips**: In the message template editor, provide tap-to-insert chips: `+ {{name}}`, `+ {{time}}`, `+ {{note}}` directly above the virtual keyboard.

---

## 4. Supplementary Life-Workflow Integration

1. **Daily MIT Capsule (Top of Dashboard)**:
   * Displays the **single most important visible delivery** for the day.
   * Quick-launch buttons to open external contexts:
     * `[ 🌐 Open Gemini Gem ]` (custom URL scheme or direct web link)
     * `[ 📝 Open Google Tasks ]` (`https://tasks.google.com/embed/`)
2. **Emergency Mode (10-Minute De-escalation)**:
   * A single toggle button for bad/hectic days: Automatically snoozes non-essential queue messages to tomorrow, keeping only the single highest-priority message to maintain the user's daily victory streak.

---

## 5. TypeScript Data Models

```typescript
// Core Data Schema

export interface Contact {
  id: string;
  name: string;
  phone: string; // Sanitized, e.g. "85291234567"
  note?: string; // Micro-note context
  tags: string[];
  createdAt: number;
}

export interface MessageTemplate {
  id: string;
  title: string;
  content: string; // Supports Spintax and {{variables}}
}

export interface QueueItem {
  id: string;
  contactId: string;
  name: string;
  phone: string;
  rawTemplate: string;
  finalRenderedText: string; // Spintax and variables resolved
  scheduledTime: string; // ISO format or timestamp
  status: 'pending' | 'sent' | 'skipped' | 'snoozed';
  notificationId?: number;
  followUpDays?: number;
}

export interface DailyMIT {
  date: string; // YYYY-MM-DD
  title: string;
  deliveryGoal: string;
  gemUrl?: string;
  tasksUrl?: string;
  isCompleted: boolean;
}
```

---

## 6. UI / UX Layout Guide (Mobile Viewport)

```
┌──────────────────────────────────────────────┐
│  🌅 Morning Launchpad           [⚙️ Config]  │
├──────────────────────────────────────────────┤
│  🎯 TODAY'S MIT (One Visible Delivery)       │
│  "Finalize Landing Page Pitch Deck"          │
│  [💎 Open AI Gem]   [📋 Open Google Tasks]   │
├──────────────────────────────────────────────┤
│  🚀 WhatsApp Conveyor Belt                   │
│  ┌────────────────────────────────────────┐  │
│  │ NEXT UP (1/4): Ken                     │  │
│  │ 💬 "Hi Ken, just checking in on..."    │  │
│  │ 📝 Note: Decision maker, reply fast    │  │
│  │                                        │  │
│  │    [ 🚀 LAUNCH & SEND VIA WHATSAPP ]   │  │
│  └────────────────────────────────────────┘  │
│  [ ⏱️ Snooze 2 Days ]   [ ⏩ Skip to Next ]   │
├──────────────────────────────────────────────┤
│  📋 Launch Queue (3 remaining)               │
│  • Mary Wong (09:30) - Meeting Docs          │
│  • David Chan (10:00) - Follow-up invoice    │
├──────────────────────────────────────────────┤
│  ⚡ Quick Actions                             │
│  [ + Smart Paste ]   [ 📑 Manage Templates ] │
└──────────────────────────────────────────────┘
```

---

## 7. Direct Kickoff Prompt for Claude

Copy and paste the prompt below into a new Claude conversation to start coding:

```text
Hi Claude, I need you to act as a Senior Frontend/Mobile Engineer.
We are building "Morning Launchpad", an ultra-lightweight, local-first Vue 3 + Tailwind CSS + Capacitor web/mobile application.

Here are the non-negotiable requirements:
1. Local-First & 0-Cloud: Use LocalStorage or Dexie.js for all storage. No remote database or authentication.
2. WhatsApp Deep Linking: Use the native protocol `whatsapp://send?phone=${phone}&text=${encodedText}` with fallback to `https://wa.me/`.
3. Spintax Engine: Implement a parser that resolves `{opt1|opt2|opt3}` dynamically per recipient.
4. Smart Paste & Phone Sanitizer: Implement regex to parse pasted contact strings (Name, Phone with auto-prefixing, Notes).
5. 1-Click Follow-Up Action Sheet: Allow snoozing or creating follow-up queue reminders with one tap.
6. Passive Alarm System: Stub and prepare integration with `@capacitor/local-notifications`.
7. Minimalist Mobile UI: A clean, distraction-free cockpit featuring the daily MIT anchor and a single "Launch Next" Conveyor Belt button.

Please start by setting up the core utility functions:
1. `spintax.ts` (Spintax parser & variable replacement)
2. `sanitizer.ts` (Phone number cleaning & smart text parser)
3. `store.ts` (Reactive state store for MIT, Contacts, and Queue)
Then, provide the complete, clean single-file component for the Main Dashboard. Keep all code production-ready, modular, and lightweight.
```