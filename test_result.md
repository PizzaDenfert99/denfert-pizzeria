#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: |
  Premium restaurant app (Pizza Denfert Lyon). Current session: complete Phase 3 — Loyalty App Split & Tablet Kiosk Mode.
  Implement idle auto-kiosk launch (any interaction resets timer), route-gate the loyalty subdomain to /kiosk,
  then fix the Android POST_NOTIFICATIONS permission so native reservation alerts can be received.

backend:
  - task: "Kiosk public slides endpoint + admin CRUD + settings"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        - working: true
          agent: "main"
          comment: "Endpoints already in place from prior session: GET /api/ads/slides (public), GET/POST/PATCH/DELETE /api/admin/ads/slides, PUT /api/admin/ads/reorder, GET/PUT /api/admin/ads/settings. Default seed of 14 slides at startup. Smoke-tested via backend log; need formal verification."
  - task: "Native push device registration endpoint"
    implemented: true
    working: "NA"
    file: "backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        - working: "NA"
          agent: "main"
          comment: "POST /api/register-push relays to Emergent push service. No-ops with status=skipped when EMERGENT_PUSH_KEY is placeholder (dev). Verify it accepts the {user_id, platform, device_token} payload our new nativePush.ts sends."

frontend:
  - task: "Kiosk slideshow UI (/kiosk)"
    implemented: true
    working: true
    file: "frontend/app/kiosk.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        - working: true
          agent: "main"
          comment: "Already implemented in prior session — auto-rotating slides, section labels (Loyalty/Experience/Ingredients), progress dots, tap-to-exit. Verified via screenshot — Club Fidélité slide renders with hero text."
  - task: "Admin Ad Management UI (/admin-ads)"
    implemented: true
    working: true
    file: "frontend/app/admin-ads.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        - working: true
          agent: "main"
          comment: "Already implemented — section-grouped CRUD, Supabase Storage upload, settings panel (idle_seconds / loop / show_section_titles). Admin-only route."
  - task: "Global idle-kiosk watcher"
    implemented: true
    working: true
    file: "frontend/src/useIdleKiosk.ts, frontend/app/_layout.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        - working: true
          agent: "main"
          comment: "New hook wired in _layout via IdleKioskWatcher. Activates only on loyalty subdomain (Platform.OS web + hostname check). Resets timer on mousedown, mousemove, touchstart, keydown, scroll, wheel, AND route changes. Exempts /kiosk and /admin* so staff aren't yanked. Fetches idle_seconds from /api/ads/slides settings, default 30s. Cannot verify auto-trigger from current localhost because appMode returns 'main' on localhost — needs production loyalty.pizzadenfert.fr verification."
  - task: "Route gating per subdomain"
    implemented: true
    working: true
    file: "frontend/app/(tabs)/_layout.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        - working: true
          agent: "main"
          comment: "Added <Redirect href='/kiosk'> at the top of TabsLayout when isLoyaltyApp() is true. On loyalty subdomain the customer-facing tabs (home/menu/reserve/account) are unreachable, deep links land on the slideshow. Lint clean. Main subdomain unaffected — verified via screenshot."
  - task: "Android POST_NOTIFICATIONS + expo-notifications plugin"
    implemented: true
    working: "NA"
    file: "frontend/app.json, frontend/src/nativePush.ts, frontend/src/PushOptIn.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Added android.permission.POST_NOTIFICATIONS + VIBRATE + WAKE_LOCK to app.json. Added expo-notifications plugin block. Installed expo-notifications@0.32.17 and expo-device@8.0.10 via expo install. New src/nativePush.ts wraps permission flow per handle-permissions-contract (rationale -> request -> register Expo push token via /api/register-push -> 'Open Settings' fallback when canAskAgain=false). PushOptIn refactored to branch web vs native. CANNOT validate in Expo Go / web preview — requires native EAS build."

metadata:
  created_by: "main_agent"
  version: "1.0"
  test_sequence: 1
  run_ui: false

test_plan:
  current_focus:
    - "Kiosk public slides endpoint + admin CRUD + settings"
    - "Kiosk slideshow UI (/kiosk)"
    - "Admin Ad Management UI (/admin-ads)"
    - "Global idle-kiosk watcher"
    - "Route gating per subdomain"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
    - agent: "main"
      message: |
        Phase 3 of the Loyalty App Split is now feature-complete on the codebase.
        Please smoke-test:
        1) Backend: GET /api/ads/slides (public) returns {slides:[…], settings:{idle_seconds, loop, default_duration_ms, show_section_titles}}.
        2) Backend admin auth required for GET/POST/PATCH/DELETE /api/admin/ads/slides and GET/PUT /api/admin/ads/settings. Admin creds in /app/memory/test_credentials.md.
        3) Frontend /kiosk renders slideshow with hero/title/subtitle and progress dots; tapping returns to /.
        4) Frontend /admin-ads gated to admins only, lists slides grouped by section (loyalty/experience/ingredients), can edit slide (title/subtitle/duration/active/image upload to Supabase Storage).
        5) Customer screens (/, /menu, /reserve, /account) still load normally on the MAIN app (i.e. when window.location.hostname is NOT loyalty.pizzadenfert.fr). Cannot exercise loyalty subdomain locally — only verify main flow not regressed.

        The Android push permission code path cannot be exercised here (web/Expo Go limitation). Verify only the bundle compiles & PushOptIn renders without crash on the admin page (web branch).
