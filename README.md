# ExplorerRS

> **ExplorerRS** is a development tool for connecting a web-based Explorer interface to Roblox Studio.

The name **RS** means **Roblox Studio**.

ExplorerRS is designed to let developers inspect and manage the complete Roblox Studio Instance hierarchy from an external interface.

---

## 🎯 Project Goal

ExplorerRS will connect:

```text
┌─────────────────────────┐
│     ExplorerRS Web      │
│ React + TypeScript      │
└────────────┬────────────┘
             │
             │ WebSocket
             ▼
┌─────────────────────────┐
│    ExplorerRS Bridge    │
│        Node.js          │
└────────────┬────────────┘
             │
             │ WebSocket
             ▼
┌─────────────────────────┐
│      Roblox Studio      │
│    ExplorerRS Plugin    │
└─────────────────────────┘
```

The long-term goal is:

```text
Connect to Roblox Studio
        ↓
Receive Hierarchy
        ↓
Display the complete Explorer tree
        ↓
Read scripts and properties
        ↓
Edit scripts and properties
        ↓
Create Instances
        ↓
Delete Instances
        ↓
Move Instances
        ↓
Rename Instances
        ↓
Send changes back to Roblox Studio
```

---

# 🧠 Important Design Principle

ExplorerRS is **not a normal file explorer**.

Roblox Studio uses an **Instance hierarchy**.

For example:

```text
Workspace
└── Weapons
    └── Sword
        ├── Handle
        └── AttackScript
```

`Weapons` may be a `Folder`.

`Sword` may be a `Tool` or `Model`.

`Handle` may be a `Part`.

`AttackScript` may be a `Script`.

ExplorerRS must preserve this complete hierarchy.

The system must therefore store:

- Instance ID
- Instance name
- ClassName
- Parent
- Children
- Full path
- Script source when applicable
- Relevant properties

Example:

```text
Workspace.Weapons.Sword.AttackScript
```

The system must **not** treat `AttackScript` as an independent file.

---

# 🏗️ Current Architecture

```text
ExplorerRS
│
├── apps/
│   ├── web/                 # React frontend
│   └── bridge/              # Node.js communication bridge
│
├── packages/
│   └── shared/              # Shared ExplorerRS protocol
│
├── roblox/
│   └── plugin/              # Roblox Studio plugin
│
├── docs/
│   ├── architecture/
│   └── protocol/
│
├── tests/
│
├── .gitignore
├── package.json
└── README.md
```

---

# 📦 Technology Stack

## Frontend

- React
- TypeScript
- Vite
- ESLint

## Bridge

- Node.js
- TypeScript
- WebSocket

## Roblox

- Roblox Studio Plugin
- Luau

## Shared Protocol

- TypeScript
- JSON-compatible messages
- WebSocket communication

## Development

- Git
- GitHub
- GitHub Codespaces

---

# 📊 Project Status

| Task | Status |
|---|---|
| Repository | ✅ Complete |
| Web Foundation | ✅ Complete |
| Shared Protocol | ✅ Complete |
| `.gitignore` | ✅ Complete |
| WebSocket Bridge | 🔜 Next |
| Roblox Studio Plugin | ⏳ |
| Connection Handshake | ⏳ |
| Receive Hierarchy | ⏳ |
| Explorer UI | ⏳ |
| Script Reading | ⏳ |
| Script Editing | ⏳ |
| Create Instances | ⏳ |
| Delete Instances | ⏳ |
| Move Instances | ⏳ |
| Rename Instances | ⏳ |
| Send Hierarchy Data | ⏳ |
| Two-Way Synchronization | ⏳ |
| Validation & Safety | ⏳ |
| Production Build | ⏳ |

---

# 🌳 Git Branch Strategy

`main` is the stable branch.

Development should happen on:

```text
feature/explorerrs-v1
```

Do **not** push development changes directly to `main`.

## Check current branch

```bash
git branch --show-current
```

## Switch to development branch

```bash
git switch feature/explorerrs-v1
```

## Create the branch if it does not exist

```bash
git switch -c feature/explorerrs-v1
```

## Push to the development branch

```bash
git push -u origin feature/explorerrs-v1
```

After the first push, this is usually enough:

```bash
git push
```

## Check remote branches

```bash
git branch -a
```

## Check Git status

```bash
git status
```

---

# 💾 Git Workflow

Before starting work:

```bash
git switch feature/explorerrs-v1
git status
```

After making changes:

```bash
git status
```

Stage changes:

```bash
git add .
```

Review staged changes:

```bash
git diff --cached
```

Commit:

```bash
git commit -m "feat: describe your change"
```

Push:

```bash
git push
```

---

# 🚨 Safe Git Workflow

Before committing, always check:

```bash
git status
```

Check what will be committed:

```bash
git diff --cached
```

Do not commit:

