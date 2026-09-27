# CodeArena Frontend

CodeArena is a secure, real-time coding competition platform designed for controlled laboratory environments. This repository contains the frontend application built to conduct fair coding competitions with centralized management.

## 🚀 Getting Started

Official integrated environment (repository root):

```bash
make docker-build-codearena
make docker-up-codearena
```

Open [http://localhost:8080](http://localhost:8080). Nginx serves this app and `/api`.

Isolated UI iteration (this directory only):

```bash
npm install
npm run dev
```

`next dev` is not the official stack. Authentication and application APIs must be tested through `http://localhost:8080`.

---

# Architecture Report

This section outlines the technology stack, design philosophy, and structural architecture of the **CodeArena** frontend application.

## 🛠️ Technology Stack

The frontend is built as a modern, single-page application (SPA) heavily utilizing server-side rendering (SSR) capabilities.

*   **Language**: JavaScript (ES6+). Per requirements, TypeScript was not used.
*   **Framework**: [Next.js (v14/v15)](https://nextjs.org/) utilizing the modern **App Router** (`/app` directory) for layouts, routing, and React Server Components.
*   **UI Library**: React.js (v19).
*   **Styling**: **Vanilla Custom CSS** (`globals.css`). We explicitly avoided Tailwind CSS to maintain maximum flexibility and adhere to the requirement of building a custom design system from scratch.
*   **Icons**: [Lucide React](https://lucide.dev/), chosen for its clean, lightweight, and modern SVG icon set.
*   **Integrated IDE**: [CodeMirror 6](https://codemirror.net/). A highly extensible code editor for the web. We built a custom React wrapper around the core CodeMirror libraries to support syntax highlighting for Python, C++, Java, and JavaScript.

## 🎨 Design System & Aesthetics

The application features a **Premium Dark-Mode Cyberpunk** aesthetic. This was achieved through a meticulously crafted `globals.css` file containing:

*   **CSS Variables (Design Tokens)**: Centralized definitions for colors (`--bg-primary`, `--accent-cyan`), spacing, typography, and shadows.
*   **Glassmorphism**: Extensive use of semi-transparent backgrounds with `backdrop-filter: blur()` to create depth and a modern UI feel.
*   **Dynamic Backgrounds**: An animated, glowing gradient background using CSS `radial-gradient` and `@keyframes` that slowly shifts to make the UI feel alive.
*   **Typography**: Combination of *Inter* (UI text), *Orbitron* (Headers/Logos for a futuristic feel), and *JetBrains Mono* (Code blocks and terminal).
*   **Custom Components**: Reusable CSS classes for `.card`, `.btn`, `.badge`, and `.data-table` to ensure extreme consistency across all pages without duplicating code.

## 📁 Project Structure & Routing

The application uses Next.js App Router for role-based routing and layout nesting.

```text
codearena-frontend/
├── app/                      # Next.js App Router
│   ├── admin/                # Admin Panel Routes
│   │   ├── layout.js         # Protected Admin Layout (Sidebar + Topbar)
│   │   ├── page.js           # Admin Dashboard
│   │   ├── contests/         # Contest Management
│   │   ├── questions/        # Question Bank
│   │   ├── monitor/          # System Monitor
│   │   └── settings/         # Platform Settings
│   ├── client/               # Participant Routes
│   │   ├── layout.js         # Protected Client Layout
│   │   ├── page.js           # Participant Dashboard
│   │   ├── practice/         # Practice Editor (CodeMirror)
│   │   ├── contests/         # Active/Upcoming Contests
│   │   └── submissions/      # Submission History
│   ├── layout.js             # Root Layout (Injects AuthContext & CSS)
│   ├── page.js               # Login / Landing Page
│   └── globals.css           # Core Design System
├── components/               # React Components
│   └── ui/                   
│       ├── Sidebar.js        # Reusable Navigation
│       ├── TopBar.js         # Header & User Profile
│       ├── Card.js           # Layout Container
│       ├── Button.js         # Interactive Buttons
│       ├── Badge.js          # Status Indicators
│       └── Editor.js         # Custom CodeMirror 6 Wrapper
└── lib/                      # Utilities & Services
    ├── AuthContext.js        # Global State Management for Users
    └── mockData.js           # Simulated Backend Database
```

## 🔐 State Management & Data Flow

*   **Authentication**: Managed via React's `Context API` (`AuthContext.js`). Login uses `POST /api/auth/login`; session restore uses `GET /api/auth/me`. Role-specific M4 APIs (`/api/admin/*` or `/api/student/*`) load after authentication.
*   **Route Protection**: The layouts (`app/admin/layout.js` and `app/client/layout.js`) act as route guards (UX only). Backend RBAC remains the security boundary.
*   **Mock / future UI**: Contest, question, and submission screens still use `lib/mockData.js` because those backend APIs do not exist yet. Dashboard identity and application status come from the live API.

## 🚀 Key Technical Highlights

1.  **Split-Pane Editor**: The Practice Area and Contest Arena utilize a CSS Grid layout to create a split-pane interface, allowing users to read the problem on the left while coding on the right.
2.  **Role Abstraction**: The login page automatically detects if a user is an admin or student based purely on their credentials, abstracting the role-selection away from the user for better security UX.
3.  **Terminal Simulation**: The UI includes a custom terminal output box that formats code execution results, simulating a real lab-based compilation environment.
