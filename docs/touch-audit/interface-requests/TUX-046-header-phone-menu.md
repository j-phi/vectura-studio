# TUX-046 interface note for TUX-001 (shell)

Found while testing Document Setup by taps on phone-layout.

- `src/ui/shell/header.js` `initPhoneMenu` closed the hamburger sheet with a bubble-phase click listener on `#top-menubar`.
- `src/ui/shell/menubar.js` calls `stopPropagation()` on every `[data-top-menu-panel]` click. The bar listener never ran.
- Result: after the user chose Document Setup, Help or Export from the menu, the sheet stayed open at z-index 1500. It covered the drawer and the modal.
- TUX-046 changed that listener to capture phase (one token, `true`). TUX-001 should keep it.