```text
node_modules/
dist/
build/
.cache/
.env
temporary files
logs
editor cache
```

---

# 📦 Installing Dependencies

After cloning the repository or removing `node_modules`:

```bash
npm install
```

This recreates the required `node_modules` directories.

`node_modules` should never be committed to Git.

---

# 🧪 Testing

Run shared protocol tests:

```bash
npm run test --workspace=@explorerrs/shared
```

Build the shared package:

```bash
npm run build --workspace=@explorerrs/shared
```

Run the web build:

```bash
npm run build --workspace=apps/web
```

---

# 🌐 Running the Web Application

Start the Vite development server:

```bash
npm run dev --workspace=apps/web
```

Vite normally provides:

```text
Local:   http://localhost:5173/
Network: http://...
```

In GitHub Codespaces, open the forwarded port `5173` to access the application from a mobile browser.

---

# 🧹 Check Trash / Cache Files

Use this command to find common generated files and directories:

```bash
find . -type d \( -name node_modules -o -name dist -o -name build -o -name .cache -o -name .vite -o -name coverage -o -type f -name '*.log' -o -name '*.tsbuildinfo' \) -print
```

This command only **checks** files.

It does not delete anything.

---

# 🗑️ Remove Generated / Trash Files

## Remove all `node_modules`

```bash
find . -type d -name node_modules -prune -exec rm -rf {} +
```

## Remove all build output

```bash
find . -type d -name dist -o -name build -prune -exec rm -rf {} +
```

## Remove common caches

```bash
find . -type d -name .cache -o -name .vite -o -name coverage -prune -exec rm -rf {} +
```

## Remove TypeScript build cache

```bash
find . -type f -name '*.tsbuildinfo' -delete
```

## Remove log files

```bash
find . -type f -name '*.log' -o -name 'npm-debug.log*' -delete
```

## Remove all common generated files

Use this when you intentionally want a clean development environment:

```bash
find . -type d -name node_modules -o -name dist -o -name build -o -name .cache -o -name .vite -o -name coverage -prune -exec rm -rf {} +
find . -type f -name '*.tsbuildinfo' -o -name '*.log' -o -name 'npm-debug.log*' -delete
```

After cleanup:

```bash
npm install
```

---

# 🔍 Check Whether Git Tracks Trash Files

Check tracked `node_modules`:

```bash
git ls-files | grep node_modules
```

Check tracked build output:

```bash
git ls-files | grep -E '(^|/)(dist|build)/'
```

If both commands produce no output, Git is not tracking those files.

---

# 🚫 `.gitignore`

ExplorerRS ignores generated and machine-specific files.

Important ignored paths include:

```text
node_modules/
dist/
build/
.cache/
.vite/
coverage/
.env
*.log
*.tsbuildinfo
```

If a file was already tracked before adding it to `.gitignore`, `.gitignore` alone will not remove it from Git tracking.

---

# 🔓 Untrack Files Without Deleting Them

If `node_modules` was previously committed:

```bash
git rm -r --cached --ignore-unmatch node_modules
```

For workspace dependencies:

```bash
git rm -r --cached --ignore-unmatch apps/web/node_modules
git rm -r --cached --ignore-unmatch packages/shared/node_modules
```

To find all tracked `node_modules`:

```bash
git ls-files | grep node_modules
```

After untracking:

```bash
git status
```

Then commit:

```bash
git add .gitignore
git commit -m "chore: stop tracking dependencies"
git push
```

The files remain on the machine but are no longer tracked by Git.

---

# 🔄 Clean Dependency Reinstallation

If dependencies become corrupted:

```bash
find . -type d -name node_modules -prune -exec rm -rf {} +
npm install
```

---

# 📁 Inspect Project Structure

Show the project tree:

```bash
find . -maxdepth 3 -type f | sort
```

Show shared package files:

```bash
find packages/shared -maxdepth 3 -type f | sort
```

Show web files:

```bash
find apps/web -maxdepth 3 -type f | sort
```

---

# 🔎 Useful Git Commands

Current branch:

```bash
git branch --show-current
```

Repository status:

```bash
git status
```

Recent commits:

```bash
git log --oneline --decorate -10
```

Show remote:

```bash
git remote -v
```

Show branches:

```bash
git branch -a
```

Show changed files:

```bash
git status --short
```

Show unstaged changes:

```bash
git diff
```

Show staged changes:

```bash
git diff --cached
```

---

# ↩️ Undo Staging

If you accidentally staged everything:

```bash
git restore --staged .
```

The files are not deleted.

They are simply removed from the staging area.

---

# ↩️ Discard Local Changes

⚠️ This permanently discards unstaged changes.

```bash
git restore .
```

Do not use this unless you are sure you want to discard your changes.

---

# 🔄 Update Your Development Branch

Fetch the latest remote information:

