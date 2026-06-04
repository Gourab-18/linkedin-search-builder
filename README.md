# LinkedIn Search Builder ( https://linkedin-search-builder.vercel.app/ )

A browser-based tool to supercharge your LinkedIn job search using a CSV of target companies.

Upload your company list → get AI-powered search strings, connection messages, and direct LinkedIn links — all in one click.

---

## What it does

- Upload any CSV file containing company names
- Select which column has the company names
- Click any company to instantly get:
  - Ready-to-use LinkedIn search strings in format `"Role" "Company"`
  - Direct LinkedIn search links (opens in new tab)
  - AI-generated 2-line company summary
  - Personalized LinkedIn connection messages for each role
- Filter roles by category: ML/AI, Backend, Full Stack, Data, Recruiter, Management
- Add custom roles not suggested by AI
- Star favorites, add notes per company, bulk copy across multiple companies

---

## Features

### Phase 1 — Core
| Feature | Description |
|---|---|
| CSV Upload | Upload any CSV, pick the company name column |
| AI Role Suggestions | Grok API suggests relevant roles per company based on what they do |
| One-Click Copy | Copy any search string instantly |
| LinkedIn URL | Opens LinkedIn People search directly in new tab |
| Role Filter | Toggle between ML/AI, Backend, Full Stack, Data, Recruiter, Management |
| Custom Role | Add your own role for any company |
| Company Intel | 2-line AI summary of what each company does |

### Phase 2 — Productivity
| Feature | Description |
|---|---|
| Connection Message | AI generates a personalized <300 char LinkedIn connect message per role |
| Notes | Add private notes per company (saved across sessions) |
| Favorites | Star any search string, view all favorites in one place |
| Bulk Copy | Select multiple companies and copy all their search strings at once |

### Phase 3 — Advanced
| Feature | Description |
|---|---|
| Relevance Score | Each role scored 1-3 based on how likely the company hires for it |
| Current Employees URL | LinkedIn URL filtered to current employees with that role |
| CSV Export | Export company list with your notes, status, and favorited roles |
| Multi-CSV Merge | Upload additional CSVs — new companies are merged, duplicates skipped |

---

## Setup

1. Clone the repo
2. Run `npm install`
3. Run `npm run dev`
4. Open in browser
5. Paste your [Grok API key](https://console.x.ai) in the settings panel — saved automatically

No backend. No database. Runs entirely in your browser.

---

## Tech Stack

- React + Vite
- Tailwind CSS
- Grok API (xAI) — `grok-3-mini`
- PapaParse — CSV parsing
- localStorage — all data persisted locally

---

## Who is this for

Anyone doing active job searching who maintains a target company list and wants to:
- Find recruiters and engineers at specific companies on LinkedIn
- Send personalized connection requests without writing from scratch every time
- Track outreach progress company by company

---

## Search String Format

All search strings follow the format LinkedIn actually supports:


<img width="1470" height="803" alt="Screenshot 2026-06-04 at 7 52 31 AM" src="https://github.com/user-attachments/assets/1215018f-5165-4a84-a338-819aa63a1151" />

<img width="1470" height="813" alt="Screenshot 2026-06-04 at 7 52 48 AM" src="https://github.com/user-attachments/assets/31416d51-8ee3-491d-b1b5-9618c9a4ab24" />


<img width="687" height="82" alt="Screenshot 2026-06-04 at 7 53 01 AM" src="https://github.com/user-attachments/assets/df57ac47-5cf7-4ee2-9338-659250d53fc3" />

<img width="592" height="75" alt="Screenshot 2026-06-04 at 7 53 11 AM" src="https://github.com/user-attachments/assets/43882845-e979-4ee3-8374-e5d6c6845867" />

<img width="729" height="82" alt="Screenshot 2026-06-04 at 7 53 17 AM" src="https://github.com/user-attachments/assets/10941cc5-2ab7-4b37-8d5f-076a4fe3dffe" />

<img width="280" height="123" alt="Screenshot 2026-06-04 at 7 53 24 AM" src="https://github.com/user-attachments/assets/90bbfdec-63c8-41e4-88a6-3fd6e5c5ed64" />

<img width="326" height="159" alt="Screenshot 2026-06-04 at 7 53 32 AM" src="https://github.com/user-attachments/assets/568cd4c9-b416-4da1-9884-ff42d63b067b" />

<img width="925" height="167" alt="Screenshot 2026-06-04 at 7 53 39 AM" src="https://github.com/user-attachments/assets/72be87d6-be72-4d0e-8767-0731a0009497" />








