STORM QUEST | UPDATED FINAL HACKATHON BUILD
===================================

Two playable learning missions for NCERT Class 8 Science:
1. SKY OF SECRETS: Pressure & Winds
2. EYE OF THE STORM: Storms & Cyclones

WHAT IS INCLUDED
-----------------
- Your 3D aircraft and crewmate pilot model (GLB), plus the editable Blender source (BLEND).
- Three lives per mission, flight score, moving weather and warning effects.
- Level 1: cyan and amber pressure currents move towards the aircraft without floating text labels. Each collision removes one life. After all three lives are lost, the facts screen appears.
- Level 2: dark thunderstorm clouds and rotating cyclones move towards the aircraft. Each collision removes one life. After all three lives are lost, the facts screen appears.
- When a pressure current, thunderstorm cloud or cyclone hits the aircraft, a weather-info card explains it. After the facts screen, a multiple-choice quiz follows for EACH level (the original 5 questions, then extra questions at the end based on the weather-hit info and the facts).
- Mission summaries, total score and credits.
- Keyboard and touch flight controls.
- A local teacher dashboard with attempt summaries and CSV export.
- Offline mode: the service worker caches the game files, aircraft model, Three.js engine and GLTF loader for later offline use.

DOUBLE-CLICK TO PLAY
-------------------
This build is self-contained: just double-click index.html (the 3D aircraft and 3D engine are built in; the internet is only needed for the Fredoka font). The separate editable source files are in the source folder (run those with a local web server).

RUN ON MAC (source folder only)
----------
1. Extract this ZIP.
2. Open the extracted stormquest_final_updated folder in VS Code.
3. Choose Terminal > New Terminal.
4. Run: python3 -m http.server 8000
5. Open Chrome and visit: http://localhost:8000
6. Keep the internet connected for the first setup. Wait for the page to finish loading, then reload the page once while still online. The service worker installs and caches the game files and Three.js modules.
7. Reload once while online so the service worker controls the page.
8. Turn Wi-Fi off and reload STORM QUEST. It should open from the local cache. Keep the extracted game folder on the device.

NEW IN THIS BUILD
-----------------
- HOW TO PLAY screen (home and mission screens) and ANSWER KEY (home screen, printable). ANSWER-KEY.txt is also included.

MORE
-----------------
- Synthesised sound effects and wind/thunder ambience (mute button in the HUD).
- Screen shake, red flash and slow-motion when a hazard hits.
- 3-2-1-FLY countdown, pause button (P / Esc), quiz progress bar.
- Quiz question and answer order are shuffled (6 questions per level: 3 core first, 3 info/fact-based last).
- Badge and star rating at the end of each level.

CONTROLS
--------
- Keyboard: Up/Down arrows or W/S.
- Touch: tap the upper/lower half of the flight window, or hold the ▲ / ▼ buttons.
- Each level ends when all three lives are lost. Read the facts screen and select START QUIZ.

TEACHER DASHBOARD
-----------------
Open TEACHER DASHBOARD from the home screen. Quiz reports are stored locally in that browser on that device. Use EXPORT CSV REPORT to download them. This is a prototype dashboard, not a multi-device class sync system. No student names are collected.

IMPORTANT LIMITATIONS
--------------------
- An internet connection is required once for the initial setup because Three.js is downloaded from jsDelivr. Keep the device online until the service worker finishes installing, then reload once online. The service worker pre-caches the Three.js engine and loader as well as the game assets. After this setup, the game is designed to run offline from the same browser and device. Clear browser site data or use a different browser/device and the first-time setup must be repeated. Test offline mode on each target device before deployment.
- The game is a classroom learning prototype. It has not been load-tested for deployment to one million schools or independently audited for accessibility, privacy or security.
- The aircraft adventure is fictional. Never use it as real-world weather or aviation guidance. During severe weather, follow official local alerts and evacuation instructions.

CREDITS & LEARNING REFERENCES
-----------------------------
- NCERT Class 8 Science, chapter: Some Natural Phenomena / winds, storms and cyclones (edition chapter title may vary).
- Three.js documentation: https://threejs.org/docs/
- Three.js GLTFLoader documentation: https://threejs.org/docs/#examples/en/loaders/GLTFLoader
- Blender manual: https://docs.blender.org/manual/en/latest/
- MDN Web Docs: HTML, CSS, JavaScript, Canvas API, Service Workers and Web App Manifest.

STORM QUEST game code, lesson flow, quiz questions and interface are original project work assembled for this educational prototype. The 3D aircraft asset is the project asset supplied with the user's files.


INTERNET REQUIREMENT
--------------------
This build is ONLINE ONLY. An internet connection is required whenever the game
is opened and while it is being played. The 3D aircraft scene loads Three.js
and its GLTF loader from the jsDelivr CDN. Offline play is not supported in
this build.