```bash
git fetch origin
```

Check status:

```bash
git status
```

Pull updates:

```bash
git pull --rebase origin feature/explorerrs-v1
```

---

# 🧪 Recommended Development Cycle

Use this workflow for ExplorerRS:

```text
1. Switch branch
       ↓
2. Pull latest changes
       ↓
3. Make changes
       ↓
4. Run tests
       ↓
5. Run build
       ↓
6. Check git status
       ↓
7. Review staged changes
       ↓
8. Commit
       ↓
9. Push feature branch
```

Commands:

```bash
git switch feature/explorerrs-v1
git pull --rebase origin feature/explorerrs-v1

# Make changes

npm run test --workspace=@explorerrs/shared
npm run build --workspace=@explorerrs/shared
npm run build --workspace=apps/web

git status
git add .
git diff --cached

git commit -m "feat: describe your change"
git push
```

---

# 🔌 ExplorerRS Protocol

The shared protocol is located at:

```text
packages/shared/src/
```

Current protocol messages:

```text
connection.hello
connection.ready
connection.error

hierarchy.request
hierarchy.response

script.request
script.response

properties.request
properties.response

changes.apply
changes.result
```

Protocol version:

```text
1
```

---

# 🌳 Hierarchy Representation

ExplorerRS represents Roblox Instances using nodes.

Example:

```text
Workspace
└── Tools
    └── Sword
        ├── Handle
        └── ServerScript
```

Conceptually:

```text
InstanceNode
├── id
├── name
├── className
├── parentId
├── path
└── children
```

Example path:

```text
Workspace.Tools.Sword.ServerScript
```

The hierarchy must preserve Roblox's actual Instance relationships.

---

# ✏️ Supported Change Types

The shared protocol currently defines:

```text
rename
move
create
delete
update-property
update-script
```

Example:

```json
{
  "type": "rename",
  "instanceId": "sword-001",
  "newName": "SuperSword"
}
```

---

# 🔐 Safety Principles

ExplorerRS should never blindly modify Roblox Studio.

Future operations should be validated before being sent to Roblox Studio.

Important rules:

1. Validate Instance IDs.
2. Validate parent relationships.
3. Prevent invalid hierarchy operations.
4. Validate script targets.
5. Reject malformed protocol messages.
6. Use protocol versioning.
7. Return explicit errors.
8. Keep changes traceable using request IDs.
9. Never execute arbitrary commands received from the web interface.
10. Require an active connection before modifying Roblox Studio.

---

# 🛣️ Roadmap

```text
Task 1
Web Foundation
React + TypeScript + Vite
✅ Complete

        ↓

Task 2
Shared Protocol
Hierarchy + Changes + Messages
✅ Complete

        ↓

Task 3
WebSocket Bridge
🔜 Next

        ↓

Task 4
Roblox Studio Plugin
⏳

        ↓

Task 5
Connection Handshake
⏳

        ↓

Task 6
Receive Hierarchy
⏳

        ↓

Task 7
Explorer UI
⏳

        ↓

Task 8
Script Reading
⏳

        ↓

Task 9
Script Editing
⏳

        ↓

Task 10
Create / Delete / Move / Rename
⏳

        ↓

Task 11
Send Hierarchy Data
⏳

        ↓

Task 12
Two-Way Synchronization
⏳

        ↓

Task 13
Safety + Validation
⏳

        ↓

Task 14
Production Build
⏳
```

---

# 📱 Mobile Development

ExplorerRS can be developed from an Android device using:

```text
Android
   │
   ├── GitHub Codespaces
   │      ├── Node.js
   │      ├── npm
   │      ├── TypeScript
   │      └── Vite
   │
   └── Termux
          └── Git
```

Codespaces is recommended for Node/npm development.

Termux can be used for Git operations when needed.

---

# ⚠️ Important

Do not commit:

```text
node_modules/
dist/
build/
.env
.cache/
.vite/
coverage/
*.log
*.tsbuildinfo
```

Do not push development work directly to:

```text
main
```

Use:

```text
feature/explorerrs-v1
```

instead.

---

# 🚀 Quick Start

Clone the repository:

```bash
git clone <repository-url>
cd ExplorerRS
```

Switch to the development branch:

```bash
git switch feature/explorerrs-v1
```

Install dependencies:

```bash
npm install
```

Run tests:

```bash
npm run test --workspace=@explorerrs/shared
```

Build shared package:

```bash
npm run build --workspace=@explorerrs/shared
```

Build web application:

```bash
npm run build --workspace=apps/web
```

Start web development server:

```bash
npm run dev --workspace=apps/web
```

---

# 📌 Current Development Branch

```text
feature/explorerrs-v1
```

Keep `main` stable.

All active ExplorerRS development should happen on the feature branch.

---

# 📜 License

License information will be added when the project reaches its initial release stage.
